const sleep=(ms=40)=>new Promise(r=>setTimeout(r,ms));

function pageInfo(){
  const label=[...document.querySelectorAll('.plan-pagination b')].find(x=>/Página\s+\d+\s+de\s+\d+/i.test(x.textContent||''));
  const m=(label?.textContent||'').match(/Página\s+(\d+)\s+de\s+(\d+)/i);
  return m?{current:Number(m[1]),total:Number(m[2])}:{current:1,total:1};
}

function clickAndWait(button){
  if(!button||button.disabled)return Promise.resolve(false);
  button.click();
  return sleep(70).then(()=>true);
}

async function goFirst(){
  for(let guard=0;guard<100;guard++){
    const prev=document.getElementById('prevPlanPage');
    if(!prev||prev.disabled)break;
    await clickAndWait(prev);
  }
}

function selectVisibleQuarantines(){
  let count=0;
  document.querySelectorAll('.op-check[data-type="QUARANTINE_FILE"]').forEach(c=>{
    if(!c.checked){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));count++;}
  });
  return count;
}

async function selectAllQuarantines(button){
  const original=pageInfo().current;
  button.disabled=true;
  const old=button.textContent;
  let added=0;
  try{
    button.textContent='Selecionando quarentenas…';
    await goFirst();
    for(let guard=0;guard<200;guard++){
      added+=selectVisibleQuarantines();
      const next=document.getElementById('nextPlanPage');
      if(!next||next.disabled)break;
      await clickAndWait(next);
    }
    await goFirst();
    for(let p=1;p<original;p++){
      const next=document.getElementById('nextPlanPage');
      if(!next||next.disabled)break;
      await clickAndWait(next);
    }
    button.textContent=`Quarentenas selecionadas ✓`;
    setTimeout(()=>{button.textContent=old;button.disabled=false;},1800);
  }catch(e){
    button.textContent='Tentar novamente';
    button.disabled=false;
    console.error('[RBWI quarantine hotfix]',e);
  }
}

function installButton(){
  const toolbar=document.querySelector('#plan .plan-master-toolbar > div:last-child');
  if(!toolbar||document.getElementById('selectAllQuarantineBtn'))return;
  const hasQuarantine=document.querySelector('.op-check[data-type="QUARANTINE_FILE"]')||[...document.querySelectorAll('#plan .plan-group strong')].some(x=>(x.textContent||'').trim()==='Duplicados');
  if(!hasQuarantine)return;
  const b=document.createElement('button');
  b.id='selectAllQuarantineBtn';
  b.className='secondary small';
  b.textContent='Selecionar todas as quarentenas';
  b.title='Marca todas as operações de quarentena em todas as páginas do plano.';
  b.onclick=()=>selectAllQuarantines(b);
  toolbar.insertBefore(b,toolbar.firstChild);
}

export function initQuarantineHotfix(){
  installButton();
  const target=document.getElementById('plan')||document.body;
  const obs=new MutationObserver(()=>installButton());
  obs.observe(target,{childList:true,subtree:true});
}
