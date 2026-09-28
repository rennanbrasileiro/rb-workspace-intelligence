import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const root=path.join(os.homedir(),`rbwi-review-smoke-${Date.now()}`);
const data=path.join(os.homedir(),`.rbwi-review-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;

try{
  const { ensureState, savePlan, readState }=await import('../core/storage.mjs');
  const { getOperationReview, updateOperationReview, resetOperationReview, selectionReferenceProtection }=await import('../core/plan_review.mjs');
  await ensureState();
  const incoming=path.join(root,'entrada'),organized=path.join(root,'Organizado');await mkdir(incoming,{recursive:true});
  const pdf=path.join(incoming,'relatorio.pdf'),html=path.join(incoming,'painel.html');await writeFile(pdf,'pdf-fixture','utf8');await writeFile(html,'<html>fixture</html>','utf8');
  const plan={id:'plan-review',scanId:'scan-review',spaceId:'pessoal',spaceName:'Pessoal',root,createdAt:new Date().toISOString(),destinationRoot:organized,status:'preview',operations:[
    {id:'op-pdf',type:'MOVE_FILE',before:pdf,after:path.join(organized,'Trabalho','relatorio.pdf'),reason:'Trabalho → Relatórios',confidence:'high',recommended:true,area:'Trabalho',subject:'Relatórios',category:'PDFs'},
    {id:'op-html',type:'MOVE_FILE',before:html,after:path.join(organized,'Web','painel.html'),reason:'Web → Painel',confidence:'high',recommended:true,area:'Trabalho',subject:'Web',category:'Artefatos Web'}
  ],findings:[],groups:{}};
  await savePlan(plan);

  let r=await getOperationReview('op-pdf');assert.equal(r.source.exists,true);assert.equal(r.operation.referenceRisk,false);assert.equal(r.trace.edited,false);
  const custom=path.join(root,'Destino Manual');await mkdir(custom,{recursive:true});await updateOperationReview('op-pdf',{filename:'relatorio revisado.pdf',destinationDir:custom,note:'smoke'});
  r=await getOperationReview('op-pdf');assert.equal(r.operation.after,path.join(custom,'relatorio revisado.pdf'));assert.equal(r.trace.edited,true);assert.equal(r.trace.history.length,1);assert.equal(r.trace.original.after,path.join(organized,'Trabalho','relatorio.pdf'));
  await assert.rejects(()=>updateOperationReview('op-pdf',{filename:'relatorio.exe'}),/extensão deve permanecer/i);
  await resetOperationReview('op-pdf');r=await getOperationReview('op-pdf');assert.equal(r.operation.after,path.join(organized,'Trabalho','relatorio.pdf'));assert.equal(r.trace.edited,false);

  const h=await getOperationReview('op-html');assert.equal(h.operation.referenceRisk,true);
  const protection=await selectionReferenceProtection('plan-review',['op-pdf','op-html']);assert.equal(protection.required,true);assert.equal(protection.count,1);assert.equal(protection.forcedRetentionMode,'preserve_original');assert.equal(protection.items[0].id,'op-html');

  const state=await readState(),saved=state.plans.find(p=>p.id==='plan-review'),savedPdf=saved.operations.find(o=>o.id==='op-pdf');assert.ok(savedPdf.reviewHistory.length>=2);
  console.log('Review smoke OK · rename/path review · traceability · extension guard · reference preservation');
} finally {
  await rm(root,{recursive:true,force:true});await rm(data,{recursive:true,force:true});
}
