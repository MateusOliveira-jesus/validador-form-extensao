// ============================================
// Mapeador de Formulários v52 — melhorias de UX (aditivo)
// Não altera dados, perfis nem preenchimento. Só lê o DOM.
//  - Alt+1…7 troca de aba; a última aba aberta é lembrada
//  - "?" mostra os atalhos
//  - Ctrl+Enter confirma o modal aberto
//  - caixas JSON: status válido/inválido, Formatar e Copiar
//  - Tab dentro das caixas JSON insere 2 espaços
//  - abas acessíveis (role="tab", aria-selected)
// ============================================
(function () {
  "use strict";
  const KEY = "mapeadorLastTabV52";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const tabs = () => $$(".tab-group button[data-tab]");

  // ---------- toasts ----------
  let box;
  function toast(msg, kind) {
    if (!box || !box.isConnected) {
      box = document.createElement("div");
      box.className = "v52-toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
      document.body.append(box);
    }
    const t = document.createElement("div");
    t.className = "v52-toast"; if (kind) t.dataset.kind = kind; t.textContent = msg;
    box.append(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, 1900);
  }
  window.MapeadorToast = toast;

  // ---------- abas ----------
  function syncAria() {
    const nav = $(".tab-group"); if (nav) nav.setAttribute("role", "tablist");
    tabs().forEach((b) => {
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", b.classList.contains("active") ? "true" : "false");
      b.setAttribute("aria-controls", b.dataset.tab);
    });
  }
  function setupTabs() {
    const list = tabs();
    list.forEach((b, i) => {
      if (i < 9 && !$(".v52-kbd", b)) {
        const k = document.createElement("span"); k.className = "v52-kbd"; k.setAttribute("aria-hidden", "true"); k.textContent = i + 1;
        b.append(k);
        b.setAttribute("aria-keyshortcuts", "Alt+" + (i + 1));
        if (b.title && !/Alt\+/.test(b.title)) b.title += "  (Alt+" + (i + 1) + ")";
      }
      b.addEventListener("click", () => {
        try { localStorage.setItem(KEY, b.dataset.tab); } catch (_) {}
        setTimeout(() => {
          syncAria();
          const pane = document.getElementById(b.dataset.tab);
          if (pane) { pane.classList.remove("v52-enter"); void pane.offsetWidth; pane.classList.add("v52-enter"); }
        }, 0);
      });
    });
    // setas esquerda/direita na barra de abas
    $(".tab-group")?.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const vis = tabs().filter((b) => b.offsetParent !== null);
      const i = vis.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault();
      const n = vis[(i + (e.key === "ArrowRight" ? 1 : -1) + vis.length) % vis.length];
      n.focus(); n.click();
    });
    // restaura a última aba (só se a página ainda estiver na aba inicial)
    let last = null; try { last = localStorage.getItem(KEY); } catch (_) {}
    const first = list[0];
    if (last && first && first.classList.contains("active") && last !== first.dataset.tab) {
      const t = list.find((b) => b.dataset.tab === last && b.offsetParent !== null);
      if (t) setTimeout(() => t.click(), 60);
    }
    syncAria();
  }

  // ---------- caixas JSON ----------
  const JSON_IDS = ["reqData", "reqHeaders", "dadoJsonText", "newProfileJson"];
  function enhanceJson(ta) {
    if (!ta || ta.dataset.v52) return;
    ta.dataset.v52 = "1";
    const bar = document.createElement("div"); bar.className = "v52-json-bar";
    bar.innerHTML =
      '<span class="v52-json-status" aria-live="polite"></span>' +
      '<button type="button" class="v52-mini" data-act="fmt" title="Formatar JSON (Shift+Alt+F)">Formatar</button>' +
      '<button type="button" class="v52-mini" data-act="copy" title="Copiar conteúdo">Copiar</button>';
    ta.insertAdjacentElement("afterend", bar);
    const st = $(".v52-json-status", bar), fmt = $('[data-act="fmt"]', bar);
    const check = () => {
      const v = ta.value.trim();
      if (!v) { st.dataset.state = ""; st.textContent = "Vazio"; ta.classList.remove("v52-invalid"); fmt.disabled = true; return null; }
      try { const o = JSON.parse(v); st.dataset.state = "ok"; st.textContent = "JSON válido"; ta.classList.remove("v52-invalid"); fmt.disabled = false; return o; }
      catch (err) {
        // textos com {{variáveis}} ou CSV não são erro: só informa
        const loose = /\{\{|^[^\[{]/.test(v);
        st.dataset.state = loose ? "" : "err";
        st.textContent = loose ? "Texto livre" : "JSON inválido — " + String(err.message).replace(/^JSON\.parse: |^Unexpected /, "").slice(0, 60);
        ta.classList.toggle("v52-invalid", !loose); fmt.disabled = true; return undefined;
      }
    };
    let t; const later = () => { clearTimeout(t); t = setTimeout(check, 250); };
    ta.addEventListener("input", later);
    ta.addEventListener("change", later);
    const doFmt = () => {
      const o = check(); if (o == null) return;
      const s = JSON.stringify(o, null, 2); if (s === ta.value) return;
      ta.value = s; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.dispatchEvent(new Event("change", { bubbles: true }));
      toast("JSON formatado");
    };
    fmt.addEventListener("click", doFmt);
    $('[data-act="copy"]', bar).addEventListener("click", async () => {
      if (!ta.value) return toast("Nada para copiar", "err");
      try { await navigator.clipboard.writeText(ta.value); toast("Copiado"); }
      catch (_) { ta.select(); document.execCommand("copy"); toast("Copiado"); }
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const a = ta.selectionStart, b = ta.selectionEnd;
        ta.setRangeText("  ", a, b, "end");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (e.key.toLowerCase() === "f" && e.shiftKey && e.altKey) { e.preventDefault(); doFmt(); }
      else if (e.key === "Escape") ta.blur();
    });
    // valores colocados via script (sem evento) também são verificados
    let lastVal = ta.value;
    setInterval(() => { if (ta.value !== lastVal) { lastVal = ta.value; check(); } }, 800);
    check();
  }

  // ---------- atalhos ----------
  function helpEl() {
    let h = $("#v52Help"); if (h) return h;
    h = document.createElement("div"); h.id = "v52Help"; h.className = "v52-help"; h.hidden = true;
    h.setAttribute("role", "dialog"); h.setAttribute("aria-modal", "true"); h.setAttribute("aria-label", "Atalhos de teclado");
    h.innerHTML = '<div class="v52-help-card"><h4>Atalhos de teclado</h4><dl>' +
      "<dt><kbd>Alt</kbd> + <kbd>1</kbd>…<kbd>7</kbd></dt><dd>Trocar de aba</dd>" +
      "<dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Navegar entre abas focadas</dd>" +
      "<dt><kbd>/</kbd></dt><dd>Buscar mapeamento</dd>" +
      "<dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Confirmar janela aberta</dd>" +
      "<dt><kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>F</kbd></dt><dd>Formatar JSON</dd>" +
      "<dt><kbd>Tab</kbd></dt><dd>Indentar dentro do JSON</dd>" +
      "<dt><kbd>Esc</kbd></dt><dd>Fechar / sair do campo</dd>" +
      "<dt><kbd>?</kbd></dt><dd>Mostrar esta ajuda</dd></dl></div>";
    h.addEventListener("click", (e) => { if (e.target === h) h.hidden = true; });
    document.body.append(h); return h;
  }
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  document.addEventListener("keydown", (e) => {
    const help = $("#v52Help");
    if (e.key === "Escape" && help && !help.hidden) { help.hidden = true; e.stopPropagation(); return; }
    if (e.key === "Alt") document.documentElement.classList.add("v52-show-keys");
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      const b = tabs()[Number(e.key) - 1];
      if (b && b.offsetParent !== null) { e.preventDefault(); b.click(); b.focus(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const m = $(".modal.show");
      const btn = m && ($(".modal-footer .btn-primary:not(:disabled)", m) || $(".modal-footer .btn-success:not(:disabled)", m));
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
    if (e.key === "?" && !typing(document.activeElement)) { e.preventDefault(); helpEl().hidden = false; }
  }, true);
  document.addEventListener("keyup", (e) => { if (e.key === "Alt") document.documentElement.classList.remove("v52-show-keys"); });
  window.addEventListener("blur", () => document.documentElement.classList.remove("v52-show-keys"));

  // ---------- botões: foco no 1º campo ao abrir modal ----------
  document.addEventListener("shown.bs.modal", (e) => {
    const f = $("input:not([type=hidden]):not(:disabled), textarea, select", e.target);
    if (f) f.focus();
  });

  function init() {
    setupTabs();
    JSON_IDS.forEach((id) => enhanceJson(document.getElementById(id)));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
