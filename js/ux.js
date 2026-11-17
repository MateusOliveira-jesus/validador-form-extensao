// ============================================
// Mapeador de Formulários v5.15 — melhorias de UX (aditivo)
// Só adiciona comportamento na aba Mapeamentos. Não altera perfis,
// dados, histórico nem o preenchimento: lê o DOM já renderizado.
//  - botão para limpar a busca, atalho "/" e Esc
//  - contador de mapeamentos e "Expandir tudo / Recolher tudo"
//  - pastas abrem sozinhas durante a busca (sem mudar o estado salvo)
//  - trecho encontrado destacado no nome
//  - navegação por teclado na lista (setas, Home, End, Enter)
//  - indicação de qual mapeamento será preenchido, junto ao botão
// ============================================
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const list = () => $("#profileList");
  const input = () => $("#profileSearchInput");

  let clearBtn = null, countEl = null, foldBox = null, expandBtn = null, collapseBtn = null, targetEl = null;
  let pendingFocusIndex = null;
  let busy = false;

  const isVisible = (el) => el.offsetParent !== null && el.getBoundingClientRect().height > 0;
  const query = () => (input() ? input().value.trim() : "");

  // ---------- montagem ----------
  function build() {
    const inp = input(), box = list();
    if (!inp || !box || $("#v4ListTools")) return false;

    // busca com botão de limpar (o mesmo <input>, só ganha um invólucro)
    const wrap = document.createElement("div");
    wrap.className = "v4-search-wrap";
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    inp.setAttribute("aria-label", "Buscar mapeamento por nome ou endereço");
    inp.setAttribute("aria-keyshortcuts", "/");
    clearBtn = document.createElement("button");
    clearBtn.type = "button"; clearBtn.className = "v4-search-clear"; clearBtn.hidden = true;
    clearBtn.title = "Limpar busca (Esc)"; clearBtn.setAttribute("aria-label", "Limpar busca");
    clearBtn.textContent = "×";
    wrap.appendChild(clearBtn);

    // contador e expandir/recolher
    const tools = document.createElement("div");
    tools.id = "v4ListTools"; tools.className = "v4-list-tools";
    tools.innerHTML =
      '<span class="v4-count" role="status" aria-live="polite"></span>' +
      '<span class="v4-fold" hidden>' +
      '<button type="button" data-fold="open" title="Abrir todas as pastas">Expandir</button>' +
      '<button type="button" data-fold="close" title="Fechar todas as pastas">Recolher</button></span>';
    // dentro do bloco da busca (.mb-2): a aba usa grid com linhas fixas e
    // elementos soltos cairiam no fim da página
    const host = wrap.closest(".mb-2") || wrap.parentNode;
    const quick = $("#v4Quick");
    if (quick && quick.parentNode === host) quick.insertAdjacentElement("afterend", tools);
    else host.appendChild(tools);
    countEl = $(".v4-count", tools); foldBox = $(".v4-fold", tools);
    expandBtn = $('[data-fold="open"]', tools); collapseBtn = $('[data-fold="close"]', tools);

    // semântica de lista para leitores de tela
    box.setAttribute("role", "listbox");
    box.setAttribute("aria-label", "Mapeamentos salvos");

    // atalhos como dica ao passar o mouse na busca
    inp.title = "Atalhos: / busca · ↑ ↓ navegam pela lista · Enter seleciona · Esc limpa";

    // qual mapeamento será preenchido
    const fill = $("#fillProfileBtn");
    const actions = fill && fill.closest(".primary-actions");
    if (actions) {
      targetEl = document.createElement("div");
      targetEl.className = "v4-fill-target"; targetEl.hidden = true;
      actions.parentNode.insertBefore(targetEl, actions);
    }
    return true;
  }

  // ---------- atualização após cada renderização da lista ----------
  function refresh() {
    const box = list();
    if (!box || busy) return;
    busy = true;
    try {
      const q = query();
      if (clearBtn) clearBtn.hidden = !q;

      // pastas abertas durante a busca (a marca impede salvar esse estado)
      const nodes = Array.from(box.querySelectorAll("details.profile-tree-node"));
      if (q) nodes.forEach((d) => { if (!d.open) { d.dataset.autoOpen = "1"; d.open = true; } });

      // contador
      const rows = box.querySelectorAll(".profile-tree-profile").length;
      if (countEl) {
        const n = `<strong>${rows}</strong>`;
        countEl.innerHTML = q
          ? `${n} ${rows === 1 ? "encontrado" : "encontrados"}`
          : `${n} ${rows === 1 ? "mapeamento" : "mapeamentos"}`;
      }

      // expandir/recolher
      if (foldBox) {
        foldBox.hidden = nodes.length === 0;
        if (expandBtn) expandBtn.disabled = nodes.every((d) => d.open);
        if (collapseBtn) collapseBtn.disabled = nodes.every((d) => !d.open);
      }

      highlight(box, q);

      // devolve o foco ao item depois de selecionar com o teclado
      if (pendingFocusIndex !== null) {
        const row = box.querySelector(`.profile-tree-profile[data-index="${pendingFocusIndex}"]`);
        pendingFocusIndex = null;
        if (row) row.focus({ preventScroll: true });
      }

      // mantém o item selecionado à vista
      const sel = box.querySelector(".profile-tree-profile.selected");
      if (sel && isVisible(sel)) sel.scrollIntoView({ block: "nearest" });
    } finally { busy = false; }
    syncTarget();
  }

  // destaca o trecho buscado no nome (somente nós de texto; nada de innerHTML)
  function highlight(box, q) {
    if (!q) return;
    const needle = q.toLowerCase();
    box.querySelectorAll(".profile-tree-name").forEach((el) => {
      const text = el.textContent, low = text.toLowerCase();
      let i = low.indexOf(needle);
      if (i < 0) return;
      const frag = document.createDocumentFragment();
      let last = 0;
      while (i >= 0) {
        if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
        const m = document.createElement("mark");
        m.className = "v4-hit"; m.textContent = text.slice(i, i + needle.length);
        frag.appendChild(m);
        last = i + needle.length;
        i = low.indexOf(needle, last);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      el.textContent = ""; el.appendChild(frag);
    });
  }

  function syncTarget() {
    if (!targetEl) return;
    const nameEl = $("#profilePreview .selected-profile-name");
    const preview = $("#profilePreview");
    const on = nameEl && preview && preview.style.display !== "none";
    targetEl.hidden = !on;
    if (on) {
      targetEl.innerHTML = "Será preenchido com: <strong></strong>";
      $("strong", targetEl).textContent = nameEl.textContent;
    }
  }

  // ---------- eventos ----------
  function onKeyList(e) {
    const t = e.target;
    const row = t.closest && t.closest(".profile-tree-profile");
    const sum = t.matches && t.matches(".profile-tree-node > summary") ? t : null;
    const isRow = row && t === row;
    if (!isRow && !sum) return;

    const items = Array.from(list().querySelectorAll(".profile-tree-profile, .profile-tree-node > summary")).filter(isVisible);
    const at = items.indexOf(t);
    const go = (i) => { const n = items[Math.max(0, Math.min(items.length - 1, i))]; if (n) { e.preventDefault(); n.focus(); n.scrollIntoView({ block: "nearest" }); } };

    switch (e.key) {
      case "ArrowDown": return go(at + 1);
      case "ArrowUp": return at <= 0 && input() ? (e.preventDefault(), input().focus()) : go(at - 1);
      case "Home": return go(0);
      case "End": return go(items.length - 1);
      case "ArrowRight": if (sum && !sum.parentElement.open) { e.preventDefault(); sum.parentElement.open = true; } return;
      case "ArrowLeft": if (sum && sum.parentElement.open) { e.preventDefault(); sum.parentElement.open = false; } return;
      case "Enter":
      case " ":
        if (isRow) { e.preventDefault(); pendingFocusIndex = row.dataset.index; row.click(); }
        return;
    }
  }

  function isTyping(el) {
    return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  }

  function bind() {
    const box = list(), inp = input();
    if (!box || !inp) return;

    // não grava o estado das pastas que abrimos só por causa da busca
    box.addEventListener("toggle", (e) => {
      if (e.target.dataset && e.target.dataset.autoOpen) {
        delete e.target.dataset.autoOpen;
        e.stopImmediatePropagation();
      }
    }, true);

    box.addEventListener("keydown", onKeyList);

    inp.addEventListener("input", () => { if (clearBtn) clearBtn.hidden = !inp.value; });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && inp.value) {
        e.preventDefault(); e.stopPropagation();
        inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (e.key === "ArrowDown") {
        const first = box.querySelector(".profile-tree-profile, .profile-tree-node > summary");
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    if (clearBtn) clearBtn.addEventListener("click", () => {
      inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.focus();
    });

    if (foldBox) foldBox.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fold]");
      if (!b) return;
      const open = b.dataset.fold === "open";
      box.querySelectorAll("details.profile-tree-node").forEach((d) => { d.open = open; });
      refresh();
    });

    // atalho "/" para buscar (só na aba Mapeamentos, fora de campos de texto)
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(document.activeElement)) return;
      const tab = $("#tabProfiles");
      if (!tab || !tab.classList.contains("active")) return;
      e.preventDefault(); inp.focus(); inp.select();
    });

    // a lista é refeita a cada seleção/busca; o resumo do selecionado também
    new MutationObserver(refresh).observe(box, { childList: true });
    const prev = $("#profilePreview");
    if (prev) new MutationObserver(syncTarget).observe(prev, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
  }

  function init() {
    if (!build()) return;
    bind();
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
