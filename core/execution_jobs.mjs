import { mkdir, link, stat, access, copyFile, open, unlink, rm } from 'node:fs/promises';
import { createReadStream, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { id, readState, saveTransaction, updateTransaction } from './storage.mjs';
import { assertAllowedPath } from './workspace.mjs';
import { createRecoveryCheckpoint, recoveryCapacity } from './recovery_center.mjs';

const jobs=new Map();
const CHECKPOINT_EVERY=50;
const RETENTION_MODES=new Set(['remove_after_verified_copy','preserve_original']);
const FINALIZATION_STRATEGY='atomic_hardlink_no_replace';
function now(){return new Date().toISOString();}
async function exists(p){try{await access(p);return true}catch{return false}}
async function hashFile(file){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=createReadStream(file);s.on('data',d=>h.update(d));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')));});}
async function syncFile(file){const handle=await open(file,'r');try{await handle.sync();}finally{await handle.close();}}
function collisionSafe(target){const p=path.parse(target);return{dir:p.dir,base:p.name,ext:p.ext};}
async function uniqueTarget(target){if(!(await exists(target)))return target;const{dir,base,ext}=collisionSafe(target);for(let i=2;i<1000;i++){const candidate=path.join(dir,`${base} (${i})${ext}`);if(!(await exists(candidate)))return candidate;}throw new Error(`Não foi possível resolver colisão de nome em ${target}`);}
function publicJob(j){if(!j)return null;return{id:j.id,status:j.status,phase:j.phase,percent:j.percent,message:j.message,planId:j.planId,checkpointId:j.checkpointId||null,retentionMode:j.retentionMode,startedAt:j.startedAt,updatedAt:j.updatedAt,finishedAt:j.finishedAt||null,counters:{...j.counters},current:j.current||'',error:j.error||'',transaction:['completed','completed_with_errors','cancelled'].includes(j.status)?j.transaction:undefined};}
function setJob(j,patch){Object.assign(j,patch,{updatedAt:now()});}
async function checkpointTx(tx){await updateTransaction(tx.id,{status:'running',operations:[...tx.operations],summary:{...tx.summary},lastCheckpointAt:now()});}
function targetKey(p){const resolved=path.resolve(p);return process.platform==='win32'?resolved.toLowerCase():resolved;}

export async function executionPreflight({planId,operationIds}={}){
  const state=await readState(),plan=state.plans.find(p=>p.id===planId);if(!plan)throw new Error('Plano não encontrado. Faça uma nova análise.');
  const ids=new Set(operationIds||[]),selected=plan.operations.filter(o=>ids.has(o.id));if(!selected.length)throw new Error('Selecione ao menos uma operação.');
  let totalBytes=0;const missingSources=[],existingTargetConflicts=[],targets=new Map();
  for(const op of selected){
    const source=assertAllowedPath(op.before),target=assertAllowedPath(op.after),s=await stat(source).catch(()=>null);
    if(!s?.isFile())missingSources.push(source);else totalBytes+=s.size;
    if(await exists(target))existingTargetConflicts.push({source,target});
    const key=targetKey(target),row=targets.get(key)||{target,sources:[]};row.sources.push(source);targets.set(key,row);
  }
  const plannedTargetCollisions=[...targets.values()].filter(x=>x.sources.length>1),capacity=await recoveryCapacity(totalBytes),skipped=plan.skipped||{};
  return{
    planId:plan.id,spaceId:plan.spaceId,root:plan.root,destinationRoot:plan.destinationRoot,
    operations:selected.length,moves:selected.filter(o=>o.type==='MOVE_FILE').length,quarantines:selected.filter(o=>o.type==='QUARANTINE_FILE').length,
    totalBytes,checkpointBytes:totalBytes,recoveryCapacity:capacity,
    missingSources:{count:missingSources.length,items:missingSources.slice(0,20)},
    existingTargetConflicts:{count:existingTargetConflicts.length,items:existingTargetConflicts.slice(0,20)},
    plannedTargetCollisions:{count:plannedTargetCollisions.length,items:plannedTargetCollisions.slice(0,20)},
    protected:{projects:Number(skipped.repositoryCount||0),technical:Number(skipped.technicalCount||0),system:Number(skipped.systemCount||0)},
    safeToStart:missingSources.length===0&&capacity.enough!==false,
    movementStrategy:'copy_verify_commit',finalizationStrategy:FINALIZATION_STRATEGY,checkpointRequired:true,retentionModes:[...RETENTION_MODES]
  };
}

async function atomicFinalizeNoReplace(tmp,target){
  try{await link(tmp,target);}
  catch(e){
    if(e?.code==='EEXIST')throw new Error('O destino foi ocupado durante a operação. A origem foi preservada.');
    throw new Error(`Não foi possível finalizar atomicamente sem sobrescrever o destino. A origem foi preservada. ${e?.message||e}`);
  }
  await unlink(tmp).catch(()=>{});
}

async function verifiedTransfer(source,target,{preserveOriginal=false}={}){
  const beforeHash=await hashFile(source);
  const tmp=path.join(path.dirname(target),`.${path.basename(target)}.rbwi-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  let committed=false;
  try{
    await copyFile(source,tmp,fsConstants.COPYFILE_EXCL);
    await syncFile(tmp);
    const tempHash=await hashFile(tmp);
    if(tempHash!==beforeHash)throw new Error('Cópia temporária falhou na validação SHA-256. A origem foi preservada.');
    await atomicFinalizeNoReplace(tmp,target);
    committed=true;
    await syncFile(target);
    const afterHash=await hashFile(target);
    if(afterHash!==beforeHash){await rm(target,{force:true}).catch(()=>{});committed=false;throw new Error('Destino final falhou na validação SHA-256. A origem foi preservada.');}

    if(preserveOriginal)return{beforeHash,afterHash,sourceRemoved:false,sourceRetainedReason:'retention_mode',finalizationStrategy:FINALIZATION_STRATEGY};
    const sourceHashNow=await hashFile(source).catch(()=>null);
    if(!sourceHashNow||sourceHashNow!==beforeHash)return{beforeHash,afterHash,sourceRemoved:false,sourceRetainedReason:'source_changed_after_copy',finalizationStrategy:FINALIZATION_STRATEGY};
    try{await unlink(source);return{beforeHash,afterHash,sourceRemoved:true,sourceRetainedReason:null,finalizationStrategy:FINALIZATION_STRATEGY};}
    catch{return{beforeHash,afterHash,sourceRemoved:false,sourceRetainedReason:'source_remove_failed',finalizationStrategy:FINALIZATION_STRATEGY};}
  }catch(e){
    await rm(tmp,{force:true}).catch(()=>{});
    if(committed&&await exists(target))await rm(target,{force:true}).catch(()=>{});
    throw e;
  }
}

async function executeOne(op,{retentionMode='remove_after_verified_copy'}={}){
  const record={id:op.id,type:op.type,before:op.before,requestedAfter:op.after,status:'pending',movementStrategy:'copy_verify_commit',finalizationStrategy:FINALIZATION_STRATEGY,retentionMode};
  try{
    const source=assertAllowedPath(op.before),sourceStat=await stat(source).catch(()=>null);if(!sourceStat?.isFile())throw new Error('Arquivo de origem não existe mais.');
    let target=assertAllowedPath(op.after);target=await uniqueTarget(target);await mkdir(path.dirname(target),{recursive:true});
    const transfer=await verifiedTransfer(source,target,{preserveOriginal:retentionMode==='preserve_original'});
    Object.assign(record,{after:target,...transfer,status:'completed',completedAt:now()});
    if(transfer.sourceRetainedReason)record.warning=transfer.sourceRetainedReason==='retention_mode'?'Original preservado por modo de retenção.':transfer.sourceRetainedReason==='source_changed_after_copy'?'A origem mudou durante a operação e foi preservada.':'Não foi possível remover a origem; ela foi preservada.';
  }catch(e){record.status='failed';record.error=e.message;}
  return record;
}

async function run(j){let tx=null;try{
  const state=await readState(),plan=state.plans.find(p=>p.id===j.planId);if(!plan)throw new Error('Plano não encontrado. Faça uma nova análise.');const ids=new Set(j.operationIds||[]),selected=plan.operations.filter(o=>ids.has(o.id));if(!selected.length)throw new Error('Selecione ao menos uma operação.');j.counters.requested=selected.length;j.counters.remaining=selected.length;
  setJob(j,{status:'running',phase:'checkpoint',percent:1,message:`Criando checkpoint físico de ${selected.length} arquivo(s) antes de mover qualquer coisa…`});
  const recovery=await createRecoveryCheckpoint({planId:j.planId,operations:selected,isCancelled:()=>j.cancelled,onProgress:p=>{j.current=p.file||'';j.counters.checkpointProcessed=p.processed||0;j.counters.checkpointTotal=p.total||selected.length;j.counters.checkpointBytes=p.bytes||0;j.counters.checkpointTotalBytes=p.totalBytes||0;setJob(j,{percent:Math.max(1,Math.min(20,Math.floor((p.processed||0)/Math.max(1,p.total||1)*20))),message:`Checkpoint de segurança ${p.processed||0}/${p.total||selected.length} · nenhum arquivo foi movido ainda`});}});
  j.checkpointId=recovery.id;j.current='';
  if(j.cancelled){setJob(j,{status:'cancelled',phase:'cancelled',message:'Execução cancelada antes de qualquer movimentação. O checkpoint foi preservado.',finishedAt:now(),percent:20});return;}
  tx={id:id('tx'),planId:j.planId,spaceId:plan.spaceId,checkpointId:recovery.id,retentionMode:j.retentionMode,createdAt:now(),status:'running',operations:[],summary:{requested:selected.length,completed:0,failed:0,retainedOriginals:0}};j.transaction=tx;await saveTransaction(tx);
  setJob(j,{status:'running',phase:'moving',percent:20,message:`Checkpoint ${recovery.id} pronto. Iniciando ${selected.length} movimentações com cópia + SHA-256 + finalização atômica sem sobrescrita…`});
  for(let i=0;i<selected.length;i++){
    if(j.cancelled)break;
    const op=selected[i];j.current=op.before;setJob(j,{message:`Protegendo e finalizando ${i+1}/${selected.length} · ${path.basename(op.before)}`});
    const record=await executeOne(op,{retentionMode:j.retentionMode});tx.operations.push(record);
    if(record.status==='completed'){tx.summary.completed++;if(!record.sourceRemoved)tx.summary.retainedOriginals++;}else tx.summary.failed++;
    const processed=i+1;j.counters.processed=processed;j.counters.completed=tx.summary.completed;j.counters.failed=tx.summary.failed;j.counters.retainedOriginals=tx.summary.retainedOriginals;j.counters.remaining=Math.max(0,selected.length-processed);
    setJob(j,{percent:20+Math.max(1,Math.floor(processed/selected.length*80)),message:`${processed}/${selected.length} processadas · ${tx.summary.completed} finalizadas · ${tx.summary.failed} falharam${tx.summary.retainedOriginals?` · ${tx.summary.retainedOriginals} originais preservados`:''} · checkpoint ${recovery.id}`});
    if(processed%CHECKPOINT_EVERY===0)await checkpointTx(tx);await new Promise(r=>setImmediate(r));
  }
  const wasCancelled=j.cancelled===true;tx.status=wasCancelled?'cancelled':tx.summary.failed?'completed_with_errors':'completed';tx.completedAt=now();await updateTransaction(tx.id,{status:tx.status,operations:[...tx.operations],summary:{...tx.summary},completedAt:tx.completedAt,checkpointId:recovery.id,retentionMode:j.retentionMode});j.transaction=tx;
  setJob(j,{status:tx.status,phase:wasCancelled?'cancelled':'done',percent:wasCancelled?j.percent:100,message:wasCancelled?`Execução cancelada · ${tx.summary.completed} arquivos finalizados · checkpoint ${recovery.id} preservado`:`Execução concluída · ${tx.summary.completed} arquivos finalizados · ${tx.summary.failed} falharam${tx.summary.retainedOriginals?` · ${tx.summary.retainedOriginals} originais preservados`:''} · checkpoint ${recovery.id} preservado`,finishedAt:now(),current:''});
}catch(e){
  if(tx){tx.status='failed';tx.completedAt=now();try{await updateTransaction(tx.id,{status:'failed',operations:[...tx.operations],summary:{...tx.summary},completedAt:tx.completedAt,error:e.message,checkpointId:j.checkpointId||tx.checkpointId,retentionMode:j.retentionMode})}catch{}}
  if(j.cancelled&&!tx){setJob(j,{status:'cancelled',phase:'cancelled',message:'Execução cancelada durante o checkpoint. Nenhum arquivo foi movido.',error:'',finishedAt:now(),current:'',percent:Math.min(j.percent||0,20)});return;}
  setJob(j,{status:'failed',phase:'failed',message:j.phase==='checkpoint'?'Checkpoint falhou. Nenhum arquivo foi movido.':'A execução encontrou um erro.',error:e.message,finishedAt:now(),current:''});
}}
function trimJobs(){const finished=[...jobs.values()].filter(j=>!['queued','running'].includes(j.status)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));for(const j of finished.slice(20))jobs.delete(j.id);}
export function startExecutionJob({planId,operationIds,retentionMode='remove_after_verified_copy'}){
  if(!RETENTION_MODES.has(retentionMode))throw new Error('Modo de retenção inválido.');
  const active=[...jobs.values()].find(j=>['queued','running'].includes(j.status));if(active)throw new Error('Já existe uma execução em andamento. Aguarde ou cancele antes de iniciar outra.');
  const j={id:id('execjob'),planId,operationIds:[...(operationIds||[])],retentionMode,status:'queued',phase:'queued',percent:0,message:'Preparando checkpoint de segurança…',startedAt:now(),updatedAt:now(),finishedAt:null,counters:{requested:(operationIds||[]).length,processed:0,completed:0,failed:0,retainedOriginals:0,remaining:(operationIds||[]).length,checkpointProcessed:0,checkpointTotal:(operationIds||[]).length,checkpointBytes:0,checkpointTotalBytes:0},current:'',cancelled:false,transaction:null,checkpointId:null,error:''};jobs.set(j.id,j);trimJobs();run(j);return publicJob(j);
}
export function executionJobStatus(jobId){const j=jobs.get(jobId);if(!j)throw new Error('Execução não encontrada ou já expirada.');return publicJob(j);}
export function cancelExecutionJob(jobId){const j=jobs.get(jobId);if(!j)throw new Error('Execução não encontrada.');if(!['queued','running'].includes(j.status))return publicJob(j);j.cancelled=true;setJob(j,{message:j.phase==='checkpoint'?'Cancelamento solicitado. Nenhum arquivo será movido.':'Cancelamento solicitado. O arquivo atual será finalizado sem apagar a origem antes da validação.'});return publicJob(j);}
