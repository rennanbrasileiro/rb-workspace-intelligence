import { readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const ignored=new Set(['.git','node_modules','.next','dist','build','.venv','venv','__pycache__','.idea','.vscode','coverage','target','bin','obj','.cache','.turbo']);
function safeLocal(input){const resolved=path.resolve(String(input||'')),home=path.resolve(os.homedir());const rel=path.relative(home,resolved);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('O projeto precisa estar dentro do seu perfil de usuário.');return resolved;}

export async function listProjectTree(localPath){
  const root=safeLocal(localPath),entries=[];
  async function walk(cur,rel='',depth=0){
    for(const e of (await readdir(cur,{withFileTypes:true}).catch(()=>[])).sort((a,b)=>a.name.localeCompare(b.name))){
      if(ignored.has(e.name))continue;
      const r=rel?`${rel}/${e.name}`:e.name;
      entries.push({path:r,type:e.isDirectory()?'dir':'file',depth});
      if(e.isDirectory())await walk(path.join(cur,e.name),r,depth+1);
    }
  }
  await walk(root);
  return{entries,truncated:false,files:entries.filter(x=>x.type==='file').length,folders:entries.filter(x=>x.type==='dir').length};
}
