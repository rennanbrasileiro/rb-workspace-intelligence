import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureState, readState, upsertSpace, removeSpace, replacePlan } from './core/storage.mjs';
import { scanFolder, analyzeScan, executePlan, rollbackTransaction, commonFolders, getWorkspaceSummary, assertAllowedPath } from './core/workspace.mjs';
import { devStatus, runConsole, projectAction, checkUpdate, pullUpdate, restartApp, addProject, repoRoot } from './core/dev.mjs';
import { listLocalProjects, inspectLocalProject, cloneLocalProject, addExistingProject, createEmptyProject, localProjectAction, localGit, localConsole } from './core/projects.mjs';
import { indexFolderDocuments, enrichPlanWithDocuments } from './core/documents.mjs';
import { githubLocalStatus, listGithubRepositories, beginGithubLogin, installGithubCli } from './core/github_local.mjs';
import { listProjectTree } from './core/project_tree.mjs';
import { startRuntime, runtimeStatus, stopRuntime, restartRuntime, openRuntime } from './core/runtime.mjs';
import { startOrganizerJob, organizerJobStatus, cancelOrganizerJob } from './core/organizer_v17.mjs';
import { startExecutionJob, executionJobStatus, cancelExecutionJob } from './core/execution_jobs.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4310);
const version='1.7.0';
await ensureState();
function sendJson(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let b='';for await(const c of req){b+=c;if(b.length>2_000_000)throw new Error('Payload muito grande.');}return b?JSON.parse(b):{};}
function mime(ext){return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'})[ext]||'application/octet-stream';}
function safeStatic(base,rel){const p=path.resolve(base,rel);if(!p.startsWith(path.resolve(base)))throw new Error('invalid path');return p;}
function powershellDialog(kind){
  if(process.platform!=='win32')throw new Error('O seletor nativo está disponível no Windows.');
  const home=os.homedir().replace(/'/g,"''");
  const owner=`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; Add-Type @'\nusing System;\nusing System.Runtime.InteropServices;\npublic class RBWin32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd); }\n'@; $owner=New-Object System.Windows.Forms.Form; $owner.Text='RB Workspace Intelligence'; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.StartPosition='CenterScreen'; $owner.Width=2; $owner.Height=2; $owner.Opacity=0.02; $owner.Show(); $owner.BringToFront(); $owner.Activate(); [RBWin32]::BringWindowToTop($owner.Handle) | Out-Null; [RBWin32]::SetForegroundWindow($owner.Handle) | Out-Null; Start-Sleep -Milliseconds 120;`;
  const script=kind==='folder'
    ? `${owner} $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='RB Workspace Intelligence - escolha a pasta para analisar'; $d.ShowNewFolderButton=$true; $d.SelectedPath='${home}'; $result=$d.ShowDialog($owner); if($result -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $d.SelectedPath}; $owner.Close()`
    : `${owner} $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='RB Workspace Intelligence - escolha um documento'; $d.InitialDirectory='${home}'; $d.Filter='Documentos suportados|*.pdf;*.docx;*.xlsx;*.pptx;*.txt;*.csv;*.json;*.md;*.xml;*.html;*.htm|Todos os arquivos|*.*'; $result=$d.ShowDialog($owner); if($result -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $d.FileName}; $owner.Close()`;
  const r=spawnSync('powershell.exe',['-NoProfile','-STA','-Command',script],{encoding:'utf8',windowsHide:false,maxBuffer:2*1024*1024});
  if(r.status)throw new Error(r.stderr||'Não foi possível abrir o seletor do Windows.');
  const selected=(r.stdout||'').trim();if(!selected)return null;return assertAllowedPath(selected);
}
function readDocument(input){const resolved=assertAllowedPath(input),script=path.join(root,'agent','reader.py'),r=spawnSync('python',[script,resolved],{encoding:'utf8',maxBuffer:128*1024*1024,windowsHide:true});let parsed;try{parsed=JSON.parse((r.stdout||'').trim())}catch{throw new Error(r.stderr||'O extrator de documentos não retornou uma resposta válida.');}if(r.status||!parsed.ok)throw new Error(parsed.error||r.stderr||'Falha ao ler documento.');return parsed.document;}
async function projectWithTree(id){const project=await inspectLocalProject(id);if(project.exists){const fullTree=await listProjectTree(project.path);project.tree=fullTree;project.stats={files:fullTree.files,folders:fullTree.folders};}return project;}

const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/api/system'&&req.method==='GET'){const ws=await getWorkspaceSummary(),state=await readState();return sendJson(res,200,{ok:true,version,machine:{hostname:os.hostname(),platform:os.platform(),home:os.homedir()},commonFolders:commonFolders(),settings:state.settings,...ws});}
  if(u.pathname==='/api/spaces'&&req.method==='POST')return sendJson(res,200,{ok:true,space:await upsertSpace(await body(req))});
  if(u.pathname.startsWith('/api/spaces/')&&req.method==='DELETE')return sendJson(res,200,{ok:true,removed:await removeSpace(decodeURIComponent(u.pathname.split('/').pop()))});
  if(u.pathname==='/api/pick/folder'&&req.method==='POST')return sendJson(res,200,{ok:true,path:powershellDialog('folder')});
  if(u.pathname==='/api/pick/file'&&req.method==='POST')return sendJson(res,200,{ok:true,path:powershellDialog('file')});

  if(u.pathname==='/api/organizer/jobs'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,job:startOrganizerJob({path:b.path,spaceId:b.spaceId})});}
  if(u.pathname.startsWith('/api/organizer/jobs/')&&u.pathname.endsWith('/cancel')&&req.method==='POST'){const id=decodeURIComponent(u.pathname.split('/')[4]);return sendJson(res,200,{ok:true,job:cancelOrganizerJob(id)});}
  if(u.pathname.startsWith('/api/organizer/jobs/')&&req.method==='GET'){const id=decodeURIComponent(u.pathname.split('/')[4]);return sendJson(res,200,{ok:true,job:organizerJobStatus(id)});}

  if(u.pathname==='/api/execution/jobs'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,job:startExecutionJob({planId:b.planId,operationIds:b.operationIds})});}
  if(u.pathname.startsWith('/api/execution/jobs/')&&u.pathname.endsWith('/cancel')&&req.method==='POST'){const id=decodeURIComponent(u.pathname.split('/')[4]);return sendJson(res,200,{ok:true,job:cancelExecutionJob(id)});}
  if(u.pathname.startsWith('/api/execution/jobs/')&&req.method==='GET'){const id=decodeURIComponent(u.pathname.split('/')[4]);return sendJson(res,200,{ok:true,job:executionJobStatus(id)});}

  if(u.pathname==='/api/workspace/scan'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,scan:await scanFolder(b.path,b.spaceId)});}
  if(u.pathname==='/api/workspace/analyze'&&req.method==='POST'){const b=await body(req),plan=await analyzeScan(b.scanId,b.spaceId),state=await readState(),scan=state.scans.find(s=>s.id===b.scanId);let enriched=plan;try{const docs=indexFolderDocuments(scan?.files||[]);enriched=enrichPlanWithDocuments(plan,docs);await replacePlan(enriched);}catch(e){enriched={...plan,documentIntelligence:{count:0,readComplete:0,failed:0,error:e.message},findings:[...(plan.findings||[]),{type:'document_read_error',severity:'low',message:`A organização estrutural foi concluída, mas a leitura documental encontrou um problema: ${e.message}`}]};await replacePlan(enriched);}return sendJson(res,200,{ok:true,plan:enriched});}
  if(u.pathname==='/api/workspace/execute'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,transaction:await executePlan(b.planId,b.operationIds)});}
  if(u.pathname.startsWith('/api/transactions/')&&u.pathname.endsWith('/rollback')&&req.method==='POST'){const parts=u.pathname.split('/');return sendJson(res,200,{ok:true,transaction:await rollbackTransaction(parts[3])});}
  if(u.pathname==='/api/document/read'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,document:readDocument(b.path)});}

  if(u.pathname==='/api/projects/status'&&req.method==='GET')return sendJson(res,200,{ok:true,...await listLocalProjects()});
  if(u.pathname.startsWith('/api/projects/')&&u.pathname.endsWith('/inspect')&&req.method==='GET'){const id=decodeURIComponent(u.pathname.split('/')[3]);return sendJson(res,200,{ok:true,project:await projectWithTree(id)});}
  if(u.pathname==='/api/projects/clone'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,project:await cloneLocalProject(b.repository)});}
  if(u.pathname==='/api/projects/local'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,project:await addExistingProject(b.path)});}
  if(u.pathname==='/api/projects/create'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,project:await createEmptyProject(b.name)});}
  if(u.pathname==='/api/projects/action'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,message:await localProjectAction(b.projectId,b.action)});}
  if(u.pathname==='/api/projects/git'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,result:await localGit(b.projectId,b.action,{message:b.message,repository:b.repository})});}
  if(u.pathname==='/api/projects/command'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,result:await localConsole(b.projectId,b.command)});}
  if(u.pathname==='/api/projects/github/status'&&req.method==='GET')return sendJson(res,200,{ok:true,status:await githubLocalStatus()});
  if(u.pathname==='/api/projects/github/repos'&&req.method==='GET')return sendJson(res,200,{ok:true,...await listGithubRepositories()});
  if(u.pathname==='/api/projects/github/login'&&req.method==='POST')return sendJson(res,200,{ok:true,...beginGithubLogin()});
  if(u.pathname==='/api/projects/github/install'&&req.method==='POST')return sendJson(res,200,{ok:true,...installGithubCli()});
  if(u.pathname==='/api/projects/runtime/start'&&req.method==='POST'){const b=await body(req),project=await projectWithTree(b.projectId);return sendJson(res,200,{ok:true,runtime:startRuntime(project,b.mode||'prepare')});}
  if(u.pathname==='/api/projects/runtime/stop'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,runtime:stopRuntime(b.projectId)});}
  if(u.pathname==='/api/projects/runtime/restart'&&req.method==='POST'){const b=await body(req),project=await projectWithTree(b.projectId);return sendJson(res,200,{ok:true,runtime:restartRuntime(project,b.mode||'prepare')});}
  if(u.pathname==='/api/projects/runtime/open'&&req.method==='POST'){const b=await body(req),project=await projectWithTree(b.projectId);return sendJson(res,200,{ok:true,...openRuntime(b.projectId,project.localUrl||'')});}
  if(u.pathname.startsWith('/api/projects/runtime/')&&req.method==='GET'){const id=decodeURIComponent(u.pathname.split('/').pop());return sendJson(res,200,{ok:true,runtime:runtimeStatus(id)});}

  if(u.pathname==='/api/dev/status'&&req.method==='GET')return sendJson(res,200,{ok:true,...await devStatus()});
  if(u.pathname==='/api/dev/command'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,result:await runConsole(b.projectId,b.command)});}
  if(u.pathname==='/api/dev/project'&&req.method==='POST'){const b=await body(req);return sendJson(res,200,{ok:true,message:await projectAction(b.projectId,b.action)});}
  if(u.pathname==='/api/dev/projects'&&req.method==='POST')return sendJson(res,200,{ok:true,project:await addProject(await body(req))});
  if(u.pathname==='/api/dev/update/check'&&req.method==='POST')return sendJson(res,200,{ok:true,update:await checkUpdate()});
  if(u.pathname==='/api/dev/update/pull'&&req.method==='POST')return sendJson(res,200,{ok:true,update:await pullUpdate()});
  if(u.pathname==='/api/dev/restart'&&req.method==='POST'){const result=restartApp();return sendJson(res,200,{ok:true,...result});}

  let base,rel;if(u.pathname.startsWith('/devhub/')||u.pathname==='/devhub'||u.pathname.startsWith('/dev/')){base=path.join(root,'devhub');rel=u.pathname.replace(/^\/devhub\/?|^\/dev\/?/,'')||'index.html';}else{base=path.join(root,'app');rel=u.pathname.replace(/^\//,'')||'index.html';}const file=safeStatic(base,rel),data=await readFile(file);res.writeHead(200,{'content-type':mime(path.extname(file)),'cache-control':'no-store'});res.end(data);
}catch(e){console.error('[RBWI]',e.stack||e.message||e);if((req.url||'').startsWith('/api/'))return sendJson(res,400,{ok:false,error:e.message||String(e)});res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found');}});
server.on('clientError',(err,socket)=>{console.error('[HTTP]',err.message);socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');});
process.on('uncaughtException',e=>console.error('[UNCAUGHT]',e));process.on('unhandledRejection',e=>console.error('[UNHANDLED]',e));
server.listen(port,'127.0.0.1',()=>console.log(`RB Workspace Intelligence v${version} · http://127.0.0.1:${port} · ${repoRoot}`));