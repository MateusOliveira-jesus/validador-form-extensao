(() => {
  'use strict';
  if (globalThis.__mapeadorDiscoveryV16) return;
  globalThis.__mapeadorDiscoveryV16 = true;
  const CANDIDATES = 'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]),textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"],[role="textbox"],[role="combobox"]';
  let cleanupPicker = null;
  const cssString = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ') + '"';
  const stable = s => !!s && s.length < 100 && !/(?:^|[-_])[a-f0-9]{10,}(?:$|[-_])|\d{7,}/i.test(s);
  function rootOf(el) { return el.getRootNode(); }
  function select(el) {
    const root = rootOf(el);
    const tag = el.localName;
    const options = [];
    if (stable(el.id)) options.push('#' + CSS.escape(el.id));
    for (const a of ['data-testid','data-test','data-qa','name','aria-label','placeholder']) {
      const v = el.getAttribute(a);
      if (stable(v)) options.push(`${tag}[${a}=${cssString(v)}]`);
    }
    for (const candidate of options) {
      try { if (root.querySelectorAll(candidate).length === 1 && root.querySelector(candidate) === el) return {selector:candidate,quality:'alta',matches:1}; } catch (_) {}
    }
    let node = el, parts = [];
    while (node && node.nodeType === 1 && parts.length < 7) {
      let part = node.localName;
      if (stable(node.id)) { part = '#' + CSS.escape(node.id); parts.unshift(part); break; }
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(n=>n.localName===node.localName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node)+1})`;
      parts.unshift(part);
      const candidate = parts.join(' > ');
      try { if (root.querySelectorAll(candidate).length===1 && root.querySelector(candidate)===el) break; } catch (_) {}
      node = node.parentElement;
    }
    const selector = parts.join(' > ');
    let matches=0;
    try { matches = root.querySelectorAll(selector).length; } catch (_) {}
    return {selector,quality:'limitada',matches};
  }
  function context(el) {
    const hosts=[]; let root=el.getRootNode();
    while (root instanceof ShadowRoot) {
      const host=root.host; hosts.unshift(select(host).selector); root=host.getRootNode();
    }
    return {shadowHosts:hosts,frameUrl:location.href};
  }
  function label(el) {
    const by = el.getAttribute('aria-labelledby');
    const labelText = by && by.split(/\s+/).map(id=>document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    return (el.labels && Array.from(el.labels).map(n=>n.textContent.trim()).join(' ')) || labelText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || el.localName;
  }
  function discover() {
    const out=[],seen=new WeakSet();
    function walk(root,depth) {
      if(depth>6 || out.length>=500) return;
      for(const el of root.querySelectorAll('*')) {
        if (el.matches(CANDIDATES) && !seen.has(el)) {
          seen.add(el);
          if (!(el.isContentEditable && el.parentElement?.isContentEditable)) {
            const s=select(el);
            out.push({label:label(el).slice(0,120),tag:el.localName,type:el.getAttribute('type')||'',selector:s.selector,quality:s.quality,matches:s.matches,mask:(globalThis.__mapeadorMaskV19?.detect(el)?.label)||'',disabled:el.matches(':disabled'),visible:el.getClientRects().length>0,context:context(el)});
          }
        }
        if (el.shadowRoot) walk(el.shadowRoot,depth+1);
        if (out.length>=500) break;
      }
    }
    walk(document,0); return out;
  }
  const CLICKABLE='label,[role="option"],[role="listbox"],[role="checkbox"],[role="radio"],[role="switch"],button[aria-haspopup]';
  function resolveTarget(path){
    for(const n of path){
      if(!(n instanceof Element)) continue;
      if(n.id==='mapeador-formularios-floating-panel'||n.dataset?.mapeadorPicker) return null;
      if(n.matches(CANDIDATES)) return n;
      if(n.localName==='label' && n.control) return n.control;
      if(n.matches(CLICKABLE)) { const inner=n.querySelector(CANDIDATES); return inner||n; }
      const inner=n.querySelectorAll?.(CANDIDATES);
      if(inner && inner.length===1 && n.getBoundingClientRect().height<120) return inner[0];
    }
    return null;
  }
  let hl=null,hlTimer=null;
  function highlight(selector,scroll){
    hl?.remove();hl=null;clearTimeout(hlTimer);
    if(!selector)return;
    let el=null;try{el=document.querySelector(selector);}catch(_){}
    if(!el)return;
    if(scroll)el.scrollIntoView({block:'center',behavior:'smooth'});
    hl=document.createElement('div');hl.dataset.mapeadorPicker='1';
    hl.style.cssText='position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #f59e0b;background:rgba(245,158,11,.14);border-radius:6px;box-sizing:border-box;box-shadow:0 0 0 4px rgba(245,158,11,.2);';
    document.documentElement.append(hl);
    const place=()=>{if(!hl)return;const r=el.getBoundingClientRect();Object.assign(hl.style,{left:r.left-3+'px',top:r.top-3+'px',width:r.width+6+'px',height:r.height+6+'px'});};
    place();setTimeout(place,350);
    hlTimer=setTimeout(()=>{hl?.remove();hl=null;},2500);
  }
  function pick(multi) {
    cleanupPicker?.();
    const mk=(css)=>{const d=document.createElement('div');d.dataset.mapeadorPicker='1';d.style.cssText=css;return d;};
    const overlay=mk('position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #2563eb;background:rgba(37,99,235,.10);border-radius:6px;box-shadow:0 0 0 4px rgba(37,99,235,.18);box-sizing:border-box;display:none;transition:all .06s ease-out;');
    const tip=mk('position:fixed;z-index:2147483647;pointer-events:none;background:#0f172a;color:#f8fafc;padding:4px 8px;border-radius:6px;font:600 11px/1.4 system-ui,sans-serif;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;');
    const banner=mk('position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#0f172a;color:#f8fafc;padding:10px 16px;border-radius:999px;font:500 13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);pointer-events:none;');
    banner.textContent=multi?'🎯 Validador e Formulário: clique nos campos para selecioná-los · Esc para concluir':'🎯 Validador e Formulário: clique em um campo para selecionar · Esc para cancelar';
    document.documentElement.append(overlay,tip,banner);
    const prevCursor=document.documentElement.style.cursor; document.documentElement.style.cursor='crosshair';
    const ac=new AbortController();
    const done=()=>{ac.abort();marks.forEach(m=>m.remove());overlay.remove();tip.remove();banner.remove();document.documentElement.style.cursor=prevCursor;cleanupPicker=null;};
    cleanupPicker=done;
    let current=null,count=0;const marks=[];
    const show=el=>{
      current=el;
      if(!el){overlay.style.display=tip.style.display='none';return;}
      const r=el.getBoundingClientRect();
      Object.assign(overlay.style,{display:'block',left:r.left-3+'px',top:r.top-3+'px',width:r.width+6+'px',height:r.height+6+'px'});
      tip.textContent=label(el)+'  ·  '+select(el).selector;
      Object.assign(tip.style,{display:'block',left:Math.max(4,r.left)+'px',top:(r.top>28?r.top-26:r.bottom+6)+'px'});
    };
    const opt={capture:true,signal:ac.signal};
    document.addEventListener('pointermove',e=>show(resolveTarget(e.composedPath())),opt);
    const block=e=>{ if(resolveTarget(e.composedPath())){e.preventDefault();e.stopImmediatePropagation();} };
    document.addEventListener('pointerdown',block,opt);
    document.addEventListener('mousedown',block,opt);
    document.addEventListener('mouseup',block,opt);
    document.addEventListener('click',e=>{
      const el=resolveTarget(e.composedPath())||current;if(!el)return;
      e.preventDefault();e.stopImmediatePropagation();
      const s=select(el);
      const item={...s,label:label(el),tag:el.localName,context:context(el),savedAt:Date.now()};
      chrome.storage.local.get('mapeadorDiscoveryQueueV17',r=>{
        const q=(r.mapeadorDiscoveryQueueV17||[]).filter(x=>x.selector!==item.selector);
        q.push(item);chrome.storage.local.set({mapeadorDiscoveryQueueV17:q.slice(-50),mapeadorDiscoverySelection:item});
      });
      if(multi){
        const mark=mk('position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #16a34a;background:rgba(22,163,74,.12);border-radius:6px;box-sizing:border-box;');
        const r=el.getBoundingClientRect();Object.assign(mark.style,{left:r.left-3+'px',top:r.top-3+'px',width:r.width+6+'px',height:r.height+6+'px'});
        document.documentElement.append(mark);marks.push(mark);count++;
        banner.textContent=`✅ ${count} campo(s) selecionado(s) · continue clicando · Esc para concluir`;
        return;
      }
      overlay.style.borderColor='#16a34a';overlay.style.background='rgba(22,163,74,.15)';
      banner.textContent='✅ Campo selecionado: '+label(el).slice(0,60);
      ac.abort();document.documentElement.style.cursor=prevCursor;
      setTimeout(()=>{overlay.remove();tip.remove();banner.remove();cleanupPicker=null;},900);
    },opt);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();done();}},opt);
    window.addEventListener('scroll',()=>show(current),{...opt,passive:true});
  }
  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.action==='DISCOVERY_SCAN_V16') {try{sendResponse({ok:true,fields:discover()});}catch(e){sendResponse({ok:false,error:e.message});}return;}
    if(message?.action==='DISCOVERY_PICK_V16') {pick(!!message.multi);sendResponse({ok:true});return;}
    if(message?.action==='DISCOVERY_HIGHLIGHT_V17') {highlight(message.selector,message.scroll);sendResponse({ok:true});return;}
    if(message?.action==='DISCOVERY_PING_V16') {sendResponse({ok:true});return;}
  });
})();
