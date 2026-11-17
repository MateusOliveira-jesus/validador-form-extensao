// ============================================
// PAINEL FLUTUANTE NA ABA ATUAL (iframe 760×760, redimensionável)
//
// Estrutura (tudo isolado em Shadow DOM, para o CSS da página não interferir):
//   #mapeador-formularios-floating-panel     -> contêiner (position: fixed)
//     └ .box > iframe (popup.html?floating=1)
//     └ 8 alças de redimensionamento (bordas e cantos)
//   #mapeador-formularios-floating-minimized -> botão lançador (ícone redondo)
//
// Duas formas de popup:
//   1) este painel flutuante (iframe dentro da página)
//   2) janela destacada (chrome.windows.create, ver popup.js / janela.js)
// ============================================
const FLOATING_PANEL_ID = "mapeador-formularios-floating-panel";
const FLOATING_MINIMIZED_ID = "mapeador-formularios-floating-minimized";
const FLOATING_STATE_KEY = "mapeador-formularios-floating-state"; // sessionStorage: posição (por aba)
const FLOATING_MIN_KEY = "mapeador-formularios-floating-is-minimized"; // sessionStorage: minimizado (por aba)
const FLOATING_PREF_KEY = "floatingPanelEnabled"; // chrome.storage.local: ligado/desligado (global)
const FLOATING_SIZE_KEY = "floatingPanelSize"; // chrome.storage.local: tamanho (global)
const FLOATING_LAUNCHER_POS_KEY = "floatingLauncherPos"; // chrome.storage.local: posição da bolinha (global)

const FLOATING_DEFAULT_SIZE = { width: 760, height: 760 };
const FLOATING_MIN_SIZE = { width: 360, height: 320 };
const FLOATING_MARGIN = 8;
const LAUNCHER_SIZE = 46;
const LAUNCHER_DEFAULT_POS = { right: 20, bottom: 20 };
const LAUNCHER_DRAG_THRESHOLD = 4; // px: abaixo disso é clique, acima é arraste
const FLOATING_Z_INDEX = "2147483647";

// Cache em memória (evita ler o storage a cada mutação do DOM)
let floatingEnabled = null;
let floatingSizePref = null; // { width, height } escolhido pelo usuário
let floatingLauncherPos = null; // { right, bottom } da bolinha, escolhido pelo usuário
let floatingObserver = null;
let floatingRestoreTimer = null;

// ---------- Utilidades ----------
function importantStyle(element, styles) {
  Object.entries(styles).forEach(([prop, value]) => {
    element.style.setProperty(prop, String(value), "important");
  });
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function attachShadowStyles(root, cssText) {
  // adoptedStyleSheets não depende da CSP da página; <style> fica como alternativa
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    root.adoptedStyleSheets = [sheet];
    return;
  } catch (_) {}
  const style = document.createElement("style");
  style.textContent = cssText;
  root.appendChild(style);
}

function appendToPage(element) {
  // No <html> (e não no <body>): sobrevive a SPAs que trocam o body
  (document.documentElement || document.body).appendChild(element);
}

function getFloatingIframe(host) {
  return host && host.shadowRoot
    ? host.shadowRoot.querySelector("iframe")
    : null;
}

// ---------- Preferências (chrome.storage.local) ----------
function floatingStorageAvailable() {
  try {
    return !!(
      chrome &&
      chrome.runtime &&
      chrome.runtime.id &&
      chrome.storage &&
      chrome.storage.local
    );
  } catch (_) {
    return false; // extensão recarregada/contexto invalidado
  }
}

function setFloatingPreference(enabled) {
  floatingEnabled = !!enabled;
  if (!floatingStorageAvailable()) return;
  try {
    chrome.storage.local.set({ [FLOATING_PREF_KEY]: !!enabled }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) {}
}

function normalizeStoredSize(value) {
  if (!value || !Number.isFinite(value.width) || !Number.isFinite(value.height))
    return null;
  if (value.width < 200 || value.height < 200) return null;
  return { width: value.width, height: value.height };
}

function loadFloatingSettings(callback) {
  if (!floatingStorageAvailable()) {
    callback(false, null);
    return;
  }
  try {
    chrome.storage.local.get(
      [FLOATING_PREF_KEY, FLOATING_SIZE_KEY, FLOATING_LAUNCHER_POS_KEY],
      (result) => {
        if (chrome.runtime.lastError || !result) {
          callback(false, null, null);
          return;
        }
        callback(
          result[FLOATING_PREF_KEY] === true,
          normalizeStoredSize(result[FLOATING_SIZE_KEY]),
          normalizeLauncherPos(result[FLOATING_LAUNCHER_POS_KEY]),
        );
      },
    );
  } catch (_) {
    callback(false, null);
  }
}

function persistFloatingSize(size) {
  const normalized = normalizeStoredSize(size);
  if (!normalized) return;
  floatingSizePref = normalized;
  if (!floatingStorageAvailable()) return;
  try {
    chrome.storage.local.set({ [FLOATING_SIZE_KEY]: normalized }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) {}
}

function normalizeLauncherPos(pos) {
  if (!pos || typeof pos !== "object") return null;
  const right = Number(pos.right);
  const bottom = Number(pos.bottom);
  if (!Number.isFinite(right) || !Number.isFinite(bottom)) return null;
  return { right, bottom };
}

function persistLauncherPos(pos) {
  const normalized = normalizeLauncherPos(pos);
  if (!normalized) return;
  floatingLauncherPos = normalized;
  if (!floatingStorageAvailable()) return;
  try {
    chrome.storage.local.set({ [FLOATING_LAUNCHER_POS_KEY]: normalized }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) {}
}

// Mantém a bolinha sempre dentro da janela do navegador
function clampLauncherPos(pos) {
  const base = normalizeLauncherPos(pos) || LAUNCHER_DEFAULT_POS;
  return {
    right: Math.round(
      clampNumber(
        base.right,
        FLOATING_MARGIN,
        window.innerWidth - LAUNCHER_SIZE - FLOATING_MARGIN,
      ),
    ),
    bottom: Math.round(
      clampNumber(
        base.bottom,
        FLOATING_MARGIN,
        window.innerHeight - LAUNCHER_SIZE - FLOATING_MARGIN,
      ),
    ),
  };
}

function applyLauncherPos(host, pos) {
  if (!host) return null;
  const clamped = clampLauncherPos(pos || floatingLauncherPos);
  importantStyle(host, {
    right: clamped.right + "px",
    bottom: clamped.bottom + "px",
  });
  return clamped;
}

// ---------- Mensagens ----------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_FLOATING" && window === window.top) {
    toggleFloatingPanel();
    sendResponse({ status: "ok" });
    return true;
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.source !== "mapeador-formularios") return;
  // Só aceita comandos vindos do nosso próprio iframe
  const host = document.getElementById(FLOATING_PANEL_ID);
  const iframe = getFloatingIframe(host);
  if (!iframe || event.source !== iframe.contentWindow) return;

  switch (event.data.action) {
    case "MINIMIZE_FLOATING":
      minimizeFloatingPanel();
      break;
    case "EXPAND_FLOATING":
      expandFloatingPanel();
      break;
    case "CLOSE_FLOATING":
      removeFloatingPanel();
      break;
    case "FLOATING_DRAG":
      moveFloatingPanel(event.data.dx || 0, event.data.dy || 0);
      break;
    case "TOGGLE_MAXIMIZE":
      toggleMaximizeFloatingPanel();
      break;
    case "RESET_FLOATING_SIZE":
      resetFloatingSize();
      break;
  }
});

