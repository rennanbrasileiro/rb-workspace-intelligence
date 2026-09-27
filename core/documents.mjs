import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SUPPORTED=new Set(['.pdf','.docx','.xlsx','.pptx','.txt','.csv','.json','.md','.xml','.html','.htm','.log','.yaml','.yml','.js','.css','.ts','.tsx','.jsx']);
const BATCH_SIZE=100;

function payloadFor(files=[]){return JSON.stringify({files:(files||[]).map(f=>({path:f.path,name:f.name,ext:f.ext,size:f.size}))});}
function parseResult(stdout,stderr=''){let parsed;try{parsed=JSON.parse(String(stdout||'').trim())}catch{throw new Error(stderr||'A inteligência documental não retornou uma resposta válida.');}if(!parsed.ok)throw new Error(parsed.error||stderr||'Falha ao analisar documentos da pasta.');return parsed.documents||[];}
function supportedFiles(files=[]){return (files||[]).filter(f=>SUPPORTED.has(String(f.ext||path.extname(f.path||'')).toLowerCase()));}
function chunks(items,size){const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}
function shortWarning(lines=[]){return lines.filter(Boolean).slice(-8).join(' | ').slice(0,1800);}

export function indexFolderDocuments(files=[]){
  const script=path.join(root,'agent','folder_index.py'),r=spawnSync('python',[script],{input:payloadFor(files),encoding:'utf8',maxBuffer:128*1024*1024,windowsHide:true});
  if(r.status){let parsed=null;try{parsed=JSON.parse(String(r.stdout||'').trim())}catch{}throw new Error(parsed?.error||shortWarning(String(r.stderr||'').split(/\r?\n/))||'Falha ao analisar documentos da pasta.');}
  return parseResult(r.stdout,'');
}

function runBatch(batch,{batchIndex,batchCount,offset,total,onProgress,isCancelled,onChild}){
  return new Promise((resolve,reject)=>{
    const script=path.join(root,'agent','folder_index.py');
    const child=spawn('python',[script],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    onChild(child);
    let stdout='',buffer='',settled=false;
    const warnings=[];
    const done=fn=>value=>{if(settled)return;settled=true;fn(value)};
    const resolveOnce=done(resolve),rejectOnce=done(reject);
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',d=>stdout+=d);
    child.stderr.on('data',d=>{
      buffer+=d;
      const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
      for(const line of lines){
        if(line.startsWith('RB_PROGRESS ')){
          try{
            const p=JSON.parse(line.slice(12));
            onProgress({processed:offset+(p.processed||0),total,file:p.file||'',batch:batchIndex+1,batches:batchCount});
          }catch{}
        }else if(line.trim()){
          warnings.push(line.trim());if(warnings.length>12)warnings.shift();
        }
      }
    });
    child.on('error',rejectOnce);
    child.on('exit',code=>{
      if(isCancelled())return rejectOnce(new Error('Análise cancelada.'));
      if(buffer.trim()&&!buffer.startsWith('RB_PROGRESS ')){warnings.push(buffer.trim());if(warnings.length>12)warnings.shift();}
      if(code!==0){
        let parsed=null;try{parsed=JSON.parse(String(stdout||'').trim())}catch{}
        const reason=parsed?.error||shortWarning(warnings)||`Leitor documental encerrou com código ${code}.`;
        return resolveOnce({documents:batch.map(f=>({path:f.path,name:f.name,error:`Falha isolada no lote ${batchIndex+1}/${batchCount}: ${reason}`,bucket:'Documentos',confidence:'low'})),warnings:[reason],failedBatch:true});
      }
      try{return resolveOnce({documents:parseResult(stdout,''),warnings:shortWarning(warnings)?[shortWarning(warnings)]:[],failedBatch:false});}
      catch(e){return resolveOnce({documents:batch.map(f=>({path:f.path,name:f.name,error:`Falha isolada no lote ${batchIndex+1}/${batchCount}: ${e.message}`,bucket:'Documentos',confidence:'low'})),warnings:[e.message],failedBatch:true});}
    });
    if(isCancelled()){try{child.kill()}catch{};return rejectOnce(new Error('Análise cancelada.'));}
    child.stdin.end(payloadFor(batch));
  });
}

export async function indexFolderDocumentsAsync(files=[],{onProgress=()=>{},isCancelled=()=>false,onChild=()=>{}}={}){
  const eligible=supportedFiles(files),batches=chunks(eligible,BATCH_SIZE),documents=[],warnings=[];
  let offset=0,failedBatches=0;
  if(!eligible.length){onProgress({processed:0,total:0,batch:0,batches:0,file:''});return documents;}
  for(let i=0;i<batches.length;i++){
    if(isCancelled())throw new Error('Análise cancelada.');
    const batch=batches[i];
    onProgress({processed:offset,total:eligible.length,batch:i+1,batches:batches.length,file:`Iniciando lote ${i+1}/${batches.length}`});
    const result=await runBatch(batch,{batchIndex:i,batchCount:batches.length,offset,total:eligible.length,onProgress,isCancelled,onChild});
    documents.push(...result.documents);warnings.push(...result.warnings);if(result.failedBatch)failedBatches++;
    offset+=batch.length;
    onProgress({processed:offset,total:eligible.length,batch:i+1,batches:batches.length,file:`Lote ${i+1}/${batches.length} concluído`,failedBatches,warnings:warnings.length});
    await new Promise(r=>setImmediate(r));
  }
  onChild(null);
  return documents;
}

export function enrichPlanWithDocuments(plan,documents=[]){
  const byPath=new Map((documents||[]).map(d=>[path.resolve(d.path),d])),findings=[...(plan.findings||[])];
  for(const d of documents||[]){
    if(d.error){findings.push({type:'document_read_error',severity:'low',path:d.path,message:`Documento não pôde ser lido integralmente: ${d.error}`});continue;}
    findings.push({type:'content_classification',severity:'low',path:d.path,message:`Conteúdo lido integralmente · ${d.area||'Área não definida'} → ${d.topic||'Geral'} → ${d.bucket}${d.warning?` · ${d.warning}`:''}.`});
  }
  const operations=(plan.operations||[]).map(op=>{
    const d=byPath.get(path.resolve(op.before));
    if(!d||d.error||op.type!=='MOVE_FILE')return op;
    const area=(d.area&&['medium','high'].includes(d.areaConfidence))?d.area:(op.area||'Geral'),topic=(d.topic&&['medium','high'].includes(d.topicConfidence))?d.topic:(op.subject||'Geral'),bucket=d.bucket&&d.bucket!=='Documentos'?d.bucket:(op.category||'Documentos'),after=path.join(plan.destinationRoot,area,topic,op.year||String(new Date().getFullYear()),bucket,path.basename(op.after));
    return{...op,after,area,subject:topic,category:bucket,reason:`${area} → ${topic} → ${op.year||''} → ${bucket}`,contentBucket:d.bucket,contentTopic:d.topic,contentArea:d.area,contentConfidence:d.confidence};
  });
  return{...plan,findings,operations,documentIntelligence:{count:documents.length,readComplete:documents.filter(d=>!d.error).length,failed:documents.filter(d=>d.error).length,documents}};
}
