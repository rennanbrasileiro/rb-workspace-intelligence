import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const base=path.join(os.homedir(),`rbwi-v17-${Date.now()}`),input=path.join(base,'Downloads'),organized=path.join(base,'Organizado'),data=path.join(os.homedir(),`.rbwi-v17-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;
async function file(rel,content='teste'){const p=path.join(input,rel);await mkdir(path.dirname(p),{recursive:true});await writeFile(p,content);return p;}
async function waitJob(start,statusFn){let j=start,deadline=Date.now()+30000;while(!['completed','failed','cancelled'].includes(j.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,80));j=statusFn(start.id);}if(j.status!=='completed')throw new Error(`Job não concluiu: ${j.status} ${j.error||j.message}`);return j;}
try{
  await mkdir(input,{recursive:true});
  await file('AutoCertidao-Local-1.0.1-r17-Final.zip','zip fake');
  await file('AutoCertidao-Local-1.0.1-r16-portable.zip','zip fake 2');
  await file('Certidao_federal_25184237000109.txt','certidão federal receita federal regularidade');
  await file('Certidao_fgts_25184237000109.txt','certidão FGTS regularidade');
  await file('financehub_backup_2026-02-10.json','{"financehub":true,"backup":1}');
  await file('financehub_backup_2026-02-11.json','{"financehub":true,"backup":2}');
  await file('financehub_backup_2026-02-12.json','{"financehub":true,"backup":3}');
  await file('rb_hub_souza_preview.html','<!doctype html><title>RB Hub Proposta Souza Melo</title><h1>RB Hub proposta executiva</h1>');
  await file('AutoCertidao-Local-1.0.1-r12/.gitignore','vendor/');
  await file('AutoCertidao-Local-1.0.1-r12/vendor/wheels/requests.whl','wheel');
  await file('AutoCertidao-Local-1.0.1-r12/README.md','AutoCertidao pacote técnico');

  const {ensureState}=await import('../core/storage.mjs');
  const {startOrganizerJob,organizerJobStatus}=await import('../core/organizer_v17.mjs');
  await ensureState();
  const j=await waitJob(startOrganizerJob({path:input,spaceId:'pessoal'}),organizerJobStatus),ops=j.plan.operations.filter(o=>o.type==='MOVE_FILE');
  const byName=n=>ops.find(o=>path.basename(o.before)===n);
  if(byName('AutoCertidao-Local-1.0.1-r17-Final.zip')?.family!=='AutoCertidão')throw new Error('AutoCertidão não foi consolidada na família mestre.');
  if(byName('Certidao_federal_25184237000109.txt')?.family!=='Certidões')throw new Error('Certidões não foram centralizadas.');
  if(byName('financehub_backup_2026-02-11.json')?.family!=='FinanceHub')throw new Error('FinanceHub não foi consolidado.');
  if(byName('rb_hub_souza_preview.html')?.family!=='RB Hub')throw new Error('RB Hub não foi consolidado.');
  if(ops.some(o=>o.before.includes(`AutoCertidao-Local-1.0.1-r12${path.sep}`)))throw new Error('Pacote técnico AutoCertidão foi desmontado.');
  if((j.scan.skipped?.repositoryCount||0)<1)throw new Error('Pacote técnico não foi contado como protegido.');

  await mkdir(path.join(organized,'Pessoal','Autocertidao Local 1','2026','Compactados'),{recursive:true});
  await writeFile(path.join(organized,'Pessoal','Autocertidao Local 1','2026','Compactados','AutoCertidao-Local-1.0.1-r9.zip'),'old organized');
  const c=await waitJob(startOrganizerJob({path:organized,spaceId:'pessoal'}),organizerJobStatus),cop=c.plan.operations.find(o=>path.basename(o.before)==='AutoCertidao-Local-1.0.1-r9.zip');
  if(!cop)throw new Error('Consolidação da pasta Organizado não gerou movimento.');
  if(cop.after.includes(`${path.sep}Organizado${path.sep}Organizado${path.sep}`))throw new Error('Consolidação criou Organizado/Organizado.');
  if(!cop.after.includes(`${path.sep}Trabalho${path.sep}AutoCertidão${path.sep}`))throw new Error(`Destino consolidado inesperado: ${cop.after}`);
  console.log(`V1.7 smoke OK · ${ops.length} movimentos · ${j.scan.skipped.repositoryCount} pacote(s) técnico(s) protegido(s)`);
} finally {await rm(base,{recursive:true,force:true});await rm(data,{recursive:true,force:true});}