// ---------- Estado por aba (sessionStorage): posição ----------
function getFloatingState() {
  try {
    return JSON.parse(sessionStorage.getItem(FLOATING_STATE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function saveFloatingState(host) {
  if (!host || host.dataset.maximized === "true") return;
  try {
    const rect = readFloatingRect(host);
    sessionStorage.setItem(
      FLOATING_STATE_KEY,
      JSON.stringify({ left: rect.left, top: rect.top }),
    );
  } catch (_) {}
}

function setFloatingMinimizedInSession(value) {
  try {
    if (value) sessionStorage.setItem(FLOATING_MIN_KEY, "1");
    else sessionStorage.removeItem(FLOATING_MIN_KEY);
  } catch (_) {}
}

// ---------- Geometria ----------
// Lê/grava a geometria no style (funciona mesmo com o painel oculto)
function readFloatingRect(host) {
  return {
    left: parseFloat(host.style.left) || 0,
    top: parseFloat(host.style.top) || 0,
    width: parseFloat(host.style.width) || FLOATING_DEFAULT_SIZE.width,
    height: parseFloat(host.style.height) || FLOATING_DEFAULT_SIZE.height,
  };
}

function writeFloatingRect(host, rect) {
  const styles = {};
  ["left", "top", "width", "height"].forEach((key) => {
    if (Number.isFinite(rect[key])) styles[key] = Math.round(rect[key]) + "px";
  });
  importantStyle(host, styles);
}

function floatingSizeLimits() {
  const maxW = Math.max(240, window.innerWidth - FLOATING_MARGIN * 2);
  const maxH = Math.max(240, window.innerHeight - FLOATING_MARGIN * 2);
  return {
    maxW,
    maxH,
    minW: Math.min(FLOATING_MIN_SIZE.width, maxW),
    minH: Math.min(FLOATING_MIN_SIZE.height, maxH),
  };
}

function clampFloatingSize(width, height) {
  const l = floatingSizeLimits();
  return {
    width: Math.round(
      clampNumber(Number(width) || FLOATING_DEFAULT_SIZE.width, l.minW, l.maxW),
    ),
    height: Math.round(
      clampNumber(
        Number(height) || FLOATING_DEFAULT_SIZE.height,
        l.minH,
        l.maxH,
      ),
    ),
  };
}

// Mantém tamanho e posição dentro da janela do navegador
function fitFloatingToViewport(host) {
  if (!host) return;
  const rect = readFloatingRect(host);
  const size = clampFloatingSize(rect.width, rect.height);
  const maxLeft = window.innerWidth - size.width - FLOATING_MARGIN;
  const maxTop = window.innerHeight - size.height - FLOATING_MARGIN;
  writeFloatingRect(host, {
    width: size.width,
    height: size.height,
    left: clampNumber(rect.left, FLOATING_MARGIN, maxLeft),
    top: clampNumber(rect.top, FLOATING_MARGIN, maxTop),
  });
}

function maximizedRect() {
  return {
    left: FLOATING_MARGIN,
    top: FLOATING_MARGIN,
    width: window.innerWidth - FLOATING_MARGIN * 2,
    height: window.innerHeight - FLOATING_MARGIN * 2,
  };
}

// Expande o painel para quase toda a janela; novo clique restaura o tamanho anterior
function toggleMaximizeFloatingPanel() {
  const host = document.getElementById(FLOATING_PANEL_ID);
  if (!host || host.dataset.minimized === "true") return;

  if (host.dataset.maximized === "true") {
    let prev = null;
    try {
      prev = JSON.parse(host.dataset.prevRect || "null");
    } catch (_) {}
    host.dataset.maximized = "false";
    writeFloatingRect(
      host,
      prev || {
        ...FLOATING_DEFAULT_SIZE,
        left: FLOATING_MARGIN,
        top: FLOATING_MARGIN,
      },
    );
    fitFloatingToViewport(host);
    saveFloatingState(host);
    return;
  }

  host.dataset.prevRect = JSON.stringify(readFloatingRect(host));
  host.dataset.maximized = "true";
  writeFloatingRect(host, maximizedRect());
}

// Volta ao tamanho padrão 760×760 (duplo clique em qualquer alça)
function resetFloatingSize() {
  const host = document.getElementById(FLOATING_PANEL_ID);
  if (!host || host.dataset.minimized === "true") return;
  host.dataset.maximized = "false";
  writeFloatingRect(host, FLOATING_DEFAULT_SIZE);
  fitFloatingToViewport(host);
  saveFloatingState(host);
  persistFloatingSize(readFloatingRect(host));
}

function moveFloatingPanel(dx, dy) {
  const host = document.getElementById(FLOATING_PANEL_ID);
  if (
    !host ||
    host.dataset.minimized === "true" ||
    host.dataset.maximized === "true"
  )
    return;
  const rect = readFloatingRect(host);
  writeFloatingRect(host, {
    left: rect.left + Number(dx || 0),
    top: rect.top + Number(dy || 0),
  });
  fitFloatingToViewport(host);
  saveFloatingState(host);
}

// ---------- Alças de redimensionamento ----------
function setResizing(host, active, sizeText) {
  const root = host.shadowRoot;
  if (!root) return;
  const box = root.querySelector(".box");
  const badge = root.querySelector(".badge");
  if (box) box.classList.toggle("resizing", !!active);
  if (badge) {
    if (sizeText) badge.textContent = sizeText;
    badge.classList.toggle("show", !!active);
  }
}

function bindResizeHandle(host, handle) {
  const dir = handle.dataset.dir;
  let start = null;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    host.dataset.maximized = "false";
    start = {
      x: event.clientX,
      y: event.clientY,
      rect: readFloatingRect(host),
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch (_) {}
    setResizing(
      host,
      true,
      `${Math.round(start.rect.width)} × ${Math.round(start.rect.height)}`,
    );
  });

  handle.addEventListener("pointermove", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const r = start.rect;
    const l = floatingSizeLimits();
    let { left, top, width, height } = r;

    if (dir.includes("e")) {
      width = clampNumber(
        r.width + dx,
        l.minW,
        window.innerWidth - FLOATING_MARGIN - r.left,
      );
    }
    if (dir.includes("w")) {
      const right = r.left + r.width;
      width = clampNumber(r.width - dx, l.minW, right - FLOATING_MARGIN);
      left = right - width;
    }
    if (dir.includes("s")) {
      height = clampNumber(
        r.height + dy,
        l.minH,
        window.innerHeight - FLOATING_MARGIN - r.top,
      );
    }
    if (dir.includes("n")) {
      const bottom = r.top + r.height;
      height = clampNumber(r.height - dy, l.minH, bottom - FLOATING_MARGIN);
      top = bottom - height;
    }

    writeFloatingRect(host, { left, top, width, height });
    setResizing(host, true, `${Math.round(width)} × ${Math.round(height)}`);
  });

  const finish = (event) => {
    if (!start) return;
    start = null;
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch (_) {}
    setTimeout(() => setResizing(host, false), 600);
    saveFloatingState(host);
    persistFloatingSize(readFloatingRect(host));
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);

  handle.addEventListener("dblclick", (event) => {
    event.preventDefault();
    resetFloatingSize();
  });
}

// ---------- Botão lançador (ícone flutuante) ----------
function createMinimizedButton() {
  let host = document.getElementById(FLOATING_MINIMIZED_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = FLOATING_MINIMIZED_ID;
  importantStyle(host, {
    all: "initial",
    display: "block",
    position: "fixed",
    width: LAUNCHER_SIZE + "px",
    height: LAUNCHER_SIZE + "px",
    margin: "0",
    padding: "0",
    "z-index": FLOATING_Z_INDEX,
  });
  applyLauncherPos(host, floatingLauncherPos);

  const root = host.attachShadow({ mode: "open" });
  const iconUrl = chrome.runtime.getURL("icons/image-extensao.png");
  attachShadowStyles(
    root,
    `
    button {
      all: initial;
      box-sizing: border-box;
      display: block;
      width: 46px;
      height: 46px;
      border: 1px solid rgba(0, 0, 0, .18);
      border-radius: 50%;
      background: #268DFF url("${iconUrl}") center / 76% no-repeat;
      box-shadow: 0 8px 28px rgba(0, 0, 0, .28);
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      transition: transform .2s ease-in-out, box-shadow .2s ease-in-out;
    }
    button:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0, 0, 0, .34); }
    button.dragging { cursor: grabbing; transition: none; transform: scale(1.08); box-shadow: 0 14px 34px rgba(0, 0, 0, .4); }
    button:focus-visible { box-shadow: 0 0 0 3px #fff, 0 0 0 6px #268DFF; }
  `,
  );

  const button = document.createElement("button");
  button.type = "button";
  button.title = "Abrir Validador e Formulário";
  button.setAttribute("aria-label", "Abrir Validador e Formulário");
  bindLauncherDrag(host, button);
  root.appendChild(button);

  appendToPage(host);
  return host;
}

// Arrastar a bolinha para reposicioná-la; um clique simples (sem mover) abre o painel
function bindLauncherDrag(host, button) {
  let drag = null;
  let suppressClick = false;

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const current = clampLauncherPos(floatingLauncherPos);
    drag = {
      x: event.clientX,
      y: event.clientY,
      right: current.right,
      bottom: current.bottom,
      moved: false,
    };
    try {
      button.setPointerCapture(event.pointerId);
    } catch (_) {}
  });

  button.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < LAUNCHER_DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      button.classList.add("dragging");
    }
    event.preventDefault();
    // A bolinha é ancorada por right/bottom: mover para a direita diminui "right"
    const next = applyLauncherPos(host, {
      right: drag.right - dx,
      bottom: drag.bottom - dy,
    });
    drag.last = next;
  });

  const finish = (event) => {
    if (!drag) return;
    const state = drag;
    drag = null;
    try {
      button.releasePointerCapture(event.pointerId);
    } catch (_) {}
    button.classList.remove("dragging");
    if (state.moved && state.last) {
      persistLauncherPos(state.last);
      // O "click" disparado logo após soltar não deve abrir o painel
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 80);
    }
  };
  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", finish);

  // Também cobre ativação por teclado (Enter/Espaço)
  button.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    expandFloatingPanel();
  });

  // Duplo clique volta a bolinha para o canto padrão
  button.addEventListener("dblclick", (event) => {
    event.preventDefault();
    applyLauncherPos(host, LAUNCHER_DEFAULT_POS);
    persistLauncherPos(LAUNCHER_DEFAULT_POS);
  });
}

