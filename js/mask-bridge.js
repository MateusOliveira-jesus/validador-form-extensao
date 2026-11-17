// v19 — ponte no mundo MAIN (mesmo contexto JS da página).
// O content.js roda em "mundo isolado" e NÃO enxerga `input.inputmask`, jQuery.data('mask') etc.
// Este script lê/aplica as máscaras da própria página e responde via atributos no elemento.
(() => {
  "use strict";
  if (window.__mapeadorMaskBridgeV19) return;
  window.__mapeadorMaskBridgeV19 = true;

  const REQ = "data-mapeador-req";
  const RES = "data-mapeador-res";
  const norm = (s) => String(s ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
  const NUMERIC_ALIASES = ["numeric", "currency", "decimal", "integer", "percentage"];

  function probe(el) {
    const im = el.inputmask;
    if (im) {
      const o = im.opts || {};
      const mask = Array.isArray(o.mask) ? o.mask.join(" | ") : typeof o.mask === "string" ? o.mask : "";
      return {
        masked: true,
        engine: "inputmask",
        mask,
        alias: o.alias || "",
        regex: o.regex || "",
        numeric: NUMERIC_ALIASES.includes(o.alias),
      };
    }
    const $ = window.jQuery;
    if ($) {
      try {
        const d = $(el).data() || {};
        const jm = d.mask;
        if (jm && (jm.mask || typeof jm === "string")) {
          return { masked: true, engine: "jquery-mask", mask: String(jm.mask || jm), alias: "", regex: "", numeric: false };
        }
        if (d.rawMaskFn) {
          return { masked: true, engine: "jquery-maskedinput", mask: "", alias: "", regex: "", numeric: false };
        }
      } catch (_) {}
    }
    return { masked: false, engine: "", hasInputmaskLib: !!window.Inputmask };
  }

  function fire(el, names) {
    names.forEach((n) => el.dispatchEvent(new Event(n, { bubbles: true })));
  }

  function fill(el, value, candidates) {
    const cands = [...new Set([value, ...(candidates || [])].map(String))];
    const want = norm(value);
    const accepted = () => {
      const got = norm(el.value);
      return !!got && (got === want || got.startsWith(want));
    };
    const im = el.inputmask;
    if (im && typeof im.setValue === "function") {
      for (const c of cands) {
        try { im.setValue(c); } catch (_) {}
        if (accepted()) return { ok: true, via: "Inputmask.setValue", value: el.value, accepted: true };
      }
      return { ok: !!el.value, via: "Inputmask.setValue", value: el.value, accepted: false };
    }
    if (window.Inputmask && typeof window.Inputmask.setValue === "function" && el.inputmask) {
      for (const c of cands) {
        try { window.Inputmask.setValue(el, c); } catch (_) {}
        if (accepted()) return { ok: true, via: "Inputmask.setValue(el)", value: el.value, accepted: true };
      }
    }
    const $ = window.jQuery;
    if ($) {
      const $el = $(el);
      const d = $el.data() || {};
      if (d.mask || d.rawMaskFn) {
        for (const c of cands) {
          try {
            let v = c;
            if (typeof $el.masked === "function") { try { v = $el.masked(c) || c; } catch (_) {} }
            $el.val(v).trigger("input").trigger("keyup");
          } catch (_) {}
          if (accepted()) return { ok: true, via: "jQuery mask", value: el.value, accepted: true };
        }
        return { ok: !!el.value, via: "jQuery mask", value: el.value, accepted: false };
      }
    }
    return { ok: false, via: "", value: el.value, accepted: false };
  }

  window.addEventListener(
    "mapeador:mask",
    (ev) => {
      const el = ev.composedPath && ev.composedPath()[0];
      if (!el || el.nodeType !== 1) return;
      let req = null;
      try { req = JSON.parse(el.getAttribute(REQ) || "null"); } catch (_) {}
      if (!req) return;
      let res;
      try {
        res = req.op === "fill" ? fill(el, req.value, req.candidates) : probe(el);
      } catch (e) {
        res = { ok: false, error: String((e && e.message) || e) };
      }
      el.setAttribute(RES, JSON.stringify(res));
      el.removeAttribute(REQ);
    },
    true,
  );
})();
