import {$} from './common.js';

function render(snapshot){
  const box=$('executionPreflight');if(!box||!snapshot)return;box.querySelector('.stale-plan-guard')?.remove();
  const changed=Number(snapshot.changedSinceAnalysis?.count||0),unavailable=snapshot.available===false;if(!changed&&!unavailable)return;
  const items=(snapshot.changedSinceAnalysis?.items||[]).slice(0,5),message=unavailable?'O snapshot usado para montar este plano não está mais disponível. Para segurança, a execução não pode continuar.':`${changed} arquivo(s) selecionado(s) mudaram depois da análise. A decisão antiga não será aplicada ao conteúdo atual.`;
  const details=items.length?`<div class="stale-plan-items">${items.map(i=>`<code>${String(i.source||'')}</code>`).join('')}</div>`:'';
  box.querySelector('.result-actions')?.insertAdjacentHTML('beforebegin',`<div class="stale-plan-guard"><div><b>Plano precisa ser atualizado</b><span>${message}</span>${details}</div><button class="secondary small" id="reanalyzeStalePlanBtn">Reanalisar pasta agora</button></div>`);
  const b=$('reanalyzeStalePlanBtn');if(b)b.onclick=()=>{$('preflightCancelBtn')?.click();$('manualAnalyzeBtn')?.click();};
}
export function initStalePlanGuard(){document.addEventListener('rbwi:api-response',e=>{const d=e.detail||{};if(d.url==='/api/execution/preflight'&&d.data?.preflight)setTimeout(()=>render(d.data.preflight.analysisSnapshot),0);});}
