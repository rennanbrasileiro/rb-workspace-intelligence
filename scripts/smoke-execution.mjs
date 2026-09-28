import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';

const root=path.join(os.homedir(),`rbwi-exec-smoke-${Date.now()}`);
const data=path.join(os.homedir(),`.rbwi-exec-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;
const checkpoints=[];
async function exists(p){try{await access(p);return true}catch{return false}}
async function waitFor(started,statusFn,timeout=60000){let job=started,deadline=Date.now()+timeout;while(!['completed','completed_with_errors','cancelled','failed'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,25));job=statusFn(started.id);}if(!['completed','completed_with_errors','cancelled','failed'].includes(job.status))throw new Error(`Job não terminou: ${job.status}`);if(job.checkpointId)checkpoints.push(job.checkpointId);return job;}

try{
  const { ensureState, savePlan }=await import('../core/storage.mjs');
  const { startExecutionJob, executionJobStatus, cancelExecutionJob, executionPreflight }=await import('../core/execution_jobs.mjs');
  const { recoveryRoot }=await import('../core/recovery_center.mjs');
  await ensureState();
  let seq=0;
  async function createPlan(operations,label='Teste',skipped={}){
    const plan={id:`plan-${Date.now()}-${seq++}`,scanId:'smoke',spaceId:'pessoal',spaceName:'Pessoal',root,createdAt:new Date().toISOString(),policy:'',destinationRoot:path.join(root,'organized'),findings:[],operations,groups:{[label]:operations.length},status:'preview',skipped};
    await savePlan(plan);return plan;
  }

  // 1) Preflight + movimento normal: checkpoint, cópia, SHA-256 e finalização atômica no-replace.
  const incoming=path.join(root,'normal','entrada'),organized=path.join(root,'normal','organizado');
  await mkdir(incoming,{recursive:true});await mkdir(organized,{recursive:true});
  const total=80,operations=[];
  for(let i=0;i<total;i++){const name=`arquivo-${String(i).padStart(4,'0')}.txt`;await writeFile(path.join(incoming,name),`conteudo-${i}\n`,'utf8');operations.push({id:`normal-${i}`,type:'MOVE_FILE',before:path.join(incoming,name),after:path.join(organized,name),reason:'smoke',confidence:'high',recommended:true});}
  let plan=await createPlan(operations,'Normal',{repositoryCount:2,technicalCount:3,systemCount:1});
  let preflight=await executionPreflight({planId:plan.id,operationIds:operations.map(o=>o.id)});
  assert.equal(preflight.operations,total);assert.equal(preflight.moves,total);assert.equal(preflight.missingSources.count,0);assert.equal(preflight.safeToStart,true);assert.ok(preflight.totalBytes>0);assert.equal(preflight.checkpointBytes,preflight.totalBytes);assert.equal(preflight.protected.projects,2);assert.notEqual(preflight.recoveryCapacity.enough,false);assert.equal(preflight.finalizationStrategy,'atomic_hardlink_no_replace');
  let job=await waitFor(startExecutionJob({planId:plan.id,operationIds:operations.map(o=>o.id)}),executionJobStatus);
  assert.equal(job.status,'completed');assert.equal(job.counters.completed,total);assert.equal(job.counters.failed,0);assert.ok(job.checkpointId);assert.equal(job.transaction.operations[0].finalizationStrategy,'atomic_hardlink_no_replace');
  assert.equal(await readFile(path.join(organized,'arquivo-0000.txt'),'utf8'),'conteudo-0\n');assert.equal(await exists(path.join(incoming,'arquivo-0000.txt')),false);

  // 2) Colisão: preflight sinaliza e a execução jamais sobrescreve um destino existente.
  const collisionSource=path.join(root,'collision','entrada','relatorio.txt'),collisionTarget=path.join(root,'collision','destino','relatorio.txt');
  await mkdir(path.dirname(collisionSource),{recursive:true});await mkdir(path.dirname(collisionTarget),{recursive:true});
  await writeFile(collisionSource,'novo-conteudo','utf8');await writeFile(collisionTarget,'destino-existente','utf8');
  plan=await createPlan([{id:'collision',type:'MOVE_FILE',before:collisionSource,after:collisionTarget,reason:'collision',confidence:'high',recommended:true}],'Collision');
  preflight=await executionPreflight({planId:plan.id,operationIds:['collision']});assert.equal(preflight.existingTargetConflicts.count,1);assert.equal(preflight.safeToStart,true);
  job=await waitFor(startExecutionJob({planId:plan.id,operationIds:['collision']}),executionJobStatus);
  assert.equal(job.status,'completed');assert.equal(await readFile(collisionTarget,'utf8'),'destino-existente');assert.equal(await readFile(path.join(path.dirname(collisionTarget),'relatorio (2).txt'),'utf8'),'novo-conteudo');

  // 3) Retenção: permite finalizar destino sem apagar o original.
  const retainedSource=path.join(root,'retention','entrada','contrato.txt'),retainedTarget=path.join(root,'retention','destino','contrato.txt');
  await mkdir(path.dirname(retainedSource),{recursive:true});await writeFile(retainedSource,'preservar-original','utf8');
  plan=await createPlan([{id:'retention',type:'MOVE_FILE',before:retainedSource,after:retainedTarget,reason:'retention',confidence:'high',recommended:true}],'Retention');
  job=await waitFor(startExecutionJob({planId:plan.id,operationIds:['retention'],retentionMode:'preserve_original'}),executionJobStatus);
  assert.equal(job.status,'completed');assert.equal(job.transaction.summary.retainedOriginals,1);assert.equal(await readFile(retainedSource,'utf8'),'preservar-original');assert.equal(await readFile(retainedTarget,'utf8'),'preservar-original');

  // 4) Falha de checkpoint: preflight bloqueia confiança e, mesmo se execução for chamada, zero movimentos podem ocorrer.
  const protectedSource=path.join(root,'checkpoint-fail','entrada','importante.txt'),protectedTarget=path.join(root,'checkpoint-fail','destino','importante.txt'),missingSource=path.join(root,'checkpoint-fail','entrada','ausente.txt');
  await mkdir(path.dirname(protectedSource),{recursive:true});await writeFile(protectedSource,'nao-mover-se-checkpoint-falhar','utf8');
  const failOps=[{id:'valid-before-fail',type:'MOVE_FILE',before:protectedSource,after:protectedTarget,reason:'fail',confidence:'high',recommended:true},{id:'missing',type:'MOVE_FILE',before:missingSource,after:path.join(root,'checkpoint-fail','destino','ausente.txt'),reason:'fail',confidence:'high',recommended:true}];
  plan=await createPlan(failOps,'CheckpointFail');
  preflight=await executionPreflight({planId:plan.id,operationIds:failOps.map(o=>o.id)});assert.equal(preflight.missingSources.count,1);assert.equal(preflight.safeToStart,false);
  job=await waitFor(startExecutionJob({planId:plan.id,operationIds:failOps.map(o=>o.id)}),executionJobStatus);
  assert.equal(job.status,'failed');assert.equal(await readFile(protectedSource,'utf8'),'nao-mover-se-checkpoint-falhar');assert.equal(await exists(protectedTarget),false);

  // 5) Cancelamento durante checkpoint: zero movimentos e nenhuma corrupção.
  const cancelIn=path.join(root,'cancel','entrada'),cancelOut=path.join(root,'cancel','destino');await mkdir(cancelIn,{recursive:true});
  const cancelOps=[];for(let i=0;i<12;i++){const s=path.join(cancelIn,`c-${i}.txt`);await writeFile(s,`cancel-${i}`,'utf8');cancelOps.push({id:`cancel-${i}`,type:'MOVE_FILE',before:s,after:path.join(cancelOut,`c-${i}.txt`),reason:'cancel',confidence:'high',recommended:true});}
  plan=await createPlan(cancelOps,'Cancel');
  const started=startExecutionJob({planId:plan.id,operationIds:cancelOps.map(o=>o.id)});cancelExecutionJob(started.id);job=await waitFor(started,executionJobStatus);
  assert.equal(job.status,'cancelled');for(let i=0;i<12;i++){assert.equal(await readFile(path.join(cancelIn,`c-${i}.txt`),'utf8'),`cancel-${i}`);assert.equal(await exists(path.join(cancelOut,`c-${i}.txt`)),false);}

  console.log('Execution smoke OK · preflight · copy/verify · atomic no-replace finalize · checkpoint abort zero moves · collision safe · retention · cancellation safe');
  for(const cp of checkpoints)await rm(path.join(recoveryRoot,'checkpoints',cp),{recursive:true,force:true});
} finally {
  await rm(root,{recursive:true,force:true});
  await rm(data,{recursive:true,force:true});
}
