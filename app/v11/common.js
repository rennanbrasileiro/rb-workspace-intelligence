export const $=id=>document.getElementById(id);
export const api=async(url,opts={})=>{const r=await fetch(url,{cache:'no-store',...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});const j=await r.json();try{document.dispatchEvent(new CustomEvent('rbwi:api-response',{detail:{url,method:opts.method||'GET',status:r.status,data:j}}))}catch{}if(!r.ok||j.ok===false)throw Error(j.error||'Falha na operação');return j};
export const post=(url,data={})=>api(url,{method:'POST',body:JSON.stringify(data)});
export function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),3600)}
export function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function fmtDate(v){try{return new Date(v).toLocaleString('pt-BR')}catch{return v||''}}
export function fmtBytes(n=0){if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;if(n<1073741824)return`${(n/1048576).toFixed(1)} MB`;return`${(n/1073741824).toFixed(2)} GB`}
export function setBusy(el,busy,label){const b=typeof el==='string'?document.getElementById(el):el;if(!b)return;b.dataset.original=b.dataset.original||b.textContent;b.disabled=busy;b.textContent=busy?label:(b.dataset.original||label)}
