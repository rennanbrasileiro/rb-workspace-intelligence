import { mkdir, readFile, writeFile, copyFile, stat, access, readdir, statfs } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { readState } from './storage.mjs';
import { assertAllowedPath } from './workspace.mjs';

const home=path.resolve(os.homedir());
export const recoveryRoot=path.join(home,'.rb-workspace-intelligence','recovery');
const checkpointsRoot=path.join(recoveryRoot,'checkpoints');
function now(){return new Date().toISOString();}
function id(){return `checkpoint_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;}
async function exists(p){try{await access(p);return true}catch{return false}}
function relSafe(file){const rel=path.relative(home,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Arquivo fora do perfil do usuário.');return rel;}
async function hashFile(file){return new Promise(async(resolve,reject)=>{try{const {createReadStream}=await import('node:fs');const h=crypto.createHash('sha256'),s=createReadStream(file);s.on('data',d=>h.update(d));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')));}catch(e){reject(e)}})}
async function writeManifest(dir,manifest){await writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),'utf8');}

export async function createRecoveryCheckpoint({planId,operations,onProgress=()=>{},isCancelled=()=>false}={}){
  const selected=(operations||[]).filter(o=>['MOVE_FILE','QUARANTINE_FILE'].includes(o.type));
  if(!selected.length)throw new Error('Não há operações para proteger.');
  await mkdir(checkpointsRoot,{recursive:true});
  let totalBytes=0;
  const stats=[];
  for(const op of selected){
    const source=assertAllowedPath(op.before),s=await stat(source).catch(()=>null);
    if(!s?.isFile())throw new Error(`Checkpoint cancelado: arquivo de origem não existe: ${source}`);
    totalBytes+=s.size;stats.push({op,source,size:s.size,mtimeMs:s.mtimeMs});
  }
  const fsinfo=await statfs(checkpointsRoot).catch(()=>null);
  const free=fsinfo?Number(fsinfo.bavail)*Number(fsinfo.bsize):null;
  const reserve=512*1024*1024;
  if(free!==null&&free<totalBytes+reserve)throw new Error(`Checkpoint cancelado: espaço livre insuficiente. Necessário ${(totalBytes/1073741824).toFixed(2)} GB + reserva de segurança.`);
  const checkpointId=id(),dir=path.join(checkpointsRoot,checkpointId),filesDir=path.join(dir,'files');
  await mkdir(filesDir,{recursive:true});
  const manifest={id:checkpointId,planId,createdAt:now(),status:'creating',totalFiles:selected.length,totalBytes,copiedFiles:0,copiedBytes:0,entries:[]};
  await writeManifest(dir,manifest);
  for(let i=0;i<stats.length;i++){
    if(isCancelled())throw new Error('Checkpoint cancelado pelo usuário. Nenhum arquivo foi movido.');
    const x=stats[i],relative=relSafe(x.source),backup=path.join(filesDir,relative);
    await mkdir(path.dirname(backup),{recursive:true});
    await copyFile(x.source,backup);
    const hash=await hashFile(backup);
    const entry={operationId:x.op.id,type:x.op.type,original:x.source,plannedTarget:x.op.after,backup,relative,size:x.size,mtimeMs:x.mtimeMs,sha256:hash,copiedAt:now()};
    manifest.entries.push(entry);manifest.copiedFiles++;manifest.copiedBytes+=x.size;
    if((i+1)%10===0||i===stats.length-1)await writeManifest(dir,manifest);
    onProgress({processed:i+1,total:stats.length,bytes:manifest.copiedBytes,totalBytes,file:x.source,checkpointId});
  }
  manifest.status='ready';manifest.readyAt=now();await writeManifest(dir,manifest);
  return manifest;
}

export async function listRecoveryCheckpoints(){
  await mkdir(checkpointsRoot,{recursive:true});
  const dirs=await readdir(checkpointsRoot,{withFileTypes:true}).catch(()=>[]),items=[];
  for(const e of dirs){if(!e.isDirectory())continue;try{const m=JSON.parse(await readFile(path.join(checkpointsRoot,e.name,'manifest.json'),'utf8'));items.push({id:m.id,status:m.status,createdAt:m.createdAt,readyAt:m.readyAt||null,totalFiles:m.totalFiles,totalBytes:m.totalBytes,planId:m.planId});}catch{}}
  return items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getRecoveryCheckpoint(checkpointId){
  const p=path.join(checkpointsRoot,path.basename(String(checkpointId||'')),'manifest.json');
  const m=JSON.parse(await readFile(p,'utf8'));
  return m;
}

export async function restoreRecoveryCheckpoint(checkpointId,{dryRun=true}={}){
  const m=await getRecoveryCheckpoint(checkpointId);if(m.status!=='ready')throw new Error('Checkpoint não está pronto para restauração.');
  const results=[];
  for(const e of m.entries||[]){
    const original=assertAllowedPath(e.original),backup=assertAllowedPath(e.backup);
    if(!(await exists(backup))){results.push({original,status:'backup_missing'});continue;}
    if(await exists(original)){results.push({original,status:'original_exists'});continue;}
    const currentHash=await hashFile(backup).catch(()=>null);if(e.sha256&&currentHash&&currentHash!==e.sha256){results.push({original,status:'backup_changed'});continue;}
    if(!dryRun){await mkdir(path.dirname(original),{recursive:true});await copyFile(backup,original);}
    results.push({original,status:dryRun?'would_restore':'restored'});
  }
  const summary={total:results.length,wouldRestore:results.filter(x=>x.status==='would_restore').length,restored:results.filter(x=>x.status==='restored').length,originalExists:results.filter(x=>x.status==='original_exists').length,backupMissing:results.filter(x=>x.status==='backup_missing').length,backupChanged:results.filter(x=>x.status==='backup_changed').length};
  return{checkpoint:{id:m.id,createdAt:m.createdAt,totalFiles:m.totalFiles,totalBytes:m.totalBytes},dryRun,summary,results};
}

export async function auditHistoricalRecovery(){
  const state=await readState(),txs=state.transactions||[],rows=[];
  for(const tx of txs){for(const op of tx.operations||[]){if(op.status!=='completed'||!op.before||!op.after)continue;const before=await exists(op.before),after=await exists(op.after);rows.push({txId:tx.id,createdAt:tx.createdAt,type:op.type,before:op.before,after:op.after,beforeExists:before,afterExists:after,hash:op.afterHash||op.beforeHash||null,status:before?'at_original':after?'at_destination':'not_in_known_paths'});}}
  const summary={transactions:txs.length,operations:rows.length,atOriginal:rows.filter(x=>x.status==='at_original').length,atDestination:rows.filter(x=>x.status==='at_destination').length,notInKnownPaths:rows.filter(x=>x.status==='not_in_known_paths').length};
  return{summary,rows};
}
