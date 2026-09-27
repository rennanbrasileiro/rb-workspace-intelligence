import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function commandExists(name){const r=spawnSync(process.platform==='win32'?'where.exe':'which',[name],{encoding:'utf8',windowsHide:true});return r.status===0;}
function run(cmd,args=[],opts={}){return spawnSync(cmd,args,{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,...opts});}
function openVisible(command){if(process.platform==='win32'){const child=spawn('cmd.exe',['/d','/s','/c',`start "GitHub Login" cmd /k ${command}`],{detached:true,stdio:'ignore',windowsHide:true});child.unref();return;}const child=spawn('sh',['-lc',command],{detached:true,stdio:'ignore'});child.unref();}
function originOwner(){const r=run('git',['remote','get-url','origin'],{cwd:repoRoot});const url=(r.stdout||'').trim();const m=url.match(/github\.com[/:]([^/]+)\//i);return m?.[1]||'';}

export async function githubLocalStatus(){
  const installed=commandExists('gh');
  if(!installed)return{installed:false,authenticated:false,user:null,mode:'public-fallback'};
  const auth=run('gh',['auth','status','--hostname','github.com']);
  let user=null;
  if(auth.status===0){const u=run('gh',['api','user','--jq','.login']);user=(u.stdout||'').trim()||null;}
  return{installed:true,authenticated:auth.status===0,user,mode:auth.status===0?'authenticated':'public-fallback'};
}

export async function listGithubRepositories(){
  const status=await githubLocalStatus();
  if(status.authenticated){
    const r=run('gh',['repo','list',status.user,'--limit','300','--json','name,nameWithOwner,url,sshUrl,isPrivate,description,updatedAt,defaultBranchRef']);
    if(r.status)throw new Error(r.stderr||r.stdout||'Não foi possível listar os repositórios do GitHub.');
    const repos=JSON.parse(r.stdout||'[]').map(x=>({...x,source:'gh'}));
    return{status,repositories:repos};
  }
  const owner=originOwner();
  if(!owner)return{status,repositories:[]};
  try{
    const r=await fetch(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated`,{headers:{'user-agent':'RB-Workspace-Intelligence'}});
    const data=await r.json();
    const repos=Array.isArray(data)?data.map(x=>({name:x.name,nameWithOwner:x.full_name,url:x.html_url,sshUrl:x.ssh_url,isPrivate:false,description:x.description,updatedAt:x.updated_at,defaultBranchRef:{name:x.default_branch},source:'public-api'})):[];
    return{status:{...status,user:owner},repositories:repos};
  }catch{return{status:{...status,user:owner},repositories:[]};}
}

export function beginGithubLogin(){
  if(!commandExists('gh'))throw new Error('GitHub CLI ainda não está instalado. Use o botão Instalar GitHub CLI.');
  openVisible('gh auth login --hostname github.com --git-protocol https --web && gh auth setup-git');
  return{message:'A janela de autenticação do GitHub foi aberta. Conclua o login e depois clique em Atualizar repositórios.'};
}

export function installGithubCli(){
  if(commandExists('gh'))return{message:'GitHub CLI já está instalado.'};
  if(process.platform!=='win32')throw new Error('Instalação automática do GitHub CLI está disponível no Windows nesta versão.');
  if(!commandExists('winget'))throw new Error('winget não encontrado. Instale o GitHub CLI manualmente em https://cli.github.com/.');
  openVisible('winget install -e --id GitHub.cli --accept-package-agreements --accept-source-agreements');
  return{message:'A instalação do GitHub CLI foi aberta. Quando concluir, volte e clique em Conectar GitHub.'};
}
