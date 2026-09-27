import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureState, readState, upsertSpace, removeSpace } from './core/storage.mjs';
import { scanFolder, analyzeScan, executePlan, rollbackTransaction, commonFolders, getWorkspaceSummary, assertAllowedPath } from './core/workspace.mjs';
import { devStatus, runConsole, projectAction, checkUpdate, pullUpdate, restartApp, addProject, repoRoot } from './core/dev.mjs';
import { listLocalProjects, inspectLocalProject, cloneLocalProject, addExistingProject, createEmptyProject, localProjectAction, localGit, localConsole } from './core/projects.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4310);
await ensureState();

function sendJson(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let b='';for await(const c of req){b+=c;if(b.length>2_000_000)throw new Error('Payload muito grande.');}return b?JSON.parse(b):{};}
function mime(ext){return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'})[ext]||'application/octet-stream';}
function safeStatic(base,rel){const p=path.resolve(base,rel);if(!p.startsWith(path.resolve(base)))throw new Error('invalid path');return p;}

function powershellDialog(kind){
  if(process.platform!=='win32')throw new Error('O seletor nativo está disponível no Windows.');
  const script=kind==='folder'
    ? `$s=New-Object -ComObject Shell.Application; $f=$s.BrowseForFolder(0,'Escolha uma pasta para o RB Workspace Intelligence',0,0); if($f){Write-Output $f.Self.Path}`
    : `Add-Type -AssemblyName System.Windows.Forms; $owner=New-Object System.Windows.Forms.Form; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Opacity=0; $owner.Show(); $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='Escolha um documento'; $d.Filter='Documentos suportados|*.pdf;*.docx;*.xlsx;*.pptx;*.txt;*.csv;*.json;*.md;*.xml|Todos os arquivos|*.*'; if($d.ShowDialog($owner) -eq 'OK'){Write-Output $d.FileName}; $owner.Close()`;
  const r=spawnSync('powershell.exe',['-NoProfile','-STA','-Command',script],{encoding:'utf8',windowsHide:true});if(r.status)throw new Error(r.stderr||'Não foi possível abrir o seletor.');const selected=(r.stdout||'').trim();if(!selected)return null;return assertAllowedPath(selected);
}
function readDocument(input){
  const resolved=assertAllowedPath(input);const script=path.join(root,'agent','reader.py');
  const r=spawnSync('python',[script,resolved],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});let parsed;
  try{parsed=JSON.parse((r.stdout||'').trim())}catch{throw new Error(r.stderr||'O extrator de documentos não retornou uma resposta válida.');}
  if(r.status||!parsed.ok)throw new Error(parsed.error||r.stderr||'Falha ao ler documento.');return parsed.document;
}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://127.0.0.1');
    if(u.pathname==='/api/system'&&req.method==='GET'){
      const ws=await getWorkspaceSummary();const state=await readState();return sendJson(res,200,{ok:true,version:'1.1.0',machine:{hostname:os.hostname(),platform:os.platform(),home:os.homedir()},commonFolders:commonFolders(),settings:state.settings,...ws});
    }
    if(u.pathname==='/api/spaces'&&req.method==='POST')return sendJson(res,200,{ok:true,space:await upsertSpace(await body(req))});
    if(u.pathname.startsWith('/api/spaces/')&&req.method==='DELETE')return sendJson(res,200,{ok:true,removed:await removeSpace(decodeURIComponent(u.pathname.split('/').pop()))});
    if(u.pathname==='/api/pick/folder'&&req.method==='POST')return sendJson(res,200,{ok:true,path:powershellDialog('folder')});
    if(u.pathname==='/api/pick/file'&&req.method==='POST')return sendJson(res,200,{ok:true,path:powershellDialog('file')});
    if(u.pathname==='/api/workspace/scan'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,scan:await scanFolder(b.path,b.spaceId)});}
    if(u.pathname==='/api/workspace/analyze'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,plan:await analyzeScan(b.scanId,b.spaceId)});}
    if(u.pathname==='/api/workspace/execute'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,transaction:await executePlan(b.planId,b.operationIds)});}
    if(u.pathname.startsWith('/api/transactions/')&&u.pathname.endsWith('/rollback')&&req.method==='POST'){const parts=u.pathname.split('/');return sendJson(res,200,{ok:true,transaction:await rollbackTransaction(parts[3])});}
    if(u.pathname==='/api/document/read'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,document:readDocument(b.path)});}

    if(u.pathname==='/api/projects/status'&&req.method==='GET')return sendJson(res,200,{ok:true,...await listLocalProjects()});
    if(u.pathname.startsWith('/api/projects/')&&u.pathname.endsWith('/inspect')&&req.method==='GET'){const id=decodeURIComponent(u.pathname.split('/')[3]);return sendJson(res,200,{ok:true,project:await inspectLocalProject(id)});}
    if(u.pathname==='/api/projects/clone'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,project:await cloneLocalProject(b.repository)});}
    if(u.pathname==='/api/projects/local'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,project:await addExistingProject(b.path)});}
    if(u.pathname==='/api/projects/create'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,project:await createEmptyProject(b.name)});}
    if(u.pathname==='/api/projects/action'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,message:await localProjectAction(b.projectId,b.action)});}
    if(u.pathname==='/api/projects/git'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,result:await localGit(b.projectId,b.action,{message:b.message,repository:b.repository})});}
    if(u.pathname==='/api/projects/command'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,result:await localConsole(b.projectId,b.command)});}

    if(u.pathname==='/api/dev/status'&&req.method==='GET')return sendJson(res,200,{ok:true,...await devStatus()});
    if(u.pathname==='/api/dev/command'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,result:await runConsole(b.projectId,b.command)});}
    if(u.pathname==='/api/dev/project'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,message:await projectAction(b.projectId,b.action)});}
    if(u.pathname==='/api/dev/projects'&&req.method==='POST')return sendJson(res,200,{ok:true,project:await addProject(await body(req))});
    if(u.pathname==='/api/dev/update/check'&&req.method==='POST')return sendJson(res,200,{ok:true,update:await checkUpdate()});
    if(u.pathname==='/api/dev/update/pull'&&req.method==='POST')return sendJson(res,200,{ok:true,update:await pullUpdate()});
    if(u.pathname==='/api/dev/restart'&&req.method==='POST'){const result=restartApp();return sendJson(res,200,{ok:true,...result});}

    let base,rel;
    if(u.pathname.startsWith('/devhub/')||u.pathname==='/devhub'||u.pathname.startsWith('/dev/')){base=path.join(root,'devhub');rel=u.pathname.replace(/^\/devhub\/?|^\/dev\/?/,'')||'index.html';}
    else{base=path.join(root,'app');rel=u.pathname.replace(/^\//,'')||'index.html';}
    const file=safeStatic(base,rel);const data=await readFile(file);res.writeHead(200,{'content-type':mime(path.extname(file)),'cache-control':'no-store'});res.end(data);
  }catch(e){
    console.error('[RBWI]',e.stack||e.message||e);if((req.url||'').startsWith('/api/'))return sendJson(res,400,{ok:false,error:e.message||String(e)});res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');
  }
});
server.on('clientError',(err,socket)=>{console.error('[HTTP]',err.message);socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');});
process.on('uncaughtException',e=>console.error('[UNCAUGHT]',e));process.on('unhandledRejection',e=>console.error('[UNHANDLED]',e));
server.listen(port,'127.0.0.1',()=>console.log(`RB Workspace Intelligence v1.1.0 · http://127.0.0.1:${port} · Dev Console: http://127.0.0.1:${port}/devhub/ · ${repoRoot}`));
