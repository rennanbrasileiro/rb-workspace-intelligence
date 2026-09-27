import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export function indexFolderDocuments(files=[]){
  const script=path.join(root,'agent','folder_index.py');
  const payload=JSON.stringify({files:(files||[]).map(f=>({path:f.path,name:f.name,ext:f.ext,size:f.size}))});
  const r=spawnSync('python',[script],{input:payload,encoding:'utf8',maxBuffer:64*1024*1024,windowsHide:true});
  let parsed;
  try{parsed=JSON.parse((r.stdout||'').trim())}catch{throw new Error(r.stderr||'A inteligência documental não retornou uma resposta válida.');}
  if(r.status||!parsed.ok)throw new Error(parsed.error||r.stderr||'Falha ao analisar documentos da pasta.');
  return parsed.documents||[];
}

export function enrichPlanWithDocuments(plan,documents=[]){
  const byPath=new Map((documents||[]).map(d=>[path.resolve(d.path),d]));
  const findings=[...(plan.findings||[])];
  for(const d of documents||[]){
    if(d.error){findings.push({type:'document_read_error',severity:'low',path:d.path,message:`Documento não pôde ser lido integralmente: ${d.error}`});continue;}
    findings.push({type:'content_classification',severity:'low',path:d.path,message:`Conteúdo lido integralmente e classificado como ${d.bucket}${d.warning?` · ${d.warning}`:''}.`});
  }
  const operations=(plan.operations||[]).map(op=>{
    const d=byPath.get(path.resolve(op.before));
    if(!d||d.error||!d.bucket||d.bucket==='Documentos'||op.type!=='MOVE_FILE')return op;
    const year=path.basename(path.dirname(path.dirname(op.after)));
    const after=path.join(plan.destinationRoot,year,d.bucket,path.basename(op.after));
    return {...op,after,reason:`${op.reason} · conteúdo identificado como ${d.bucket}`,contentBucket:d.bucket};
  });
  return {...plan,findings,operations,documentIntelligence:{count:documents.length,readComplete:documents.filter(d=>!d.error).length,failed:documents.filter(d=>d.error).length,documents}};
}
