import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const temp=path.join(os.homedir(),`rbwi-smoke-${Date.now()}`);
const data=path.join(os.homedir(),`.rbwi-smoke-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;
await mkdir(temp,{recursive:true});

const writes=[];
for(let i=0;i<1105;i++){
  const kind=i%3;
  const name=kind===0?`sefaz-relatorio-${i}.txt`:kind===1?`condominio-avcb-${i}.txt`:`financeiro-boleto-${i}.txt`;
  const body=kind===0?'SEFAZ ICMS relatório acompanhamento projeto convênio ICMS e-Fisco':kind===1?'Condomínio Sudene AVCB elevador manutenção incêndio extintor':'Fatura boleto pagamento extrato financeiro nota fiscal';
  writes.push(writeFile(path.join(temp,name),body));
}
// Arquivo com extensão PDF e bytes inválidos. O importante é que não derrube a análise global.
writes.push(writeFile(path.join(temp,'arquivo-quebrado.pdf'),'<!doctype html><html><body>isto não é um PDF real</body></html>'));
await Promise.all(writes);

try{
  const { ensureState }=await import('../core/storage.mjs');
  const { startOrganizerJob, organizerJobStatus }=await import('../core/organizer_jobs.mjs');
  await ensureState();
  const started=startOrganizerJob({path:temp,spaceId:'rb-hub'});
  let job=started;
  const deadline=Date.now()+120000;
  while(!['completed','failed','cancelled'].includes(job.status)&&Date.now()<deadline){
    await new Promise(r=>setTimeout(r,150));
    job=organizerJobStatus(started.id);
  }
  if(job.status!=='completed')throw new Error(`Organizer smoke não concluiu: ${job.status} ${job.error||job.message}`);
  const moves=(job.plan?.operations||[]).filter(o=>o.type==='MOVE_FILE');
  if(moves.length<1000)throw new Error(`Esperava >=1000 movimentos, recebeu ${moves.length}`);
  if((job.counters?.documents||0)<1100)throw new Error(`Esperava leitura em massa >=1100, recebeu ${job.counters?.documents||0}`);
  const intel=job.plan?.documentIntelligence;
  if(!intel?.readComplete||intel.readComplete<1000)throw new Error(`Leitura integral insuficiente: ${intel?.readComplete||0}`);
  const malformed=(intel.documents||[]).find(d=>d.name==='arquivo-quebrado.pdf');
  if(!malformed)throw new Error('O arquivo PDF inválido desapareceu do resultado; ele deve ser registrado como aviso/falha isolada.');
  const topics=new Set(moves.map(o=>o.subject));
  if(![...topics].some(t=>/SEFAZ|Fiscal/i.test(t)))throw new Error(`Tema SEFAZ/Fiscal não foi reconhecido: ${[...topics].slice(0,20).join(', ')}`);
  console.log(`Organizer large smoke OK · ${job.counters.documents} documentos · ${moves.length} movimentos · arquivo inválido isolado sem abortar`);
} finally {
  await rm(temp,{recursive:true,force:true});
  await rm(data,{recursive:true,force:true});
}
