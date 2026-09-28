import {$,esc} from './common.js';

function decorate(info){
  const suggestions=info?.nameSuggestions||[],input=$('reviewFilename');if(!input||suggestions.length<2||$('reviewNameSuggestion'))return;
  const label=input.closest('label');if(!label)return;
  label.insertAdjacentHTML('afterend',`<label class="review-name-suggestions">Sugestões automáticas<select id="reviewNameSuggestion"><option value="">Escolha uma sugestão de nome…</option>${suggestions.map(s=>`<option value="${esc(s.filename)}">${esc(s.label)} · ${esc(s.filename)}</option>`).join('')}</select><small>O seletor só preenche o campo acima. Nada é renomeado até salvar o ajuste e executar o plano protegido.</small></label>`);
  $('reviewNameSuggestion').onchange=e=>{if(e.target.value)input.value=e.target.value;};
}
export function initNameSuggestions(){document.addEventListener('rbwi:api-response',e=>{const d=e.detail||{};if(d.method==='GET'&&d.url?.startsWith('/api/review/operations/')&&d.data?.review)setTimeout(()=>decorate(d.data.review),0);});}
