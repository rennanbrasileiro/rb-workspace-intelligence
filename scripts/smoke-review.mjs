import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const root=path.join(os.homedir(),`rbwi-review-smoke-${Date.now()}`);
const data=path.join(os.homedir(),`.rbwi-review-state-${Date.now()}`);
process.env.RBWI_DATA_DIR=data;

try{
  const { ensureState, savePlan, readState }=await import('../core/storage.mjs');
  const { getOperationReview, getLatestReviewPlan, updateOperationReview, quarantineOperationReview, resetOperationReview, filterReviewedSelection, selectionReferenceProtection, reviewSafetySummary }=await import('../core/plan_review.mjs');
  await ensureState();
  const incoming=path.join(root,'entrada'),organized=path.join(root,'Organizado');await mkdir(incoming,{recursive:true});
  const pdf=path.join(incoming,'relatorio.pdf'),html=path.join(incoming,'painel.html');await writeFile(pdf,'pdf-fixture','utf8');await writeFile(html,'<html>fixture</html>','utf8');
  const plan={id:'plan-review',scanId:'scan-review',spaceId:'pessoal',spaceName:'Pessoal',root,createdAt:new Date().toISOString(),destinationRoot:organized,status:'preview',operations:[
    {id:'op-pdf',type:'MOVE_FILE',before:pdf,after:path.join(organized,'Trabalho','relatorio.pdf'),reason:'Trabalho → Relatórios',confidence:'high',recommended:true,area:'Trabalho',subject:'Relatórios',category:'PDFs'},
    {id:'op-html',type:'MOVE_FILE',before:html,after:path.join(organized,'Web','painel.html'),reason:'Web → Painel',confidence:'high',recommended:true,area:'Trabalho',subject:'Web',category:'Artefatos Web'}
  ],findings:[],groups:{}};
  await savePlan(plan);

  let latest=await getLatestReviewPlan();assert.equal(latest.id,'plan-review');assert.equal(latest.operations.length,2);assert.equal(latest.operations.find(o=>o.id==='op-html').referenceRisk,true);assert.equal(latest.counts.total,2);assert.equal(latest.counts.pending,2);assert.equal(latest.counts.reviewed,0);
  const safety=reviewSafetySummary();assert.equal(safety.hardDeleteAvailable,false);assert.match(safety.quarantineRoot,/_RB_Quarantine/);assert.deepEqual(safety.reviewStatuses,['pending','approved','adjusted','excluded','quarantine']);

  let r=await getOperationReview('op-pdf');assert.equal(r.source.exists,true);assert.equal(r.operation.referenceRisk,false);assert.equal(r.trace.edited,false);assert.equal(r.operation.reviewStatus,'pending');
  const custom=path.join(root,'Destino Manual');await mkdir(custom,{recursive:true});await updateOperationReview('op-pdf',{filename:'relatorio revisado.pdf',destinationDir:custom,note:'smoke'});
  r=await getOperationReview('op-pdf');assert.equal(r.operation.after,path.join(custom,'relatorio revisado.pdf'));assert.equal(r.trace.edited,true);assert.equal(r.trace.history.length,1);assert.equal(r.trace.original.after,path.join(organized,'Trabalho','relatorio.pdf'));assert.equal(r.operation.reviewApproved,true);assert.equal(r.operation.reviewStatus,'adjusted');
  await assert.rejects(()=>updateOperationReview('op-pdf',{filename:'relatorio.exe'}),/extensão deve permanecer/i);
  await resetOperationReview('op-pdf');r=await getOperationReview('op-pdf');assert.equal(r.operation.after,path.join(organized,'Trabalho','relatorio.pdf'));assert.equal(r.trace.edited,false);assert.equal(r.operation.reviewApproved,false);assert.equal(r.operation.reviewStatus,'pending');

  let h=await getOperationReview('op-html');assert.equal(h.operation.referenceRisk,true);assert.equal(h.operation.reviewStatus,'pending');
  let protection=await selectionReferenceProtection('plan-review',['op-pdf','op-html']);assert.equal(protection.required,true);assert.equal(protection.count,1);assert.equal(protection.forcedRetentionMode,'preserve_original');assert.equal(protection.items[0].id,'op-html');

  await updateOperationReview('op-html',{excluded:true,note:'não mover smoke'});h=await getOperationReview('op-html');assert.equal(h.operation.reviewExcluded,true);assert.equal(h.operation.reviewApproved,true);assert.equal(h.operation.reviewStatus,'excluded');
  const filtered=await filterReviewedSelection('plan-review',['op-pdf','op-html']);assert.deepEqual(filtered.operationIds,['op-pdf']);assert.equal(filtered.requested,2);assert.equal(filtered.active,1);assert.equal(filtered.excluded.count,1);assert.equal(filtered.excluded.items[0].id,'op-html');
  protection=await selectionReferenceProtection('plan-review',['op-pdf','op-html']);assert.equal(protection.required,false);assert.equal(protection.count,0);

  await updateOperationReview('op-html',{excluded:false,note:'recluir smoke'});h=await getOperationReview('op-html');assert.equal(h.operation.reviewStatus,'approved');const filteredAgain=await filterReviewedSelection('plan-review',['op-pdf','op-html']);assert.equal(filteredAgain.active,2);protection=await selectionReferenceProtection('plan-review',filteredAgain.operationIds);assert.equal(protection.required,true);assert.equal(protection.count,1);
  latest=await getLatestReviewPlan();assert.equal(latest.counts.approved,1);assert.equal(latest.counts.pending,1);assert.equal(latest.counts.reviewed,1);

  await quarantineOperationReview('op-pdf');r=await getOperationReview('op-pdf');assert.equal(r.operation.type,'QUARANTINE_FILE');assert.equal(r.operation.reviewQuarantined,true);assert.match(r.operation.after,/_RB_Quarantine/);assert.match(r.operation.after,/Revisao/);assert.equal(r.operation.reviewExcluded,false);assert.equal(r.operation.reviewApproved,true);assert.equal(r.operation.reviewStatus,'quarantine');
  latest=await getLatestReviewPlan();assert.equal(latest.operations.find(o=>o.id==='op-pdf').reviewQuarantined,true);assert.equal(latest.counts.quarantine,1);assert.equal(latest.counts.approved,1);assert.equal(latest.counts.reviewed,2);assert.equal(latest.counts.pending,0);
  await resetOperationReview('op-pdf');r=await getOperationReview('op-pdf');assert.equal(r.operation.type,'MOVE_FILE');assert.equal(r.operation.reviewQuarantined,false);assert.equal(r.operation.after,path.join(organized,'Trabalho','relatorio.pdf'));assert.equal(r.operation.reviewStatus,'pending');

  const state=await readState(),saved=state.plans.find(p=>p.id==='plan-review'),savedPdf=saved.operations.find(o=>o.id==='op-pdf'),savedHtml=saved.operations.find(o=>o.id==='op-html');assert.ok(savedPdf.reviewHistory.length>=4);assert.ok(savedHtml.reviewHistory.length>=2);assert.equal(savedHtml.reviewExcluded,false);assert.equal(savedHtml.reviewApproved,true);
  console.log('Review smoke OK · progress states · approve/reinclude · global queue · persistent exclusions · safe quarantine · no hard delete · reference preservation');
} finally {
  await rm(root,{recursive:true,force:true});await rm(data,{recursive:true,force:true});
}