function minimizeFloatingPanel() {
  const host = document.getElementById(FLOATING_PANEL_ID);
  if (!host) return;
  saveFloatingState(host);
  host.dataset.minimized = "true";
  importantStyle(host, { display: "none" });
  setFloatingMinimizedInSession(true);
  createMinimizedButton();
}

function ensureFloatingFrameLoaded(host) {
  // O popup.html só é carregado na primeira vez que o painel é aberto
  const iframe = getFloatingIframe(host);
  if (!iframe || iframe.getAttribute("src")) return;
  iframe.src = chrome.runtime.getURL(
    "popup.html?floating=1&sourceUrl=" + encodeURIComponent(location.href),
  );
}

function expandFloatingPanel() {
  const button = document.getElementById(FLOATING_MINIMIZED_ID);
  if (button) button.remove();
  setFloatingMinimizedInSession(false);

  const host = document.getElementById(FLOATING_PANEL_ID);
  if (!host) {
    createFloatingPanel({ minimized: false });
    return;
  }

  host.dataset.minimized = "false";
  importantStyle(host, { display: "block" });
  if (host.dataset.maximized === "true")
    writeFloatingRect(host, maximizedRect());
  else fitFloatingToViewport(host);
  ensureFloatingFrameLoaded(host);
  saveFloatingState(host);
}

// ---------- Criar / alternar / remover ----------
const FLOATING_PANEL_CSS = `
  :host { contain: none; }
  .box {
    position: absolute; inset: 0;
    border-radius: 12px; overflow: hidden;
    background: #fff;
    box-shadow: 0 12px 40px rgba(0, 0, 0, .28), 0 0 0 1px rgba(0, 0, 0, .12);
  }
  iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
  .shield { position: absolute; inset: 0; display: none; }
  .box.resizing .shield { display: block; }

  .h { position: absolute; z-index: 2; touch-action: none; }
  .h[data-dir="n"]  { top: -4px;    left: 14px;  right: 14px;  height: 9px; cursor: ns-resize; }
  .h[data-dir="s"]  { bottom: -4px; left: 14px;  right: 14px;  height: 9px; cursor: ns-resize; }
  .h[data-dir="e"]  { right: -4px;  top: 14px;   bottom: 14px; width: 9px;  cursor: ew-resize; }
  .h[data-dir="w"]  { left: -4px;   top: 14px;   bottom: 14px; width: 9px;  cursor: ew-resize; }
  .h[data-dir="ne"] { top: -4px;    right: -4px; width: 18px; height: 18px; cursor: nesw-resize; }
  .h[data-dir="nw"] { top: -4px;    left: -4px;  width: 18px; height: 18px; cursor: nwse-resize; }
  .h[data-dir="sw"] { bottom: -4px; left: -4px;  width: 18px; height: 18px; cursor: nesw-resize; }
  .h[data-dir="se"] { bottom: -4px; right: -4px; width: 18px; height: 18px; cursor: nwse-resize; }

  /* Marca visual do canto de redimensionar */
  .grip {
    position: absolute; right: 3px; bottom: 3px; width: 12px; height: 12px;
    pointer-events: none; z-index: 3; opacity: .55;
    background: linear-gradient(135deg, transparent 0 45%, #7b8794 45% 53%, transparent 53% 66%, #7b8794 66% 74%, transparent 74%);
  }

  .badge {
    position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
    padding: 4px 10px; border-radius: 999px;
    background: rgba(17, 24, 39, .86); color: #fff;
    font: 600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
    pointer-events: none; z-index: 4; opacity: 0; transition: opacity .15s;
  }
  .badge.show { opacity: 1; }
`;

function createFloatingPanel(options) {
  const existing = document.getElementById(FLOATING_PANEL_ID);
  if (existing) return existing;

  const startMinimized = !!(options && options.minimized);
  const state = getFloatingState();
  const size = clampFloatingSize(
    floatingSizePref ? floatingSizePref.width : FLOATING_DEFAULT_SIZE.width,
    floatingSizePref ? floatingSizePref.height : FLOATING_DEFAULT_SIZE.height,
  );
  const left = Number.isFinite(state.left)
    ? state.left
    : Math.max(FLOATING_MARGIN, window.innerWidth - size.width - 20);
  const top = Number.isFinite(state.top) ? state.top : 20;

  const host = document.createElement("div");
  host.id = FLOATING_PANEL_ID;
  host.dataset.minimized = startMinimized ? "true" : "false";
  host.dataset.maximized = "false";
  importantStyle(host, {
    all: "initial",
    display: startMinimized ? "none" : "block",
    position: "fixed",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    "z-index": FLOATING_Z_INDEX,
  });
  writeFloatingRect(host, {
    left,
    top,
    width: size.width,
    height: size.height,
  });

  const root = host.attachShadow({ mode: "open" });
  attachShadowStyles(root, FLOATING_PANEL_CSS);

  const box = document.createElement("div");
  box.className = "box";
  const iframe = document.createElement("iframe");
  iframe.title = "Validador e Formulário";
  iframe.setAttribute("aria-label", "Validador e Formulário");
  const shield = document.createElement("div");
  shield.className = "shield";
  const grip = document.createElement("div");
  grip.className = "grip";
  box.append(iframe, shield, grip);
  root.appendChild(box);

  ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((dir) => {
    const handle = document.createElement("div");
    handle.className = "h";
    handle.dataset.dir = dir;
    handle.title = "Arraste para redimensionar • duplo clique: 760 × 760";
    bindResizeHandle(host, handle);
    root.appendChild(handle);
  });

  const badge = document.createElement("div");
  badge.className = "badge";
  root.appendChild(badge);

  appendToPage(host);
  if (!startMinimized) {
    fitFloatingToViewport(host);
    ensureFloatingFrameLoaded(host);
  }
  return host;
}

function toggleFloatingPanel() {
  // Qualquer ativação pelo usuário liga a preferência
  setFloatingPreference(true);

  const existing = document.getElementById(FLOATING_PANEL_ID);
  if (existing) {
    if (existing.dataset.minimized === "true") expandFloatingPanel();
    else minimizeFloatingPanel();
    return;
  }

  setFloatingMinimizedInSession(false);
  createFloatingPanel({ minimized: false });
}

// Remove apenas do DOM (não altera a preferência)
function destroyFloatingPanel() {
  const host = document.getElementById(FLOATING_PANEL_ID);
  if (host) {
    saveFloatingState(host);
    host.remove();
  }
  const button = document.getElementById(FLOATING_MINIMIZED_ID);
  if (button) button.remove();
  setFloatingMinimizedInSession(false);
}

