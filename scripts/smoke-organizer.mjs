import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const temp=path.join(os.homedir(),`rbwi-smoke-${Date.now()}`);
const data=path.join(os.homedir(),`.rbwi-smoke-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;
await mkdir(temp,{recursive:true});
await writeFile(path.join(temp,'sefaz-relatorio.html'),'<!doctype html><html><head><title>SEFAZ Relatório ICMS</title></head><body>SEFAZ ICMS relatório acompanhamento projeto convênio ICMS</body></html>');
await writeFile(path.join(temp,'sefaz-anotacoes.txt'),'SEFAZ ICMS projeto relatório acompanhamento convênio ICMS e-Fisco');
await writeFile(path.join(temp,'condominio-avcb.txt'),'Condomínio Sudene AVCB elevador manutenção incêndio extintor');

try{
  const { ensureState }=await import('../core/storage.mjs');
  const { startOrganizerJob, organizerJobStatus }=await import('../core/organizer_jobs.mjs');
  await ensureState();
  const started=startOrganizerJob({path:temp,spaceId:'rb-hub'});
  let job=started;
  const deadline=Date.now()+20000;
  while(!['completed','failed','cancelled'].includes(job.status)&&Date.now()<deadline){
    await new Promise(r=>setTimeout(r,100));
    job=organizerJobStatus(started.id);
  }
  if(job.status!=='completed')throw new Error(`Organizer smoke não concluiu: ${job.status} ${job.error||job.message}`);
  const moves=(job.plan?.operations||[]).filter(o=>o.type==='MOVE_FILE');
  if(moves.length<3)throw new Error(`Esperava >=3 movimentos, recebeu ${moves.length}`);
  const topics=new Set(moves.map(o=>o.subject));
  if(![...topics].some(t=>/SEFAZ|Fiscal/i.test(t)))throw new Error(`Tema SEFAZ/Fiscal não foi reconhecido: ${[...topics].join(', ')}`);
  if(!job.plan?.documentIntelligence?.readComplete)throw new Error('Nenhum documento foi lido integralmente no smoke test.');
  console.log(`Organizer smoke OK · ${moves.length} movimentos · temas: ${[...topics].join(' | ')}`);
} finally {
  await rm(temp,{recursive:true,force:true});
  await rm(data,{recursive:true,force:true});
}
