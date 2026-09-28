import { readdir, stat, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { id, readState, saveScan, savePlan, replacePlan } from './storage.mjs';
import { assertAllowedPath } from './workspace.mjs';
import { indexFolderDocumentsAsync, enrichPlanWithDocuments } from './documents.mjs';
import { buildFamilyClusters, familyProfile, normalizeTopic, projectLikeEntries, isSystemProfileFolder, isNoiseFile, fold, cleanSegment } from './families.mjs';

const jobs=new Map();
const home=path.resolve(os.homedir());
const ignored=new Set(['.git','node_modules','$recycle.bin','appdata','.venv','venv','dist','build','.next','.cache','.bun','.npm','.pnpm-store','.yarn','.cargo','.rustup','.gradle','.m2','.nuget','.cursor','.vscode','.idea','coverage','target','bin','obj','__pycache__','vendor','wheels','site-packages','_rb_quarantine']);
const webCode=new Set(['.html','.htm','.css','.scss','.js','.jsx','.ts','.tsx']);
const categories={'.pdf':'PDFs','.doc':'Documentos','.docx':'Documentos','.odt':'Documentos','.txt':'Documentos','.md':'Documentos','.xlsx':'Planilhas','.xls':'Planilhas','.csv':'Planilhas','.ods':'Planilhas','.pptx':'Apresentações','.ppt':'Apresentações','.jpg':'Imagens','.jpeg':'Imagens','.png':'Imagens','.webp':'Imagens','.gif':'Imagens','.heic':'Imagens','.mp4':'Vídeos','.mov':'Vídeos','.mkv':'Vídeos','.avi':'Vídeos','.mp3':'Áudios','.wav':'Áudios','.zip':'Compactados','.rar':'Compactados','.7z':'Compactados','.json':'Dados','.xml':'Dados','.yaml':'Dados','.yml':'Dados','.html':'Artefatos Web','.htm':'Artefatos Web','.css':'Artefatos Web','.scss':'Artefatos Web','.js':'Artefatos Web','.jsx':'Artefatos Web','.ts':'Artefatos Web','.tsx':'Artefatos Web','.exe':'Instaladores','.msi':'Instaladores','.stl':'Modelos 3D','.3mf':'Modelos 3D','.ofx':'Financeiro'};
const genericFolders=new Set(['downloads','download','desktop','area de trabalho','área de trabalho','documents','documentos','onedrive','pictures','imagens','videos','vídeos','music','música','musica','organizado','pessoal','trabalho','financeiro','condomínio','condominio','projetos','entrada','mídia pessoal','midia pessoal','geral']);
const stop=new Set('final novo nova copia copy arquivo documento download downloads desktop index main temp tmp teste test versao versão 2024 2025 2026 html pdf docx xlsx txt csv json css javascript typescript'.split(' '));
function now(){return new Date().toISOString();}
function publicJob(j){if(!j)return null;return{id:j.id,status:j.status,phase:j.phase,percent:j.percent,message:j.message,root:j.root,spaceId:j.spaceId,startedAt:j.startedAt,updatedAt:j.updatedAt,finishedAt:j.finishedAt||null,counters:j.counters,error:j.error||'',scan:j.status==='completed'?j.scan:undefined,plan:j.status==='completed'?j.plan:undefined};}
function setJob(j,patch){Object.assign(j,patch,{updatedAt:now()});}
function cancelled(j){return j.cancelled===true;}
function ensureRunning(j){if(cancelled(j))throw new Error('Análise cancelada.');}
async function exists(p){try{await access(p);return true}catch{return false}}
function extCategory(ext){return categories[ext]||'Outros';}
function filenameTokens(name){return fold(path.parse(name).name).match(/[a-z0-9][a-z0-9-]{3,}/g)?.filter(x=>!stop.has(x)&&!/^\d+$/.test(x))||[];}
function titleWords(words){return words.slice(0,2).map(x=>x.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())).join(' ');}
function pathParts(root,file){return path.relative(root,file).split(path.sep).filter(Boolean);}
function meaningfulParent(root,file){const dirs=pathParts(root,path.dirname(file));return dirs.map(cleanSegment).find(x=>!genericFolders.has(fold(x))&&!ignored.has(fold(x))&&!/^\d{4}$/.test(x))||'';}
function inferArea(file,root,space){const hay=fold(pathParts(root,file.path).join(' ')+' '+file.name);if(/condominio|sudene|avcb|elevador|predial|extintor/.test(hay))return'Condomínio';if(/extrato|boleto|fatura|pagamento|darf|nota fiscal|finance|contab/.test(hay))return'Financeiro';if(/sefaz|cliente|empresa|reuniao|relatorio|contrato|trabalho/.test(hay))return'Trabalho';if(/github|gitlab|repo|projeto|project|deploy|build/.test(hay))return'Projetos';if(/curriculo|cpf|identidade|familia|pessoal/.test(hay))return'Pessoal';if(['rb-hub','condominio','projetos','pessoal'].includes(space?.id))return({'rb-hub':'Trabalho','condominio':'Condomínio','projetos':'Projetos','pessoal':'Pessoal'})[space.id];const rootName=fold(path.basename(root));if(/download|desktop|area de trabalho/.test(rootName))return'Entrada';return cleanSegment(space?.name||'Geral');}
async function hashFile(file){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=createReadStream(file);s.on('data',d=>h.update(d));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')));});}

async function smartScan(j){
  const root=assertAllowedPath(j.root),state=await readState(),max=Number(state.settings?.maxScanFiles||5000),files=[],folders=[],skipped={technical:[],projects:[],system:[]};let truncated=false;
  const rootStat=await stat(root).catch(()=>null);if(!rootStat?.isDirectory())throw new Error('A pasta selecionada não existe.');
  const rootIsHome=path.resolve(root)===home;
  async function walk(dir,depth=0){
    ensureRunning(j);if(depth>12||files.length>=max){truncated=true;return;}
    const entries=await readdir(dir,{withFileTypes:true}).catch(()=>[]);
    if(dir!==root&&projectLikeEntries(entries)){skipped.projects.push(dir);j.counters.projectsSkipped=skipped.projects.length;return;}
    for(const e of entries){
      ensureRunning(j);if(files.length>=max){truncated=true;return;}if(e.isSymbolicLink())continue;
      const full=path.join(dir,e.name),low=fold(e.name);
      if(e.isDirectory()){
        if(rootIsHome&&dir===root&&isSystemProfileFolder(e.name)){skipped.system.push(full);j.counters.systemSkipped=skipped.system.length;continue;}
        if(ignored.has(low)||low.startsWith('.')){skipped.technical.push(full);j.counters.technicalSkipped=skipped.technical.length;continue;}
        folders.push(full);j.counters.folders=folders.length;await walk(full,depth+1);continue;
      }
      if(!e.isFile())continue;
      if(isNoiseFile(e.name)){skipped.technical.push(full);j.counters.technicalSkipped=skipped.technical.length;continue;}
      const st=await stat(full).catch(()=>null);if(!st)continue;const ext=path.extname(e.name).toLowerCase();
      files.push({id:id('file'),path:full,relativePath:path.relative(root,full),name:e.name,ext,size:st.size,modifiedAt:st.mtime.toISOString(),createdAt:st.birthtime?.toISOString?.()||null,category:extCategory(ext),depth:pathParts(root,path.dirname(full)).length});
      j.counters.files=files.length;j.counters.bytes=(j.counters.bytes||0)+st.size;
      if(files.length%20===0){setJob(j,{message:`Varrendo arquivos… ${files.length} encontrados`,percent:Math.min(28,5+Math.floor(files.length/Math.max(100,max)*23))});await new Promise(r=>setImmediate(r));}
    }
  }
  await walk(root);
  const scan={id:id('scan'),spaceId:j.spaceId,root,createdAt:now(),fileCount:files.length,folderCount:folders.length,truncated,files,skipped:{technicalCount:skipped.technical.length,repositoryCount:skipped.projects.length,systemCount:skipped.system.length,technical:skipped.technical.slice(0,50),repositories:skipped.projects.slice(0,50),system:skipped.system.slice(0,50)}};
  await saveScan(scan);return scan;
}
function fileTopicMap(files){const df=new Map(),tokensBy=new Map();for(const f of files){const tokens=[...new Set(filenameTokens(f.name))];tokensBy.set(f.path,tokens);for(const t of tokens)df.set(t,(df.get(t)||0)+1);}const maxDf=Math.max(2,Math.ceil(files.length*.45)),map=new Map();for(const f of files){const shared=(tokensBy.get(f.path)||[]).filter(t=>(df.get(t)||0)>=2&&(df.get(t)||0)<=maxDf).sort((a,b)=>(df.get(a)||0)-(df.get(b)||0));if(shared.length)map.set(f.path,titleWords(shared));else{const parent=meaningfulParent(path.dirname(f.path),f.path);map.set(f.path,parent||titleWords(tokensBy.get(f.path)||[])||'Geral');}}return map;}
async function duplicates(j,files){const bySize=new Map();for(const f of files){if(!f.size)continue;const a=bySize.get(f.size)||[];a.push(f);bySize.set(f.size,a);}const groups=[],candidates=[...bySize.values()].filter(a=>a.length>1);let done=0,total=candidates.reduce((n,a)=>n+a.length,0);for(const group of candidates){const byHash=new Map();for(const f of group){ensureRunning(j);const h=await hashFile(f.path).catch(()=>null);done++;j.counters.hashes=done;setJob(j,{message:`Confirmando duplicados… ${done}/${total}`,percent:92+Math.min(6,Math.floor(done/Math.max(1,total)*6))});if(!h)continue;const a=byHash.get(h)||[];a.push(f);byHash.set(h,a);}for(const [hash,items] of byHash)if(items.length>1)groups.push({hash,size:items[0].size,files:items});}return groups;}

async function buildPlan(j,scan,docs){
  ensureRunning(j);
  const state=await readState(),space=state.spaces.find(s=>s.id===j.spaceId)||state.spaces[0],root=scan.root,rootIsOrganized=fold(path.basename(root))==='organizado';
  const destRoot=rootIsOrganized?root:(space?.basePath?assertAllowedPath(space.basePath):path.join(home,'Organizado'));
  const docBy=new Map(docs.map(d=>[path.resolve(d.path),d])),topics=fileTopicMap(scan.files),families=buildFamilyClusters(scan.files,docs,root),findings=[],operations=[];
  for(const f of scan.files){
    ensureRunning(j);const rel=pathParts(root,f.path);if(!rootIsOrganized&&rel.map(fold).includes('organizado'))continue;
    const d=docBy.get(path.resolve(f.path)),profile=familyProfile(f,d,families.get(f.path));
    const area=profile?.area||((d?.area&&['medium','high'].includes(d.areaConfidence))?d.area:inferArea(f,root,space));
    const family=profile?.family||meaningfulParent(root,f.path)||(d?.topic&&['medium','high'].includes(d.topicConfidence)?d.topic:topics.get(f.path))||'Geral';
    let topic=profile?.topic||((d?.topic&&d.topicConfidence==='high')?d.topic:'');
    const bucket=d?.bucket&&d.bucket!=='Documentos'?d.bucket:f.category;topic=normalizeTopic(family,topic,bucket);
    const isWeb=webCode.has(f.ext),rootName=fold(path.basename(root)),looseGeneric=/download|desktop|area de trabalho|organizado/.test(rootName),direct=f.depth===0;
    if(isWeb&&!direct&&!looseGeneric&&!profile)continue;if(['.py','.java','.cs','.go','.rs','.php','.rb'].includes(f.ext))continue;
    const year=String(new Date(f.modifiedAt).getFullYear()||new Date().getFullYear()),segments=[destRoot,cleanSegment(area),cleanSegment(family)];if(topic)segments.push(cleanSegment(topic));segments.push(year,cleanSegment(bucket),f.name);const target=path.join(...segments);if(path.resolve(target)===path.resolve(f.path))continue;
    const confidence=profile?.family||d?.topicConfidence==='high'||d?.areaConfidence==='high'?'high':direct||looseGeneric?'medium':'high',reason=[area,family,topic,year,bucket].filter(Boolean).join(' → ');
    operations.push({id:id('op'),type:'MOVE_FILE',before:f.path,after:target,reason,confidence,recommended:confidence==='high',area,family,subject:family,subtopic:topic,year,category:bucket,familyLocked:Boolean(profile),organizerV17:true});
    findings.push({id:id('finding'),type:'organization_candidate',severity:'low',path:f.path,message:reason});
  }
  const dups=await duplicates(j,scan.files.filter(f=>!(!rootIsOrganized&&pathParts(root,f.path).map(fold).includes('organizado'))));for(const g of dups){findings.push({id:id('finding'),type:'duplicate',severity:'medium',message:`${g.files.length} arquivos idênticos.`,hash:g.hash,paths:g.files.map(x=>x.path)});for(const f of g.files.slice(1))operations.push({id:id('op'),type:'QUARANTINE_FILE',before:f.path,after:path.join(home,'_RB_Quarantine','Duplicados',f.name),reason:'Duplicado confirmado por SHA-256. Revisão opcional; nunca excluir automaticamente.',confidence:'medium',recommended:false,sha256:g.hash,area:'Duplicados',family:'Duplicados',subject:'Duplicados',subtopic:'',year:'',category:'Duplicados',organizerV17:true});}
  const groups={},familyStats={};for(const op of operations){groups[op.area]=(groups[op.area]||0)+1;const key=`${op.area} → ${op.family||op.subject||'Geral'}`;familyStats[key]=(familyStats[key]||0)+1;}
  let plan={id:id('plan'),scanId:scan.id,spaceId:space?.id||j.spaceId,spaceName:space?.name||'Geral',root,createdAt:now(),policy:space?.policy||'',destinationRoot:destRoot,findings,operations,groups,familyStats,status:'preview',skipped:scan.skipped||{},consolidationMode:rootIsOrganized,organizerVersion:'1.7'};
  await savePlan(plan);plan=enrichPlanWithDocuments(plan,docs);await replacePlan(plan);return plan;
}
async function run(j){try{
  setJob(j,{status:'running',phase:'scan',percent:4,message:'Varrendo a pasta e protegendo caches, atalhos e projetos…'});const scan=await smartScan(j);j.scan=scan;ensureRunning(j);
  setJob(j,{phase:'documents',percent:32,message:`Lendo conteúdo dos documentos… 0/${scan.fileCount}`});let child=null;const docs=await indexFolderDocumentsAsync(scan.files,{isCancelled:()=>cancelled(j),onChild:c=>child=c,onProgress:p=>{j.child=child;j.counters.documents=p.processed||0;j.counters.documentsTotal=p.total||0;const pct=34+Math.floor((p.processed||0)/Math.max(1,p.total||1)*48);setJob(j,{percent:Math.min(82,pct),message:`Lendo documentos… ${p.processed||0}/${p.total||0}${p.file?` · ${p.file}`:''}`});}});j.child=null;ensureRunning(j);
  setJob(j,{phase:'grouping',percent:84,message:'Consolidando famílias maiores e subtemas…'});const plan=await buildPlan(j,scan,docs);j.plan=plan;ensureRunning(j);
  setJob(j,{status:'completed',phase:'done',percent:100,message:`Análise concluída · ${scan.fileCount} arquivos · ${plan.operations.filter(o=>o.type==='MOVE_FILE').length} movimentos sugeridos`,finishedAt:now()});
}catch(e){if(cancelled(j)){setJob(j,{status:'cancelled',phase:'cancelled',message:'Análise cancelada. Você pode selecionar outra pasta.',finishedAt:now()});}else setJob(j,{status:'failed',phase:'failed',message:'A análise encontrou um erro.',error:e.message,finishedAt:now()});}}
export function startOrganizerJob({path:input,spaceId}){for(const old of jobs.values())if(['queued','running'].includes(old.status)){old.cancelled=true;try{old.child?.kill()}catch{}}const root=assertAllowedPath(input),j={id:id('orgjob'),root,spaceId,status:'queued',phase:'queued',percent:1,message:'Preparando análise…',startedAt:now(),updatedAt:now(),counters:{files:0,folders:0,bytes:0,documents:0,documentsTotal:0,technicalSkipped:0,projectsSkipped:0,systemSkipped:0,hashes:0},cancelled:false,child:null,scan:null,plan:null,error:''};jobs.set(j.id,j);run(j);return publicJob(j);}
export function organizerJobStatus(jobId){const j=jobs.get(jobId);if(!j)throw new Error('Análise não encontrada ou já expirada.');return publicJob(j);}
export function cancelOrganizerJob(jobId){const j=jobs.get(jobId);if(!j)throw new Error('Análise não encontrada.');j.cancelled=true;try{j.child?.kill()}catch{}setJob(j,{status:'cancelled',phase:'cancelled',message:'Cancelamento solicitado.',finishedAt:now()});return publicJob(j);}
