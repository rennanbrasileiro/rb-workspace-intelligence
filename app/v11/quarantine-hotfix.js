const sleep=(ms=40)=>new Promise(r=>setTimeout(r,ms));

function pageInfo(){
  const label=[...document.querySelectorAll('.plan-pagination b')].find(x=>/Página\s+\d+\s+de\s+\d+/i.test(x.textContent||''));
  const m=(label?.textContent||'').match(/Página\s+(\d+)\s+de\s+(\d+)/i);
  return m?{current:Number(m[1]),total:Number(m[2])}:{current:1,total:1};
}
function clickAndWait(button){if(!button||button.disabled)return Promise.resolve(false);button.click();return sleep(70).then(()=>true);}
async function goFirst(){for(let guard=0;guard<100;guard++){const prev=document.getElementById('prevPlanPage');if(!prev||prev.disabled)break;await clickAndWait(prev);}}
function sourcePath(check){return check.closest('.plan-row')?.querySelector('code')?.textContent||'';}
function riskyProjectDuplicate(check){
  const p=sourcePath(check).toLowerCase().replaceAll('/','\\');
  const ext=(p.match(/\.[a-z0-9]+$/i)||[''])[0];
  if(['.py','.js','.jsx','.ts','.tsx','.java','.cs','.go','.rs','.php','.rb','.ps1','.bat','.cmd','.sh'].includes(ext))return true;
  if(/\\(src|tests?|scripts?|vendor|node_modules|cert_drivers|lib|packages?)\\/.test(p))return true;
  if(/\\(package(-lock)?\.json|pyproject\.toml|requirements\.txt|pom\.xml|build\.gradle|\.gitignore|\.env(?:\.|$))$/.test(p))return true;
  return false;
}
function selectVisibleQuarantines({includeRisky=false}={}){
  let added=0,skipped=0,total=0;
  document.querySelectorAll('.op-check[data-type="QUARANTINE_FILE"]').forEach(c=>{
    total++;
    if(!includeRisky&&riskyProjectDuplicate(c)){skipped++;return;}
    if(!c.checked){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));added++;}
  });
  return{added,skipped,total};
}
async function restorePage(original){await goFirst();for(let p=1;p<original;p++){const next=document.getElementById('nextPlanPage');if(!next||next.disabled)break;await clickAndWait(next);}}
async function selectQuarantines(button,{includeRisky=false}={}){
  const original=pageInfo().current,old=button.textContent;
  button.disabled=true;let added=0,skipped=0,total=0;
  try{
    button.textContent=includeRisky?'Selecionando todas…':'Selecionando seguras…';
    await goFirst();
    for(let guard=0;guard<200;guard++){
      const r=selectVisibleQuarantines({includeRisky});added+=r.added;skipped+=r.skipped;total+=r.total;
      const next=document.getElementById('nextPlanPage');if(!next||next.disabled)break;await clickAndWait(next);
    }
    await restorePage(original);
    button.textContent=includeRisky?`Todas selecionadas ✓`:`Seguras selecionadas ✓${skipped?` · ${skipped} técnicas ignoradas`:''}`;
    setTimeout(()=>{button.textContent=old;button.disabled=false;},2200);
  }catch(e){button.textContent='Tentar novamente';button.disabled=false;console.error('[RBWI quarantine hotfix]',e);}
}
function installButtons(){
  const toolbar=document.querySelector('#plan .plan-master-toolbar > div:last-child');
  if(!toolbar)return;
  const hasQuarantine=document.querySelector('.op-check[data-type="QUARANTINE_FILE"]')||[...document.querySelectorAll('#plan .plan-group strong')].some(x=>(x.textContent||'').trim()==='Duplicados');
  if(!hasQuarantine)return;
  if(!document.getElementById('selectSafeQuarantineBtn')){
    const safe=document.createElement('button');safe.id='selectSafeQuarantineBtn';safe.className='secondary small';safe.textContent='Selecionar quarentenas seguras';safe.title='Seleciona duplicados em todas as páginas, preservando arquivos internos de projetos/código.';safe.onclick=()=>selectQuarantines(safe,{includeRisky:false});toolbar.insertBefore(safe,toolbar.firstChild);
  }
  if(!document.getElementById('selectAllQuarantineBtn')){
    const all=document.createElement('button');all.id='selectAllQuarantineBtn';all.className='ghost small';all.textContent='Selecionar TODAS as quarentenas';all.title='Inclui código e arquivos internos de projetos. Use somente se quiser revisar/mover tudo.';all.onclick=()=>{if(confirm('Isso também selecionará duplicados dentro de código/projetos. Pode quebrar versões locais se você aplicar tudo. Deseja realmente selecionar TODAS as quarentenas?'))selectQuarantines(all,{includeRisky:true});};toolbar.insertBefore(all,toolbar.firstChild);
  }
}
export function initQuarantineHotfix(){installButtons();const target=document.getElementById('plan')||document.body;const obs=new MutationObserver(()=>installButtons());obs.observe(target,{childList:true,subtree:true});}
