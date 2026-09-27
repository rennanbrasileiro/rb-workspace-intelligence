import http from 'node:http';
import { readFile, stat, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4310);
const projectsRoot=process.env.RB_PROJECTS_DIR||path.join(os.homedir(),'RB','Projects');
const projects={
 'rb-workspace-intelligence':{name:'RB Workspace Intelligence',repo:'https://github.com/rennanbrasileiro/rb-workspace-intelligence.git',dir:'rb-workspace-intelligence',dev:['npm','run','dev'],url:'http://127.0.0.1:4310'},
 'molde-3d-app':{name:'MOLDÊ',repo:'https://github.com/rennanbrasileiro/molde-3d-app.git',dir:'molde-3d-app',dev:['npm','run','dev'],url:'http://127.0.0.1:4317'}
};
const protectedRoots=process.platform==='win32'?['C:\\Windows','C:\\Program Files','C:\\Program Files (x86)']:['/bin','/sbin','/usr','/etc','/System'];
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
function tool(name){const cmd=process.platform==='win32'?'where':'which';return spawnSync(cmd,[name],{encoding:'utf8',shell:false}).status===0;}
function projectPath(p){return path.join(projectsRoot,p.dir)}
function safeSpawn(command,args,cwd){const child=spawn(command,args,{cwd,detached:true,stdio:'ignore',shell:false});child.unref();return child.pid;}
async function exists(p){try{await stat(p);return true}catch{return false}}
async function status(){const tools=Object.fromEntries(['git','node','code','python'].map(t=>[t,tool(t)]));const rows=[];for(const [id,p] of Object.entries(projects)){const dir=projectPath(p);rows.push({id,name:p.name,repo:p.repo,path:dir,cloned:await exists(path.join(dir,'.git')),url:p.url});}return{projectsRoot,tools,projects:rows};}
async function action(id,act){const p=projects[id];if(!p)throw new Error('Projeto desconhecido');const dir=projectPath(p);
 if(act==='clone-or-update'){await mkdir(projectsRoot,{recursive:true});if(await exists(path.join(dir,'.git'))){const r=spawnSync('git',['-C',dir,'pull','--ff-only'],{encoding:'utf8',shell:false});if(r.status)throw new Error(r.stderr||'git pull falhou');return r.stdout.trim()||'Atualizado';}const r=spawnSync('git',['clone',p.repo,dir],{encoding:'utf8',shell:false});if(r.status)throw new Error(r.stderr||'git clone falhou');return 'Clonado';}
 if(!(await exists(dir)))throw new Error('Clone o projeto primeiro');
 if(act==='vscode'){if(!tool('code'))throw new Error('VS Code CLI não encontrado');safeSpawn('code',['-n',dir],dir);return 'VS Code aberto';}
 if(act==='install'){if(!(await exists(path.join(dir,'package.json'))))return 'Sem dependências npm';const pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));if(!pkg.dependencies&&!pkg.devDependencies)return 'Projeto sem dependências externas';const r=spawnSync('npm',['install'],{cwd:dir,encoding:'utf8',shell:false});if(r.status)throw new Error(r.stderr||'npm install falhou');return 'Dependências instaladas';}
 if(act==='build'){const r=spawnSync('npm',['run','build'],{cwd:dir,encoding:'utf8',shell:false});if(r.status)throw new Error(r.stderr||r.stdout||'build falhou');return (r.stdout||'Build concluído').slice(-4000);}
 if(act==='run'){const [cmd,...args]=p.dev;safeSpawn(cmd,args,dir);return 'Processo iniciado';}
 if(act==='browser'){safeSpawn(process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open',process.platform==='win32'?['/c','start','',p.url]:[p.url],dir);return 'Navegador aberto';}
 throw new Error('Ação não permitida');}
async function scanFolder(input){const resolved=path.resolve(input);if(protectedRoots.some(x=>resolved.toLowerCase().startsWith(path.resolve(x).toLowerCase())))throw new Error('Diretório protegido');const home=path.resolve(os.homedir());if(!resolved.toLowerCase().startsWith(home.toLowerCase()))throw new Error('No MVP, autorize somente pastas dentro do seu usuário');const out=[];async function walk(dir,depth=0){if(depth>5||out.length>=2000)return;for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){if(['.git','node_modules','$Recycle.Bin'].includes(e.name))continue;const full=path.join(dir,e.name);if(e.isDirectory())await walk(full,depth+1);else{const s=await stat(full).catch(()=>null);if(s)out.push({path:full,name:e.name,size:s.size,modifiedAt:s.mtime.toISOString(),ext:path.extname(e.name).toLowerCase()});if(out.length>=2000)return;}}}await walk(resolved);return{root:resolved,count:out.length,files:out};}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');if(u.pathname==='/api/status')return json(res,200,await status());if(req.method==='POST'&&u.pathname.startsWith('/api/project/')){const [, , ,id,act]=u.pathname.split('/');return json(res,200,{ok:true,message:await action(id,act)});}if(req.method==='POST'&&u.pathname==='/api/scan'){let b='';for await(const c of req)b+=c;const {path:p}=JSON.parse(b||'{}');return json(res,200,await scanFolder(p));}
 let base=u.pathname.startsWith('/devhub')?path.join(root,'devhub'):path.join(root,'app');let rel=u.pathname.startsWith('/devhub')?u.pathname.replace(/^\/devhub\/?/,''):u.pathname.replace(/^\//,'');if(!rel)rel='index.html';const file=path.join(base,rel);if(!file.startsWith(base))throw new Error('invalid path');const body=await readFile(file);const ext=path.extname(file);res.writeHead(200,{'content-type':ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'text/javascript; charset=utf-8':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(body);}catch(e){if((req.url||'').startsWith('/api/'))return json(res,400,{ok:false,error:e.message});res.writeHead(404);res.end('Not found');}});
server.listen(port,'127.0.0.1',()=>console.log(`RB Workspace Intelligence: http://127.0.0.1:${port} · Dev Hub: http://127.0.0.1:${port}/devhub/`));
