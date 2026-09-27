import { spawn } from 'node:child_process';

const jobs=new Map();
const MAX_LOG=1200;
function now(){return new Date().toISOString();}
function shell(command,cwd){return process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c',command],{cwd,windowsHide:true,env:{...process.env,FORCE_COLOR:'0'}}):spawn('sh',['-lc',command],{cwd,env:{...process.env,FORCE_COLOR:'0'}});}
function append(job,stream,text){for(const raw of String(text||'').split(/\r?\n/)){if(!raw)continue;job.logs.push({at:now(),stream,text:raw});if(job.logs.length>MAX_LOG)job.logs.splice(0,job.logs.length-MAX_LOG);const urls=raw.match(/https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0)(?::\d+)?(?:\/[^\s]*)?/gi)||[];if(urls.length){const u=urls[urls.length-1].replace('0.0.0.0','127.0.0.1').replace('localhost','127.0.0.1');job.detectedUrl=u;}}}
function publicJob(job){if(!job)return{status:'idle',logs:[]};return{projectId:job.projectId,status:job.status,step:job.step,command:job.command,pid:job.child?.pid||null,startedAt:job.startedAt,updatedAt:job.updatedAt,endedAt:job.endedAt||null,url:job.readyUrl||job.detectedUrl||job.expectedUrl||'',error:job.error||'',logs:job.logs||[],steps:job.steps||[]};}
function set(job,patch){Object.assign(job,patch,{updatedAt:now()});}
async function checkUrl(url){if(!url)return false;try{const c=new AbortController();const t=setTimeout(()=>c.abort(),1200);const r=await fetch(url,{signal:c.signal,redirect:'manual'});clearTimeout(t);return r.status>0;}catch{return false;}}
function runFinite(job,command,label){return new Promise((resolve,reject)=>{set(job,{status:'running',step:label,command});append(job,'system',`$ ${command}`);const child=shell(command,job.cwd);job.child=child;child.stdout.on('data',d=>append(job,'stdout',d));child.stderr.on('data',d=>append(job,'stderr',d));child.on('error',e=>{append(job,'stderr',e.message);reject(e)});child.on('exit',code=>{job.child=null;job.steps.push({label,command,code,finishedAt:now()});append(job,'system',`${label}: processo finalizado com código ${code}`);code===0?resolve():reject(new Error(`${label} falhou com código ${code}.`));});});}
async function runServer(job,command){set(job,{status:'starting',step:'Inicialização',command});append(job,'system',`$ ${command}`);const child=shell(command,job.cwd);job.child=child;child.stdout.on('data',d=>append(job,'stdout',d));child.stderr.on('data',d=>append(job,'stderr',d));child.on('error',e=>{set(job,{status:'failed',error:e.message,endedAt:now()});append(job,'stderr',e.message)});child.on('exit',code=>{job.child=null;if(!['stopped','failed'].includes(job.status)){set(job,{status:code===0?'stopped':'failed',error:code===0?'':`Servidor encerrou com código ${code}.`,endedAt:now()});append(job,code===0?'system':'stderr',`Servidor encerrou com código ${code}.`);}});
  set(job,{status:'waiting_url',step:'Aguardando aplicação'});
  for(let i=0;i<60;i++){
    if(!job.child||job.status==='stopped')return;
    const candidates=[job.detectedUrl,job.expectedUrl].filter(Boolean);
    for(const url of [...new Set(candidates)])if(await checkUrl(url)){set(job,{status:'running',step:'Rodando',readyUrl:url});append(job,'system',`Aplicação respondeu em ${url}`);openBrowser(url);return;}
    await new Promise(r=>setTimeout(r,500));
  }
  set(job,{status:'running_no_url',step:'Rodando sem URL confirmada'});append(job,'system','O processo continua ativo, mas nenhuma URL HTTP respondeu em 30 segundos. Veja o log abaixo.');
}
function openBrowser(url){if(!url)return;if(process.platform==='win32'){const c=spawn('cmd.exe',['/d','/s','/c',`start "" "${url}"`],{detached:true,stdio:'ignore',windowsHide:true});c.unref();}else{const c=spawn('sh',['-lc',`xdg-open '${url.replaceAll("'","'\\''")}' >/dev/null 2>&1 || open '${url.replaceAll("'","'\\''")}'`],{detached:true,stdio:'ignore'});c.unref();}}
async function pipeline(job,project,mode){try{
  if(mode==='prepare'||mode==='build'){
    if(project.commands?.install){set(job,{step:'Dependências'});await runFinite(job,project.commands.install,'Dependências');}
    if(project.commands?.build){set(job,{step:'Build'});await runFinite(job,project.commands.build,'Build');}
    else append(job,'system','Nenhum comando de build foi detectado; etapa ignorada.');
    if(mode==='build'){set(job,{status:'completed',step:'Build concluído',endedAt:now()});return;}
  }
  const run=project.commands?.dev||project.commands?.start;if(!run)throw new Error('Não foi possível inferir um comando de execução seguro para este projeto.');await runServer(job,run);
}catch(e){if(job.status!=='stopped'){set(job,{status:'failed',step:'Falhou',error:e.message,endedAt:now()});append(job,'stderr',e.message);}}
}
export function startRuntime(project,mode='prepare'){stopRuntime(project.id);const job={projectId:project.id,cwd:project.path,status:'queued',step:'Preparando',command:'',startedAt:now(),updatedAt:now(),expectedUrl:project.localUrl||'',detectedUrl:'',readyUrl:'',error:'',logs:[],steps:[],child:null};jobs.set(project.id,job);append(job,'system',`Projeto: ${project.name}`);append(job,'system',`Pasta: ${project.path}`);pipeline(job,project,mode);return publicJob(job);}
export function runtimeStatus(projectId){return publicJob(jobs.get(projectId));}
export function stopRuntime(projectId){const job=jobs.get(projectId);if(!job)return{status:'idle',logs:[]};if(job.child){try{if(process.platform==='win32'){spawn('taskkill',['/PID',String(job.child.pid),'/T','/F'],{windowsHide:true});}else job.child.kill('SIGTERM');}catch{}}set(job,{status:'stopped',step:'Parado',endedAt:now()});append(job,'system','Processo interrompido pelo usuário.');job.child=null;return publicJob(job);}
export function restartRuntime(project,mode='prepare'){stopRuntime(project.id);return startRuntime(project,mode);}
export function openRuntime(projectId,fallbackUrl=''){const job=jobs.get(projectId);const url=job?.readyUrl||job?.detectedUrl||job?.expectedUrl||fallbackUrl;if(!url)throw new Error('Ainda não há URL detectada para este projeto.');openBrowser(url);return{url};}