// Fechar pelo "×": remove e desliga a preferência
function removeFloatingPanel() {
  setFloatingPreference(false);
  destroyFloatingPanel();
}

// ---------- Persistência: restaurar após load / navegação / SPA ----------
function restoreFloatingPanel() {
  if (floatingEnabled !== true) return;

  const host = document.getElementById(FLOATING_PANEL_ID);
  if (host) {
    // Painel já existe: só garante o botão se estiver minimizado
    if (
      host.dataset.minimized === "true" &&
      !document.getElementById(FLOATING_MINIMIZED_ID)
    ) {
      createMinimizedButton();
    }
    return;
  }

  if (!document.body && !document.documentElement) return;
  // Em cada carregamento de página, mantém somente o ícone flutuante visível.
  // O painel completo abre quando o usuário clica no ícone.
  createFloatingPanel({ minimized: true });
  setFloatingMinimizedInSession(true);
  createMinimizedButton();
}

function scheduleFloatingRestore() {
  if (floatingEnabled !== true) return;
  clearTimeout(floatingRestoreTimer);
  floatingRestoreTimer = setTimeout(restoreFloatingPanel, 150);
}

function startFloatingObserver() {
  if (floatingObserver || typeof MutationObserver === "undefined") return;

  floatingObserver = new MutationObserver(() => {
    if (floatingEnabled !== true) return;
    const host = document.getElementById(FLOATING_PANEL_ID);
    const minimizedOk =
      !host ||
      host.dataset.minimized !== "true" ||
      document.getElementById(FLOATING_MINIMIZED_ID);
    if (!host || !minimizedOk) scheduleFloatingRestore();
  });

  // Somente filhos diretos do <html> (leve): detecta remoção do painel/botão
  floatingObserver.observe(document.documentElement, { childList: true });
}

function initFloatingPersistence() {
  loadFloatingSettings((enabled, size, launcherPos) => {
    floatingEnabled = enabled;
    floatingSizePref = size;
    floatingLauncherPos = launcherPos;
    if (enabled) restoreFloatingPanel();
  });

  startFloatingObserver();

  // Ao navegar dentro de uma SPA, volta a mostrar somente o botão.
  const onFloatingNavigation = () => {
    const host = document.getElementById(FLOATING_PANEL_ID);
    if (floatingEnabled === true && host && host.dataset.minimized !== "true") {
      minimizeFloatingPanel();
    }
    scheduleFloatingRestore();
  };
  window.addEventListener("popstate", onFloatingNavigation);
  window.addEventListener("hashchange", onFloatingNavigation);
  window.addEventListener("pageshow", scheduleFloatingRestore);
  try {
    if (
      window.navigation &&
      typeof window.navigation.addEventListener === "function"
    ) {
      window.navigation.addEventListener(
        "navigatesuccess",
        onFloatingNavigation,
      );
    }
  } catch (_) {}

  // Janela do navegador redimensionada: mantém o painel visível e dentro da tela
  window.addEventListener("resize", () => {
    const launcher = document.getElementById(FLOATING_MINIMIZED_ID);
    if (launcher) applyLauncherPos(launcher, floatingLauncherPos);
    const host = document.getElementById(FLOATING_PANEL_ID);
    if (!host || host.dataset.minimized === "true") return;
    if (host.dataset.maximized === "true")
      writeFloatingRect(host, maximizedRect());
    else fitFloatingToViewport(host);
  });

  // Sincroniza com mudanças feitas em outras abas / no popup
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[FLOATING_SIZE_KEY]) {
        floatingSizePref = normalizeStoredSize(
          changes[FLOATING_SIZE_KEY].newValue,
        );
      }
      if (changes[FLOATING_LAUNCHER_POS_KEY]) {
        floatingLauncherPos = normalizeLauncherPos(
          changes[FLOATING_LAUNCHER_POS_KEY].newValue,
        );
        applyLauncherPos(
          document.getElementById(FLOATING_MINIMIZED_ID),
          floatingLauncherPos,
        );
      }
      if (changes[FLOATING_PREF_KEY]) {
        floatingEnabled = changes[FLOATING_PREF_KEY].newValue === true;
        if (floatingEnabled) scheduleFloatingRestore();
        else destroyFloatingPanel();
      }
    });
  } catch (_) {}
}

if (window === window.top) initFloatingPersistence();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "FILL_FORM") {
    try {
      fillForm(request.data)
        .then((result) =>
          sendResponse({ status: result.status, report: result.report }),
        )
        .catch((error) => sendResponse({ status: "Erro: " + error.message }));
    } catch (error) {
      sendResponse({ status: "Erro: " + error.message });
    }
  }

  if (request.action === "EXTRACT_FIELDS") {
    try {
      const fields = extractFields();
      sendResponse({ fields: fields });
    } catch (error) {
      sendResponse({ fields: [], error: error.message });
    }
  }

  if (request.action === "CHECK_SELECTOR") {
    try {
      sendResponse(checkSelector(request.selector, request.mode));
    } catch (error) {
      sendResponse({ ok: false, count: 0, error: error.message });
    }
  }

  if (request.action === "GET_FIELD_OPTIONS") {
    try {
      const options = getFieldOptions(request.fieldId);
      sendResponse({ options: options });
    } catch (error) {
      sendResponse({ options: [], error: error.message });
    }
  }
  return true;
});

