import {$,api,toast} from './common.js';

function joinHome(home,platform,name){return platform==='win32'?`${String(home||'').replace(/[\\/]+$/,'')}\\${name}`:`${String(home||'').replace(/\/+$/,'')}/${name}`;}

export async function initV17Enhancements(){
  let tries=0;while(!document.getElementById('quickFolders')&&tries++<30)await new Promise(r=>setTimeout(r,100));
  const row=document.getElementById('quickFolders');if(!row||document.getElementById('consolidateOrganizedBtn'))return;
  try{
    const s=await api('/api/system'),organized=joinHome(s.machine?.home,s.machine?.platform,'Organizado');
    const b=document.createElement('button');b.id='consolidateOrganizedBtn';b.className='secondary tiny';b.textContent='Consolidar o que já organizei';b.title='Reanalisa a pasta Organizado e junta microgrupos em famílias maiores, sem voltar a mexer em caches/projetos.';
    b.onclick=()=>{const input=$('folderPath');if(input)input.value=organized;toast('Consolidação selecionada. Vou reanalisar apenas a pasta Organizado.');$('manualAnalyzeBtn')?.click();};
    row.appendChild(b);
    const hint=document.createElement('span');hint.className='consolidate-hint';hint.textContent='Use depois de uma primeira organização para juntar famílias repetidas.';row.appendChild(hint);
  }catch{}
}
