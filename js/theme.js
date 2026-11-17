// v17 — tema adaptável. Carregado no <head> para evitar "piscar" de cores.
(function () {
  "use strict";
  const KEY = "mapeadorThemeV17"; // auto | light | dark
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  let pref = "auto";
  try { pref = localStorage.getItem(KEY) || "auto"; } catch (_) {}
  const apply = () => {
    const dark = pref === "dark" || (pref === "auto" && mq.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");
    const b = document.getElementById("themeToggleV17");
    if (b) {
      const lbl = { auto: "Tema: automático (segue o sistema)", light: "Tema: claro", dark: "Tema: escuro" }[pref];
      b.textContent = { auto: "◐", light: "☀", dark: "☾" }[pref];
      b.title = lbl + " — clique para alternar"; b.setAttribute("aria-label", b.title);
    }
  };
  apply();
  mq.addEventListener("change", apply);
  const set = (p, animate) => {
    pref = p;
    try { localStorage.setItem(KEY, p); } catch (_) {}
    try { chrome.storage?.local?.set({ [KEY]: p }); } catch (_) {}
    if (animate) { document.documentElement.classList.add("theme-anim"); setTimeout(() => document.documentElement.classList.remove("theme-anim"), 300); }
    apply();
  };
  // Sincroniza entre popup, janela e painel flutuante.
  try {
    chrome.storage.local.get(KEY, (r) => { if (r && r[KEY] && r[KEY] !== pref) set(r[KEY]); });
    chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && c[KEY] && c[KEY].newValue !== pref) set(c[KEY].newValue, true); });
  } catch (_) {}
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.getElementById("themeToggleV17")?.addEventListener("click", () => {
      const order = ["auto", "light", "dark"];
      set(order[(order.indexOf(pref) + 1) % 3], true);
    });
  });
})();
