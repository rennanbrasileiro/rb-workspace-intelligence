import {$,esc} from './common.js';

function decorate(info){
  const suggestions=info?.destinationSuggestions||[],input=$('reviewDestination');if(!input||!suggestions.length||$('reviewDestinationSuggestion'))return;
  const label=input.closest('label');if(!label)return;
  label.insertAdjacentHTML('afterend',`<label class="review-destination-suggestions">Pastas sugeridas<select id="reviewDestinationSuggestion"><option value="">Escolha uma pasta sugerida…</option>${suggestions.map(s=>`<option value="${esc(s.path)}">${esc(s.label)} · ${esc(s.path)}</option>`).join('')}</select><small>Isso só preenche a proposta de destino. Nenhum arquivo é movido até salvar o ajuste e passar pelo preflight + checkpoint.</small></label>`);
  $('reviewDestinationSuggestion').onchange=e=>{if(e.target.value)input.value=e.target.value;};
}
export function initDestinationSuggestions(){document.addEventListener('rbwi:api-response',e=>{const d=e.detail||{};if(d.method==='GET'&&d.url?.startsWith('/api/review/operations/')&&d.data?.review)setTimeout(()=>decorate(d.data.review),0);});}
