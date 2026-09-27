import http from 'node:http';
import { readFile, stat, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4310);
const projectsRoot=process.env.RB_PROJECTS_DIR||path.join(os.homedir(),'RB','Projects');
const registryFile=path.join(root,'projects.registry.json');
const protectedRoots=process.platform==='win32'?['C:\\Windows','C:\\Program Files','C:\\Program Files (x86)']:['/bin','/sbin','/usr','/etc','/System'];
const categoryByExt={'.pdf':'PDFs','.doc':'Documentos','.docx':'Documentos','.txt':'Documentos','.md':'Documentos','.xlsx':'Planilhas','.xls':'Planilhas','.csv':'Planilhas','.pptx':'Apresentações','.ppt':'Apresentações','.jpg':'Imagens','.jpeg':'Imagens','.png':'Imagens','.webp':'Imagens','.zip':'Arquivos compactados','.rar':'Arquivos compactados','.7z':'Arquivos compactados','.js':'Código','.ts':'Código','.tsx':'Código','.jsx':'Código','.py':'Código','.java':'Código','.cs':'Código','.sql':'Código'};

function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
function commandExists(name){const cmd=process.platform==='win32'?'where.exe':'which';const r=spawnSync(cmd,[name],{encoding:'utf8',windowsHide:true});return r.status===0;}
function cursorExe(){if(process.platform!=='win32')return null;const base=process.env.LOCALAPPDATA||'';const candidates=[path.join(base,'Programs','cursor','Cursor.exe'),path.join(base,'Programs','Cursor','Cursor.exe')];return candidates.find(existsSync)||null;}
function vscodeExe(){if(process.platform!=='win32')return null;const base=process.env.LOCALAPPDATA||'';const candidates=[path.join(base,'Programs','Microsoft VS Code','Code.exe'),path.join(base,'Programs','Microsoft VS Code Insiders','Code - Insiders.exe')];return candidates.find(existsSync)||null;}
function projectPath(p){return path.join(projectsRoot,p.directory||p.dir);}
async function exists(p){try{await stat(p);return true}catch{return false}}
async function loadRegistry(){const raw=JSON.parse(await readFile(registryFile,'utf8'));return Object.fromEntries((raw.projects||[]).map(p=>[p.id,p]));}
function runSync(command,cwd){if(!command)return {status:0,stdout:'Nenhum comando necessário.',stderr:''};return process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c',command],{cwd,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}):spawnSync('sh',['-lc',command],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});}
function runGit(dir,args){return spawnSync('git',['-C',dir,...args],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});}
function outputOf(r,fallback='OK'){if(r.status)throw new Error((r.stderr||r.stdout||'Comando falhou').trim());return (r.stdout||r.stderr||fallback).trim().slice(-12000);}
function windowsStart(command,cwd){const r=spawnSync('cmd.exe',['/d','/s','/c',command],{cwd,encoding:'utf8',windowsHide:true});if(r.status)throw new Error(r.stderr||r.stdout||'Falha ao abrir processo no Windows.');}
function runDetached(command,cwd,title='RB Project'){if(!command)throw new Error('Projeto não declarou comando de execução.');if(process.platform==='win32'){const safeTitle=String(title).replace(/"/g,'');windowsStart(`start "${safeTitle}" cmd /k ${command}`,cwd);return 'Processo iniciado em uma janela própria.';}const child=spawn('sh',['-lc',command],{cwd,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return `Processo iniciado · PID ${child.pid}`;}
function openUrl(url,cwd){if(process.platform==='win32')windowsStart(`start "" "${url}"`,cwd);else{const child=spawn(process.platform==='darwin'?'open':'xdg-open',[url],{cwd,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}}
function openEditor(kind,dir){if(process.platform==='win32'){
  if(kind==='cursor'){
    if(commandExists('cursor')){windowsStart(`start "" cursor -n "${dir}"`,dir);return 'Projeto aberto no Cursor.';}
    const exe=cursorExe();if(exe){windowsStart(`start "" "${exe}" -n "${dir}"`,dir);return 'Projeto aberto no Cursor.';}
    throw new Error('Cursor não encontrado. Abra o Cursor uma vez ou habilite o comando cursor no PATH.');
  }
  if(kind==='vscode'){
    if(commandExists('code')){windowsStart(`start "" code -n "${dir}"`,dir);return 'Projeto aberto no VS Code.';}
    const exe=vscodeExe();if(exe){windowsStart(`start "" "${exe}" -n "${dir}"`,dir);return 'Projeto aberto no VS Code.';}
    throw new Error('VS Code não encontrado.');
  }
 }
 const cmd=kind==='cursor'?'cursor':'code';if(!commandExists(cmd))throw new Error(`${kind==='cursor'?'Cursor':'VS Code'} não encontrado.`);const child=spawn(cmd,['-n',dir],{cwd:dir,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();return `Projeto aberto no ${kind==='cursor'?'Cursor':'VS Code'}.`;
}
function scheduleRestart(){if(process.platform==='win32'){
  const child=spawn('cmd.exe',['/d','/s','/c','timeout /t 1 /nobreak >nul & start "RB Dev Hub" cmd /k npm run dev'],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});child.unref();
 }else{
  const child=spawn('sh',['-lc','sleep 1; npm run dev'],{cwd:root,detached:true,stdio:'ignore'});child.unref();
 }
 setTimeout(()=>server.close(()=>process.exit(0)),350);
}
function assertUserPath(input){const resolved=path.resolve(input||'');if(!resolved)throw new Error('Informe um caminho.');if(protectedRoots.some(x=>resolved.toLowerCase().startsWith(path.resolve(x).toLowerCase())))throw new Error('Diretório protegido');const home=path.resolve(os.homedir());if(!resolved.toLowerCase().startsWith(home.toLowerCase()))throw new Error('No MVP, autorize somente caminhos dentro do seu usuário');return resolved;}
async function manifestFor(id,p){const dir=projectPath(p);try{return JSON.parse(await readFile(path.join(dir,'rb-project.json'),'utf8'))}catch{return {id,name:p.name,repository:p.repository,install:null,build:null,dev:null,start:null,localUrl:p.fallbackUrl,requires:['git']}}}
async function status(){const registry=await loadRegistry();const cursor=commandExists('cursor')||!!cursorExe(),vscode=commandExists('code')||!!vscodeExe();const tools={git:commandExists('git'),node:commandExists('node'),python:commandExists('python'),cursor,vscode};const rows=[];for(const [id,p] of Object.entries(registry)){const dir=projectPath(p),cloned=await exists(path.join(dir,'.git')),manifest=await manifestFor(id,p);let branch=null,head=null,dirty=null;if(cloned){branch=outputOf(runGit(dir,['branch','--show-current']),'').trim()||null;head=outputOf(runGit(dir,['log','-1','--pretty=format:%h | %s']),'').trim()||null;const s=runGit(dir,['status','--porcelain']);dirty=s.status===0?!!(s.stdout||'').trim():null;}rows.push({id,name:manifest.name||p.name,repo:p.repository,path:dir,cloned,url:manifest.localUrl||p.fallbackUrl,type:manifest.type||'unknown',role:p.role||'independent-app',current:id==='rb-workspace-intelligence',branch,head,dirty,commands:{install:manifest.install,build:manifest.build,dev:manifest.dev,start:manifest.start}});}return{projectsRoot,tools,preferredEditor:cursor?'cursor':vscode?'vscode':null,projects:rows};}
async function action(id,act){const registry=await loadRegistry();const p=registry[id];if(!p)throw new Error('Projeto desconhecido');const dir=projectPath(p);
 if(act==='clone-or-update'){await mkdir(projectsRoot,{recursive:true});if(await exists(path.join(dir,'.git'))){return outputOf(runGit(dir,['pull','--ff-only']),'Já está atualizado.');}const r=spawnSync('git',['clone',p.repository,dir],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});if(r.status)throw new Error(r.stderr||'git clone falhou. Se o repositório for privado, autentique o Git/GitHub Credential Manager e tente novamente.');return 'Clonado';}
 if(!(await exists(dir)))throw new Error('Clone o projeto primeiro');const m=await manifestFor(id,p);
 if(act==='cursor')return openEditor('cursor',dir);
 if(act==='vscode')return openEditor('vscode',dir);
 if(act==='install'){const r=runSync(m.install,dir);if(r.status)throw new Error(r.stderr||r.stdout||'Instalação falhou');return (r.stdout||'Dependências OK').trim().slice(-12000);}
 if(act==='build'){const r=runSync(m.build,dir);if(r.status)throw new Error(r.stderr||r.stdout||'Build falhou');return (r.stdout||'Build concluído').trim().slice(-12000);}
 if(act==='run'){if(id==='rb-workspace-intelligence')return 'O RB Workspace Intelligence já está rodando nesta janela em http://127.0.0.1:4310.';const command=m.dev||m.start;return runDetached(command,dir,m.name||p.name);}
 if(act==='browser'){const url=m.localUrl||p.fallbackUrl;openUrl(url,dir);return `Aplicação aberta em ${url}`;}
 if(act==='git-status')return outputOf(runGit(dir,['status','--short','--branch']),'Working tree limpa.');
 if(act==='git-log')return outputOf(runGit(dir,['log','-12','--date=short','--pretty=format:%h | %ad | %s']),'Sem commits.');
 if(act==='git-diff')return outputOf(runGit(dir,['diff','--stat']),'Sem alterações locais não commitadas.');
 if(act==='git-branch')return outputOf(runGit(dir,['branch','-vv']),'Sem branch.');
 if(act==='git-remote')return outputOf(runGit(dir,['remote','-v']),'Sem remoto configurado.');
 if(act==='git-fetch')return outputOf(runGit(dir,['fetch','--prune']),'Fetch concluído.');
 if(act==='restart'&&id==='rb-workspace-intelligence'){scheduleRestart();return 'RB Dev Hub reiniciando. A página deve voltar em alguns segundos.';}
 throw new Error('Ação não permitida');}
async function scanFolder(input){const resolved=assertUserPath(input),out=[];async function walk(dir,depth=0){if(depth>6||out.length>=3000)return;for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){if(['.git','node_modules','$Recycle.Bin','AppData'].includes(e.name))continue;const full=path.join(dir,e.name);if(e.isDirectory())await walk(full,depth+1);else{const s=await stat(full).catch(()=>null);if(s)out.push({path:full,name:e.name,size:s.size,modifiedAt:s.mtime.toISOString(),ext:path.extname(e.name).toLowerCase()});if(out.length>=3000)return;}}}await walk(resolved);return{root:resolved,count:out.length,files:out};}
function analyzeInventory(inv){const findings=[],plan=[];for(const f of inv.files){const year=new Date(f.modifiedAt).getFullYear(),category=categoryByExt[f.ext]||'Outros';const poor=/\b(final|novo|c[oó]pia|copy|documento|arquivo)(?:\s*\d+)?\b/i.test(path.parse(f.name).name)||/[()]{1}|\s{2,}/.test(f.name);if(poor)findings.push({type:'poor_filename',severity:'medium',path:f.path,message:'Nome pouco descritivo ou com marcador de versão informal.'});if(path.dirname(f.path)===inv.root){const proposed=path.join(inv.root,'Organizado',String(year),category,f.name);findings.push({type:'root_clutter',severity:'low',path:f.path,message:`Arquivo solto na raiz; candidato a ${year}/${category}.`});plan.push({operation:'MOVE_FILE',before:f.path,after:proposed,approved:false,executed:false});}}
 return{...inv,findings,plan,summary:{findings:findings.length,proposedOperations:plan.length,note:'PREVIEW apenas. Nenhum arquivo foi movido, renomeado ou apagado.'}};}
function readDocument(input){const resolved=assertUserPath(input);if(!commandExists('python'))throw new Error('Python não encontrado. Instale Python 3.11+ para Document Intelligence.');const script=path.join(root,'agent','reader.py');const r=spawnSync('python',[script,resolved],{encoding:'utf8',maxBuffer:4*1024*1024});let parsed;try{parsed=JSON.parse((r.stdout||'').trim())}catch{throw new Error(r.stderr||'O extrator não retornou JSON válido.');}if(r.status||!parsed.ok)throw new Error(parsed.error||r.stderr||'Falha ao ler documento');return parsed.document;}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');if(u.pathname==='/api/status')return json(res,200,await status());if(req.method==='POST'&&u.pathname.startsWith('/api/project/')){const [, , ,id,act]=u.pathname.split('/');return json(res,200,{ok:true,message:await action(id,act)});}if(req.method==='POST'&&['/api/scan','/api/analyze','/api/document/read'].includes(u.pathname)){let b='';for await(const c of req)b+=c;const body=JSON.parse(b||'{}');if(u.pathname==='/api/document/read')return json(res,200,{ok:true,document:readDocument(body.path)});const inv=await scanFolder(body.path);return json(res,200,u.pathname==='/api/analyze'?analyzeInventory(inv):inv);}
 let base=u.pathname.startsWith('/devhub')?path.join(root,'devhub'):path.join(root,'app');let rel=u.pathname.startsWith('/devhub')?u.pathname.replace(/^\/devhub\/?/,''):u.pathname.replace(/^\//,'');if(!rel)rel='index.html';const file=path.join(base,rel);if(!file.startsWith(base))throw new Error('invalid path');const body=await readFile(file);const ext=path.extname(file);res.writeHead(200,{'content-type':ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'text/javascript; charset=utf-8':ext==='.json'?'application/json; charset=utf-8':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(body);}catch(e){console.error('[RB Dev Hub]',e);if((req.url||'').startsWith('/api/'))return json(res,400,{ok:false,error:e.message});res.writeHead(404);res.end('Not found');}});
server.on('clientError',(err,socket)=>{console.error('[HTTP]',err.message);socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');});
process.on('uncaughtException',(err)=>console.error('[UNCAUGHT]',err));
process.on('unhandledRejection',(err)=>console.error('[UNHANDLED]',err));
server.listen(port,'127.0.0.1',()=>console.log(`RB Workspace Intelligence: http://127.0.0.1:${port} · Dev Hub: http://127.0.0.1:${port}/devhub/`));