let fillInProgress = false;
async function fillForm(data) {
  if (fillInProgress)
    return { status: "Preenchimento já em andamento", report: { busy: true } };
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Dados de preenchimento inválidos");
  fillInProgress = true;
  const report = {
    total: Object.keys(data).length,
    filled: 0,
    notFound: [],
    failed: [],
    skipped: [],
    fields: [],
  };
  const visited = new Set();
  try {
    for (const [key, value] of Object.entries(data)) {
      if (value === "" || value == null) {
        report.skipped.push(key);
        report.fields.push({
          field: key,
          result: "ignorado",
          reason: "valor vazio",
        });
        continue;
      }
      const manual =
        key.startsWith(CSS_KEY_PREFIX) || key.startsWith(JS_KEY_PREFIX);
      const targets = manual
        ? resolveManualTargets(key)
        : findField(key)
          ? [findField(key)]
          : [];
      if (!targets.length) {
        report.notFound.push(key);
        report.fields.push({ field: key, result: "não encontrado" });
        continue;
      }
      for (const [index, field] of targets.entries()) {
        const label =
          targets.length > 1 ? `${key} (${index + 1}/${targets.length})` : key;
        if (visited.has(field)) {
          report.skipped.push(label);
          report.fields.push({
            field: label,
            result: "ignorado",
            reason: "elemento já processado",
          });
          continue;
        }
        visited.add(field);
        if (
          !field.isConnected ||
          field.disabled ||
          field.closest("[inert]") ||
          field.getAttribute("aria-disabled") === "true"
        ) {
          report.skipped.push(label);
          report.fields.push({
            field: label,
            result: "ignorado",
            reason: "indisponível ou desabilitado",
          });
          continue;
        }
        try {
          const result = await fillField(field, value);
          if (result === false) throw new Error("O campo recusou o valor");
          report.filled++;
          report.fields.push({
            field: label,
            result: "preenchido",
            ...(result && result.note ? { reason: result.note } : {}),
          });
        } catch (error) {
          report.failed.push(label);
          report.fields.push({
            field: label,
            result: "recusado",
            reason: error.message,
          });
        }
      }
    }
    return {
      status: `${report.filled} preenchido(s), ${report.notFound.length} não encontrado(s), ${report.skipped.length} ignorado(s), ${report.failed.length} falha(s)`,
      report,
    };
  } finally {
    fillInProgress = false;
  }
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// Campos adicionados manualmente usam a chave "css:<seletor>"
const CSS_KEY_PREFIX = "css:";

// Expressões JS suportadas sem eval: document.querySelector(...),
// document.querySelectorAll(...) e acesso por índice [n] / .item(n).
const JS_KEY_PREFIX = "js:";
function parseJsSelector(expression) {
  const expr = String(expression || "").trim();
  const match = expr.match(
    /^document\.(querySelector|querySelectorAll)\(\s*(['"`])([\s\S]*?)\2\s*\)(?:\s*(?:\[\s*(\d+)\s*\]|\.item\(\s*(\d+)\s*\)))?\s*;?$/,
  );
  if (!match)
    throw new Error(
      'Use document.querySelector("CSS") ou document.querySelectorAll("CSS")[0].',
    );
  const css = match[3];
  document.createDocumentFragment().querySelector(css); // valida CSS
  return {
    css,
    first: match[1] === "querySelector",
    index:
      match[4] !== undefined || match[5] !== undefined
        ? Number(match[4] ?? match[5])
        : null,
  };
}
function resolveManualTargets(key) {
  try {
    let nodes;
    if (key.startsWith(JS_KEY_PREFIX)) {
      const parsed = parseJsSelector(key.slice(JS_KEY_PREFIX.length));
      const all = [...document.querySelectorAll(parsed.css)];
      nodes = parsed.first
        ? all.slice(0, 1)
        : parsed.index === null
          ? all
          : all.slice(parsed.index, parsed.index + 1);
    } else {
      nodes = [
        ...document.querySelectorAll(key.slice(CSS_KEY_PREFIX.length).trim()),
      ];
    }
    // Divs contêineres não devem ser descartadas: procurar editor interno.
    return [
      ...new Set(
        nodes
          .flatMap((el) => {
            // Permite selecionar o próprio input, seu label associado ou um contêiner.
            if (
              el.matches("input, textarea, select") ||
              el.isContentEditable ||
              el.getAttribute("role") === "textbox"
            ) return el;
            if (el.tagName === "LABEL") {
              if (el.control) return el.control;
              const forId = el.htmlFor;
              if (forId) {
                const associated = document.getElementById(forId);
                if (associated && associated.matches("input, textarea, select")) return associated;
              }
            }
            // Se o seletor apontar para um grupo de checkboxes, devolve todos
            // os checkboxes do grupo (em vez de somente o primeiro descendente).
            const groupedCheckboxes = el.querySelectorAll('input[type="checkbox"]');
            if (groupedCheckboxes.length) return [...groupedCheckboxes];
            return el.querySelector(
              'input, textarea, select, [contenteditable="true"], [role="textbox"]',
            );
          })
          .filter(Boolean),
      ),
    ];
  } catch (_) {
    return [];
  }
}
function findAllBySelector(selector) {
  return resolveManualTargets(CSS_KEY_PREFIX + selector);
}

function findBySelector(selector) {
  try {
    return document.querySelector(selector);
  } catch (_) {
    return null; // seletor inválido
  }
}

function findField(key) {
  const rawKey = String(key ?? "");
  if (rawKey.startsWith(CSS_KEY_PREFIX)) {
    const selector = rawKey.slice(CSS_KEY_PREFIX.length).trim();
    return selector ? findBySelector(selector) : null;
  }
  const keyLower = rawKey.toLowerCase();
  const safeKey = cssEscape(rawKey);
  const selectors = [
    `[name="${safeKey}"]`,
    `[id="${safeKey}"]`,
    `[placeholder="${safeKey}"]`,
    `[aria-label="${safeKey}"]`,
    `[name*="${cssEscape(keyLower)}" i]`,
    `[id*="${cssEscape(keyLower)}" i]`,
    `[placeholder*="${cssEscape(keyLower)}" i]`,
    `[aria-label*="${cssEscape(keyLower)}" i]`,
  ];

  for (let sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  const labels = document.querySelectorAll(
    "label, .freebirdFormviewerComponentsQuestionBaseTitle, .question-title, .form-label",
  );
  for (let label of labels) {
    if (label.textContent.toLowerCase().includes(keyLower)) {
      const container =
        label.closest(".freebirdFormviewerComponentsQuestionBaseRoot") ||
        label.closest(".form-group") ||
        label.closest(".question") ||
        label.closest(".field");
      if (container) {
        const input = container.querySelector("input, textarea, select");
        if (input) return input;
      }
    }
  }

  return null;
}

// Preenche editores ricos (WhatsApp Web = Lexical, Slack, Notion, Draft.js...).
// Esses editores guardam estado interno (incluindo a posição do cursor) e só o
// atualizam quando recebem eventos reais de foco/seleção. Por isso o texto é
// inserido como digitação (beforeinput/input reais) e, antes disso, damos tempo
// para o editor "perceber" o foco e o cursor. Sem essa espera o campo vazio
// ignora a inserção até o usuário digitar a primeira tecla.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanText = (el) =>
  (el.innerText || el.textContent || "").replace(/[\u200b\ufeff]/g, "").trim();

// Editores de e-mail (Outlook etc.) guardam a assinatura dentro do mesmo campo editável.
// Devolve o filho direto de `el` que contém a assinatura (id="Signature"), se existir.
function findSignatureBlock(el) {
  let node = el.querySelector('[id="Signature"], #Signature, [id="signature"]');
  if (!node) return null;
  while (node && node.parentNode !== el) node = node.parentNode;
  return node || null;
}

// Texto do corpo SEM a assinatura (para conferir se o preenchimento funcionou)
function bodyOnlyText(el) {
  const sig = findSignatureBlock(el);
  if (!sig) return cleanText(el);
  const clone = el.cloneNode(true);
  const sigClone = findSignatureBlock(clone);
  if (sigClone) sigClone.remove();
  return (clone.textContent || "").replace(/[\u200b\ufeff]/g, "").trim();
}

function selectEditorContents(el, collapse) {
  const sel = window.getSelection();
  const range = document.createRange();
  const sigBlock = findSignatureBlock(el);
  if (sigBlock && !collapse) {
    // seleciona só do início do campo até antes da assinatura: ela é mantida
    range.setStart(el, 0);
    range.setEndBefore(sigBlock);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  // entra no 1º parágrafo/nó de texto: o Lexical mapeia melhor o cursor ali dentro
  const target = el.querySelector("p, [data-lexical-text]") || el;
  if (collapse) {
    range.selectNodeContents(target);
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

async function activateEditor(el) {
  el.scrollIntoView({ block: "nearest" });
  el.focus();
  // simula o clique do usuário (alguns editores só inicializam o cursor assim)
  ["mousedown", "mouseup", "click"].forEach((type) => {
    el.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: window }),
    );
  });
  el.focus();
  selectEditorContents(el, !cleanText(el));
  document.dispatchEvent(new Event("selectionchange"));
  await sleep(80); // deixa o editor processar foco + selectionchange
}

function typeIntoEditor(el, text) {
  // seleciona tudo para substituir o conteúdo atual
  selectEditorContents(el, false);
  let ok = true;
  if (text === "") return document.execCommand("delete");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, i) => {
    // quebra de linha = Shift+Enter no WhatsApp (não envia a mensagem)
    if (i > 0) ok = document.execCommand("insertLineBreak") && ok;
    if (line) ok = document.execCommand("insertText", false, line) && ok;
  });
  return ok;
}

// Edição direta preservando as quebras (<br>) — último recurso para editores sem framework
function setEditorTextWithBreaks(el, text) {
  const sig = findSignatureBlock(el);
  if (sig) {
    // remove só o que vem antes da assinatura e recria o corpo como um bloco
    while (el.firstChild && el.firstChild !== sig)
      el.removeChild(el.firstChild);
    const block = document.createElement("div");
    text.split("\n").forEach((line, i) => {
      if (i > 0) block.appendChild(document.createElement("br"));
      if (line) block.appendChild(document.createTextNode(line));
    });
    el.insertBefore(block, sig);
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
    return;
  }
  el.textContent = "";
  text.split("\n").forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement("br"));
    if (line) el.appendChild(document.createTextNode(line));
  });
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }),
  );
}

