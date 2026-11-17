(() => {
'use strict';
const $=id=>document.getElementById(id);
const list=$('discoveryResultsV16'), status=$('discoveryStatusV16');
if(!list)return;
const params=new URLSearchParams(location.search);
const persistent=params.get('floating')==='1'||params.get('window')==='1';
const QKEY='mapeadorDiscoveryQueueV17';
const say=(s,tone='')=>{status.textContent=s;status.dataset.tone=tone;};
const used=new Set();
let lastFields=[];

// Ferramentas: filtro + modo múltiplo
const tools=document.createElement('div');tools.className='discovery-tools-v17';
tools.innerHTML='<input id="discoveryFilterV17" type="search" class="form-control form-control-sm" placeholder="Filtrar campos… (nome, tipo, seletor)" aria-label="Filtrar campos" hidden><label title="Continuar selecionando até pressionar Esc"><input id="discoveryMultiV17" type="checkbox"> Vários</label>';
list.before(tools);
const filter=$('discoveryFilterV17'), multi=$('discoveryMultiV17');
try{multi.checked=localStorage.getItem('mapeadorMultiV17')==='1';}catch(_){}
multi.addEventListener('change',()=>{try{localStorage.setItem('mapeadorMultiV17',multi.checked?'1':'0');}catch(_){}});

let toastEl;
function toast(msg){
 toastEl??=Object.assign(document.createElement('div'),{className:'toast-v17',role:'status'});
 if(!toastEl.isConnected)document.body.append(toastEl);
 toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastEl._t);toastEl._t=setTimeout(()=>toastEl.classList.remove('show'),1800);
}
async function targetTab(){
 const src=Number(params.get('sourceTabId'));
 if(Number.isFinite(src)&&src>0){try{const t=await chrome.tabs.get(src);if(t?.id)return t;}catch(_){}}
 const isExt=x=>String(x.url||'').startsWith('chrome-extension://');
 let t=(await new Promise(r=>chrome.tabs.query({active:true,currentWindow:true},r)))?.find(x=>!isExt(x));
 if(!t)t=(await new Promise(r=>chrome.tabs.query({active:true,lastFocusedWindow:true},r)))?.find(x=>!isExt(x));
 if(!t?.id)throw new Error('Nenhuma aba de página ativa.');
 if(/^(chrome|edge|about|chrome-extension|view-source):/.test(t.url||'')||/chrome\.google\.com\/webstore|chromewebstore\.google\.com/.test(t.url||''))throw new Error('Esta página é protegida pelo navegador.');
 return t;
}
async function send(msg){
 if(typeof msg==='string')msg={action:msg};
 const tab=await targetTab();
 const results=await mapeadorFrames.sendAll(tab.id,msg,['js/discovery-content.js']);
 const resps=results.map(r=>r.response).filter(Boolean);
 if(!resps.length)throw Error((results[0]&&results[0].error)||'Página indisponível');
 if(msg.action==='DISCOVERY_SCAN_V16'){const okr=resps.filter(r=>r.ok);if(!okr.length)return resps[0];return {ok:true,fields:okr.flatMap(r=>r.fields||[])};}
 return resps.find(r=>r.ok)||resps[0];
}
const highlight=(selector,scroll)=>send({action:'DISCOVERY_HIGHLIGHT_V17',selector,scroll}).catch(()=>{});
function applySelector(selector,labelText){
 const box=$('manualFieldBox');if(box)box.open=true;
 const mode=$('manualSelectorMode');if(mode&&mode.value!=='css'){mode.value='css';mode.dispatchEvent(new Event('change',{bubbles:true}));}
 const input=$('manualSelectorInput');
 if(input){input.value=selector;input.dispatchEvent(new Event('input',{bubbles:true}));input.classList.remove('flash-v16');void input.offsetWidth;input.classList.add('flash-v16');input.scrollIntoView({block:'center',behavior:'smooth'});input.focus({preventScroll:true});}
 used.add(selector);
 list.querySelectorAll('.discovery-item-v16').forEach(r=>r.classList.toggle('is-used-v17',used.has(r.dataset.selector)));
 say(`Selecionado: ${labelText||selector}. Revise e clique em Adicionar.`,'ok');
}
function row(f){
 const r=document.createElement('div');r.className='discovery-item-v16';r.dataset.selector=f.selector;r.tabIndex=0;
 r.dataset.search=`${f.label} ${f.tag} ${f.type||''} ${f.selector}`.toLowerCase();
 if(used.has(f.selector))r.classList.add('is-used-v17');
 const info=document.createElement('div');info.className='discovery-item-info-v16';
 const name=document.createElement('strong');name.textContent=f.label;name.title=f.label;
 const meta=document.createElement('small');
 if(f.quality){const q=document.createElement('span');q.className='quality-v16 '+(f.quality==='alta'?'is-high':'is-low');q.textContent=f.quality;meta.append(q,' ');}
 meta.append(`${f.tag||''}${f.type?':'+f.type:''}${f.matches!=null?` · ${f.matches} corresp.`:''}${f.context?.shadowHosts?.length?' · Shadow DOM':''}${f.mask?' · 🎭 '+f.mask:''}${f.visible===false?' · oculto':''}${f.disabled?' · desativado':''}`);
 const code=document.createElement('code');code.textContent=f.selector;
 const acts=document.createElement('div');acts.className='discovery-row-actions-v17';
 const mkb=(txt,cls,title,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn btn-sm '+cls;b.textContent=txt;b.title=title;b.setAttribute('aria-label',title);b.addEventListener('click',e=>{e.stopPropagation();fn();});return b;};
 acts.append(
  mkb('👁','btn-secondary','Mostrar na página',()=>highlight(f.selector,true)),
  mkb('⧉','btn-secondary','Copiar seletor',async()=>{try{await navigator.clipboard.writeText(f.selector);toast('Seletor copiado');}catch(_){toast('Não foi possível copiar');}}),
  mkb('Usar','btn-primary','Usar seletor no campo manual',()=>applySelector(f.selector,f.label)));
 r.addEventListener('mouseenter',()=>highlight(f.selector,false));
 r.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();applySelector(f.selector,f.label);}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const rows=[...list.querySelectorAll('.discovery-item-v16:not(.is-hidden-v17)')];const i=rows.indexOf(r);rows[e.key==='ArrowDown'?Math.min(i+1,rows.length-1):Math.max(i-1,0)]?.focus();}
 });
 r.addEventListener('focus',()=>highlight(f.selector,true));
 info.append(name,meta,code);r.append(info,acts);return r;
}
function applyFilter(){
 const q=filter.value.trim().toLowerCase();let n=0;
 list.querySelectorAll('.discovery-item-v16').forEach(r=>{const hide=!!q&&!r.dataset.search.includes(q);r.classList.toggle('is-hidden-v17',hide);if(!hide)n++;});
 if(lastFields.length)say(q?`${n} de ${lastFields.length} campos.`:`${lastFields.length} campos identificados. Passe o mouse para ver na página.`,'ok');
}
filter.addEventListener('input',applyFilter);
filter.addEventListener('keydown',e=>{if(e.key==='Escape'){filter.value='';applyFilter();}else if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('.discovery-item-v16:not(.is-hidden-v17)')?.focus();}});
function render(fields){
 lastFields=fields;list.replaceChildren();filter.hidden=!fields.length;
 if(!fields.length){say('Nenhum campo acessível encontrado nesta página.','warn');return;}
 // visíveis e de melhor qualidade primeiro
 const sorted=[...fields].sort((a,b)=>(b.visible-a.visible)||((b.quality==='alta')-(a.quality==='alta')));
 const frag=document.createDocumentFragment();sorted.forEach(f=>frag.append(row(f)));list.append(frag);
 applyFilter();
}
function renderQueue(q){
 if(!q?.length)return;
 lastFields=q;list.replaceChildren();filter.hidden=false;
 const h=document.createElement('div');h.className='discovery-item-v16';
 const t=document.createElement('small');t.textContent=`Selecionados na página (${q.length})`;
 const clr=document.createElement('button');clr.type='button';clr.className='btn btn-secondary btn-sm';clr.textContent='Limpar';
 clr.addEventListener('click',async()=>{await chrome.storage.local.remove(QKEY);list.replaceChildren();lastFields=[];filter.hidden=true;say('Lista limpa.','');});
 h.append(t,clr);list.append(h);
 [...q].reverse().forEach(f=>list.append(row(f)));
}
$('discoveryScanV16').addEventListener('click',async e=>{
 const b=e.currentTarget;b.disabled=true;say('Analisando a página…','info');
 try{const result=await send('DISCOVERY_SCAN_V16');if(!result?.ok)throw Error(result?.error||'Falha ao analisar');render(result.fields);filter.focus();}
 catch(err){say('Não foi possível analisar: '+err.message,'err');}
 finally{b.disabled=false;}
});
$('discoveryPickV16').addEventListener('click',async()=>{
 try{
  await chrome.storage.local.remove(['mapeadorDiscoverySelection',QKEY]);
  const result=await send({action:'DISCOVERY_PICK_V16',multi:multi.checked});if(!result?.ok)throw Error('Seleção indisponível');
  say(persistent?(multi.checked?'Clique nos campos na página. Esc para concluir.':'Clique no campo desejado na página…'):'Clique no campo na página. Ao reabrir o Mapeador o seletor estará preenchido.','info');
  if(!persistent)setTimeout(()=>window.close(),250); // fecha o popup para liberar o clique na página
 }catch(e){say('Não foi possível iniciar a seleção: '+e.message,'err');}
});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 const s=changes.mapeadorDiscoverySelection?.newValue;
 if(s){applySelector(s.selector,s.label);toast('Campo selecionado');}
 const q=changes[QKEY]?.newValue;
 if(q&&q.length>1)renderQueue(q);
});
(async()=>{
 const st=await chrome.storage.local.get(['mapeadorDiscoverySelection',QKEY]);
 const s=st.mapeadorDiscoverySelection,q=st[QKEY];
 if(!s||Date.now()-s.savedAt>10*60*1000)return;
 document.querySelector('[data-tab="tabMapper"]')?.click();
 if(q?.length>1)renderQueue(q);
 applySelector(s.selector,s.label);
 await chrome.storage.local.remove('mapeadorDiscoverySelection');
})().catch(()=>{});
})();
