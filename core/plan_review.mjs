import { stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mutate, readState } from './storage.mjs';
import { assertAllowedPath } from './workspace.mjs';

const home=path.resolve(os.homedir());
const REFERENCE_EXTS=new Set(['.html','.htm','.url','.lnk']);
const RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function now(){return new Date().toISOString();}
function samePath(a,b){const left=path.resolve(a),right=path.resolve(b);return process.platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;}
function locate(state,opId){for(const plan of state.plans||[]){const operation=(plan.operations||[]).find(o=>o.id===opId);if(operation)return{plan,operation};}throw new Error('Operação de revisão não encontrada. Refaça a análise se o plano já expirou.');}
function referenceRisk(operation){const ext=path.extname(operation.before||operation.after||'').toLowerCase();return REFERENCE_EXTS.has(ext);}
function safeFilename(input,expectedExt){const name=String(input||'').trim();if(!name||name==='.'||name==='..')throw new Error('Informe um nome de arquivo válido.');if(path.basename(name)!==name||/[<>:"/\\|?*\u0000-\u001f]/.test(name)||RESERVED.test(name))throw new Error('O nome contém caracteres ou um identificador reservado pelo Windows.');const ext=path.extname(name).toLowerCase();if(expectedExt&&ext!==expectedExt.toLowerCase())throw new Error(`A extensão deve permanecer ${expectedExt}. Renomeie apenas o arquivo, sem alterar o tipo.`);return name.slice(0,220);}
function reviewSnapshot(op){return{after:op.after,type:op.type,preserveSource:Boolean(op.preserveSource),recommended:Boolean(op.recommended),reviewExcluded:Boolean(op.reviewExcluded)};}
function documentInfo(plan,source){const docs=plan.documentIntelligence?.documents||[];const target=path.resolve(source);return docs.find(d=>{try{return path.resolve(d.path)===target}catch{return false}})||null;}
function publicOperation(op){return{id:op.id,type:op.type,before:op.before,after:op.after,reason:op.reason||'',confidence:op.confidence||'',recommended:Boolean(op.recommended),area:op.area||'Outros',family:op.family||'',subject:op.subject||'Geral',subtopic:op.subtopic||'',category:op.category||'',referenceRisk:referenceRisk(op),reviewEdited:Boolean(op.reviewEdited),reviewExcluded:Boolean(op.reviewExcluded),reviewQuarantined:op.type==='QUARANTINE_FILE'};}
function pushHistory(operation,before,note){operation.reviewedAt=now();operation.reviewHistory=[...(operation.reviewHistory||[]),{at:operation.reviewedAt,before,after:reviewSnapshot(operation),note:String(note||'Ajuste manual').slice(0,300)}].slice(-30);}

export async function getOperationReview(opId){
  const state=await readState(),{plan,operation}=locate(state,opId),source=assertAllowedPath(operation.before),s=await stat(source).catch(()=>null),doc=documentInfo(plan,source);
  return{
    planId:plan.id,
    operation:{...operation,referenceRisk:referenceRisk(operation),reviewQuarantined:operation.type==='QUARANTINE_FILE'},
    source:{path:source,name:path.basename(source),ext:path.extname(source).toLowerCase(),exists:Boolean(s?.isFile()),size:s?.size??null,modifiedAt:s?.mtime?.toISOString?.()||null},
    document:doc?{name:doc.name||path.basename(source),topic:doc.topic||'',bucket:doc.bucket||'',area:doc.area||'',summary:doc.summary||'',method:doc.method||'',complete:doc.complete!==false,textLength:doc.textLength||0,error:doc.error||''}:null,
    trace:{original:operation.reviewOriginal||reviewSnapshot(operation),history:operation.reviewHistory||[],edited:Boolean(operation.reviewEdited)}
  };
}

export async function getLatestReviewPlan(){
  const state=await readState(),plan=(state.plans||[])[0];if(!plan)throw new Error('Ainda não existe um plano para revisar. Analise uma pasta primeiro.');
  return{id:plan.id,root:plan.root,createdAt:plan.createdAt,spaceId:plan.spaceId,spaceName:plan.spaceName||'',destinationRoot:plan.destinationRoot||'',operations:(plan.operations||[]).map(publicOperation)};
}

export async function updateOperationReview(opId,input={}){
  return mutate((state)=>{
    const {plan,operation}=locate(state,opId);
    if(!operation.reviewOriginal)operation.reviewOriginal=reviewSnapshot(operation);
    const before=reviewSnapshot(operation),expectedExt=path.extname(operation.after||operation.before||'');
    let target=assertAllowedPath(operation.after);
    if(input.destinationDir!==undefined){const dir=assertAllowedPath(String(input.destinationDir||'').trim());target=path.join(dir,path.basename(target));}
    if(input.filename!==undefined){const filename=safeFilename(input.filename,expectedExt);target=path.join(path.dirname(target),filename);}
    target=assertAllowedPath(target);
    if(samePath(target,operation.before))throw new Error('O destino revisado ficou igual à origem. Nesse caso, marque o item como “não mover”.');
    operation.after=target;
    if(input.excluded!==undefined)operation.reviewExcluded=Boolean(input.excluded);
    operation.reviewEdited=true;
    pushHistory(operation,before,input.note||'Ajuste manual de destino');
    plan.updatedAt=now();
    return{planId:plan.id,operation:{...operation,referenceRisk:referenceRisk(operation),reviewQuarantined:operation.type==='QUARANTINE_FILE'}};
  });
}

export async function quarantineOperationReview(opId){
  return mutate((state)=>{
    const {plan,operation}=locate(state,opId);if(!operation.reviewOriginal)operation.reviewOriginal=reviewSnapshot(operation);
    const before=reviewSnapshot(operation),stamp=new Date().toISOString().slice(0,7),target=assertAllowedPath(path.join(home,'_RB_Quarantine','Revisao',stamp,path.basename(operation.before)));
    operation.type='QUARANTINE_FILE';operation.after=target;operation.reviewExcluded=false;operation.reviewEdited=true;operation.reason=`Quarentena solicitada na revisão · origem preservada por checkpoint antes da execução`;
    pushHistory(operation,before,'Marcado para quarentena segura');plan.updatedAt=now();
    return{planId:plan.id,operation:{...operation,referenceRisk:referenceRisk(operation),reviewQuarantined:true}};
  });
}

export async function resetOperationReview(opId){
  return mutate((state)=>{
    const {plan,operation}=locate(state,opId),original=operation.reviewOriginal;if(!original)return{planId:plan.id,operation:{...operation,referenceRisk:referenceRisk(operation),reviewQuarantined:operation.type==='QUARANTINE_FILE'}};
    const before=reviewSnapshot(operation);operation.after=original.after;operation.type=original.type;operation.preserveSource=original.preserveSource;operation.recommended=original.recommended;operation.reviewExcluded=Boolean(original.reviewExcluded);operation.reviewEdited=false;pushHistory(operation,before,'Sugestão automática restaurada');plan.updatedAt=now();return{planId:plan.id,operation:{...operation,referenceRisk:referenceRisk(operation),reviewQuarantined:operation.type==='QUARANTINE_FILE'}};
  });
}

export async function filterReviewedSelection(planId,operationIds=[]){
  const state=await readState(),plan=(state.plans||[]).find(p=>p.id===planId);if(!plan)throw new Error('Plano não encontrado. Faça uma nova análise.');const requested=new Set(operationIds||[]),selected=(plan.operations||[]).filter(o=>requested.has(o.id)),active=selected.filter(o=>!o.reviewExcluded),excluded=selected.filter(o=>o.reviewExcluded);
  return{operationIds:active.map(o=>o.id),requested:selected.length,active:active.length,excluded:{count:excluded.length,items:excluded.slice(0,20).map(publicOperation)}};
}

export async function selectionReferenceProtection(planId,operationIds=[]){
  const state=await readState(),plan=(state.plans||[]).find(p=>p.id===planId);if(!plan)throw new Error('Plano não encontrado. Faça uma nova análise.');const ids=new Set(operationIds||[]),selected=(plan.operations||[]).filter(o=>ids.has(o.id)&&!o.reviewExcluded),risky=selected.filter(referenceRisk);
  return{count:risky.length,required:risky.length>0,forcedRetentionMode:risky.length?'preserve_original':null,items:risky.slice(0,20).map(o=>({id:o.id,path:o.before,target:o.after,ext:path.extname(o.before||'').toLowerCase()}))};
}

export function reviewSafetySummary(){return{referenceExtensions:[...REFERENCE_EXTS],referencePolicy:'preserve_original',quarantineRoot:path.join(home,'_RB_Quarantine','Revisao'),hardDeleteAvailable:false,home};}
