// ============================================
// Mapeador de Formulários v12 — modo "janela destacada"
// Quando o popup é aberto em uma janela própria (popup.html?window=1&sourceTabId=N),
// a aba ativa seria a própria janela da extensão. Este arquivo faz as chamadas
// chrome.tabs.query({ active: true, currentWindow: true }) já existentes apontarem
// para a aba de origem, sem alterar nenhuma outra lógica.
// ============================================
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  if (params.get("window") !== "1") return;

  const sourceTabId = Number(params.get("sourceTabId"));
  if (!Number.isFinite(sourceTabId) || !window.chrome || !chrome.tabs || !chrome.tabs.query) return;

  const originalQuery = chrome.tabs.query.bind(chrome.tabs);
  chrome.tabs.query = function (queryInfo, callback) {
    const wantsActiveTab =
      queryInfo && queryInfo.active === true && queryInfo.currentWindow === true;
    if (!wantsActiveTab || typeof callback !== "function") {
      return originalQuery(queryInfo, callback);
    }
    chrome.tabs.get(sourceTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        // aba de origem foi fechada: cai no comportamento normal
        void chrome.runtime.lastError;
        return originalQuery(queryInfo, callback);
      }
      callback([tab]);
    });
  };
})();

// ============================================
// v17.1 — Janela destacada: tamanho interno exato (760×760 por padrão)
// e memória do último tamanho escolhido pelo usuário.
//   popup.html?window=1&iw=760&ih=760
// chrome.windows.create recebe o tamanho EXTERNO (com moldura e barra de título),
// então, depois de aberta, a própria janela mede a moldura e se ajusta.
// ============================================
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  if (params.get("window") !== "1" || !window.chrome || !chrome.windows || !chrome.windows.getCurrent) return;

  const SIZE_KEY = "floatingWindowSize";
  const wantW = Number(params.get("iw"));
  const wantH = Number(params.get("ih"));
  let saveTimer = null;

  function saveSize() {
    chrome.windows.getCurrent((win) => {
      if (chrome.runtime.lastError || !win || win.state !== "normal") return; // ignora maximizada/minimizada
      try {
        chrome.storage.local.set({ [SIZE_KEY]: { w: window.innerWidth, h: window.innerHeight } }, () => {
          void chrome.runtime.lastError;
        });
      } catch (_) {}
    });
  }

  function watchResize() {
    window.addEventListener("resize", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveSize, 500);
    });
  }

  function fitToInnerSize() {
    chrome.windows.getCurrent((win) => {
      if (chrome.runtime.lastError || !win) return watchResize();
      const availW = screen.availWidth || 1280;
      const availH = screen.availHeight || 800;
      const frameW = Math.max(0, window.outerWidth - window.innerWidth);
      const frameH = Math.max(0, window.outerHeight - window.innerHeight);
      const width = Math.min(availW, wantW + frameW);
      const height = Math.min(availH, wantH + frameH);
      const left = (screen.availLeft || 0) + Math.max(0, Math.round((availW - width) / 2));
      const top = (screen.availTop || 0) + Math.max(0, Math.round((availH - height) / 2));
      chrome.windows.update(win.id, { width, height, left, top }, () => {
        void chrome.runtime.lastError;
        setTimeout(watchResize, 300); // só passa a lembrar o tamanho depois do ajuste
      });
    });
  }

  if (Number.isFinite(wantW) && Number.isFinite(wantH) && wantW > 0 && wantH > 0) {
    if (document.readyState === "complete") fitToInnerSize();
    else window.addEventListener("load", fitToInnerSize, { once: true });
  } else {
    watchResize();
  }
})();