async function fillContentEditable(el, rawText) {
  const text = String(rawText).replace(/\r\n?/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLine = lines[0] || "";
  const lastLine = lines[lines.length - 1] || "";
  const wantsBreaks = text.trim().includes("\n");

  // o texto chegou? (1ª e última linhas presentes) e, se havia quebras, elas foram criadas?
  const hasSignature = !!findSignatureBlock(el);
  const landed = () => {
    const current = bodyOnlyText(el);
    if (text === "") return current === "";
    if (!current.includes(firstLine) || !current.includes(lastLine))
      return false;
    if (wantsBreaks) {
      const sig = findSignatureBlock(el);
      const hasBreak = hasSignature
        ? !!Array.from(el.children).some(
            (ch) => ch !== sig && ch.querySelector && ch.querySelector("br"),
          ) || Array.from(el.children).filter((ch) => ch !== sig).length > 1
        : /\n/.test(el.innerText || "");
      if (!hasBreak) return false;
    }
    return true;
  };

  // 1ª e 2ª tentativas: digitação simulada (a 2ª ativa o editor de novo, mais devagar)
  for (let attempt = 0; attempt < 2 && !landed(); attempt++) {
    try {
      await activateEditor(el);
      if (attempt > 0) await sleep(150);
      typeIntoEditor(el, text);
    } catch (_) {
      /* tenta o próximo recurso */
    }
    await sleep(80);
  }
  if (landed()) return true;

  // 3º recurso: simula colagem
  try {
    await activateEditor(el);
    selectEditorContents(el, false);
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  } catch (_) {
    /* segue */
  }
  await sleep(100);
  if (landed()) return true;

  // último recurso: edição direta (só funciona em editores sem framework)
  // Não alterar diretamente o DOM de editores ricos: preserva assinaturas e formatação.
  return false;
}

// Atribui o valor pelo setter nativo (necessário para React/Vue/Angular perceberem a mudança)
function setNativeValue(el, value) {
  try {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
      return;
    }
  } catch (_) {
    /* cai no padrão */
  }
  el.value = value;
}

// Códigos digitáveis que viram quebra de linha em qualquer campo:
//   \n   (barra invertida + n)   |   <br>   <br/>   <br />
function expandLineBreakTokens(text) {
  return String(text)
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
}


// ============================================================================
// v19 — CAMPOS COM MÁSCARA (Inputmask, jQuery Mask, IMask, Cleave, Maska...)
// ============================================================================
const MASK_REQ_ATTR = "data-mapeador-req";
const MASK_RES_ATTR = "data-mapeador-res";
const MASKABLE_TYPES = new Set(["text", "tel", "search", "email", "url"]);
const MASK_CLASS_RE =
  /(^|[\s_-])(mask|masked|input-?mask|js-?mask|mask-\w+|cpf|cnpj|cep|telefone|celular|moeda|money|currency|rg)($|[\s_-])/i;
