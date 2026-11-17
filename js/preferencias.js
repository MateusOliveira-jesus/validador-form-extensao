// ============================================
// Mapeador de Formulários v3 — Central de preferências
// Só altera aparência/layout (atributos, variáveis CSS, rows/cols).
// Não toca em perfis, dados, histórico nem no preenchimento.
// Substitui o layout.js da v2 e migra o uiPrefsV2 automaticamente.
// ============================================
(function () {
  "use strict";

  const KEY = "uiPrefsV3", OLD_KEY = "uiPrefsV2", CACHE = "uiPrefsV3cache";
  const isFloating = new URLSearchParams(location.search).get("floating") === "1";

  // As 6 primeiras são as originais; as demais ampliam a paleta. "Personalizada" usa o seletor de cor.
  const ACCENTS = {
    esmeralda: ["Esmeralda (v20)", "#0f7a5f"], azul: ["Azul", "#2563eb"], verde: ["Verde", "#059669"], violeta: ["Violeta", "#7c3aed"],
    laranja: ["Laranja", "#ea580c"], rosa: ["Rosa", "#db2777"], grafite: ["Grafite", "#475569"],
    indigo: ["Índigo", "#4f46e5"], ciano: ["Ciano", "#0891b2"], turquesa: ["Turquesa", "#0d9488"],
    lima: ["Lima", "#4d7c0f"], ambar: ["Âmbar", "#b45309"], vermelho: ["Vermelho", "#dc2626"],
    fucsia: ["Fúcsia", "#c026d3"], marrom: ["Marrom", "#92400e"], ardosia: ["Ardósia", "#334155"],
    oceano: ["Oceano", "#0369a1"],
  };
  const CUSTOM = "custom";
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const accentHex = (p) => (p.accent === CUSTOM ? p.accentCustom : ACCENTS[p.accent][1]);
  const accentName = (p) => (p.accent === CUSTOM ? "Personalizada" : ACCENTS[p.accent][0]);
  // Texto sobre a cor de destaque: branco ou quase preto, conforme a luminância (WCAG).
  function onAccent(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return L > 0.4 ? "#0f172a" : "#ffffff";
  }

  // Listas ajustáveis. cols/rows: false = não se aplica.
  const LISTS = {
    profiles: { label: "Mapeamentos", tab: "tabProfiles", tabName: "Mapeamentos", sel: "#profileList", item: ".profile-tree-profile", est: 56, cols: false,
      extra: [
        { t: "sw", k: "fullName", label: "Nome completo do mapeamento", hint: "Quebra o nome em mais linhas em vez de cortar com “…”." },
        { t: "sw", k: "showMapped", label: "Mostrar campos mapeados", hint: "Exibe abaixo do nome quantos campos já foram mapeados." },
        { t: "sw", k: "showData", label: "Mostrar dados salvos", hint: "Exibe abaixo do nome quantos dados padrão o mapeamento tem." },
      ] },
    mapping: { label: "Campos mapeados", tab: "tabMapper", tabName: "Mapear", sel: "#mappingContainer", item: ".mapping-item", est: 46, cols: true },
    history: { label: "Dados salvos", tab: "tabHistory", tabName: "Dados", sel: "#historyListContainer", item: ".list-item, .history-item", est: 46, cols: true },
    gen: { label: "Opções do gerador", tab: "tabAI", tabName: "Gerar", sel: "#configuracaoIA", cols: true, rows: false },
    people: { label: "Pessoas geradas", tab: "tabAI", tabName: "Gerar", sel: "#pessoasGeradasList", item: ":scope > *", est: 30, cols: false },
    testKeys: { label: "Chaves do modo de teste", tab: null, tabName: "janela de teste", sel: "#testFieldList", item: ":scope > *", est: 34, cols: false },
  };
  const JSON_AREAS = "#newJsonData, #newProfileJson, #editProfileJson";

  const DEFAULTS = {
    theme: "auto", accent: "esmeralda", accentCustom: "#2563eb", radius: "medium", density: "normal", text: 13, motion: true,
    wcols: 2, split: 42, width: 760, height: 600, sticky: true, hints: true,
    jsonRows: 6, jsonFont: 12,
    fullName: true, showMapped: true, showData: true,
    lists: {
      profiles: { rows: 0 }, mapping: { cols: 1, rows: 0 }, history: { cols: 1, rows: 0 },
      gen: { cols: 1 }, people: { rows: 0 }, testKeys: { rows: 0 },
    },
  };

  const PRESETS = [
    { name: "Compacto", desc: "Mais informação na tela", p: { density: "compact", text: 12, radius: "sharp", jsonRows: 4, lists: { mapping: { cols: 2, rows: 0 }, history: { cols: 2, rows: 0 } } } },
    { name: "Equilibrado", desc: "O padrão da extensão", p: {} },
    { name: "Confortável", desc: "Texto e espaços maiores", p: { density: "comfy", text: 14, radius: "round", width: 800, jsonRows: 8 } },
    { name: "Painel largo", desc: "Listas em 2 colunas", p: { width: 800, split: 36, text: 13, lists: { mapping: { cols: 2, rows: 0 }, history: { cols: 2, rows: 0 }, gen: { cols: 2 } } } },
  ];

  const PANES = [
    { id: "look", label: "Aparência", keys: ["theme", "accent", "accentCustom", "radius", "density", "text", "motion"], fields: [
      { t: "seg", k: "theme", label: "Tema", opts: [["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]] },
      { t: "swatch", k: "accent", label: "Cor de destaque" },
      { t: "seg", k: "radius", label: "Cantos", opts: [["sharp", "Retos"], ["medium", "Médios"], ["round", "Redondos"]] },
      { t: "seg", k: "density", label: "Densidade", opts: [["compact", "Compacta"], ["normal", "Normal"], ["comfy", "Confortável"]] },
      { t: "range", k: "text", label: "Tamanho do texto", min: 11, max: 16, step: 1, fmt: "px" },
      { t: "sw", k: "motion", label: "Animações", hint: "Desligue para reduzir movimento na interface." },
    ] },
    { id: "layout", label: "Layout", keys: ["wcols", "split", "width", "height", "sticky", "hints"], fields: [
      { t: "seg", k: "wcols", label: "Colunas do painel", opts: [[1, "1 coluna"], [2, "2 colunas"]] },
      { t: "range", k: "split", label: "Largura da coluna esquerda", min: 25, max: 70, step: 1, fmt: "split", needs: "wcols2" },
      { t: "range", k: "width", label: "Largura do popup", min: 560, max: 800, step: 20, fmt: "px", popupOnly: true },
      { t: "range", k: "height", label: "Altura máxima do popup", min: 400, max: 600, step: 20, fmt: "px", popupOnly: true, hint: "O Chrome limita o popup a 800 × 600 px." },
      { t: "sw", k: "sticky", label: "Fixar cabeçalho e abas", hint: "Mantém a navegação visível ao rolar." },
      { t: "sw", k: "hints", label: "Mostrar textos de ajuda", hint: "Descrições e avisos abaixo dos títulos." },
    ] },
    { id: "lists", label: "Listas", keys: ["lists", "fullName", "showMapped", "showData"], custom: "lists" },
    { id: "areas", label: "JSON", keys: ["jsonRows", "jsonFont"], fields: [
      { t: "step", k: "jsonRows", label: "Linhas visíveis", min: 3, max: 20, fmt: "rows", hint: "Vale para adicionar, criar e editar JSON. Você também pode arrastar o canto da caixa." },
      { t: "range", k: "jsonFont", label: "Fonte do JSON", min: 11, max: 16, step: 1, fmt: "px" },
    ] },
    { id: "more", label: "Mais", keys: [], custom: "more" },
  ];

  let prefs = clone(DEFAULTS);
  let drawer = null, btn = null;

  // ---------- util ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(n, a, b, d) { n = Number(n); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : (d != null ? d : a); }
  function oneOf(v, list, d) { return list.includes(v) ? v : d; }
  function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, p, v) { const ks = p.split("."); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

  function normalize(p) {
    const d = clone(DEFAULTS);
    if (!p || typeof p !== "object") return d;
    d.theme = oneOf(p.theme, ["auto", "light", "dark"], d.theme);
    d.accentCustom = HEX.test(p.accentCustom || "") ? p.accentCustom.toLowerCase() : d.accentCustom;
    d.accent = (ACCENTS[p.accent] || (p.accent === CUSTOM && HEX.test(p.accentCustom || ""))) ? p.accent : d.accent;
    // v20: quem estava no azul padrão antigo passa para o novo padrão uma única vez
    if (!p.v20 && p.accent === "azul") d.accent = "esmeralda";
    d.v20 = true;
    d.radius = oneOf(p.radius, ["sharp", "medium", "round"], d.radius);
    d.density = oneOf(p.density, ["compact", "normal", "comfy"], d.density);
    d.text = clamp(p.text, 11, 16, d.text);
    d.motion = p.motion !== false;
    d.wcols = Number(p.wcols) === 1 ? 1 : 2;
    d.split = clamp(p.split, 25, 70, d.split);
    d.width = clamp(p.width, 560, 800, d.width);
    d.height = clamp(p.height, 400, 600, d.height);
    d.sticky = p.sticky !== false;
    d.hints = p.hints !== false;
    d.jsonRows = clamp(p.jsonRows, 3, 20, d.jsonRows);
    d.jsonFont = clamp(p.jsonFont, 11, 16, d.jsonFont);
    d.fullName = p.fullName !== false;
    d.showMapped = p.showMapped !== false;
    d.showData = p.showData !== false;
    Object.keys(LISTS).forEach((k) => {
      const src = (p.lists && p.lists[k]) || {};
      if (LISTS[k].cols) d.lists[k].cols = clamp(src.cols, 1, 4, 1);
      if (LISTS[k].rows !== false) { const r = Number(src.rows); d.lists[k].rows = r >= 3 ? clamp(r, 3, 20) : 0; }
    });
    return d;
  }

  // v2 -> v3
  function fromV2(o) {
    if (!o || typeof o !== "object") return null;
    const m = { wcols: o.wcols, split: o.split, width: o.width, text: o.text, lists: { mapping: {}, history: {}, gen: {} } };
    if (o.lcols) { m.lists.mapping.cols = o.lcols.tabMapper; m.lists.history.cols = o.lcols.tabHistory; m.lists.gen.cols = o.lcols.tabAI; }
    return m;
  }

  // ---------- persistência ----------
  function readCache() { try { const s = localStorage.getItem(CACHE); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
  function writeCache() { try { localStorage.setItem(CACHE, JSON.stringify(prefs)); } catch (_) {} }
  function load(cb) {
    try {
      chrome.storage.local.get([KEY, OLD_KEY], (r) => {
        void chrome.runtime.lastError;
        if (r && r[KEY]) return cb(normalize(r[KEY]));
        cb(normalize(fromV2(r && r[OLD_KEY])));
      });
    } catch (_) { cb(normalize(readCache())); }
  }
  let saveTimer = null;
  function save() {
    writeCache();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { chrome.storage.local.set({ [KEY]: prefs }, () => void chrome.runtime.lastError); } catch (_) {}
    }, 200);
  }

  // ---------- aplicar ----------
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function resolvedTheme() { return prefs.theme === "auto" ? (mq && mq.matches ? "dark" : "light") : prefs.theme; }

  function applyRoot() {
    const r = document.documentElement;
    r.dataset.theme = resolvedTheme();
    r.dataset.density = prefs.density;
    r.dataset.radius = prefs.radius;
    r.dataset.hints = prefs.hints ? "1" : "0";
    r.dataset.sticky = prefs.sticky ? "1" : "0";
    r.dataset.motion = prefs.motion ? "1" : "0";
    r.dataset.pname = prefs.fullName ? "full" : "clip";
    r.dataset.pmapped = prefs.showMapped ? "1" : "0";
    r.dataset.pdata = prefs.showData ? "1" : "0";
    const s = r.style;
    const hex = accentHex(prefs);
    s.setProperty("--v2-accent", hex);
    if (prefs.accent === "esmeralda") s.removeProperty("--v20-user-accent"); else s.setProperty("--v20-user-accent", hex);
    s.setProperty("--v4-on-accent", onAccent(hex));
    s.setProperty("--v2-fs", prefs.text + "px");
    s.setProperty("--v2-split", prefs.split + "%");
    s.setProperty("--v2-width", isFloating ? "100%" : prefs.width + "px");
    s.setProperty("--v3-height", prefs.height + "px");
    s.setProperty("--v3-area-fs", prefs.jsonFont + "px");
  }

  function applyDom() {
    if (!document.body) return;
    document.body.classList.add("v2", "v3");
    document.body.dataset.wcols = String(prefs.wcols);
    Object.entries(LISTS).forEach(([k, L]) => {
      if (!L.cols) return;
      const el = document.querySelector(L.sel);
      if (el) el.dataset.lcols = String(prefs.lists[k].cols);
    });
    document.querySelectorAll(JSON_AREAS).forEach((t) => { t.rows = prefs.jsonRows; t.classList.add("v3-area"); });
    scheduleMeasure();
  }

  // Linhas visíveis: converte "N linhas" em max-height medindo os itens reais.
  function visible(el) { return el.offsetParent !== null && el.offsetHeight > 0; }
  function measure(key) {
    const L = LISTS[key];
    if (L.rows === false) return;
    const el = document.querySelector(L.sel);
    if (!el) return;
    const rows = prefs.lists[key].rows;
    if (!rows) {
      el.style.removeProperty("max-height"); el.style.removeProperty("min-height"); delete el.dataset.v3rows;
      return;
    }
    let items = Array.from(el.querySelectorAll(L.item)).filter((n) => !n.classList.contains("empty-message"));
    if (!items.length) items = Array.from(el.children).filter((n) => !n.classList.contains("empty-message"));
    const sample = items.filter(visible).slice(0, 6);
    let h = L.est;
    if (sample.length) {
      h = sample.reduce((s, n) => {
        const cs = getComputedStyle(n);
        const m = items.length > 1 && getComputedStyle(el).display !== "grid" ? (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0) : 0;
        return s + n.offsetHeight + m;
      }, 0) / sample.length;
    }
    const cs = getComputedStyle(el);
    const gap = cs.display === "grid" ? parseFloat(cs.rowGap) || 0 : 0;
    const pad = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((s, p) => s + (parseFloat(cs[p]) || 0), 0);
    const max = Math.round(rows * h + (rows - 1) * gap + pad);
    el.dataset.v3rows = String(rows);
    el.style.setProperty("max-height", max + "px", "important");
    el.style.setProperty("min-height", "0", "important");
  }
  let measureTimer = null;
  function scheduleMeasure() {
    clearTimeout(measureTimer);
    measureTimer = setTimeout(() => requestAnimationFrame(() => Object.keys(LISTS).forEach(measure)), 40);
  }

  function applyAll() { applyRoot(); applyDom(); syncDrawer(); syncQuick(); writeCache(); }

  // ---------- gaveta ----------
  const FMT = {
    px: (v) => v + " px",
    split: (v) => v + "% / " + (100 - v) + "%",
    rows: (v) => v + " linhas",
    cols: (v) => v + (v === 1 ? " coluna" : " colunas"),
    lrows: (v) => (v ? v + (v === 1 ? " linha" : " linhas") : "Automático"),
  };

  function fieldHtml(f, path) {
    const p = path || f.k;
    const hint = f.hint ? `<div class="v3-hint">${f.hint}</div>` : "";
    const cls = "v3-field" + (f.popupOnly ? " popup-only" : "");
    const need = f.needs ? ` data-needs="${f.needs}"` : "";
    if (f.t === "seg") {
      return `<div class="${cls}"${need}><div class="v3-lab"><span>${f.label}</span></div><div class="v3-seg" data-seg="${p}">${f.opts.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join("")}</div>${hint}</div>`;
    }
    if (f.t === "swatch") {
      return `<div class="${cls}"><div class="v3-lab"><span>${f.label}</span><output data-name="accent"></output></div><div class="v3-swatches" data-swatch="${p}">${Object.entries(ACCENTS).map(([k, [n, c]]) => `<button type="button" data-v="${k}" style="background:${c}" title="${n}" aria-label="${n}"></button>`).join("")}<label class="v3-swatch-custom" title="Cor personalizada" aria-label="Cor personalizada"><input type="color" data-custom-accent value="#2563eb" /></label></div></div>`;
    }
    if (f.t === "range") {
      return `<div class="${cls}"${need}><div class="v3-lab"><label for="v3r-${p}">${f.label}</label><output data-out="${p}" data-fmt="${f.fmt}"></output></div><input id="v3r-${p}" type="range" data-range="${p}" min="${f.min}" max="${f.max}" step="${f.step}" />${hint}</div>`;
    }
    if (f.t === "step") {
      return `<div class="${cls}"><div class="v3-lab"><span>${f.label}</span></div><div class="v3-step"><button type="button" data-step="${p}" data-d="-1" data-min="${f.min}" data-max="${f.max}" aria-label="Diminuir">−</button><output data-out="${p}" data-fmt="${f.fmt}"></output><button type="button" data-step="${p}" data-d="1" data-min="${f.min}" data-max="${f.max}" aria-label="Aumentar">+</button></div>${hint}</div>`;
    }
    if (f.t === "sw") {
      return `<div class="${cls}"><button type="button" class="v3-sw" role="switch" data-sw="${p}"><span><span class="t">${f.label}</span>${f.hint ? `<span class="h">${f.hint}</span>` : ""}</span><span class="v3-track"></span></button></div>`;
    }
    return "";
  }

  function listsPane() {
    const groups = Object.entries(LISTS).map(([k, L]) => {
      const where = L.tab ? `<button type="button" data-go="${L.tab}" title="Abrir a aba ${L.tabName}">Abrir aba ${L.tabName}</button>` : `<span class="v3-hint">${L.tabName}</span>`;
      const cols = L.cols ? `<div class="v3-field"><div class="v3-lab"><span>Colunas</span></div><div class="v3-step"><button type="button" data-step="lists.${k}.cols" data-d="-1" data-min="1" data-max="4" aria-label="Menos colunas">−</button><output data-out="lists.${k}.cols" data-fmt="cols"></output><button type="button" data-step="lists.${k}.cols" data-d="1" data-min="1" data-max="4" aria-label="Mais colunas">+</button></div></div>` : "";
      const rows = L.rows === false ? "" : `<div class="v3-field"><div class="v3-lab"><span>Linhas visíveis</span></div><div class="v3-step"><button type="button" data-step="lists.${k}.rows" data-d="-1" data-min="3" data-max="20" data-auto="1" aria-label="Menos linhas">−</button><output data-out="lists.${k}.rows" data-fmt="lrows"></output><button type="button" data-step="lists.${k}.rows" data-d="1" data-min="3" data-max="20" data-auto="1" aria-label="Mais linhas">+</button></div></div>`;
      const extra = (L.extra || []).map((f) => fieldHtml(f)).join("");
      return `<section class="v3-group" data-list="${k}"><h3><span>${L.label}</span>${where}</h3>${cols}${rows}${extra}</section>`;
    }).join("");
    return `<div class="v3-hint" style="margin:0 0 10px">Passe o mouse sobre um grupo para destacar a lista na tela. Em “Automático” a altura segue o padrão da aba.</div>` + groups;
  }

  function morePane() {
    return `<div class="v3-field"><div class="v3-lab"><span>Modelos prontos</span></div><div class="v3-presets">${PRESETS.map((p, i) => `<button type="button" class="v3-btn" data-preset="${i}">${p.name}<small>${p.desc}</small></button>`).join("")}</div><div class="v3-hint">Mantêm o tema e a cor escolhidos.</div></div>
      <div class="v3-field"><div class="v3-lab"><span>Tudo de volta ao padrão</span></div><button type="button" class="v3-btn danger" data-act="resetAll">Restaurar todas as preferências</button><div class="v3-hint">Não apaga mapeamentos, dados nem histórico.</div></div>
      <div class="v3-hint">As preferências valem no popup e no painel flutuante.</div>`;
  }

  function buildDrawer() {
    drawer = document.createElement("aside");
    drawer.id = "v3Prefs";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Preferências");
    drawer.innerHTML = `
      <div class="v3-head"><h2>Preferências</h2><button type="button" class="v3-x" data-act="close" aria-label="Fechar">×</button></div>
      <div class="v3-nav" role="tablist">${PANES.map((p, i) => `<button type="button" role="tab" data-pane="${p.id}" aria-selected="${i === 0}">${p.label}</button>`).join("")}</div>
      <div class="v3-body">${PANES.map((p, i) => `<div class="v3-pane${i === 0 ? " on" : ""}" data-pane-id="${p.id}" role="tabpanel">${p.custom === "lists" ? listsPane() : p.custom === "more" ? morePane() : p.fields.map((f) => fieldHtml(f)).join("")}</div>`).join("")}</div>
      <div class="v3-foot"><button type="button" class="v3-btn" data-act="resetPane">Restaurar esta seção</button><span class="v3-hint" style="margin:0">Salvo automaticamente</span></div>`;
    document.body.appendChild(drawer);

    drawer.addEventListener("click", onClick);
    drawer.addEventListener("input", (e) => {
      const r = e.target.closest("[data-range]");
      if (r) { setPref(r.dataset.range, Number(r.value)); return; }
      const c = e.target.closest("[data-custom-accent]");
      if (c && HEX.test(c.value)) { prefs.accentCustom = c.value.toLowerCase(); prefs.accent = CUSTOM; prefs = normalize(prefs); applyAll(); save(); }
    });
    drawer.addEventListener("pointerover", (e) => flash(e.target.closest("[data-list]")));
    drawer.addEventListener("pointerleave", () => flash(null));
  }

  let flashed = null;
  function flash(group) {
    const el = group ? document.querySelector(LISTS[group.dataset.list].sel) : null;
    if (flashed && flashed !== el) flashed.classList.remove("v3-flash");
    flashed = el;
    if (el && el.offsetParent !== null) el.classList.add("v3-flash");
  }

  function setPref(path, val) {
    setPath(prefs, path, val);
    prefs = normalize(prefs);
    applyAll(); save();
  }

  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.pane) return showPane(b.dataset.pane);
    if (b.dataset.go) { const t = document.querySelector('.tab-group [data-tab="' + b.dataset.go + '"]'); if (t) t.click(); return; }
    const seg = b.closest("[data-seg]");
    if (seg && b.dataset.v != null) { const v = b.dataset.v; return setPref(seg.dataset.seg, /^\d+$/.test(v) ? Number(v) : v); }
    const sw = b.closest("[data-swatch]");
    if (sw && b.dataset.v) return setPref(sw.dataset.swatch, b.dataset.v);
    if (b.dataset.sw) return setPref(b.dataset.sw, !getPath(prefs, b.dataset.sw));
    if (b.dataset.step) {
      const path = b.dataset.step, d = Number(b.dataset.d), min = Number(b.dataset.min), max = Number(b.dataset.max);
      let cur = Number(getPath(prefs, path)) || 0, next;
      if (b.dataset.auto) next = d > 0 ? (cur === 0 ? min + 3 : cur + 1) : (cur <= min ? 0 : cur - 1);
      else next = cur + d;
      return setPref(path, Math.min(max, Math.max(b.dataset.auto ? 0 : min, next)));
    }
    if (b.dataset.preset) return applyPreset(PRESETS[Number(b.dataset.preset)]);
    switch (b.dataset.act) {
      case "close": return closeDrawer();
      case "resetAll": prefs = clone(DEFAULTS); applyAll(); save(); return msg("Preferências restauradas.");
      case "resetPane": return resetPane();
    }
  }

  function showPane(id) {
    drawer.querySelectorAll(".v3-nav button").forEach((n) => n.setAttribute("aria-selected", String(n.dataset.pane === id)));
    drawer.querySelectorAll(".v3-pane").forEach((p) => p.classList.toggle("on", p.dataset.paneId === id));
    const body = drawer.querySelector(".v3-body"); if (body) body.scrollTop = 0;
    const foot = drawer.querySelector('[data-act="resetPane"]');
    if (foot) foot.style.visibility = id === "more" ? "hidden" : "visible";
  }
  function currentPane() { const p = drawer.querySelector(".v3-pane.on"); return p ? p.dataset.paneId : "look"; }
  function resetPane() {
    const pane = PANES.find((p) => p.id === currentPane());
    if (!pane) return;
    pane.keys.forEach((k) => { prefs[k] = clone(DEFAULTS[k]); });
    prefs = normalize(prefs); applyAll(); save();
  }

  function mergeDeep(t, s) {
    Object.keys(s).forEach((k) => {
      if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k])) { t[k] = mergeDeep(t[k] || {}, s[k]); } else t[k] = s[k];
    });
    return t;
  }
  function applyPreset(p) {
    const keep = { theme: prefs.theme, accent: prefs.accent, accentCustom: prefs.accentCustom };
    prefs = normalize(Object.assign(mergeDeep(clone(DEFAULTS), clone(p.p)), keep));
    applyAll(); save(); msg("Modelo “" + p.name + "” aplicado.");
  }

  function msg(t) { const m = drawer && drawer.querySelector("[data-msg]"); if (m) m.textContent = t; }

  function syncDrawer() {
    if (!drawer) return;
    const q = (s) => drawer.querySelectorAll(s);
    q("[data-seg]").forEach((g) => { const cur = String(getPath(prefs, g.dataset.seg)); g.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === cur)); });
    q("[data-swatch]").forEach((g) => { const cur = getPath(prefs, g.dataset.swatch); g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === cur))); });
    q("[data-name='accent']").forEach((o) => { o.textContent = accentName(prefs); });
    q("[data-custom-accent]").forEach((i) => {
      if (document.activeElement !== i) i.value = prefs.accentCustom;
      const lab = i.closest(".v3-swatch-custom");
      if (lab) { lab.classList.toggle("on", prefs.accent === CUSTOM); lab.style.setProperty("--sw", prefs.accentCustom); lab.setAttribute("aria-pressed", String(prefs.accent === CUSTOM)); }
    });
    q("[data-sw]").forEach((b) => b.setAttribute("aria-checked", String(!!getPath(prefs, b.dataset.sw))));
    q("[data-range]").forEach((r) => { const v = getPath(prefs, r.dataset.range); if (document.activeElement !== r || Number(r.value) !== v) r.value = v; });
    q("[data-out]").forEach((o) => { const v = getPath(prefs, o.dataset.out); o.textContent = FMT[o.dataset.fmt](v); });
    q("[data-step]").forEach((b) => {
      const v = Number(getPath(prefs, b.dataset.step)) || 0, d = Number(b.dataset.d);
      b.disabled = b.dataset.auto ? (d < 0 ? v === 0 : v >= Number(b.dataset.max)) : (d < 0 ? v <= Number(b.dataset.min) : v >= Number(b.dataset.max));
    });
    q('[data-needs="wcols2"]').forEach((f) => f.classList.toggle("off", prefs.wcols === 1));
    q(".popup-only").forEach((f) => { f.style.display = isFloating ? "none" : ""; });
  }

  function openDrawer() {
    if (!drawer) { buildDrawer(); }
    syncDrawer(); showPane(currentPane());
    drawer.classList.add("open");
    document.body.classList.add("v3-prefs-open");
    if (btn) btn.setAttribute("aria-expanded", "true");
    const first = drawer.querySelector(".v3-nav button[aria-selected='true']"); if (first) first.focus();
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("open");
    document.body.classList.remove("v3-prefs-open");
    flash(null);
    if (btn) { btn.setAttribute("aria-expanded", "false"); btn.focus(); }
  }
  const isOpen = () => drawer && drawer.classList.contains("open");

  function injectButton() {
    const host = document.querySelector(".app-header-actions");
    if (!host || document.getElementById("v3PrefsBtn")) return;
    btn = document.createElement("button");
    btn.id = "v3PrefsBtn"; btn.type = "button"; btn.className = "float-popup-btn";
    btn.title = "Preferências (tema, colunas, linhas, texto)"; btn.setAttribute("aria-label", "Abrir preferências");
    btn.setAttribute("aria-expanded", "false"); btn.textContent = "⚙";
    btn.addEventListener("click", (e) => { e.stopPropagation(); isOpen() ? closeDrawer() : openDrawer(); });
    host.insertBefore(btn, host.firstChild);
  }

  // ---------- barra rápida de exibição (aba Mapeamentos) ----------
  // Atalho para as mesmas preferências da central: nome completo, mapeados e dados.
  const QUICK = [
    ["fullName", "Nome completo", "Mostrar o nome completo, sem cortar"],
    ["showMapped", "Mapeados", "Mostrar a quantidade de campos mapeados abaixo do nome"],
    ["showData", "Dados", "Mostrar a quantidade de dados salvos abaixo do nome"],
  ];
  function injectQuick() {
    if (document.getElementById("v4Quick")) return;
    const search = document.getElementById("profileSearchInput");
    const host = search && (search.closest(".mb-2") || search.parentElement);
    if (!host) return;
    const bar = document.createElement("div");
    bar.id = "v4Quick"; bar.className = "v4-quick";
    bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "O que exibir em cada mapeamento");
    bar.innerHTML = '<span class="v4-quick-lab">Exibir</span>' + QUICK.map(([k, l, t]) =>
      `<button type="button" class="v4-chip-toggle" data-quick="${k}" title="${t}" aria-pressed="false">${l}</button>`).join("");
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-quick]");
      if (b) setPref(b.dataset.quick, !prefs[b.dataset.quick]);
    });
    host.appendChild(bar); // dentro do bloco da busca: a aba usa grid com linhas fixas
    syncQuick();
  }
  function syncQuick() {
    document.querySelectorAll("#v4Quick [data-quick]").forEach((b) => b.setAttribute("aria-pressed", String(!!prefs[b.dataset.quick])));
  }

  // ---------- init ----------
  // 1) aplica o cache já no <head> para evitar piscar o tema
  const cached = readCache();
  if (cached) { prefs = normalize(cached); }
  applyRoot();

  function init() {
    injectButton();
    injectQuick();
    applyDom();
    load((p) => { prefs = p; applyAll(); });

    // trocas de aba/modais e mudanças nas listas remedem as linhas
    const mo = new MutationObserver(scheduleMeasure);
    document.querySelectorAll(".tab-content, .modal").forEach((t) => mo.observe(t, { attributes: true, attributeFilter: ["class", "style"] }));
    Object.values(LISTS).forEach((L) => { const el = document.querySelector(L.sel); if (el && L.rows !== false) mo.observe(el, { childList: true }); });

    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) closeDrawer(); });
    if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (prefs.theme === "auto") applyAll(); });
    try {
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== "local" || !ch[KEY]) return;
        const next = normalize(ch[KEY].newValue);
        if (JSON.stringify(next) !== JSON.stringify(prefs)) { prefs = next; applyAll(); }
      });
    } catch (_) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
