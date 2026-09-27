import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function payloadFor(files=[]){return JSON.stringify({files:(files||[]).map(f=>({path:f.path,name:f.name,ext:f.ext,size:f.size}))});}
function parseResult(stdout,stderr=''){
  let parsed;
  try{parsed=JSON.parse(String(stdout||'').trim())}catch{throw new Error(stderr||'A inteligência documental não retornou uma resposta válida.');}
  if(!parsed.ok)throw new Error(parsed.error||stderr||'Falha ao analisar documentos da pasta.');
  return parsed.documents||[];
}
export function indexFolderDocuments(files=[]){
  const script=path.join(root,'agent','folder_index.py');
  const r=spawnSync('python',[script],{input:payloadFor(files),encoding:'utf8',maxBuffer:128*1024*1024,windowsHide:true});
  if(r.status)throw new Error(r.stderr||'Falha ao analisar documentos da pasta.');
  return parseResult(r.stdout,r.stderr);
}
export function indexFolderDocumentsAsync(files=[],{onProgress=()=>{},isCancelled=()=>false,onChild=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    const script=path.join(root,'agent','folder_index.py');
    const child=spawn('python',[script],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    onChild(child);let stdout='',stderr='',buffer='';
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',d=>stdout+=d);
    child.stderr.on('data',d=>{
      stderr+=d;buffer+=d;
      const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
      for(const line of lines){
        if(line.startsWith('RB_PROGRESS ')){
          try{onProgress(JSON.parse(line.slice(12)))}catch{}
        }
      }
    });
    child.on('error',reject);
    child.on('exit',code=>{
      if(isCancelled())return reject(new Error('Análise cancelada.'));
      if(code!==0)return reject(new Error(stderr||`Leitor documental encerrou com código ${code}.`));
      try{resolve(parseResult(stdout,stderr))}catch(e){reject(e)}
    });
    if(isCancelled()){child.kill();return reject(new Error('Análise cancelada.'));}
    child.stdin.end(payloadFor(files));
  });
}

export function enrichPlanWithDocuments(plan,documents=[]){
  const byPath=new Map((documents||[]).map(d=>[path.resolve(d.path),d]));
  const findings=[...(plan.findings||[])];
  for(const d of documents||[]){
    if(d.error){findings.push({type:'document_read_error',severity:'low',path:d.path,message:`Documento não pôde ser lido integralmente: ${d.error}`});continue;}
    findings.push({type:'content_classification',severity:'low',path:d.path,message:`Conteúdo lido integralmente · ${d.area||'Área não definida'} → ${d.topic||'Geral'} → ${d.bucket}${d.warning?` · ${d.warning}`:''}.`});
  }
  const operations=(plan.operations||[]).map(op=>{
    const d=byPath.get(path.resolve(op.before));
    if(!d||d.error||op.type!=='MOVE_FILE')return op;
    const area=(d.area&&['medium','high'].includes(d.areaConfidence))?d.area:(op.area||'Geral');
    const topic=(d.topic&&['medium','high'].includes(d.topicConfidence))?d.topic:(op.subject||'Geral');
    const bucket=d.bucket&&d.bucket!=='Documentos'?d.bucket:(op.category||'Documentos');
    const after=path.join(plan.destinationRoot,area,topic,op.year||String(new Date().getFullYear()),bucket,path.basename(op.after));
    return {...op,after,area,subject:topic,category:bucket,reason:`${area} → ${topic} → ${op.year||''} → ${bucket}`,contentBucket:d.bucket,contentTopic:d.topic,contentArea:d.area,contentConfidence:d.confidence};
  });
  return {...plan,findings,operations,documentIntelligence:{count:documents.length,readComplete:documents.filter(d=>!d.error).length,failed:documents.filter(d=>d.error).length,documents}};
}
