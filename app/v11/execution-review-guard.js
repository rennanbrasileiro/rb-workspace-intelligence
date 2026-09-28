import {$,toast} from './common.js';

function resetConsent(){globalThis.__rbAllowPendingExecution=false;}
function openPendingQueue(){const filter=$('reviewQueueFilter'),start=$('reviewStartQueue');if(filter){filter.value='pending';filter.dispatchEvent(new Event('change',{bubbles:true}));}if(start)start.click();else toast('Abra a revisão item a item e filtre por pendentes.');}
function decoratePendingGuard(preflight){
  resetConsent();
  const pending=Number(preflight?.reviewSelection?.review?.pending||0),reviewed=Number(preflight?.reviewSelection?.review?.reviewed||0),excluded=Number(preflight?.reviewSelection?.excluded?.count||0);
  if(!pending)return;
  const box=$('executionPreflight'),apply=$('preflightApplyBtn');if(!box||!apply)return;
  box.querySelector('.pending-review-guard')?.remove();
  const baseDisabled=apply.disabled;apply.dataset.reviewBaseDisabled=baseDisabled?'1':'0';apply.disabled=true;
  const anchor=box.querySelector('.result-actions');
  anchor?.insertAdjacentHTML('beforebegin',`<div class="pending-review-guard"><div><b>${pending} item(ns) selecionado(s) ainda estão pendentes</b><span>${reviewed} item(ns) deste lote já têm decisão registrada${excluded?` · ${excluded} marcado(s) como não mover e já retirado(s) da execução`:''}. Você pode revisar agora ou autorizar conscientemente a execução dos pendentes.</span></div><div class="pending-review-actions"><button class="secondary small" id="reviewPendingNowBtn">Revisar pendentes</button><label><input type="checkbox" id="allowPendingExecution"> Executar mesmo assim os ${pending} pendente(s)</label></div></div>`);
  const check=$('allowPendingExecution'),review=$('reviewPendingNowBtn');
  if(review)review.onclick=()=>openPendingQueue();
  if(check)check.onchange=()=>{const allowed=check.checked===true;globalThis.__rbAllowPendingExecution=allowed;apply.disabled=baseDisabled||!allowed;apply.textContent=allowed?'Criar checkpoint e aplicar com pendentes':'Criar checkpoint e aplicar';};
  const cancel=$('preflightCancelBtn');if(cancel)cancel.addEventListener('click',resetConsent,{once:true});
  toast(`${pending} item(ns) selecionado(s) ainda estão pendentes de revisão.`);
}

export function initExecutionReviewGuard(){
  resetConsent();
  document.addEventListener('rbwi:api-response',e=>{
    const d=e.detail||{};
    if(d.url==='/api/execution/preflight'&&d.data?.preflight)setTimeout(()=>decoratePendingGuard(d.data.preflight),0);
    if(d.url==='/api/execution/jobs'&&d.status<400)resetConsent();
  });
}
