import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, access, rm } from 'node:fs/promises';

const root=path.join(os.homedir(),`rbwi-exec-smoke-${Date.now()}`);
const incoming=path.join(root,'entrada');
const organized=path.join(root,'organizado');
const data=path.join(os.homedir(),`.rbwi-exec-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;
await mkdir(incoming,{recursive:true});
await mkdir(organized,{recursive:true});
const total=240;
for(let i=0;i<total;i++)await writeFile(path.join(incoming,`arquivo-${String(i).padStart(4,'0')}.txt`),`conteudo-${i}\n`,'utf8');

async function exists(p){try{await access(p);return true}catch{return false}}
try{
  const { ensureState, savePlan }=await import('../core/storage.mjs');
  const { startExecutionJob, executionJobStatus }=await import('../core/execution_jobs.mjs');
  await ensureState();
  const operations=[];
  for(let i=0;i<total;i++)operations.push({id:`op-${i}`,type:'MOVE_FILE',before:path.join(incoming,`arquivo-${String(i).padStart(4,'0')}.txt`),after:path.join(organized,`arquivo-${String(i).padStart(4,'0')}.txt`),reason:'smoke',confidence:'high',recommended:true,area:'Teste',subject:'Lote',year:'2026',category:'Documentos'});
  const plan={id:`plan-${Date.now()}`,scanId:'smoke',spaceId:'pessoal',spaceName:'Pessoal',root,createdAt:new Date().toISOString(),policy:'',destinationRoot:organized,findings:[],operations,groups:{Teste:total},status:'preview',skipped:{}};
  await savePlan(plan);
  const started=startExecutionJob({planId:plan.id,operationIds:operations.map(o=>o.id)});
  let job=started;
  const deadline=Date.now()+60000;
  while(!['completed','completed_with_errors','cancelled','failed'].includes(job.status)&&Date.now()<deadline){
    await new Promise(r=>setTimeout(r,50));
    job=executionJobStatus(started.id);
  }
  if(job.status!=='completed')throw new Error(`Execution smoke não concluiu: ${job.status} ${job.error||job.message}`);
  if(job.counters.completed!==total||job.counters.failed!==0)throw new Error(`Esperava ${total} movimentos; recebeu ${job.counters.completed} completos e ${job.counters.failed} falhas.`);
  if(!(await exists(path.join(organized,'arquivo-0000.txt'))))throw new Error('Arquivo inicial não chegou ao destino.');
  if(!(await exists(path.join(organized,`arquivo-${String(total-1).padStart(4,'0')}.txt`))))throw new Error('Arquivo final não chegou ao destino.');
  if(await exists(path.join(incoming,'arquivo-0000.txt')))throw new Error('Arquivo original ainda existe após a movimentação.');
  console.log(`Execution smoke OK · ${total} arquivos movidos · checkpoints e job assíncrono funcionando`);
} finally {
  await rm(root,{recursive:true,force:true});
  await rm(data,{recursive:true,force:true});
}
