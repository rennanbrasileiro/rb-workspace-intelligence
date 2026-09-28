import path from 'node:path';
import { readState } from './storage.mjs';

const REFERENCE_EXTS=new Set(['.html','.htm','.url','.lnk']);
function key(p=''){const r=path.resolve(String(p||''));return process.platform==='win32'?r.toLowerCase():r;}
function opStatus(op){if(!op)return'no_action';if(op.reviewExcluded)return'excluded';if(op.type==='QUARANTINE_FILE')return'quarantine';if(op.reviewEdited)return'adjusted';if(op.reviewApproved)return'approved';return'pending';}
function referenceRisk(p=''){return REFERENCE_EXTS.has(path.extname(String(p)).toLowerCase());}
function docMap(plan){const m=new Map();for(const d of plan.documentIntelligence?.documents||[]){if(!d?.path)continue;m.set(key(d.path),d);}return m;}
function publicDoc(d){if(!d)return null;return{name:d.name||'',topic:d.topic||'',bucket:d.bucket||'',area:d.area||'',summary:d.summary||'',method:d.method||'',complete:d.complete!==false,textLength:Number(d.textLength||0),error:d.error||''};}
function publicItem(file,op,doc){const status=opStatus(op),hasSuggestion=Boolean(op);return{
  id:file.id||key(file.path),path:file.path,name:file.name||path.basename(file.path||''),relativePath:file.relativePath||'',ext:file.ext||path.extname(file.path||'').toLowerCase(),size:Number(file.size||0),modifiedAt:file.modifiedAt||null,createdAt:file.createdAt||null,category:file.category||'Outros',depth:Number(file.depth||0),
  hasSuggestion,operationId:op?.id||null,type:op?.type||null,destination:op?.after||null,reason:op?.reason||'',confidence:op?.confidence||'',area:op?.area||doc?.area||'',family:op?.family||op?.subject||'',topic:op?.subtopic||doc?.topic||'',reviewStatus:status,referenceRisk:referenceRisk(file.path),document:publicDoc(doc)
};}
function searchable(i){return[i.name,i.path,i.relativePath,i.category,i.destination,i.reason,i.area,i.family,i.topic,i.reviewStatus,i.document?.summary,i.document?.topic,i.document?.area].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');}
function matchesStatus(i,status){switch(status){case'suggestion':return i.hasSuggestion;case'pending':return i.reviewStatus==='pending';case'decided':return i.hasSuggestion&&i.reviewStatus!=='pending';case'no_action':return !i.hasSuggestion;case'reference':return i.referenceRisk;case'quarantine':return i.reviewStatus==='quarantine';default:return true;}}
function counts(items){return items.reduce((a,i)=>{a.total++;if(i.hasSuggestion)a.withSuggestion++;else a.noAction++;if(i.reviewStatus==='pending')a.pending++;if(i.hasSuggestion&&i.reviewStatus!=='pending')a.decided++;if(i.referenceRisk)a.references++;if(i.reviewStatus==='quarantine')a.quarantine++;return a;},{total:0,withSuggestion:0,noAction:0,pending:0,decided:0,references:0,quarantine:0});}

export async function getAnalyzedInventory({q='',status='all',offset=0,limit=100}={}){
  const state=await readState(),plan=(state.plans||[])[0];if(!plan)throw new Error('Ainda não existe uma análise para consultar. Analise uma pasta primeiro.');
  const scan=(state.scans||[]).find(s=>s.id===plan.scanId);if(!scan)throw new Error('O inventário desta análise não está mais disponível. Refaça a análise da pasta.');
  const ops=new Map((plan.operations||[]).map(o=>[key(o.before),o])),docs=docMap(plan);
  const all=(scan.files||[]).map(f=>publicItem(f,ops.get(key(f.path)),docs.get(key(f.path))));
  const summary=counts(all),query=String(q||'').trim().toLocaleLowerCase('pt-BR'),safeStatus=['all','suggestion','pending','decided','no_action','reference','quarantine'].includes(status)?status:'all';
  const filtered=all.filter(i=>(!query||searchable(i).includes(query))&&matchesStatus(i,safeStatus));
  const start=Math.max(0,Number(offset)||0),pageSize=Math.min(250,Math.max(1,Number(limit)||100)),items=filtered.slice(start,start+pageSize);
  return{planId:plan.id,scanId:scan.id,root:scan.root,createdAt:scan.createdAt,spaceId:plan.spaceId,spaceName:plan.spaceName||'',counts:summary,matched:filtered.length,offset:start,limit:pageSize,hasMore:start+items.length<filtered.length,items,protected:{technical:Number(scan.skipped?.technicalCount||0),projects:Number(scan.skipped?.repositoryCount||0),system:Number(scan.skipped?.systemCount||0)},readOnly:true};
}
