// ============================================
// v56 — Interface "Área de trabalho"
// As abas viram pastas numa área de trabalho. Abrir uma pasta abre uma janela
// (com barra de título, minimizar, maximizar e fechar) com o conteúdo da aba.
// A extensão lembra a última pasta aberta e reabre a janela no mesmo estado.
// Não altera a lógica das abas: os botões originais continuam no DOM (ocultos)
// e são clicados por aqui, então todo o código existente segue funcionando.
// ============================================
(function () {
  "use strict";
  const KEY = "mapeadorDesktopV56"; // { tab, open, min, max }
  const V52_KEY = "mapeadorLastTabV52";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const hasStore = () => !!(window.chrome && chrome.storage && chrome.storage.local);

  let state = { tab: null, open: false, min: false, max: false };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); if (state.tab) localStorage.setItem(V52_KEY, state.tab); } catch (_) {}
    if (hasStore()) try { chrome.storage.local.set({ [KEY]: state }, () => void chrome.runtime.lastError); } catch (_) {}
  }

  // v56.1 — o usuário escolhe a interface: "desktop" (pastas) ou "abas" (clássica)
  const MODE_KEY = "mapeadorInterfaceV56";
  let mode = "desktop";
  try { mode = localStorage.getItem(MODE_KEY) || "desktop"; } catch (_) {}
  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (_) {}
    const done = () => location.reload();
    if (hasStore()) try { chrome.storage.local.set({ [MODE_KEY]: m }, done); return; } catch (_) {}
    done();
  }
  function addSwitch() {
    const actions = $(".app-header-actions"); if (!actions || $("#v56ModeBtn")) return;
    const b = document.createElement("button");
    b.id = "v56ModeBtn"; b.type = "button"; b.className = "float-popup-btn v56-mode-btn";
    const isDesk = mode === "desktop";
    b.textContent = isDesk ? "☰" : "🖥";
    b.title = isDesk ? "Mudar para a interface clássica (abas)" : "Mudar para a interface área de trabalho (pastas)";
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", () => setMode(isDesk ? "abas" : "desktop"));
    actions.prepend(b);
  }
  function start() {
    addSwitch();
    if (mode === "desktop") build();
    // sincroniza com o que foi salvo no Chrome (ex.: outra janela da extensão)
    if (hasStore()) try { chrome.storage.local.get(MODE_KEY, (r) => { void chrome.runtime.lastError;
      const m = r && r[MODE_KEY]; if (m && m !== mode) { try { localStorage.setItem(MODE_KEY, m); } catch (_) {} location.reload(); } }); } catch (_) {}
  }

  function build() {
    const nav = $(".tab-group.v20-nav") || $(".tab-group");
    if (!nav || $("#v56Desktop")) return;
    const buttons = $$("button[data-tab]", nav);
    document.body.classList.add("v56-os");

    const desk = document.createElement("section");
    desk.id = "v56Desktop"; desk.className = "v56-desktop"; desk.setAttribute("aria-label", "Área de trabalho");
    const grid = document.createElement("div"); grid.className = "v56-icons"; grid.setAttribute("role", "list");
    buttons.forEach((b) => {
      const label = ($(".v20-tab-label", b) || b).textContent.trim();
      const ico = document.createElement("button");
      ico.type = "button"; ico.className = "v56-folder"; ico.dataset.open = b.dataset.tab; ico.setAttribute("role", "listitem");
      ico.title = (b.title || label).replace(/\s+\(Alt\+\d\)$/, "");
      ico.innerHTML = '<span class="v56-folder-art" aria-hidden="true"><span class="v56-folder-back"></span><span class="v56-folder-front"></span><span class="v56-folder-glyph"></span></span><span class="v56-folder-name"></span>';
      const svg = $("svg", b); if (svg) $(".v56-folder-glyph", ico).append(svg.cloneNode(true));
      $(".v56-folder-name", ico).textContent = label;
      ico.addEventListener("click", () => openTab(b.dataset.tab));
      grid.append(ico);
    });
    desk.append(grid);

    // janela
    const win = document.createElement("div");
    win.id = "v56Window"; win.className = "v56-window"; win.hidden = true; win.setAttribute("role", "dialog"); win.setAttribute("aria-labelledby", "v56WinTitle");
    win.innerHTML =
      '<div class="v56-titlebar"><span class="v56-win-ico" aria-hidden="true"></span>' +
      '<div class="v56-win-titles"><span id="v56WinTitle" class="v56-win-title"></span><span class="v56-win-path"></span></div>' +
      '<div class="v56-win-ctrls">' +
      '<button type="button" data-act="min" title="Minimizar" aria-label="Minimizar">–</button>' +
      '<button type="button" data-act="max" title="Maximizar" aria-label="Maximizar">▢</button>' +
      '<button type="button" data-act="close" class="v56-close" title="Fechar" aria-label="Fechar">×</button></div></div>' +
      '<div class="v56-win-body"></div>';
    const body = $(".v56-win-body", win);
    $$(".tab-content").forEach((t) => body.append(t));
    desk.append(win);

    // barra de tarefas
    const bar = document.createElement("div");
    bar.className = "v56-taskbar";
    bar.innerHTML = '<button type="button" class="v56-start" title="Área de trabalho" aria-label="Mostrar área de trabalho"><img src="icons/image-extensao.png" alt=""></button><div class="v56-tasks"></div><span class="v56-clock" aria-live="off"></span>';
    $(".v56-start", bar).addEventListener("click", () => { if (state.open && !state.min) minimize(); else if (state.open) restore(); });
    desk.append(bar);

    nav.after(desk);
    nav.classList.add("v56-hidden-nav");

    $(".v56-win-ctrls", win).addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act === "min") minimize(); else if (act === "max") toggleMax(); else if (act === "close") closeWin();
    });
    $(".v56-titlebar", win).addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleMax(); });

    // qualquer código que clique numa aba (atalhos, "ir para") também abre a janela
    buttons.forEach((b) => b.addEventListener("click", () => {
      state.tab = b.dataset.tab; state.open = true; state.min = false; save(); render();
    }));

    const fit = () => { const top = desk.getBoundingClientRect().top + window.scrollY; desk.style.setProperty("--v56-h", Math.max(420, window.innerHeight - top - 8) + "px"); };
    fit(); window.addEventListener("resize", fit); setTimeout(fit, 300);
    tick(); setInterval(tick, 15000);

    // restaura (localStorage é síncrono; chrome.storage confirma depois)
    restoreFrom(state);
    if (hasStore()) try { chrome.storage.local.get(KEY, (r) => { void chrome.runtime.lastError; if (r && r[KEY] && r[KEY].tab !== state.tab) restoreFrom(r[KEY]); }); } catch (_) {}
  }

  function btnFor(tab) { return $('.tab-group button[data-tab="' + tab + '"]'); }
  function openTab(tab) { const b = btnFor(tab); if (!b) return; state.min = false; b.click(); }
  function minimize() { state.min = true; save(); render(); }
  function restore() { state.min = false; save(); render(); }
  function toggleMax() { state.max = !state.max; save(); render(); }
  function closeWin() { state.open = false; state.min = false; save(); render(); }
  function restoreFrom(s) {
    Object.assign(state, s || {});
    if (state.tab && btnFor(state.tab)) {
      const keep = { open: state.open, min: state.min };
      const b = btnFor(state.tab);
      if (!b.classList.contains("active")) b.click(); // dispara a lógica original da aba
      Object.assign(state, keep); save();
    }
    render();
  }

  function render() {
    const win = $("#v56Window"); if (!win) return;
    const b = state.tab && btnFor(state.tab);
    const label = b ? ($(".v20-tab-label", b) || b).textContent.trim() : "";
    win.hidden = !state.open || state.min;
    win.classList.toggle("is-max", !!state.max);
    document.body.classList.toggle("v56-win-open", state.open && !state.min);
    $("#v56WinTitle").textContent = label;
    $(".v56-win-path", win).textContent = label ? "Este computador › Validador › " + label : "";
    const ico = $(".v56-win-ico", win); ico.innerHTML = ""; const svg = b && $("svg", b); if (svg) ico.append(svg.cloneNode(true));
    $$(".v56-folder").forEach((f) => f.classList.toggle("is-current", state.open && f.dataset.open === state.tab));
    const tasks = $(".v56-tasks"); tasks.innerHTML = "";
    if (state.open && b) {
      const t = document.createElement("button"); t.type = "button"; t.className = "v56-task" + (state.min ? "" : " is-active");
      t.title = state.min ? "Restaurar " + label : "Minimizar " + label;
      t.innerHTML = '<span class="v56-task-ico" aria-hidden="true"></span><span></span>';
      if (svg) $(".v56-task-ico", t).append(svg.cloneNode(true));
      t.lastChild.textContent = label;
      t.addEventListener("click", () => (state.min ? restore() : minimize()));
      tasks.append(t);
    }
  }

  function tick() {
    const c = $(".v56-clock"); if (!c) return;
    const d = new Date();
    c.textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    c.title = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