const MASK_PLACEHOLDER_RE =
  /_{2,}|\(\s*[_9#X]{2}\s*\)|[9#]{2,}\s*[-./:]|^\s*[0-9]{2}\/[0-9]{2}\/[0-9]{4}\s*$|\b(dd|mm)\s*\/\s*(mm|aa)/i;

const normMask = (s) => String(s ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();

// Conversa com mask-bridge.js (mundo MAIN) por atributos + CustomEvent.
function callMaskBridge(el, op, payload) {
  try {
    el.removeAttribute(MASK_RES_ATTR);
    el.setAttribute(MASK_REQ_ATTR, JSON.stringify({ op, ...payload }));
    el.dispatchEvent(
      new CustomEvent("mapeador:mask", { bubbles: true, composed: true }),
    );
    const raw = el.getAttribute(MASK_RES_ATTR);
    return raw ? JSON.parse(raw) : null; // null = ponte ausente
  } catch (_) {
    return null;
  } finally {
    try {
      el.removeAttribute(MASK_REQ_ATTR);
      el.removeAttribute(MASK_RES_ATTR);
    } catch (_) {}
  }
}

// Identifica se o campo tem máscara e qual (sem ler valores digitados).
function detectMask(el) {
  const info = { masked: false, engine: "", pattern: "", hints: [], label: "" };
  if (!(el instanceof HTMLInputElement)) return info;

  // 1) Mundo MAIN: instância real da biblioteca de máscara
  const main = callMaskBridge(el, "probe", {});
  if (main && main.masked) {
    info.masked = true;
    info.engine = main.engine;
    info.pattern = main.mask || main.alias || main.regex || "";
    info.hints.push("biblioteca:" + main.engine);
  }

  // 2) Atributos (qualquer data-*/atributo com "mask" no nome)
  for (const attr of el.attributes) {
    const n = attr.name.toLowerCase();
    if (/mask|cleave|maska/.test(n) && !n.startsWith("data-mapeador")) {
      info.masked = true;
      info.hints.push("atributo:" + n);
      if (!info.pattern) {
        const v = attr.value || "";
        const m = v.match(/mask['"]?\s*:\s*['"]([^'"]+)['"]/i);
        const a = v.match(/alias['"]?\s*:\s*['"]([^'"]+)['"]/i);
        info.pattern = m ? m[1] : a ? a[1] : v.length && v.length < 40 && !/[{}]/.test(v) ? v : "";
      }
    }
  }

  // 3) Classe e placeholder típicos de máscara
  if (MASK_CLASS_RE.test(el.className || "")) {
    info.masked = true;
    info.hints.push("classe");
  }
  const ph = el.getAttribute("placeholder") || "";
  if (ph && MASK_PLACEHOLDER_RE.test(ph)) {
    info.masked = true;
    info.hints.push("placeholder");
    if (!info.pattern) info.pattern = ph;
  }

  if (info.masked) {
    info.label = [info.engine || "máscara", info.pattern].filter(Boolean).join(": ");
  }
  return info;
}

function literalFreeCandidates(value) {
  const v = String(value);
  const out = [];
  if (/^[\d.,\s\-+()/R$]+$/.test(v)) {
    const digits = v.replace(/\D/g, "");
    if (digits) out.push(digits);
    // formato numérico/monetário pt-BR → ponto decimal
    if (/,/.test(v)) out.push(v.replace(/[^\d,]/g, "").replace(",", "."));
  }
  return out;
}

function clearMasked(el) {
  try {
    el.focus({ preventScroll: true });
    el.select?.();
    if (el.value && !document.execCommand("delete")) throw new Error("x");
  } catch (_) {}
  if (el.value) {
    setNativeValue(el, "");
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  }
}

function insertNative(el, text) {
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  setNativeValue(el, el.value.slice(0, s) + text + el.value.slice(e));
  try { el.setSelectionRange(s + text.length, s + text.length); } catch (_) {}
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

// Digitação tecla a tecla (keydown → keypress → inserção → keyup), como um usuário.
function typeChars(el, text) {
  el.focus({ preventScroll: true });
  for (const ch of String(text)) {
    const up = ch.toUpperCase();
    const keyCode = /\d/.test(ch) ? 48 + Number(ch) : /[a-z]/i.test(ch) ? up.charCodeAt(0) : ch.charCodeAt(0);
    const code = /\d/.test(ch) ? "Digit" + ch : /[a-z]/i.test(ch) ? "Key" + up : "";
    const init = { key: ch, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
    if (!el.dispatchEvent(new KeyboardEvent("keydown", init))) {
      el.dispatchEvent(new KeyboardEvent("keyup", init));
      continue;
    }
    const pressOk = el.dispatchEvent(
      new KeyboardEvent("keypress", { ...init, charCode: ch.charCodeAt(0), keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0) }),
    );
    if (pressOk) {
      const before = el.value;
      let done = false;
      try { done = document.execCommand("insertText", false, ch) && el.value !== before; } catch (_) {}
      if (!done) insertNative(el, ch);
    }
    el.dispatchEvent(new KeyboardEvent("keyup", init));
  }
}

function fireFieldEvents(el, withBlur = true) {
  ["input", "change"].forEach((n) => el.dispatchEvent(new Event(n, { bubbles: true })));
  if (withBlur) el.dispatchEvent(new Event("blur", { bubbles: true }));
}

async function fillMaskedField(el, rawValue, info) {
  const value = String(rawValue).replace(/\s*\n\s*/g, " ");
  const want = normMask(value);
  const landed = () => {
    const got = normMask(el.value);
    return !!got && (got === want || got.startsWith(want)); // máscara só acrescentou preenchimento
  };
  const done = (how) => {
    try { el.blur(); } catch (_) {}
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const eng = info.label ? ` (${info.label})` : "";
    return { note: `máscara${eng}: ${how}` };
  };

  el.focus({ preventScroll: true });
  el.dispatchEvent(new Event("focus", { bubbles: true }));

  // 1) API da própria biblioteca (Inputmask.setValue, jQuery Mask...)
  const cands = literalFreeCandidates(value);
  const api = callMaskBridge(el, "fill", { value, candidates: cands });
  if (api && api.via) {
    fireFieldEvents(el, false);
    await sleep(30);
    if (landed()) return done("via " + api.via);
  }

  // 2) Valor + eventos
  setNativeValue(el, value);
  fireFieldEvents(el, false);
  await sleep(30);
  if (landed()) return done("valor + eventos");

  // 3) Inserção de texto como se fosse colada/digitada em bloco
  clearMasked(el);
  try { document.execCommand("insertText", false, value); } catch (_) {}
  await sleep(30);
  if (landed()) return done("inserção de texto");

  // 4) Digitação tecla a tecla (valor completo, depois só alfanuméricos)
  const attempts = [value];
  const bare = value.replace(/[^0-9a-z]/gi, "");
  if (bare && bare !== value) attempts.push(bare);
  for (const text of attempts) {
    clearMasked(el);
    typeChars(el, text);
    await sleep(30);
    if (landed()) return done("digitação simulada");
  }

  // 5) Aceita se a máscara deixou algo (ajuste/truncamento); falha se vazio
  if (el.value) return done("a máscara ajustou o valor informado");
  try { el.blur(); } catch (_) {}
  throw new Error("A máscara do campo não aceitou o valor");
}

// Campos sem máscara declarada que "devolvem" outro valor (máscara oculta)
async function verifyPlainFill(el, value, textValue) {
  if (!(el instanceof HTMLInputElement) || !MASKABLE_TYPES.has(el.type || "text")) return;
  await sleep(40);
  const want = normMask(textValue);
  const got = normMask(el.value);
  if (!want || (got && (got === want || got.startsWith(want)))) return;
  // valor sumiu ou foi reescrito: provável máscara não declarada → tenta o fluxo completo
  return fillMaskedField(el, value, { masked: true, label: "detectada pelo comportamento" });
}

globalThis.__mapeadorMaskV19 = { detect: detectMask };


// ============================================================================
// v33 — {{ lista() }}: cola como LISTA DE EDITOR
// O popup envia cada lista entre marcas privadas (ver js/variaveis.js):
//   ABRE + (u|o) + marcador + SEP + item1 + SEP + item2 ... + FECHA
// Editor rico (contenteditable) -> lista de verdade <ul>/<ol>; campo de texto -> linhas "- item" / "1. item".
// ============================================================================
const LIST_OPEN = "\uE000", LIST_SEP = "\uE001", LIST_CLOSE = "\uE002";
const hasListMarks = (v) => typeof v === "string" && v.indexOf(LIST_OPEN) !== -1;

// -> [{ list: false, text } | { list: true, ordered, marker, items }]
function parseListSegments(text) {
  const re = /\uE000([uo])([^\uE001\uE002]*)\uE001([^\uE002]*)\uE002/g;
  const segs = [];
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) segs.push({ list: false, text: text.slice(last, m.index) });
    segs.push({
      list: true,
      ordered: m[1] === "o",
      marker: m[2],
      items: m[3].split(LIST_SEP).map((x) => x.trim()).filter(Boolean),
    });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ list: false, text: text.slice(last) });
  return segs;
}

// Texto simples (campos que não são editores): "- item" ou "1. item"; remove qualquer marca solta
function listsToPlainText(text) {
  return parseListSegments(text)
    .map((seg) => {
      if (!seg.list) return seg.text;
      const marker = seg.marker.trim() ? seg.marker : "-";
      const lead = /\s$/.test(marker) ? marker : marker + " ";
      return seg.items.map((it, i) => (seg.ordered ? `${i + 1}. ` : lead) + it).join("\n");
    })
    .join("")
    .replace(/[\uE000-\uE002]/g, "");
}

const escapeHtmlText = (t) =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// HTML do conteúdo: linhas de texto viram <p>, listas viram <ul>/<ol>
function listSegmentsToHtml(segs) {
  const out = [];
  segs.forEach((seg, i) => {
    if (seg.list) {
      const tag = seg.ordered ? "ol" : "ul";
      out.push(`<${tag}>${seg.items.map((it) => `<li>${escapeHtmlText(it)}</li>`).join("")}</${tag}>`);
      return;
    }
    let t = seg.text.replace(/\r\n?/g, "\n");
    if (i > 0 && segs[i - 1].list) t = t.replace(/^\n/, ""); // a quebra que separava o texto da lista já é o próprio bloco
    if (i < segs.length - 1 && segs[i + 1].list) t = t.replace(/\n$/, "");
    if (!t) return;
    t.split("\n").forEach((line) => out.push(line ? `<p>${escapeHtmlText(line)}</p>` : "<p><br></p>"));
  });
  return out.join("");
}

async function fillContentEditableRich(el, text) {
  const segs = parseListSegments(text);
  const items = segs.filter((s) => s.list).flatMap((s) => s.items);
  if (!items.length) return fillContentEditable(el, listsToPlainText(text)); // listas vazias: só o texto em volta
  const html = listSegmentsToHtml(segs);
  const plain = listsToPlainText(text);

  // pedaços visíveis, em ordem: linhas de texto e itens
  const pieces = segs.flatMap((s) => (s.list ? s.items : s.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)));
  const landed = () => {
    const sig = findSignatureBlock(el);
    const lis = [...el.querySelectorAll("li")].filter((li) => !sig || !sig.contains(li));
    if (lis.length < items.length) return false; // virou lista de verdade?
    const body = bodyOnlyText(el);
    return body.includes(pieces[0]) && body.includes(pieces[pieces.length - 1]);
  };

  // 1) insertHTML: o jeito nativo de colar HTML em editores (TinyMCE, CKEditor 4, Outlook/Gmail web...)
  // O insertHTML funde o último parágrafo com o bloco seguinte e desfaz o <div id="Signature">;
  // por isso a assinatura (e o que vem depois) sai só durante a inserção e volta intacta em seguida.
  let tail = [];
  try {
    await activateEditor(el);
    const sig = findSignatureBlock(el);
    for (let n = sig; n; n = n.nextSibling) tail.push(n);
    tail.forEach((n) => n.remove());
    selectEditorContents(el, false);
    document.execCommand("insertHTML", false, html);
  } catch (_) {
    /* próximo recurso */
  } finally {
    tail.forEach((n) => el.appendChild(n));
  }
  await sleep(100);
  if (landed()) return { note: "lista de editor" };

  // 2) colagem simulada com text/html (editores com framework: CKEditor 5, Quill, Draft, Lexical...)
  try {
    await activateEditor(el);
    selectEditorContents(el, false);
    const dt = new DataTransfer();
    dt.setData("text/html", html);
    dt.setData("text/plain", plain);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  } catch (_) {
    /* próximo recurso */
  }
  await sleep(120);
  if (landed()) return { note: "lista de editor (colagem)" };

  // 3) o editor não aceita lista: preenche com texto simples, um item por linha
  const ok = await fillContentEditable(el, plain);
  return ok ? { note: "lista como texto — o editor não aceitou lista" } : false;
}

function fillField(input, value) {
  if (typeof value === "string") value = expandLineBreakTokens(value);
  // v33: {{ lista() }} — editor rico recebe lista de verdade; qualquer outro campo recebe texto simples
  if (hasListMarks(value)) {
    if (input.isContentEditable && !("value" in input)) return fillContentEditableRich(input, value);
    value = listsToPlainText(value);
  }
  // Campo manual apontando para um elemento editável (div contenteditable etc.)
  if (input.isContentEditable && !("value" in input)) {
    return fillContentEditable(input, String(value));
  }

  const type = input.type || input.tagName.toLowerCase();

  // v19: campos de texto com máscara têm fluxo próprio (assíncrono)
  if (input instanceof HTMLInputElement && MASKABLE_TYPES.has(type)) {
    const maskInfo = detectMask(input);
    if (maskInfo.masked) return fillMaskedField(input, value, maskInfo);
  }

  // ============================================
  // CORREÇÃO: DATA (formato DD/MM/YYYY → YYYY-MM-DD)
  // ============================================
  if (type === "date" && typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const parts = value.split("/");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      if (
        day.length === 2 &&
        month.length === 2 &&
        year.length === 4 &&
        !isNaN(day) &&
        !isNaN(month) &&
        !isNaN(year)
      ) {
        const formatted = `${year}-${month}-${day}`;
        input.value = formatted;
        input.dispatchEvent(new Event("focus", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        return;
      }
    }
    input.value = value;
    input.dispatchEvent(new Event("focus", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    return;
  }

  if (type === "radio") {
    const radios = document.querySelectorAll(
      `input[name="${cssEscape(input.name)}"]`,
    );
    for (let radio of radios) {
      if (radio.value === value.toString()) {
        radio.checked = true;
        radio.dispatchEvent(new Event("input", { bubbles: true }));
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
    return;
  }

  if (type === "checkbox") {
    // Arrays permitem mapear um grupo inteiro usando os valores nativos dos
    // inputs. Ex.: ["1", "3"] marca E-mail e Ligação e desmarca WhatsApp.
    let shouldCheck;
    if (Array.isArray(value)) {
      const candidates = value.map((item) => String(item).trim().toLocaleLowerCase());
      const id = String(input.id || "").trim().toLocaleLowerCase();
      const inputValue = String(input.value || "").trim().toLocaleLowerCase();
      const label = input.id
        ? document.querySelector(`label[for="${cssEscape(input.id)}"]`)
        : null;
      const labelText = String(label?.textContent || "").trim().toLocaleLowerCase();
      shouldCheck = candidates.some((candidate) =>
        candidate === inputValue || candidate === id || candidate === labelText
      );
    } else {
      const normalized = String(value ?? "").trim().toLocaleLowerCase();
      shouldCheck = value === true || value === 1 || [
        "true", "1", "sim", "yes", "checked", "marcado", "selecionado", "on"
      ].includes(normalized);
    }

    if (input.checked !== shouldCheck) {
      // Primeiro tenta a interação nativa para manter o estado de frameworks.
      try { input.click(); } catch (_) {}

      // Se o clique foi cancelado/ignorado, usa o setter nativo e emite os eventos.
      if (input.checked !== shouldCheck) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
        if (descriptor?.set) descriptor.set.call(input, shouldCheck);
        else input.checked = shouldCheck;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    if (input.checked !== shouldCheck) {
      throw new Error(`Não foi possível ${shouldCheck ? "marcar" : "desmarcar"} o checkbox ${input.id || input.name || "selecionado"}`);
    }
    return;
  }

  if (type === "select-one" || type === "select-multiple") {
    const rawValues = Array.isArray(value)
      ? value.map((v) => String(v).trim()).filter(Boolean)
      : String(value)
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);

    if (type === "select-multiple") {
      for (const option of input.options) {
        const normalizedText = option.text.trim().toLowerCase();
        const normalizedValue = String(option.value).toLowerCase();
        option.selected = rawValues.some((v) => {
          const normalized = v.toLowerCase();
          return (
            normalizedValue === normalized ||
            normalizedText.includes(normalized)
          );
        });
      }
    } else {
      const target = rawValues[0] ?? "";
      for (const option of input.options) {
        if (
          option.value === target ||
          option.text.trim().toLowerCase().includes(target.toLowerCase())
        ) {
          option.selected = true;
          break;
        }
      }
    }

    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  // Texto: normaliza quebras de linha (CRLF/CR -> LF). <textarea> mantém as quebras;
  // <input> de uma linha não aceita quebra (o navegador as removeria juntando as palavras),
  // então elas viram espaço.
  let textValue =
    typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value;
  if (
    typeof textValue === "string" &&
    input.tagName &&
    input.tagName.toLowerCase() !== "textarea"
  ) {
    textValue = textValue.replace(/\s*\n\s*/g, " ");
  }
  setNativeValue(input, textValue);
  input.dispatchEvent(new Event("focus", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
  // v19: confere se o valor "ficou" (detecta máscara não declarada)
  return verifyPlainFill(input, value, textValue);
}

function extractFields() {
  const fields = [];
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
  );

  inputs.forEach((input) => {
    const field = {
      name: input.getAttribute("name") || "",
      id: input.getAttribute("id") || "",
      placeholder: input.getAttribute("placeholder") || "",
      "aria-label": input.getAttribute("aria-label") || "",
      type: input.type || input.tagName.toLowerCase(),
    };

    let label = "";
    if (input.id) {
      const labelEl = document.querySelector(`label[for="${input.id}"]`);
      if (labelEl) label = labelEl.textContent.trim();
    }
    if (!label) {
      const container =
        input.closest(".freebirdFormviewerComponentsQuestionBaseRoot") ||
        input.closest(".form-group") ||
        input.closest(".question") ||
        input.closest(".field");
      if (container) {
        const labelEl = container.querySelector(
          "label, .freebirdFormviewerComponentsQuestionBaseTitle, .question-title, .form-label",
        );
        if (labelEl) label = labelEl.textContent.trim();
      }
    }
    if (label) field.label = label;

    if (input.tagName.toLowerCase() === "select") {
      field.options = [];
      for (let opt of input.options) {
        if (opt.value) {
          field.options.push({ value: opt.value, text: opt.text.trim() });
        }
      }
    } else if (input.type === "radio") {
      const radios = document.querySelectorAll(
        `input[name="${cssEscape(input.name)}"]`,
      );
      field.options = [];
      radios.forEach((r) => {
        if (r.value) {
          let radioLabel = r.value;
          const labelEl = document.querySelector(`label[for="${r.id}"]`);
          if (labelEl) radioLabel = labelEl.textContent.trim();
          field.options.push({ value: r.value, text: radioLabel });
        }
      });
      const seen = new Set();
      field.options = field.options.filter((opt) => {
        const key = opt.value + "|" + opt.text;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else if (input.type === "checkbox") {
      field.options = [
        { value: "checked", text: "Marcado (true)" },
        { value: "unchecked", text: "Desmarcado (false)" },
      ];
    }

    const id =
      field.name || field.id || field.placeholder || field["aria-label"] || "";
    if (id && !fields.some((f) => (f.name || f.id) === id)) {
      fields.push(field);
    }
  });

  return fields;
}

function checkSelector(selector, mode = "css") {
  const sel = String(selector || "").trim();
  if (!sel) return { ok: false, count: 0, error: "Seletor vazio" };

  let nodes;
  try {
    if (mode === "js") {
      const parsed = parseJsSelector(sel);
      const all = [...document.querySelectorAll(parsed.css)];
      nodes = parsed.first
        ? all.slice(0, 1)
        : parsed.index === null
          ? all
          : all.slice(parsed.index, parsed.index + 1);
    } else nodes = document.querySelectorAll(sel);
  } catch (_) {
    return {
      ok: false,
      count: 0,
      invalid: true,
      error: "Seletor inválido ou expressão JS não suportada",
    };
  }
  if (!nodes.length) return { ok: true, count: 0 };

  const el = nodes[0];
  const info = {
    ok: true,
    count: nodes.length,
    tag: el.tagName.toLowerCase(),
    type: el.type || "",
    editable: !!(
      el.matches("input, textarea, select") ||
      el.isContentEditable ||
      el.querySelector(
        'input, textarea, select, [contenteditable=\"true\"], [role=\"textbox\"]',
      )
    ),
  };

  // Destaque temporário (sem alterar o estilo permanente da página)
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const prevOutline = el.style.outline;
    const prevOffset = el.style.outlineOffset;
    el.style.outline = "3px solid #f59e0b";
    el.style.outlineOffset = "2px";
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOffset;
    }, 1800);
  } catch (_) {}

  return info;
}

function getFieldOptions(fieldId) {
  const fields = extractFields();
  const field = fields.find(
    (f) => (f.name || f.id || f.placeholder || f["aria-label"]) === fieldId,
  );
  return field ? field.options || [] : [];
}

