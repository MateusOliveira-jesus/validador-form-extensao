/*
 * Aba Requisição — cliente HTTP que executa na aba atual (mesma sessão do site).
 *
 * Modelo (v41):
 *   • CAMPOS são fixos: só mudam quando você adiciona (＋ Adicionar campos), remove (×),
 *     cola um JSON ou usa "Montar da página" (que pede confirmação se já houver campos).
 *   • VALORES vêm de uma origem e só preenchem campos que já existem:
 *       👤 Perfil (JSON do mapeamento) · 🌐 Página (tudo que está digitado no formulário) · 🧠 Lembrados (4Devs)
 *       🧪 Modo teste abre o mesmo modal do Início (prefixo TESTE nas chaves escolhidas).
 *   • VALIDAÇÃO: avisos antes de enviar (não bloqueiam) e verificações da resposta
 *       (status, tempo, campo do JSON, corpo, header) que definem o resultado no relatório.
 *
 * Funções puras ficam em js/request-core.js (window.ReqCore). Funções que rodam DENTRO da página
 * (pageDiscover / pageWorker) são serializadas pelo Chrome e não podem usar nada de fora.
 *
 * Chaves de armazenamento mantidas para não perder dados:
 *   requestV22 (rascunho), requestProfilesV24 (salvas), requestHistoryV23 (histórico).
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const C = window.ReqCore;
  const VARS = window.MapeadorVars || null;
  const DRAFT_KEY = "requestV22";
  const SAVED_KEY = "requestProfilesV24";
  const HISTORY_KEY = "requestHistoryV23";
  const HISTORY_MAX = 25;
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const FORM_FIELDS = [
    "reqUrl", "reqMethod", "reqSelector", "reqFormat", "reqData", "reqHeaders",
    "reqTokenMode", "reqToken", "reqTokenField", "reqTokenHeader", "reqBearer",
    "reqIncludeForm", "reqCredentials", "reqConfirm", "reqAutoVerdict", "reqExpectedFailure",
  ];
  const HEADER_PRESETS = [
    ["Accept", "application/json"], ["Content-Type", "application/json"], ["X-Requested-With", "XMLHttpRequest"],
    ["Accept-Language", "pt-BR"], ["Cache-Control", "no-cache"], ["Authorization", "Bearer "], ["X-CSRF-TOKEN", ""],
  ];

  /** Estado do editor: fonte única de verdade. */
  let fields = []; // { key, value, enabled, mapped, multi, type, typeAuto, required }
  let headerRows = []; // { key, value, enabled }
  let asserts = []; // { id, enabled, type, target, op, expected }
  let last = null; // última resposta exibida
  let pageIds = {}; // id -> name dos campos da página (para traduzir seletores do mapeamento)
  let pessoas = []; // pessoas lembradas do 4Devs (chave pessoasGeradas)
  let extra = null; // { source, items } — o que existe na origem e não está na requisição

  // ---------- Utilidades ----------
  const store = {
    get: async (key, fallback) => (await chrome.storage.local.get(key))[key] ?? fallback,
    set: (key, value) => chrome.storage.local.set({ [key]: value }),
  };
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k !== null && k !== undefined && k !== false)); return n; };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const isEmpty = (v) => v === "" || v === null || v === undefined || (Array.isArray(v) && !v.length);
  const mask = (key, value) => (/authorization|token|cookie|secret|senha|password|api[-_]?key/i.test(key) ? String(value).slice(0, 4) + "…[oculto]" : value);

  /** Mensagem curta abaixo da linha de envio (nunca mistura com a resposta). */
  function notify(message, level = "info") {
    const box = $("reqNotice");
    if (!message) { box.hidden = true; return; }
    box.hidden = false;
    box.className = "req-notice is-" + level;
    box.textContent = message;
  }
  const fail = (e) => notify(e?.message || String(e), "error");

  function parseObject(id, label) {
    let obj;
    try { obj = JSON.parse($(id).value || "{}"); } catch (e) { throw Error(`${label}: JSON inválido (${e.message}).`); }
    if (!obj || Array.isArray(obj) || typeof obj !== "object") throw Error(`${label}: informe um objeto JSON.`);
    return obj;
  }

  // ---------- Campos <-> JSON ----------
  const { isListKey, asList, detectType, convertValue, stringify } = C;

  /** Cria um campo; o tipo começa automático e só fica fixo quando o usuário o altera. */
  function makeField(key, raw, extraProps = {}) {
    const value = asList(key, raw);
    const type = extraProps.type || detectType(value);
    return { key, value: stringify(value), enabled: true, mapped: false, required: false, ...extraProps, type, typeAuto: !extraProps.type, multi: type === "list" };
  }
  function setType(f, type, manual) { f.type = type; f.multi = type === "list"; if (manual) f.typeAuto = false; }

  /** Valores {{variável}} usam os dados do perfil/pessoa em uso (e as automáticas: hoje, agora…). */
  function varValues() {
    const profile = window.MapeadorApp?.getActiveProfile?.();
    const base = profile ? window.MapeadorApp?.getCurrentData?.(profile) || profile.data || {} : {};
    const person = sourceMode() === "remembered" ? pessoas[Number($("reqRemembered").value)]?.dados : null;
    return { ...base, ...(person || {}) };
  }
  const resolveVars = (text, values = varValues()) => C.resolveTemplate(text, values, VARS);

  function fieldValue(f, resolve = false) {
    const text = resolve ? resolveVars(f.value) : f.value;
    return convertValue(text, f.type || (f.multi ? "list" : "string"));
  }
  function fieldsToObject(onlyEnabled, resolve = false) {
    const data = {};
    const values = resolve ? varValues() : null;
    for (const f of fields) {
      if (!f.key.trim() || (onlyEnabled && !f.enabled)) continue;
      data[f.key.trim()] = convertValue(resolve ? resolveVars(f.value, values) : f.value, f.type || (f.multi ? "list" : "string"));
    }
    return data;
  }

  /** Substitui a lista de campos (usado por Montar, Colar JSON e rascunho). Preserva flags quando pedido. */
  function setFields(obj, { keepFlags = false, mappedKeys = new Set() } = {}) {
    const previous = new Map(fields.map((f) => [f.key, f]));
    fields = Object.entries(obj).map(([key, raw]) => {
      const prev = previous.get(key);
      const keepType = prev && !prev.typeAuto ? { type: prev.type } : {};
      return makeField(key, raw, {
        ...keepType,
        required: !!prev?.required,
        enabled: keepFlags ? prev?.enabled ?? true : true,
        mapped: mappedKeys.has(key) || (keepFlags && !!prev?.mapped),
      });
    });
    syncRaw();
    renderFields();
  }

  const scheduleIssues = debounce(() => refreshIssues(), 250);

  function syncRaw() {
    $("reqData").value = JSON.stringify(fieldsToObject(false), null, 2);
    const active = fields.filter((f) => f.enabled && f.key.trim()).length;
    $("reqFieldCount").textContent = active;
    const stat = (id, n) => { const n0 = $(id); if (n0) n0.textContent = n; };
    stat("reqStatTotal", fields.length);
    stat("reqStatOn", active);
    stat("reqStatMapped", fields.filter((f) => f.mapped).length);
    stat("reqStatReq", fields.filter((f) => f.required).length);
    pruneExtra();
    saveDraft();
    scheduleIssues();
  }

  const rowProblem = (f) => (f.enabled && f.key.trim() ? C.typeProblem(f.value, f.type) : "");

  function renderFields() {
    const box = $("reqFieldRows");
    const q = ($("reqFieldFilter").value || "").trim().toLowerCase();
    $("reqFieldFilter").hidden = fields.length <= 8;
    box.replaceChildren();
    for (const f of fields) {
      if (q && !`${f.key} ${f.value}`.toLowerCase().includes(q)) continue;
      const row = el("div", { className: "req-field-row" + (f.enabled ? "" : " is-off") + (f.mapped ? " is-mapped" : "") + (f.required ? " is-required" : "") });
      row.title = f.mapped ? "Valor vindo do mapeamento/perfil" : "";

      const check = el("input", { type: "checkbox", checked: f.enabled });
      check.setAttribute("aria-label", "Enviar este campo");
      const name = el("input", { className: "form-control", value: f.key, placeholder: "nome" });
      name.setAttribute("aria-label", "Nome do campo");
      name.spellcheck = false;
      const val = el("textarea", { className: "form-control", rows: 1, value: f.value, placeholder: "valor" });
      val.setAttribute("aria-label", "Valor do campo");
      val.spellcheck = false;
      const type = el("select", { className: "form-control req-type" });
      type.setAttribute("aria-label", "Tipo enviado");
      for (const [v, label] of C.TYPES) type.append(new Option(label, v));
      type.value = f.type || "string";
      const req = el("button", { type: "button", className: "req-star", textContent: "★" });
      req.setAttribute("aria-label", "Campo obrigatório");
      req.setAttribute("aria-pressed", String(!!f.required));
      const del = el("button", { type: "button", className: "req-del", textContent: "×" });
      del.setAttribute("aria-label", "Remover campo");

      const mark = () => {
        type.title = (f.typeAuto ? "Tipo identificado automaticamente" : "Tipo escolhido por você") + " — altere para mudar como o valor é enviado";
        type.classList.toggle("is-manual", !f.typeAuto);
        val.disabled = f.type === "null";
        const prob = rowProblem(f);
        row.classList.toggle("is-invalid", !!prob);
        val.title = prob ? `Atenção: ${prob} — será enviado como texto` : "";
        req.classList.toggle("on", !!f.required);
        req.setAttribute("aria-pressed", String(!!f.required));
        req.title = f.required ? "Obrigatório — avisa se estiver vazio (clique para desmarcar)" : "Marcar como obrigatório (só gera um aviso)";
        row.classList.toggle("is-required", !!f.required);
      };
      mark();

      check.onchange = () => { f.enabled = check.checked; row.classList.toggle("is-off", !f.enabled); mark(); syncRaw(); };
      name.oninput = () => { f.key = name.value; mark(); syncRaw(); };
      val.oninput = () => {
        f.value = val.value; f.mapped = false; row.classList.remove("is-mapped");
        if (f.typeAuto) { setType(f, detectType(f.value), false); type.value = f.type; }
        mark(); syncRaw();
      };
      type.onchange = () => { setType(f, type.value, true); mark(); syncRaw(); };
      req.onclick = () => { f.required = !f.required; mark(); syncRaw(); };
      del.onclick = () => { fields = fields.filter((x) => x !== f); syncRaw(); renderFields(); };

      row.append(check, name, type, val, req, del);
      box.append(row);
    }
    $("reqEmpty").hidden = fields.length > 0;
    if (fields.length && !box.childElementCount) box.append(el("p", { className: "req-empty", textContent: "Nenhum campo corresponde ao filtro." }));
  }

  // ---------- Headers (tabela chave/valor) ----------
  function headersObject() {
    const out = {};
    for (const h of headerRows) if (h.enabled && h.key.trim()) out[h.key.trim()] = h.value;
    return out;
  }
  function syncHeaders() {
    $("reqHeaders").value = JSON.stringify(headersObject());
    $("reqHeaderCount").textContent = headerRows.filter((h) => h.enabled && h.key.trim()).length;
    saveDraft();
    scheduleIssues();
  }
  function renderHeaders() {
    const box = $("reqHeaderRows");
    box.replaceChildren();
    for (const h of headerRows) {
      const check = el("input", { type: "checkbox", checked: h.enabled });
      check.setAttribute("aria-label", "Enviar este header");
      const key = el("input", { className: "form-control", value: h.key, placeholder: "Header" });
      key.setAttribute("aria-label", "Nome do header");
      key.spellcheck = false;
      const val = el("input", { className: "form-control", value: h.value, placeholder: "valor" });
      val.setAttribute("aria-label", "Valor do header");
      val.spellcheck = false;
      const del = el("button", { type: "button", className: "req-del", textContent: "×" });
      del.setAttribute("aria-label", "Remover header");
      const row = el("div", { className: "req-kv-row req-kv-3" + (h.enabled ? "" : " is-off") }, check, key, val, del);
      check.onchange = () => { h.enabled = check.checked; row.classList.toggle("is-off", !h.enabled); syncHeaders(); };
      key.oninput = () => { h.key = key.value; syncHeaders(); };
      val.oninput = () => { h.value = val.value; syncHeaders(); };
      del.onclick = () => { headerRows = headerRows.filter((x) => x !== h); renderHeaders(); syncHeaders(); };
      box.append(row);
    }
    syncHeaders();
  }
  function headersFromJson(text) {
    const obj = JSON.parse(text || "{}");
    if (!obj || Array.isArray(obj) || typeof obj !== "object") throw Error("informe um objeto JSON");
    headerRows = Object.entries(obj).map(([key, value]) => ({ key, value: String(value ?? ""), enabled: true }));
  }

  // ---------- Verificações da resposta ----------
  const newAssert = (o = {}) => ({ id: "a" + Math.random().toString(36).slice(2, 8), enabled: true, type: "status", target: "", op: "eq", expected: "", ...o });

  function renderAsserts() {
    const box = $("reqAssertRows");
    box.replaceChildren();
    for (const a of asserts) {
      const meta = C.ASSERT_TYPES[a.type] || C.ASSERT_TYPES.status;
      const check = el("input", { type: "checkbox", checked: a.enabled });
      check.setAttribute("aria-label", "Usar esta verificação");
      const type = el("select", { className: "form-control" });
      type.setAttribute("aria-label", "O que verificar");
      for (const [k, t] of Object.entries(C.ASSERT_TYPES)) type.append(new Option(t.label, k));
      type.value = a.type;
      const target = el("input", { className: "form-control", value: a.target, placeholder: meta.target || "" });
      target.setAttribute("aria-label", "Alvo da verificação");
      target.spellcheck = false;
      target.hidden = !meta.target;
      const op = el("select", { className: "form-control" });
      op.setAttribute("aria-label", "Condição");
      for (const k of meta.ops) op.append(new Option(C.OPS[k].label, k));
      op.value = meta.ops.includes(a.op) ? a.op : meta.ops[0];
      a.op = op.value;
      const exp = el("input", { className: "form-control", value: a.expected, placeholder: "esperado" });
      exp.setAttribute("aria-label", "Valor esperado");
      exp.spellcheck = false;
      exp.hidden = !C.OPS[a.op].needs;
      const del = el("button", { type: "button", className: "req-del", textContent: "×" });
      del.setAttribute("aria-label", "Remover verificação");
      const row = el("div", { className: "req-kv-row req-assert-row" + (a.enabled ? "" : " is-off") }, check, type, target, op, exp, del);
      const lineBreak = el("div", { className: "req-assert-label", textContent: C.describe(a) });
      const refresh = () => { lineBreak.textContent = C.describe(a); };

      check.onchange = () => { a.enabled = check.checked; row.classList.toggle("is-off", !a.enabled); syncAsserts(); };
      type.onchange = () => {
        a.type = type.value;
        const m = C.ASSERT_TYPES[a.type];
        a.op = m.ops[0]; a.target = ""; a.expected = m.expected || "";
        renderAsserts(); syncAsserts();
      };
      target.oninput = () => { a.target = target.value; refresh(); syncAsserts(); };
      op.onchange = () => { a.op = op.value; renderAsserts(); syncAsserts(); };
      exp.oninput = () => { a.expected = exp.value; refresh(); syncAsserts(); };
      del.onclick = () => { asserts = asserts.filter((x) => x !== a); renderAsserts(); syncAsserts(); };
      box.append(el("div", { className: "req-assert" }, row, lineBreak));
    }
    $("reqAssertEmpty").hidden = asserts.length > 0;
    $("reqAssertCount").textContent = asserts.filter((a) => a.enabled).length;
  }
  function syncAsserts() { $("reqAssertCount").textContent = asserts.filter((a) => a.enabled).length; saveDraft(); }

  // ---------- Rascunho ----------
  function snapshot() {
    const values = {};
    for (const id of FORM_FIELDS) if ($(id)) values[id] = $(id).type === "checkbox" ? $(id).checked : $(id).value;
    values.reqDisabled = fields.filter((f) => !f.enabled).map((f) => f.key);
    values.reqRequired = fields.filter((f) => f.required).map((f) => f.key);
    values.reqTypes = Object.fromEntries(fields.filter((f) => !f.typeAuto && f.key).map((f) => [f.key, f.type]));
    values.reqHeaderRows = headerRows.map((h) => ({ ...h }));
    values.reqAsserts = asserts.map((a) => ({ ...a }));
    values.reqSource = sourceMode();
    return values;
  }

  function applySnapshot(values = {}) {
    for (const [id, v] of Object.entries(values)) {
      if (!FORM_FIELDS.includes(id)) continue;
      const node = $(id);
      if (!node) continue;
      if (node.type === "checkbox") node.checked = !!v;
      else node.value = v;
    }
    let data = {};
    try { data = parseObject("reqData", "Campos"); } catch { /* rascunho inválido: começa vazio */ }
    const off = new Set(values.reqDisabled || []);
    const required = new Set(values.reqRequired || []);
    const types = values.reqTypes || {};
    fields = Object.entries(data).map(([key, raw]) =>
      makeField(key, raw, { enabled: !off.has(key), required: required.has(key), ...(types[key] ? { type: types[key] } : {}) }));

    if (Array.isArray(values.reqHeaderRows)) headerRows = values.reqHeaderRows.map((h) => ({ key: String(h.key ?? ""), value: String(h.value ?? ""), enabled: h.enabled !== false }));
    else { try { headersFromJson($("reqHeaders").value); } catch { headerRows = []; } }
    asserts = Array.isArray(values.reqAsserts) ? values.reqAsserts.map((a) => newAssert(a)) : [];
    if (values.reqSource) { const r = document.querySelector(`input[name="reqSource"][value="${values.reqSource}"]`); if (r) r.checked = true; }

    syncRaw();
    renderFields();
    renderHeaders();
    renderAsserts();
    syncActs();
    paintMethod();
  }

  const saveDraft = () => store.set(DRAFT_KEY, snapshot());

  // ---------- Mapeamento ativo (automático) ----------
  async function currentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  const samePage = (a, b) => {
    try { const x = new URL(a), y = new URL(b); return x.origin === y.origin && x.pathname === y.pathname; } catch { return false; }
  };

  /** Usa o mapeamento escolhido em Início; se não houver, procura um salvo para esta página. */
  async function findMapping() {
    const app = window.MapeadorApp;
    const active = app?.getActiveProfile?.();
    if (active) return { profile: active, how: "selecionado em Início" };
    const tab = await currentTab().catch(() => null);
    const byUrl = tab?.url && (app?.getProfiles?.() || []).find((p) => p.url && samePage(p.url, tab.url));
    return byUrl ? { profile: byUrl, how: "detectado pela página" } : null;
  }

  /** Traduz a chave do mapeamento (nome, #id ou [name=...]) para o nome enviado no formulário. */
  function toFieldName(key) {
    const attr = /\[name=["']?([^"'\]]+)["']?\]/.exec(key);
    if (attr) return attr[1];
    const id = key.startsWith("#") ? key.slice(1) : key;
    return pageIds[id] || id;
  }

  // ---------- Origem dos valores ----------
  const sourceMode = () => document.querySelector('input[name="reqSource"]:checked')?.value || "profile";
  function setSource(mode) {
    const r = document.querySelector(`input[name="reqSource"][value="${mode}"]`);
    if (r) r.checked = true;
    $("reqRemembered").hidden = mode !== "remembered";
    syncActs();
    saveDraft();
  }
  function syncActs() {
    document.querySelectorAll(".req-act[data-source]").forEach((b) => b.classList.toggle("active", b.dataset.source === sourceMode()));
  }
  const SOURCE_LABEL = { profile: "dados do perfil", page: "dados da página", remembered: "dados lembrados (4Devs)" };

  async function loadPessoas() {
    pessoas = (await store.get("pessoasGeradas", [])).filter((p) => p && p.dados && typeof p.dados === "object");
    const sel = $("reqRemembered");
    const prev = sel.value;
    sel.replaceChildren(...(pessoas.length
      ? pessoas.map((p, i) => new Option(`${p.dados.nome || p.dados.name || "Pessoa " + (i + 1)}${p.dados.cpf ? " · " + p.dados.cpf : ""}${p.usado ? " (usado)" : ""}`, String(i)))
      : [new Option("Nenhuma pessoa lembrada — gere em Gerar", "")]));
    if (prev && pessoas[Number(prev)]) sel.value = prev;
    else { const fresh = pessoas.findIndex((p) => !p.usado); if (pessoas.length) sel.value = String(fresh >= 0 ? fresh : pessoas.length - 1); }
  }

  /** JSON em uso: o do perfil (ou o carregado em Início) ou a pessoa lembrada escolhida. */
  function sourceData(profile) {
    if (sourceMode() === "remembered") return pessoas[Number($("reqRemembered").value)]?.dados || {};
    return window.MapeadorApp?.getCurrentData?.(profile) || profile?.data || {};
  }

  /** Nome do campo → valor, segundo o mapeamento. Chaves de teste recebem o prefixo "TESTE ". */
  function mappedValues(profile, data, test = new Set()) {
    const out = {};
    for (const [key, config] of Object.entries(profile?.mapping || {})) {
      if (!config) continue;
      const name = toFieldName(key);
      let value;
      if (config.type === "json") value = data?.[config.value];
      else if (config.type === "default" || config.type === "form") value = config.value;
      if (isEmpty(value)) continue;
      if (config.type === "json" && test.has(config.value) && !Array.isArray(value) && typeof value !== "object") {
        const text = String(value);
        value = text.startsWith("TESTE ") ? text : `TESTE ${text}`;
      }
      out[name] = value;
    }
    return out;
  }

  // ---------- Preencher VALORES (nunca cria nem remove campos) ----------
  function findField(name) {
    const bare = String(name).replace(/\[\]$/, "");
    return fields.find((f) => f.key.trim() === name) || fields.find((f) => f.key.trim().replace(/\[\]$/, "") === bare);
  }

  /** Aplica valores aos campos que já existem. Devolve quantos foram preenchidos e quais não têm campo. */
  function fillValues(values, { mapped = true } = {}) {
    let filled = 0;
    const missing = [];
    for (const [name, raw] of Object.entries(values)) {
      const f = findField(name);
      if (!f) { missing.push(name); continue; }
      const v = asList(f.key, raw);
      f.value = stringify(v);
      if (f.typeAuto) setType(f, detectType(v), false);
      f.mapped = mapped;
      filled++;
    }
    syncRaw();
    renderFields();
    return { filled, missing };
  }

  /** Lembra o que existe na origem e não está na requisição (botão “Adicionar à requisição”). */
  function setExtra(source, names) {
    extra = names.length ? { source, names } : null;
    renderExtra();
  }
  function renderExtra() {
    const box = $("reqExtra");
    box.hidden = !extra;
    if (!extra) return;
    const n = extra.names.length;
    const what = extra.source === "page" ? "da página" : "do mapeamento";
    $("reqExtraText").textContent = `${n} campo${n > 1 ? "s" : ""} ${what} não ${n > 1 ? "estão" : "está"} na requisição: ${extra.names.slice(0, 4).join(", ")}${n > 4 ? "…" : ""}`;
  }
  function pruneExtra() {
    if (!extra) return;
    extra.names = extra.names.filter((n) => !findField(n));
    if (!extra.names.length) extra = null;
    renderExtra();
  }

  // ---------- Modal de teste (mesmo modelo do Início) ----------
  const bsModal = (id) => bootstrap.Modal.getOrCreateInstance($(id), { backdrop: true, keyboard: true });
  const testApp = () => window.MapeadorApp;
  const testSettings = (profile) => testApp()?.getTestSettings?.(profile) || { enabled: false, fields: {}, remember: false };
  const savedTestKeys = (profile) => {
    const st = testSettings(profile);
    return st.enabled ? new Set(Object.keys(st.fields || {}).filter((k) => st.fields[k] === true)) : new Set();
  };
  let testCtx = null; // { profile, data, sel, resolve, done }

  function renderTestState(profile) {
    const st = profile ? testSettings(profile) : { enabled: false, fields: {} };
    const n = Object.values(st.fields || {}).filter((v) => v === true).length;
    $("reqUseTest").checked = !!st.enabled;
    const b = $("reqTestBtn");
    b.classList.toggle("active", !!st.enabled);
    b.textContent = st.enabled ? `🧪 Teste · ${n} chave${n === 1 ? "" : "s"}` : "🧪 Modo teste";
    b.title = st.enabled ? "Teste ativo — clique para escolher as chaves ou desativar" : "Escolher quais chaves do JSON recebem o prefixo TESTE";
  }

  /** Chaves do JSON que alimentam algum campo que está na requisição. */
  function usedDataKeys(profile) {
    const used = new Set();
    for (const [key, config] of Object.entries(profile?.mapping || {})) {
      if (config?.type === "json" && config.value && findField(toFieldName(key))) used.add(config.value);
    }
    return used;
  }

  function renderTestList() {
    const ctx = testCtx;
    const list = $("reqTestFieldList");
    const q = $("reqTestFilter").value.trim().toLowerCase();
    const saved = testSettings(ctx.profile).fields || {};
    const used = usedDataKeys(ctx.profile);
    list.replaceChildren();
    for (const key of Object.keys(ctx.data)) {
      const value = ctx.data[key];
      if (q && !`${key} ${stringify(value)}`.toLowerCase().includes(q)) continue;
      const box = el("input", { type: "checkbox", checked: ctx.sel.has(key) });
      box.setAttribute("aria-label", "Aplicar TESTE em " + key);
      box.onchange = () => { box.checked ? ctx.sel.add(key) : ctx.sel.delete(key); updateTestCount(); };
      const tags = [
        saved[key] === true && "💾 salvo",
        used.has(key) && "🔗 na requisição",
        typeof value === "object" && value !== null && "lista/objeto: não recebe prefixo",
      ].filter(Boolean);
      const main = el("span", { className: "req-pick-main" }, el("strong", { textContent: key }));
      if (tags.length) main.append(el("small", { textContent: tags.join(" · ") }));
      const shown = stringify(value);
      if (shown) main.append(el("code", { className: "req-pick-val", textContent: shown.length > 60 ? shown.slice(0, 57) + "…" : shown }));
      list.append(el("label", { className: "req-pick-row" }, box, main));
    }
    if (!list.childElementCount) list.append(el("p", { className: "req-empty", textContent: Object.keys(ctx.data).length ? "Nenhuma chave corresponde ao filtro." : "⚠️ Nenhuma chave encontrada no JSON." }));
    updateTestCount();
  }
  function updateTestCount() {
    const total = Object.keys(testCtx.data).length;
    $("reqTestConfirm").textContent = testCtx.sel.size ? `✅ Preencher com Teste (${testCtx.sel.size}/${total})` : "✅ Preencher sem teste";
  }

  function openTestModal(profile, data) {
    return new Promise((resolve) => {
      const st = testSettings(profile);
      const saved = st.fields || {};
      const sel = new Set(Object.keys(data).filter((k) => saved[k] === true || (!String(data[k]).startsWith("TESTE") && saved[k] !== false)));
      testCtx = { profile, data, sel, resolve, done: false };
      $("reqTestFilter").value = "";
      $("reqTestRemember").checked = profile.testSettings?.remember !== undefined ? st.remember : true;
      $("reqTestOff").hidden = !st.enabled;
      renderTestList();
      bsModal("reqTestModal").show();
    });
  }
  function finishTest(result) {
    if (!testCtx || testCtx.done) return;
    testCtx.done = true;
    testCtx.resolve(result);
  }
  function commitTest(enabled) {
    const { profile, data, sel } = testCtx;
    const prefs = { ...(testSettings(profile).fields || {}) };
    for (const k of Object.keys(data)) prefs[k] = sel.has(k);
    testApp()?.saveTestSettings?.(profile, { enabled, fields: prefs, remember: $("reqTestRemember").checked });
  }

  /** Decide se precisa perguntar (igual ao Início): primeira vez, ou teste ativo sem chaves salvas. */
  async function testGate(profile, data, { force = false } = {}) {
    if (!profile || !Object.keys(data || {}).length) return { proceed: true };
    if (force) return openTestModal(profile, data);
    const st = testSettings(profile);
    const hasSaved = Object.values(st.fields || {}).some((v) => v === true);
    if (st.enabled && hasSaved) return { proceed: true };
    if (!profile.testSettings?.decisionMade || st.enabled) return openTestModal(profile, data);
    return { proceed: true };
  }

  // ---------- Origens: Perfil / Lembrados ----------
  async function applyProfile({ prompt = true, force = false, quiet = false } = {}) {
    const found = await findMapping();
    if (!found) { if (!quiet) notify("Nenhum mapeamento ativo. Escolha um em Início.", "warn"); return 0; }
    if (!fields.length) { if (!quiet) notify("A requisição ainda não tem campos. Use ＋ Adicionar campos (ou ⚡ Montar da página) e depois escolha a origem dos valores.", "warn"); return 0; }
    const data = sourceData(found.profile);
    if (prompt || force) {
      const gate = await testGate(found.profile, data, { force });
      if (!gate.proceed) { if (!quiet) notify("Preenchimento cancelado.", "info"); return -1; }
    }
    renderTestState(found.profile);
    const test = savedTestKeys(found.profile);
    const values = mappedValues(found.profile, data, test);
    const { filled, missing } = fillValues(values);
    setExtra("mapping", missing);
    if (!quiet) {
      notify(
        `${filled} campo(s) preenchido(s) com ${SOURCE_LABEL[sourceMode()] || "dados"}${test.size ? ` · modo teste (${test.size} chave${test.size > 1 ? "s" : ""})` : ""}.` +
        (missing.length ? ` ${missing.length} campo(s) do mapeamento não estão na requisição.` : "") +
        (!filled ? " Nenhum campo da requisição corresponde ao mapeamento." : ""),
        filled ? "ok" : "warn",
      );
    }
    return filled;
  }

  // ---------- Origem: Página (traz os DADOS, não os campos) ----------
  async function fillFromPage() {
    if (!fields.length) return notify("A requisição ainda não tem campos. Use ＋ Adicionar campos → Página, ou ⚡ Montar da página.", "warn");
    const btn = document.querySelector('.req-act[data-source="page"]');
    btn.disabled = true;
    try {
      const res = await execInPage(pageDiscover, []);
      pageIds = { ...pageIds, ...(res.ids || {}) };
      const wanted = $("reqSelector").value.trim();
      const forms = [...(res.forms || [])].sort((a, b) => Number(b.selector === wanted) - Number(a.selector === wanted));
      if (!forms.length) return notify("Nenhum campo de formulário encontrado na aba atual. Se a página usa iframe, abra o painel dentro dele.", "warn");

      const byKey = new Map();
      for (const form of forms) for (const f of form.fields) if (!byKey.has(f.key)) byKey.set(f.key, f);
      const tolerant = (key) => byKey.get(key) || byKey.get(key.replace(/\[\]$/, "")) || byKey.get(key + "[]");

      let filled = 0, empty = 0, hidden = 0;
      const notOnPage = [];
      for (const f of fields) {
        const key = f.key.trim();
        if (!key) continue;
        const pf = tolerant(key);
        if (!pf) { notOnPage.push(key); continue; }
        if (pf.file || pf.sensitive) { hidden++; continue; }
        if (isEmpty(pf.value)) { empty++; continue; }
        const v = asList(f.key, pf.value);
        f.value = stringify(v);
        if (f.typeAuto) setType(f, detectType(v), false);
        f.mapped = false;
        filled++;
      }
      syncRaw();
      renderFields();

      // O que a página tem e a requisição não: só sugere, nunca adiciona sozinho.
      const main = forms[0];
      const onlyHere = main.fields.filter((f) => !f.file && !findField(f.key)).map((f) => f.key);
      setExtra("page", onlyHere);

      notify(
        `${filled} campo(s) preenchido(s) com os dados da página (“${main.label}”).` +
        (empty ? ` ${empty} estava(m) vazio(s) na página e foram mantidos.` : "") +
        (hidden ? ` ${hidden} sensível(is)/arquivo não são lidos.` : "") +
        (notOnPage.length ? ` ${notOnPage.length} não existe(m) na página: ${notOnPage.slice(0, 3).join(", ")}${notOnPage.length > 3 ? "…" : ""}.` : ""),
        filled ? "ok" : "warn",
      );
    } catch (e) {
      fail(e);
    } finally {
      btn.disabled = false;
    }
  }

  /** Reaplica a origem atual (botão “Reaplicar valores”). */
  const reapply = () => (sourceMode() === "page" ? fillFromPage() : applyProfile({ prompt: true }));

  async function refreshMappingInfo() {
    const found = await findMapping();
    $("reqActiveMapping").textContent = found ? found.profile.name : "Nenhum";
    $("reqActiveHint").textContent = found
      ? `${Object.keys(found.profile.mapping || {}).length} campos mapeados · ${found.how}`
      : "Escolha um mapeamento em Início para usar seus valores.";
    renderTestState(found?.profile);
    syncActs();
    return found;
  }

  // ---------- Pessoas lembradas (4Devs) ----------
  function renderPeople() {
    const q = $("reqPeopleFilter").value.trim().toLowerCase();
    const showUsed = $("reqPeopleShowUsed").checked;
    const list = $("reqPeopleList");
    list.replaceChildren();
    if (!pessoas.length) return void list.append(el("div", { className: "req-people-empty", textContent: "Nenhuma pessoa gerada ainda. Gere na aba Gerar." }));
    for (let i = pessoas.length - 1; i >= 0; i--) {
      const item = pessoas[i];
      if (!showUsed && item.usado) continue;
      if (q && !JSON.stringify(item.dados).toLowerCase().includes(q)) continue;
      const d = item.dados;
      const chosen = String(i) === $("reqRemembered").value && sourceMode() === "remembered";
      const btn = (act, text, cls) => el("button", { type: "button", className: "btn btn-sm " + cls, textContent: text, dataset: { act, index: String(i) } });
      const info = el("div", { className: "req-person-info" },
        el("strong", { textContent: d.nome || d.name || "Sem nome" }),
        el("span", { className: "req-person-badge" + (item.usado ? " is-used" : ""), textContent: item.usado ? "✅ usado" : "⬜ disponível" }),
        d.cpf ? el("span", { className: "req-person-meta", textContent: d.cpf }) : null,
        el("small", { textContent: [d.email || d.cidade, item.dataCriacao && new Date(item.dataCriacao).toLocaleString("pt-BR")].filter(Boolean).join(" · ") }),
      );
      list.append(el("div", { className: "req-person" + (item.usado ? " is-used" : "") + (chosen ? " is-chosen" : "") }, info,
        el("div", { className: "req-person-actions" }, btn("usar", "📤 Usar", "btn-primary"), btn("copiar", "📋", "btn-secondary"), item.usado ? btn("toggle", "↺", "btn-secondary") : null, btn("deletar", "✕", "btn-danger"))));
    }
    if (!list.childElementCount) list.append(el("div", { className: "req-people-empty", textContent: "Nenhuma pessoa para exibir." }));
  }
  async function savePessoas(next) {
    await new Promise((r) => chrome.storage.local.set({ pessoasGeradas: next }, r));
    await loadPessoas();
    renderPeople();
  }
  async function openPeople() {
    await loadPessoas();
    $("reqPeopleFilter").value = "";
    renderPeople();
    $("reqPeopleModal").hidden = false;
    $("reqPeopleFilter").focus();
  }
  const closePeople = () => { $("reqPeopleModal").hidden = true; syncActs(); };

  /** Roda dentro da página (serializado): lista os formulários e os campos de cada um. Não lê senhas nem arquivos. */
  function pageDiscover() {
    const SKIP_TYPES = new Set(["submit", "button", "reset", "image"]);
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, "\\$&"));
    const unique = (id) => document.querySelectorAll("#" + esc(id)).length === 1;

    const labelOf = (el) => {
      const aria = el.getAttribute("aria-label");
      if (aria) return clean(aria);
      if (el.labels && el.labels[0]) return clean(el.labels[0].textContent);
      const by = (el.getAttribute("aria-labelledby") || "").split(/\s+/)
        .map((id) => (id && document.getElementById(id)?.textContent) || "").join(" ");
      return clean(by) || clean(el.placeholder) || clean(el.title);
    };
    const legendOf = (el) => clean(el.closest("fieldset")?.querySelector("legend")?.textContent);

    const pathTo = (el) => {
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
        if (n.id && unique(n.id)) { parts.unshift("#" + esc(n.id)); break; }
        const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [n];
        parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ""));
      }
      return parts.join(" > ");
    };

    const typeOf = (el) =>
      el.tagName === "INPUT" ? (el.type || "text").toLowerCase()
      : el.tagName === "SELECT" ? (el.multiple ? "select-multiple" : "select") : "textarea";

    const collect = (controls) => {
      const groups = new Map();
      for (const el of controls) {
        if (!["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) continue;
        const type = typeOf(el);
        if (SKIP_TYPES.has(type)) continue;
        const key = el.name || el.id;
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, { key, type, byId: !el.name, els: [] });
        groups.get(key).els.push(el);
      }
      return [...groups.values()].slice(0, 300).map((g) => {
        const first = g.els[0];
        const disabled = g.els.every((e) => e.disabled);
        const f = {
          key: g.key, type: g.type, label: "", value: "", multi: false, sends: false,
          disabled, required: g.els.some((e) => e.required), byId: g.byId,
          file: g.type === "file", sensitive: g.type === "password", choices: [],
        };
        if (g.type === "radio" || g.type === "checkbox") {
          const on = g.els.filter((e) => e.checked).map((e) => e.value);
          f.multi = g.type === "checkbox" && g.els.length > 1;
          f.value = f.multi ? on : on[0] || "";
          f.sends = on.length > 0;
          f.choices = g.els.slice(0, 20).map((e) => ({ value: e.value, label: labelOf(e), checked: e.checked }));
          f.label = g.els.length === 1 && g.type === "checkbox" ? labelOf(first) : legendOf(first) || labelOf(first);
        } else if (g.type === "select" || g.type === "select-multiple") {
          f.multi = g.type === "select-multiple";
          f.value = f.multi ? [...first.selectedOptions].map((o) => o.value) : first.value;
          f.sends = f.multi ? f.value.length > 0 : true;
          f.choices = [...first.options].slice(0, 20).map((o) => ({ value: o.value, label: clean(o.textContent), checked: o.selected }));
          f.label = labelOf(first);
        } else if (f.file || f.sensitive) {
          f.label = labelOf(first);
        } else {
          f.multi = g.els.length > 1;
          f.value = f.multi ? g.els.map((e) => e.value) : first.value;
          f.sends = true;
          f.label = labelOf(first);
        }
        f.sends = f.sends && !disabled && !g.byId && !f.file;
        return f;
      });
    };

    const forms = [...document.forms].map((form, index) => {
      let action = location.href;
      try { action = new URL(form.getAttribute("action") || "", location.href).href; } catch { /* mantém a URL da página */ }
      return {
        index,
        label: clean(form.getAttribute("aria-label") || form.id || form.getAttribute("name")) || `Formulário ${index + 1}`,
        action,
        method: (form.getAttribute("method") || "POST").toUpperCase(),
        selector: pathTo(form),
        fields: collect([...form.elements]),
      };
    }).filter((f) => f.fields.length);

    const loose = collect([...document.querySelectorAll("input, select, textarea")].filter((el) => !el.form));
    if (loose.length) forms.push({ index: -1, label: "Campos fora de <form>", action: location.href, method: "POST", selector: "", fields: loose });

    const ids = {};
    for (const el of [...document.querySelectorAll("[id][name]")].slice(0, 1000)) ids[el.id] = el.name;
    return { forms, ids };
  }

  /** Roda dentro da página (serializado): não pode usar nada fora desta função. */
  async function pageWorker(mode, o) {
    const form = document.querySelector(o.selector || "form");
    const toObject = (entries) => {
      const data = {};
      for (const [k, v] of entries) {
        if (typeof v !== "string") continue;
        data[k] = Object.hasOwn(data, k) ? [].concat(data[k], v) : v;
      }
      return data;
    };

    /** Corpo JSON: "nome[]" vira array, "a[b]" vira objeto aninhado (como o PHP/Laravel interpreta). */
    const nest = (entries) => {
      const root = {};
      const isIdx = (t) => t === "" || /^\d+$/.test(t);
      for (const [k, v] of entries) {
        if (typeof v !== "string") continue;
        const m = /^([^[\]]+)((?:\[[^[\]]*\])+)$/.exec(k);
        if (!m) { root[k] = Object.hasOwn(root, k) ? [].concat(root[k], v) : v; continue; }
        const path = [m[1], ...[...m[2].matchAll(/\[([^[\]]*)\]/g)].map((x) => x[1])];
        let node = root;
        path.forEach((seg, i) => {
          let slot = seg;
          if (Array.isArray(node)) slot = seg === "" || !/^\d+$/.test(seg) ? node.length : Number(seg);
          if (i === path.length - 1) { node[slot] = v; return; }
          const cur = node[slot];
          if (typeof cur !== "object" || cur === null) {
            const base = isIdx(path[i + 1]) ? [] : {};
            if (typeof cur === "string" && Array.isArray(base)) base.push(cur);
            node[slot] = base;
          }
          node = node[slot];
        });
      }
      return root;
    };

    /** v34: no corpo JSON, valores tipados (número, booleano, nulo, lista, objeto) seguem o tipo escolhido. */
    const typed = (data) => {
      for (const [k, v] of Object.entries(o.data || {})) {
        if (!/[[\]]/.test(k)) data[k] = v;
        else if (/^[^[\]]+\[\]$/.test(k) && Array.isArray(v)) data[k.slice(0, -2)] = v;
      }
      return data;
    };

    if (mode === "capture") {
      if (!form) throw Error(`Nenhum formulário encontrado com "${o.selector || "form"}". Ajuste em Opções.`);
      const ids = {};
      for (const el of form.querySelectorAll("[id][name]")) ids[el.id] = el.name;
      return {
        url: form.action || location.href,
        method: (form.getAttribute("method") || "POST").toUpperCase(),
        data: toObject(new FormData(form)),
        ids,
      };
    }

    const url = new URL(o.url || form?.action || location.href, location.href);
    if (!["http:", "https:"].includes(url.protocol)) throw Error("Protocolo não permitido.");

    const fd = o.includeForm && form ? new FormData(form) : new FormData();
    for (const [key, val] of Object.entries(o.data)) {
      fd.delete(key);
      for (const v of Array.isArray(val) ? val : [val]) {
        if (v && typeof v === "object" && v.__mapeadorFile === true && typeof v.base64 === "string") {
          const bytes = Uint8Array.from(atob(v.base64), c => c.charCodeAt(0));
          fd.append(key, new File([bytes], String(v.name || "upload.bin"), { type: String(v.type || "application/octet-stream") }));
        } else fd.append(key, v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
      }
    }

    const token =
      o.tokenMode === "manual" ? o.token
      : o.tokenMode === "auto"
        ? fd.get(o.tokenField || "_token") ||
          document.querySelector('meta[name="csrf-token"]')?.content ||
          document.querySelector('input[name="_token"]')?.value || ""
        : "";
    if (token && o.tokenField && o.format !== "json") fd.set(o.tokenField, token);

    const headers = { ...o.headers };
    if (token && o.tokenHeader) headers[o.tokenHeader] = token;
    const entries = [...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `[Arquivo: ${v.name}]`]);
    const method = o.method.toUpperCase();

    if (mode === "preview") {
      const previewBody = o.format === "json" && method !== "GET" && method !== "HEAD" ? typed(nest(entries)) : toObject(entries);
      return {
        url: url.href, method, format: o.format, fields: previewBody,
        headers: { ...headers, ...(token && o.tokenHeader ? { [o.tokenHeader]: "[OCULTO]" } : {}) },
        tokenDetected: !!token,
      };
    }

    let body;
    if (method === "GET" || method === "HEAD") {
      for (const [k, v] of fd.entries()) if (typeof v === "string") url.searchParams.append(k, v);
    } else if (o.format === "json") {
      const data = typed(nest(fd.entries()));
      if (token && o.tokenField) data[o.tokenField] = token;
      body = JSON.stringify(data);
      headers["Content-Type"] = "application/json";
    } else if (o.format === "urlencoded") {
      body = new URLSearchParams();
      for (const [k, v] of fd.entries()) {
        if (typeof v !== "string") throw Error("URL encoded não suporta arquivos.");
        body.append(k, v);
      }
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    } else {
      body = fd;
      delete headers["Content-Type"];
      delete headers["content-type"];
    }

    const start = performance.now();
    const controller = new AbortController();
    window.__mapeadorReqAbortController = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException("Tempo limite excedido", "TimeoutError")), Math.max(100, Math.min(120000, Number(o.timeoutMs) || 30000)));
    let response;
    try { response = await fetch(url.href, { method, headers, body, credentials: o.credentials ? "include" : "same-origin", signal: controller.signal }); }
    finally { clearTimeout(timeout); if (window.__mapeadorReqAbortController === controller) delete window.__mapeadorReqAbortController; }
    const full = await response.text();
    const durationMs = Math.round(performance.now() - start);
    // v41: corpo limitado a 2 MB; o tamanho real continua sendo informado.
    const LIMIT = 2000000;
    const truncated = full.length > LIMIT;
    const raw = truncated ? full.slice(0, LIMIT) : full;
    let parsed;
    try { parsed = truncated ? raw : JSON.parse(raw); } catch { parsed = raw; }
    return {
      ok: response.ok, status: response.status, statusText: response.statusText, url: response.url,
      durationMs, response: parsed, rawText: raw, truncated,
      sizeBytes: new TextEncoder().encode(full).length,
      redirected: response.redirected,
      responseHeaders: Object.fromEntries(response.headers.entries()),
      requestFields: entries, requestHeaders: headers, requestUrl: url.href, requestMethod: method,
      requestBody: typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : null,
    };
  }


  // ---------- Execução na página ----------
  async function execInPage(func, args) {
    const tab = await currentTab();
    if (!tab?.id) throw Error("Nenhuma aba ativa.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func, args });
    if (result?.error) throw Error(result.error.message);
    return result?.result;
  }
  const runInPage = (mode, opts) => execInPage(pageWorker, [mode, opts]);

  // ---------- Opções, avisos e validação ----------
  /** Opções de envio. Com resolve=true, {{variáveis}} da URL, dos valores, do token e dos headers já vêm resolvidas. */
  function options({ resolve = true } = {}) {
    const values = resolve ? varValues() : null;
    const rv = (t) => (resolve ? resolveVars(t, values) : t);
    const headers = {};
    for (const [k, v] of Object.entries(parseObject("reqHeaders", "Headers"))) headers[k] = rv(String(v));
    const bearer = rv($("reqBearer").value.trim());
    if (bearer) headers.Authorization = /^bearer\s/i.test(bearer) ? bearer : `Bearer ${bearer}`;
    return {
      url: rv($("reqUrl").value.trim()),
      method: $("reqMethod").value,
      selector: $("reqSelector").value.trim() || "form",
      format: $("reqFormat").value,
      data: { ...fieldsToObject(true, resolve), ...(window.__mapeadorRequestFiles || {}) },
      headers,
      tokenMode: $("reqTokenMode").value,
      token: rv($("reqToken").value),
      tokenField: $("reqTokenField").value.trim(),
      tokenHeader: $("reqTokenHeader").value.trim(),
      includeForm: $("reqIncludeForm").checked,
      credentials: $("reqCredentials").checked,
      timeoutMs: Math.max(100, Math.min(120000, Number($("reqAdvancedTimeout")?.value) || 30000)),
    };
  }

  function currentIssues({ live = false } = {}) {
    let headersError = "";
    try { parseObject("reqHeaders", "Headers"); } catch (e) { headersError = e.message; }
    const issues = C.validateRequest({ url: $("reqUrl").value, fields, headersError, values: varValues(), vars: VARS });
    return live ? issues.filter((i) => !/^Informe a URL/.test(i.msg)) : issues;
  }

  function refreshIssues() {
    const box = $("reqIssues");
    const issues = currentIssues({ live: true });
    box.replaceChildren();
    box.hidden = !issues.length;
    if (!issues.length) return issues;
    const errors = issues.filter((i) => i.level === "error").length;
    box.className = "req-issues" + (errors ? " has-error" : "");
    box.append(
      el("strong", { textContent: `${errors ? "⛔" : "⚠"} ${issues.length} ${issues.length > 1 ? "avisos" : "aviso"}` }),
      el("span", { className: "req-issues-hint", textContent: errors ? "há algo que impede o envio" : "não impedem o envio — você pode estar testando dados inválidos" }),
    );
    const ul = el("ul");
    for (const i of issues.slice(0, 5)) ul.append(el("li", { className: i.level, textContent: i.msg }));
    if (issues.length > 5) ul.append(el("li", { className: "more", textContent: `…e mais ${issues.length - 5}` }));
    box.append(ul);
    return issues;
  }

  // ---------- Resposta ----------
  function assertionContext(result) {
    const headers = {};
    for (const [k, v] of Object.entries(result?.responseHeaders || {})) headers[k.toLowerCase()] = v;
    return {
      status: result?.status || 0,
      ms: result?.durationMs || 0,
      body: result ? result.response : null,
      text: result ? result.rawText ?? stringify(result.response) : "",
      headers,
    };
  }

  const chip = (id, text, cls = "") => { const n = $(id); n.hidden = !text; n.textContent = text || ""; n.className = ("req-chip " + cls).trim(); };

  function renderResponse() {
    const r = last?.result;
    const status = $("reqStatus");
    if (!last) {
      status.className = "req-status"; status.textContent = "";
      chip("reqTime", ""); chip("reqSize", ""); chip("reqVerdict", "");
      $("reqRespHeaderCount").textContent = "0"; $("reqRespTestCount").textContent = "0";
      renderBody(); renderRespHeaders(); renderSent(); renderTests();
      return;
    }
    if (r) {
      status.className = "req-status is-" + C.statusClass(r.status);
      status.textContent = `${r.status} ${r.statusText || ""}`.trim();
      chip("reqTime", `${r.durationMs} ms`);
      chip("reqSize", C.formatBytes(r.sizeBytes ?? (r.rawText || "").length) + (r.truncated ? " · truncado" : ""));
    } else {
      status.className = "req-status is-error";
      status.textContent = "sem resposta";
      chip("reqTime", last.ms ? `${last.ms} ms` : "");
      chip("reqSize", "");
    }
    const list = last.assertions || [];
    if (list.length) {
      const passed = list.filter((x) => x.pass).length;
      chip("reqVerdict", passed === list.length ? `✅ ${passed}/${list.length} verificações` : `❌ ${list.length - passed} de ${list.length} falharam`, passed === list.length ? "is-pass" : "is-fail is-link");
    } else chip("reqVerdict", "");
    renderBody(); renderRespHeaders(); renderSent(); renderTests();
  }

  const isPretty = () => $("reqViewPretty").classList.contains("active");
  function bodyText() {
    if (!last) return "";
    if (!last.result) return "Erro: " + (last.error || "falha ao enviar.");
    if (isPretty() && last.body !== null && typeof last.body === "object") return JSON.stringify(last.body, null, 2);
    return last.text || "";
  }
  function renderBody() {
    const out = $("reqOutput");
    out.classList.toggle("nowrap", !$("reqWrap").checked);
    if (!last) { out.textContent = "Envie a requisição para ver a resposta aqui."; return; }
    const LIMIT = 300000;
    let text = bodyText();
    const total = text.length;
    if (total > LIMIT) text = text.slice(0, LIMIT);
    out.replaceChildren();
    if (!text.trim()) { out.textContent = "(corpo vazio)"; return; }
    if (isPretty() && last.result && last.body !== null && typeof last.body === "object" && text.length <= 100000) {
      for (const tk of C.tokenizeJson(text)) out.append(tk.t === "p" ? document.createTextNode(tk.s) : el("span", { className: "tk-" + tk.t, textContent: tk.s }));
    } else out.textContent = text;
    if (total > LIMIT) out.append(el("div", { className: "req-cut", textContent: `… exibindo os primeiros ${LIMIT.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} caracteres. Use Copiar ou Baixar para o conteúdo completo.` }));
  }

  function renderRespHeaders() {
    const box = $("reqRespHeaders");
    box.replaceChildren();
    const entries = Object.entries(last?.result?.responseHeaders || {});
    $("reqRespHeaderCount").textContent = entries.length;
    if (!entries.length) return void box.append(el("p", { className: "req-empty", textContent: last ? "A resposta não trouxe headers legíveis." : "Os headers aparecem depois do envio." }));
    for (const [k, v] of entries) box.append(el("div", { className: "req-resp-row" }, el("strong", { textContent: k }), el("span", { textContent: v })));
    box.append(el("p", { className: "req-hint text-muted", textContent: "O navegador não expõe Set-Cookie nem alguns headers protegidos." }));
  }

  function sentText() {
    const r = last?.result;
    const o = last?.o;
    if (!o) return "Nada enviado ainda. Use “Pré-visualizar” para ver o que seria enviado.";
    if (!r) return `${o.method} ${o.url}\n\nA requisição não recebeu resposta.\n${last.error ? "Motivo: " + last.error : ""}`;
    const lines = [`${r.requestMethod || o.method} ${r.requestUrl || o.url}`, `Formato: ${o.format}`, "", "Headers"];
    for (const [k, v] of Object.entries(r.requestHeaders || {})) lines.push(`  ${k}: ${mask(k, v)}`);
    lines.push("", "Corpo");
    if (r.requestBody != null) {
      let body = r.requestBody;
      try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* texto */ }
      lines.push(body);
    } else if ((r.requestFields || []).length) for (const [k, v] of r.requestFields) lines.push(`  ${k} = ${mask(k, v)}`);
    else lines.push("  (sem corpo)");
    return lines.join("\n");
  }
  const renderSent = () => { $("reqSentOut").textContent = sentText(); };

  function renderTests() {
    const box = $("reqTestResults");
    box.replaceChildren();
    const list = last?.assertions || [];
    $("reqRespTestCount").textContent = list.length;
    if (!list.length) {
      return void box.append(el("p", { className: "req-empty", textContent: asserts.some((a) => a.enabled) ? "Envie a requisição para executar as verificações." : "Nenhuma verificação definida. Crie em Validação (ou use uma verificação rápida)." }));
    }
    const passed = list.filter((x) => x.pass).length;
    box.append(el("div", { className: "req-test-summary " + (passed === list.length ? "ok" : "bad"), textContent: `${passed} de ${list.length} verificações passaram` }));
    for (const r of list) {
      const detail = [r.pass ? "" : r.message, r.actual !== "" && r.actual !== undefined ? `obtido: ${r.actual}` : ""].filter(Boolean).join(" · ");
      box.append(el("div", { className: "req-test-row " + (r.pass ? "ok" : "bad") },
        el("span", { className: "req-test-icon", textContent: r.pass ? "✓" : "✗" }),
        el("div", {}, el("strong", { textContent: r.label }), detail ? el("small", { textContent: detail }) : null)));
    }
  }

  function showRespPanel(name) {
    document.querySelectorAll("#reqResponse [data-resp-panel]").forEach((b) => b.classList.toggle("active", b.dataset.respPanel === name));
    document.querySelectorAll("#reqResponse [data-resp-content]").forEach((p) => (p.hidden = p.dataset.respContent !== name));
  }

  // ---------- Pré-visualizar ----------
  async function previewRequest() {
    try {
      const o = options();
      const p = await runInPage("preview", o);
      const lines = [
        "PRÉ-VISUALIZAÇÃO — nada foi enviado", "",
        `${p.method} ${p.url}`, `Formato: ${p.format}`, `Token CSRF: ${p.tokenDetected ? "detectado" : "não encontrado"}`, "", "Headers",
        ...Object.entries(p.headers || {}).map(([k, v]) => `  ${k}: ${mask(k, v)}`), "",
        p.method === "GET" || p.method === "HEAD" ? "Campos (vão na URL como query string)" : "Corpo", JSON.stringify(p.fields, null, 2),
      ];
      $("reqSentOut").textContent = lines.join("\n");
      showRespPanel("sent");
      $("reqResponse").scrollIntoView({ block: "nearest" });
      notify("Pré-visualização pronta em Resposta › Enviado.", "info");
    } catch (e) { fail(e); }
  }

  // ---------- Relatório e histórico ----------
  function reportEvent(o, result, extraDetail = {}, assertions = []) {
    const saved = $("reqSavedSelect");
    const safeRequestHeaders = { ...(result?.requestHeaders || o.headers || {}) };
    const secretHeaderKey = String(window.__mapeadorSecretHeaderKey || "");
    if (secretHeaderKey && Object.hasOwn(safeRequestHeaders, secretHeaderKey)) safeRequestHeaders[secretHeaderKey] = "[REDACTED]";
    const expectedFailure = !!$("reqExpectedFailure")?.checked;
    const verdict = $("reqAutoVerdict").checked ? (expectedFailure ? (result && !result.ok && (!assertions.length || assertions.every((a) => a.pass)) ? "pass" : "fail") : assertions.length ? (assertions.every((a) => a.pass) ? "pass" : "fail") : undefined) : undefined;
    window.dispatchEvent(new CustomEvent("mapeador:request-result", {
      detail: {
        method: o.method, url: o.url, format: o.format,
        profile: saved.value ? saved.selectedOptions[0]?.textContent : $("reqActiveMapping").textContent.replace(/^Nenhum$/, ""),
        at: new Date().toISOString(),
        status: result?.status || 0, ok: !!result?.ok, durationMs: result?.durationMs || 0,
        error: result ? (result.ok ? "" : "HTTP " + result.status) : "",
        requestFields: result?.requestFields || Object.entries(o.data || {}),
        requestHeaders: safeRequestHeaders,
        requestUrl: result?.requestUrl, response: result?.response ?? null,
        responseHeaders: result?.responseHeaders, statusText: result?.statusText,
        verdict, expectedFailure,
        assertions: assertions.map(({ label, pass, actual, expected, message }) => ({ label, pass, actual, expected, message })),
        ...extraDetail,
      },
    }));
  }

  async function recordHistory(o, r, assertions) {
    const list = await store.get(HISTORY_KEY, []);
    let safeHistoryUrl = o.url;
    const secretQueryKey = String(window.__mapeadorSecretQueryKey || "");
    try { const u = new URL(o.url); for (const key of [...u.searchParams.keys()]) if (/token|secret|password|api.?key|auth|session|csrf|key/i.test(key) || (secretQueryKey && key.toLowerCase() === secretQueryKey.toLowerCase())) u.searchParams.set(key, "[REDACTED]"); safeHistoryUrl = u.href; } catch {}
    const safeSnapshot = C.redactSensitive(snapshot());
    const secretHeaderKey = String(window.__mapeadorSecretHeaderKey || "");
    if (safeSnapshot.reqHeaders) { try { const h = C.redactSensitive(JSON.parse(safeSnapshot.reqHeaders)); if (secretHeaderKey && Object.hasOwn(h, secretHeaderKey)) h[secretHeaderKey] = "[REDACTED]"; safeSnapshot.reqHeaders = JSON.stringify(h); } catch {} }
    if (safeSnapshot.reqData) { try { safeSnapshot.reqData = JSON.stringify(C.redactSensitive(JSON.parse(safeSnapshot.reqData))); } catch {} }
    if (safeSnapshot.reqUrl) { try { const u = new URL(safeSnapshot.reqUrl); for (const key of [...u.searchParams.keys()]) if (/token|secret|password|api.?key|auth|session|csrf|key/i.test(key) || (secretQueryKey && key.toLowerCase() === secretQueryKey.toLowerCase())) u.searchParams.set(key, "[REDACTED]"); safeSnapshot.reqUrl = u.href; } catch {} }
    list.unshift({
      url: safeHistoryUrl, method: o.method, status: r.status || 0, statusText: r.statusText || "", ms: r.durationMs || 0,
      at: new Date().toISOString(), format: o.format, snap: safeSnapshot,
      checks: assertions.length ? { passed: assertions.filter((a) => a.pass).length, total: assertions.length } : null,
    });
    await store.set(HISTORY_KEY, list.slice(0, HISTORY_MAX));
  }

  async function renderHistory() {
    const list = await store.get(HISTORY_KEY, []);
    const box = $("reqHistoryList");
    box.replaceChildren();
    if (!list.length) return void box.append(el("p", { className: "req-empty", textContent: "Nenhuma requisição enviada ainda." }));
    for (const item of list) {
      const path = item.url.replace(/^https?:\/\/[^/]+/, "") || item.url;
      const b = el("button", { type: "button", className: "req-history-item" },
        el("span", { className: "req-hist-method", textContent: item.method }),
        el("span", { className: "req-status is-" + C.statusClass(item.status), textContent: item.status || "ERRO" }),
        el("span", { className: "req-hist-url", textContent: path }),
        item.checks ? el("span", { className: "req-chip " + (item.checks.passed === item.checks.total ? "is-pass" : "is-fail"), textContent: `${item.checks.passed}/${item.checks.total}` }) : null,
        el("small", { textContent: `${item.ms} ms · ${new Date(item.at).toLocaleString("pt-BR")}${item.snap ? " · clique para reabrir" : ""}` }));
      b.title = item.url;
      b.onclick = () => {
        if (item.snap) {
          if (fields.length && !confirm("Substituir a requisição atual pela do histórico?")) return;
          $("reqSavedSelect").value = "";
          applySnapshot(item.snap);
          return notify("Requisição reaberta do histórico (campos, headers e verificações). Confira antes de enviar.", "ok");
        }
        $("reqUrl").value = item.url;
        $("reqMethod").value = item.method;
        $("reqFormat").value = item.format;
        paintMethod();
        saveDraft();
        notify("Destino restaurado do histórico (registro antigo, sem os campos). Confira antes de enviar.", "info");
      };
      box.append(b);
    }
  }

  // ---------- Enviar ----------
  async function send() {
    const btn = $("reqSend");
    let o, started;
    try {
      const issues = currentIssues();
      const blocking = issues.find((i) => i.level === "error");
      if (blocking) throw Error(blocking.msg);
      o = options();
      const dest = new URL(o.url);
      const warns = issues.filter((i) => i.level === "warn");
      if ($("reqConfirm").checked && o.method !== "GET") {
        const msg = `Enviar ${o.method} para ${dest.origin}${dest.pathname}?\nA operação pode alterar dados no servidor.` +
          (warns.length ? `\n\n⚠ ${warns.length} aviso(s):\n• ${warns.slice(0, 5).map((w) => w.msg).join("\n• ")}` : "");
        if (!confirm(msg)) return;
      }
      btn.disabled = true;
      started = performance.now();
      last = null;
      notify("Enviando…");
      $("reqStatus").className = "req-status"; $("reqStatus").textContent = "enviando…";
      $("reqOutput").textContent = "Enviando…";
      const result = await runInPage("send", o);
      const assertions = C.runAssertions(asserts, assertionContext(result));
      last = { result, o, body: result.response, text: result.rawText ?? stringify(result.response), assertions, error: "" };
      window.__mapeadorRequestLast = { status: result.status, durationMs: result.durationMs, response: result.response, rawText: result.rawText, assertions };
      renderResponse();
      const failed = assertions.filter((a) => !a.pass).length;
      notify(
        `${result.status} ${result.statusText || ""} · ${result.durationMs} ms` + (assertions.length ? (failed ? ` · ❌ ${failed} verificação(ões) falhou(aram)` : ` · ✅ ${assertions.length} verificação(ões) ok`) : ""),
        failed ? "error" : result.ok ? "ok" : "warn",
      );
      await recordHistory(o, result, assertions);
      reportEvent(o, result, {}, assertions);
    } catch (e) {
      if (started && o) {
        const ms = Math.round(performance.now() - started);
        const assertions = C.runAssertions(asserts, assertionContext(null));
        last = { result: null, o, body: null, text: "", assertions, error: e.message, ms };
        window.__mapeadorRequestLast = { status: 0, durationMs: ms, response: null, rawText: e.message, error: e.message, assertions };
        renderResponse();
        notify("Erro: " + e.message, "error");
        reportEvent(o, null, { durationMs: ms, error: e.message }, assertions);
      } else {
        $("reqStatus").textContent = ""; $("reqStatus").className = "req-status";
        if (!last) $("reqOutput").textContent = "Envie a requisição para ver a resposta aqui.";
        const failedOptions = o || { url: $("reqUrl").value.trim(), method: $("reqMethod").value, format: $("reqFormat").value, headers: {}, data: {} };
        const failedAssertions = C.runAssertions(asserts, assertionContext(null));
        last = { result: null, o: failedOptions, body: null, text: "", assertions: failedAssertions, error: e.message, ms: 0 };
        window.__mapeadorRequestLast = { status: 0, durationMs: 0, response: null, rawText: e.message, error: e.message, assertions: failedAssertions };
        renderResponse();
        reportEvent(failedOptions, null, { durationMs: 0, error: e.message }, failedAssertions);
        fail(e);
      }
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Campos da página / mapeamento / JSON: seletor de campos ----------
  let add = { src: "mapping", items: [], forms: [], token: 0 };
  const ADD_HINT = {
    mapping: "Campos do mapeamento selecionado em Início — como na aba Mapear, você escolhe quais entram na requisição.",
    data: "Chaves do JSON em uso (perfil, JSON carregado ou pessoa lembrada). Útil para APIs.",
    page: "Campos dos formulários da aba atual, inclusive desmarcados, desabilitados e fora de <form>. Senhas têm o valor não lido.",
    manual: "Digite o nome do campo. Use nome[] para listas.",
  };
  const preview = (v) => {
    const text = Array.isArray(v) ? v.join(", ") : String(v ?? "");
    return text.length > 60 ? text.slice(0, 57) + "…" : text;
  };
  const addForm = () => add.forms[Number($("reqPickerForm").value)];

  async function buildItems(src) {
    if (src === "mapping") {
      const found = await findMapping();
      if (!found) throw Error("Nenhum mapeamento ativo. Escolha um em Início.");
      const profile = found.profile;
      const values = mappedValues(profile, sourceData(profile), savedTestKeys(profile));
      const seen = new Set();
      const items = [];
      for (const [key, cfg] of Object.entries(profile.mapping || {})) {
        if (!cfg) continue;
        const name = toFieldName(key);
        if (seen.has(name)) continue;
        seen.add(name);
        const has = Object.hasOwn(values, name);
        items.push({
          key: name, value: has ? values[name] : "", multi: Array.isArray(values[name]), hasValue: has,
          notes: [cfg.type === "json" ? `JSON: ${cfg.value}` : "valor fixo", !has && "sem valor agora"],
          selected: !findField(name), fromMapping: true,
        });
      }
      if (!items.length) throw Error("Este mapeamento não tem campos.");
      return items;
    }
    if (src === "data") {
      const profile = (await findMapping())?.profile;
      const data = sourceMode() === "remembered" ? sourceData(profile) : profile ? sourceData(profile) : {};
      const keys = Object.keys(data);
      if (!keys.length) throw Error("Não há JSON em uso. Escolha um mapeamento com dados em Início ou uma pessoa em 🧠 Lembrados.");
      return keys.map((k) => ({
        key: k, value: data[k], multi: Array.isArray(data[k]), hasValue: !isEmpty(data[k]),
        notes: [Array.isArray(data[k]) ? "lista" : typeof data[k] === "object" && data[k] ? "objeto" : typeof data[k]],
        selected: !findField(k),
      }));
    }
    // página
    const res = await execInPage(pageDiscover, []);
    pageIds = { ...pageIds, ...(res.ids || {}) };
    add.forms = res.forms || [];
    if (!add.forms.length) throw Error("Nenhum campo de formulário encontrado na aba atual. Se a página usa iframe, abra o painel dentro dele.");
    const select = $("reqPickerForm");
    select.replaceChildren(...add.forms.map((f, i) => new Option(`${f.label} (${f.fields.length})`, String(i))));
    const wanted = $("reqSelector").value.trim();
    const match = add.forms.findIndex((f) => f.selector && f.selector === wanted);
    select.value = String(match >= 0 ? match : 0);
    return pageItems();
  }
  function pageItems() {
    const form = addForm();
    return (form?.fields || []).map((f) => ({
      ...f, hasValue: !isEmpty(f.value),
      notes: [
        f.type, f.label, f.byId && "sem name (usa o id)", f.disabled && "desabilitado",
        !f.sends && !f.disabled && !f.byId && !f.file && !f.sensitive && "sem valor marcado",
        f.required && "obrigatório", f.file && "arquivo: não suportado aqui", f.sensitive && "valor não é lido",
      ],
      selected: !f.file && !f.byId && !findField(f.key),
    }));
  }

  const addMatches = (i, q) => !q || `${i.key} ${(i.notes || []).filter(Boolean).join(" ")}`.toLowerCase().includes(q);
  function updatePickerCount() {
    const manual = add.src === "manual";
    const total = add.items.filter((i) => !i.file).length;
    const chosen = add.items.filter((i) => i.selected && !i.file).length;
    $("reqPickerCount").textContent = `${chosen} de ${total} selecionados`;
    $("reqPickerAdd").disabled = manual ? !$("reqManualKey").value.trim() : !chosen;
    $("reqPickerAdd").textContent = manual ? "Adicionar campo" : chosen ? `Adicionar ${chosen} selecionado${chosen > 1 ? "s" : ""}` : "Adicionar selecionados";
  }
  function renderPickerList() {
    const list = $("reqPickerList");
    list.replaceChildren();
    const q = $("reqPickerFilter").value.trim().toLowerCase();
    for (const item of add.items) {
      if (!addMatches(item, q)) continue;
      const exists = !!findField(item.key);
      const row = el("label", { className: "req-pick-row" + (item.file ? " is-off" : "") });
      const check = el("input", { type: "checkbox", checked: !!item.selected, disabled: !!item.file });
      check.setAttribute("aria-label", "Adicionar " + item.key);
      check.onchange = () => { item.selected = check.checked; updatePickerCount(); };
      const main = el("span", { className: "req-pick-main" }, el("strong", { textContent: item.key }));
      const notes = [...(item.notes || []), exists && "✓ já na lista"].filter(Boolean);
      if (notes.length) main.append(el("small", { textContent: notes.join(" · ") }));
      const shown = isEmpty(item.value) ? "" : preview(item.value);
      if (shown) main.append(el("code", { className: "req-pick-val", textContent: shown }));
      row.append(check, main);
      list.append(row);
    }
    if (!list.childElementCount) list.append(el("p", { className: "req-empty", textContent: add.items.length ? "Nenhum campo corresponde ao filtro." : "Nada para listar." }));
    updatePickerCount();
  }

  async function setAddSource(src) {
    const token = ++add.token;
    add.src = src;
    document.querySelectorAll("[data-add-src]").forEach((b) => b.classList.toggle("active", b.dataset.addSrc === src));
    $("reqAddHint").textContent = ADD_HINT[src];
    $("reqPickerForm").hidden = src !== "page";
    $("reqAddList").hidden = src === "manual";
    $("reqAddManual").hidden = src !== "manual";
    $("reqPickerFilter").value = "";
    add.items = [];
    if (src === "manual") { updatePickerCount(); setTimeout(() => $("reqManualKey").focus(), 150); return; }
    $("reqPickerList").replaceChildren(el("p", { className: "req-empty", textContent: "Carregando…" }));
    $("reqPickerAdd").disabled = true;
    try {
      const items = await buildItems(src);
      if (token !== add.token) return;
      add.items = items;
    } catch (e) {
      if (token !== add.token) return;
      add.items = [];
      renderPickerList();
      $("reqPickerList").replaceChildren(el("p", { className: "req-empty", textContent: e.message }));
      return;
    }
    renderPickerList();
  }
  function openAdd(src = "mapping") {
    bsModal("reqAddModal").show();
    return setAddSource(src);
  }

  function addPicked() {
    const manual = add.src === "manual";
    let chosen;
    let withValues = $("reqPickerValues").checked;
    if (manual) {
      const key = $("reqManualKey").value.trim();
      if (!key) return;
      chosen = [{ key, value: $("reqManualValue").value, multi: false, hasValue: true }];
      withValues = true;
    } else chosen = add.items.filter((i) => i.selected && !i.file);
    if (!chosen.length) return notify("Marque ao menos um campo para adicionar.", "warn");

    let created = 0, already = 0, mapped = 0;
    for (const p of chosen) {
      const value = asList(p.key, withValues ? p.value : p.multi ? [] : "");
      const text = stringify(value);
      const current = findField(p.key);
      if (current) {
        already++;
        if (!current.value.trim() && text && text !== "[]") current.value = text; // não sobrescreve o que você já digitou
        continue;
      }
      const f = makeField(p.key, value, { enabled: add.src === "page" && withValues ? p.sends : true, required: !!p.required, ...(p.multi ? { type: "list" } : {}) });
      f.typeAuto = !p.multi;
      if (p.fromMapping && withValues && p.hasValue) { f.mapped = true; mapped++; }
      fields.push(f);
      created++;
    }

    const notes = [];
    const form = add.src === "page" ? addForm() : null;
    if (form && form.index >= 0 && form.selector) {
      $("reqSelector").value = form.selector;
      notes.push("“Formulário da página” (Opções) ajustado");
    }
    if (form && form.index >= 0 && !$("reqUrl").value.trim()) {
      $("reqUrl").value = form.action;
      $("reqMethod").value = METHODS.includes(form.method) ? form.method : "POST";
      paintMethod();
      notes.push("destino preenchido com a ação do formulário");
    }
    syncRaw();
    renderFields();
    bsModal("reqAddModal").hide();
    notify(
      `${created} campo(s) adicionado(s)` + (mapped ? `, ${mapped} com valor do mapeamento` : "") +
      (already ? `; ${already} já estavam na lista (valores preenchidos só se estavam vazios)` : "") + "." +
      (notes.length ? " " + notes.join("; ") + "." : ""),
      created ? "ok" : "info",
    );
  }

  // ---------- Montar a partir da página (substitui os campos) ----------
  async function capture() {
    if (fields.length && !confirm(`Substituir os ${fields.length} campo(s) atuais pelos do formulário da página?\n\nDica: para manter os campos e só trazer os dados digitados na página, use “🌐 Página”.`)) return;
    const btn = $("reqCapture");
    btn.disabled = true;
    try {
      const v = await runInPage("capture", { selector: $("reqSelector").value });
      pageIds = v.ids || {};
      $("reqUrl").value = v.url;
      $("reqMethod").value = METHODS.includes(v.method) ? v.method : "POST";
      paintMethod();
      setFields(v.data);
      const mapped = await applyProfile({ prompt: false, quiet: true });
      const total = Object.keys(v.data).length;
      notify(mapped > 0
        ? `Pronto: ${total} campos da página, ${mapped} preenchidos pelo mapeamento. Revise e clique em Enviar.`
        : `Pronto: ${total} campos capturados. Revise e clique em Enviar.`, "ok");
    } catch (e) {
      fail(e);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Requisições salvas ----------
  const readSaved = () => store.get(SAVED_KEY, {});
  const nameTaken = (saved, name, exceptId) =>
    Object.entries(saved).some(([k, v]) => k !== exceptId && v.name.toLowerCase() === name.toLowerCase());

  async function refreshSaved(selected = "") {
    const saved = await readSaved();
    const select = $("reqSavedSelect");
    select.replaceChildren(new Option("Rascunho atual", ""));
    const groups = new Map();
    for (const [id, p] of Object.entries(saved).sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      const folder = String(p.folder || "Sem pasta");
      if (!groups.has(folder)) { const group = document.createElement("optgroup"); group.label = folder; groups.set(folder, group); select.append(group); }
      groups.get(folder).append(new Option(p.name, id));
    }
    select.value = saved[selected] ? selected : "";
  }
  window.addEventListener("mapeador:request-folders-changed", () => refreshSaved($("reqSavedSelect").value));

  async function saveRequest(asCopy) {
    try {
      parseObject("reqHeaders", "Headers");
      const saved = await readSaved();
      const currentId = asCopy ? "" : $("reqSavedSelect").value;
      const suggestion = currentId ? saved[currentId].name : asCopy ? "" : $("reqUrl").value.replace(/^https?:\/\/[^/]+/, "") || "";
      const name = prompt("Nome da requisição:", suggestion)?.trim();
      if (!name) return;
      if (nameTaken(saved, name, currentId)) return notify("Já existe uma requisição com esse nome.", "warn");
      const id = currentId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      saved[id] = { name, values: snapshot(), updatedAt: new Date().toISOString(), ...(saved[id]?.folder ? { folder: saved[id].folder } : {}) };
      await store.set(SAVED_KEY, saved);
      await refreshSaved(id);
      notify("Requisição salva: " + name, "ok");
    } catch (e) { notify("Erro ao salvar: " + e.message, "error"); }
  }

  async function openSaved() {
    const id = $("reqSavedSelect").value;
    if (!id) return;
    const p = (await readSaved())[id];
    if (!p) return;
    applySnapshot(p.values);
    notify(`Requisição “${p.name}” aberta. Clique em Enviar quando quiser.`, "ok");
  }

  async function renameSaved() {
    const id = $("reqSavedSelect").value;
    const saved = await readSaved();
    if (!saved[id]) return notify("Abra uma requisição salva para renomear.", "warn");
    const name = prompt("Novo nome:", saved[id].name)?.trim();
    if (!name) return;
    if (nameTaken(saved, name, id)) return notify("Nome já utilizado.", "warn");
    saved[id].name = name;
    await store.set(SAVED_KEY, saved);
    await refreshSaved(id);
    notify("Requisição renomeada.", "ok");
  }

  async function deleteSaved() {
    const id = $("reqSavedSelect").value;
    const saved = await readSaved();
    if (!saved[id]) return notify("Abra uma requisição salva para excluir.", "warn");
    if (!confirm(`Excluir a requisição salva “${saved[id].name}”?`)) return;
    delete saved[id];
    await store.set(SAVED_KEY, saved);
    await refreshSaved();
    notify("Requisição excluída. O rascunho atual foi mantido.", "ok");
  }

  function copyCurl() {
    try {
      const o = options();
      const q = (x) => "'" + String(x).replace(/'/g, "'\\''") + "'";
      const parts = ["curl", "-X", o.method, q(o.url)];
      for (const [k, v] of Object.entries(o.headers)) parts.push("-H", q(`${k}: ${v}`));
      if (o.format === "json") parts.push("-H", q("Content-Type: application/json"), "--data-raw", q(JSON.stringify(Object.fromEntries(Object.entries(o.data).map(([k, v]) => [isListKey(k) ? k.replace(/\[\]$/, "") : k, asList(k, v)])))));
      else for (const [k, v] of Object.entries(o.data)) parts.push(o.format === "form" ? "-F" : "--data-urlencode", q(`${k}=${stringify(v)}`));
      navigator.clipboard.writeText(parts.join(" "));
      notify("cURL copiado (sem cookies, token automático ou demais campos do formulário).", "ok");
    } catch (e) { fail(e); }
  }

  function downloadResponse() {
    if (!last) return notify("Nenhuma resposta para baixar. Envie uma requisição primeiro.", "warn");
    const isJson = last.body !== null && typeof last.body === "object";
    const text = last.result ? (isJson ? JSON.stringify(last.body, null, 2) : last.text) : "Erro: " + last.error;
    const ext = isJson ? "json" : /<html|<!doctype/i.test(text) ? "html" : "txt";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = el("a", { href: url, download: `resposta-${last.result?.status || "erro"}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  const closeMenu = () => document.querySelector("#tabRequest .req-menu")?.removeAttribute("open");
  function paintMethod() { $("reqMethod").dataset.m = $("reqMethod").value; }

  // ---------- Ligações ----------
  $("reqCapture").onclick = capture;
  $("reqAddFields").onclick = () => openAdd("mapping");
  $("reqExtraAdd").onclick = () => openAdd(extra?.source === "page" ? "page" : "mapping");
  $("reqSend").onclick = send;
  $("reqUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") $("reqSend").click(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && $("tabRequest").classList.contains("active")) { e.preventDefault(); $("reqSend").click(); }
  });
  $("reqMethod").addEventListener("change", paintMethod);
  $("reqPreview").onclick = previewRequest;
  $("reqCopyResponse").onclick = () => {
    if (!last) return notify("Nenhuma resposta para copiar. Envie uma requisição primeiro.", "warn");
    const text = last.result ? (last.body !== null && typeof last.body === "object" ? JSON.stringify(last.body, null, 2) : last.text) : "Erro: " + last.error;
    navigator.clipboard.writeText(text).then(() => notify("Resposta copiada.", "ok"), (e) => fail(e));
  };
  $("reqDownloadResponse").onclick = downloadResponse;
  $("reqVerdict").onclick = () => showRespPanel("tests");
  $("reqViewPretty").onclick = () => { $("reqViewPretty").classList.add("active"); $("reqViewRaw").classList.remove("active"); renderBody(); };
  $("reqViewRaw").onclick = () => { $("reqViewRaw").classList.add("active"); $("reqViewPretty").classList.remove("active"); renderBody(); };
  $("reqWrap").onchange = renderBody;
  document.querySelectorAll("#reqResponse [data-resp-panel]").forEach((b) => (b.onclick = () => showRespPanel(b.dataset.respPanel)));

  // seletor de campos
  $("reqAddClose").onclick = $("reqAddCancel").onclick = () => bsModal("reqAddModal").hide();
  document.querySelectorAll("[data-add-src]").forEach((b) => (b.onclick = () => setAddSource(b.dataset.addSrc)));
  $("reqPickerForm").onchange = () => { add.items = pageItems(); renderPickerList(); };
  $("reqPickerFilter").addEventListener("input", renderPickerList);
  $("reqPickerAdd").onclick = addPicked;
  $("reqManualKey").addEventListener("input", updatePickerCount);
  for (const id of ["reqManualKey", "reqManualValue"]) $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") addPicked(); });
  $("reqPickerAll").onclick = () => { const q = $("reqPickerFilter").value.trim().toLowerCase(); add.items.forEach((i) => { if (!i.file && addMatches(i, q)) i.selected = true; }); renderPickerList(); };
  $("reqPickerNone").onclick = () => { const q = $("reqPickerFilter").value.trim().toLowerCase(); add.items.forEach((i) => { if (addMatches(i, q)) i.selected = false; }); renderPickerList(); };
  $("reqPickerMissing").onclick = () => { add.items.forEach((i) => { i.selected = !i.file && !i.byId && !findField(i.key); }); renderPickerList(); };

  // modal de teste
  const closeTest = () => bsModal("reqTestModal").hide();
  $("reqTestModal").addEventListener("hidden.bs.modal", () => finishTest({ proceed: false }));
  $("reqTestClose").onclick = $("reqTestCancel").onclick = closeTest;
  $("reqTestFilter").addEventListener("input", renderTestList);
  $("reqTestAll").onclick = () => { Object.keys(testCtx.data).forEach((k) => testCtx.sel.add(k)); renderTestList(); };
  $("reqTestNone").onclick = () => { testCtx.sel.clear(); renderTestList(); };
  $("reqTestOnlyUsed").onclick = () => { const used = usedDataKeys(testCtx.profile); testCtx.sel = new Set(Object.keys(testCtx.data).filter((k) => used.has(k))); renderTestList(); };
  $("reqTestSave").onclick = () => {
    const n = testCtx.sel.size;
    commitTest(n > 0);
    finishTest({ proceed: false });
    closeTest();
    renderTestState(testCtx.profile);
    notify(`💾 Preferências de teste salvas (${n} chave${n === 1 ? "" : "s"} selecionada${n === 1 ? "" : "s"}).`, "ok");
  };
  $("reqTestConfirm").onclick = () => {
    commitTest(testCtx.sel.size > 0);
    const profile = testCtx.profile;
    finishTest({ proceed: true });
    closeTest();
    renderTestState(profile);
  };
  $("reqTestOff").onclick = () => {
    const { profile } = testCtx;
    const st = testSettings(profile);
    testApp()?.saveTestSettings?.(profile, { enabled: false, fields: st.fields, remember: $("reqTestRemember").checked });
    finishTest({ proceed: true });
    closeTest();
    renderTestState(profile);
    notify("Modo teste desativado para este mapeamento (vale também no Início).", "info");
  };

  // origem dos valores
  document.querySelectorAll(".req-act[data-source]").forEach((b) => (b.onclick = async () => {
    const mode = b.dataset.source;
    if (mode === "remembered") return openPeople();
    setSource(mode);
    if (mode === "page") await fillFromPage();
    else await applyProfile({ prompt: true });
  }));
  $("reqTestBtn").onclick = async () => {
    const found = await findMapping();
    if (!found) return notify("Escolha um mapeamento em Início: o modo teste usa as chaves do JSON dele.", "warn");
    if (sourceMode() === "page") setSource("profile");
    const data = sourceData(found.profile);
    if (!Object.keys(data).length) return notify("Este mapeamento não tem dados. Use ＋ Adicionar dados em Início (ou escolha uma pessoa em 🧠 Lembrados).", "warn");
    await applyProfile({ force: true });
  };
  $("reqApplyMapping").onclick = reapply;

  $("reqPeopleList").onclick = async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const i = Number(b.dataset.index);
    const all = await store.get("pessoasGeradas", []);
    const item = all[i];
    if (!item) return;
    if (b.dataset.act === "usar") {
      item.usado = true;
      await new Promise((r) => chrome.storage.local.set({ pessoasGeradas: all }, r));
      await loadPessoas();
      $("reqRemembered").value = String(i);
      $("reqPeopleModal").hidden = true;
      setSource("remembered");
      await applyProfile({ prompt: true });
    } else if (b.dataset.act === "copiar") {
      try { await navigator.clipboard.writeText(JSON.stringify(item.dados, null, 2)); notify(`📋 JSON de “${item.dados.nome || "Sem nome"}” copiado.`, "ok"); }
      catch { notify("Não foi possível copiar.", "error"); }
    } else if (b.dataset.act === "toggle") {
      item.usado = !item.usado; await savePessoas(all);
    } else if (b.dataset.act === "deletar") {
      if (!confirm("Remover esta pessoa da lista?")) return;
      all.splice(i, 1); await savePessoas(all);
    }
  };
  $("reqPeopleShowUsed").onchange = renderPeople;
  $("reqPeopleFilter").oninput = renderPeople;
  $("reqPeopleClose").onclick = closePeople;
  $("reqPeopleModal").onclick = (e) => { if (e.target.id === "reqPeopleModal") closePeople(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("reqPeopleModal").hidden) closePeople(); });
  chrome.storage.onChanged?.addListener((changes, area) => { if (area === "local" && changes.pessoasGeradas) loadPessoas(); });

  // campos
  $("reqAddRow").onclick = () => {
    fields.push(makeField("", ""));
    syncRaw();
    renderFields();
    const rows = $("reqFieldRows").querySelectorAll('[aria-label="Nome do campo"]');
    rows[rows.length - 1]?.focus();
  };
  $("reqFieldFilter").addEventListener("input", renderFields);
  $("reqImportJson").onclick = () => {
    const v = prompt("Cole um objeto JSON para substituir os campos:");
    if (v === null) return;
    try {
      const obj = JSON.parse(v);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw Error("informe um objeto JSON");
      setFields(obj);
      notify(`${Object.keys(obj).length} campo(s) criado(s) a partir do JSON.`, "ok");
    } catch (e) { notify("JSON inválido: " + e.message, "error"); }
  };
  $("reqToggleRaw").onclick = () => {
    const raw = $("reqRawEditor");
    if (raw.hidden) {
      raw.hidden = false; $("reqFieldEditor").hidden = true; $("reqToggleRaw").textContent = "Ver como lista";
    } else {
      try { setFields(parseObject("reqData", "Campos"), { keepFlags: true }); } catch (e) { return fail(e); }
      raw.hidden = true; $("reqFieldEditor").hidden = false; $("reqToggleRaw").textContent = "Ver como JSON";
    }
  };
  $("reqData").addEventListener("change", () => {
    try { setFields(parseObject("reqData", "Campos"), { keepFlags: true }); } catch (e) { fail(e); }
  });

  // headers
  for (const [k, v] of HEADER_PRESETS) $("reqHeaderPreset").append(new Option(v ? `${k}: ${v}` : k, k));
  $("reqHeaderPreset").onchange = () => {
    const sel = $("reqHeaderPreset");
    const preset = HEADER_PRESETS.find(([k]) => k === sel.value);
    sel.value = "";
    if (!preset) return;
    const existing = headerRows.find((h) => h.key.toLowerCase() === preset[0].toLowerCase());
    if (existing) { existing.enabled = true; existing.value = existing.value || preset[1]; } else headerRows.push({ key: preset[0], value: preset[1], enabled: true });
    renderHeaders();
  };
  $("reqHeaderAdd").onclick = () => {
    headerRows.push({ key: "", value: "", enabled: true });
    renderHeaders();
    const rows = $("reqHeaderRows").querySelectorAll('[aria-label="Nome do header"]');
    rows[rows.length - 1]?.focus();
  };
  $("reqHeaders").addEventListener("change", () => {
    try { headersFromJson($("reqHeaders").value); renderHeaders(); } catch (e) { notify("Headers: JSON inválido (" + e.message + ").", "error"); }
  });

  // verificações
  for (const p of C.PRESETS) $("reqAssertPreset").append(new Option(p.label, p.id));
  $("reqAssertPreset").onchange = () => {
    const sel = $("reqAssertPreset");
    const preset = C.PRESETS.find((p) => p.id === sel.value);
    sel.value = "";
    if (!preset) return;
    let arg;
    if (preset.ask) { arg = prompt(preset.ask)?.trim(); if (!arg) return; }
    asserts.push(...preset.make(arg).map((a) => newAssert(a)));
    renderAsserts();
    syncAsserts();
  };
  $("reqAssertAdd").onclick = () => { asserts.push(newAssert({ expected: "200" })); renderAsserts(); syncAsserts(); };

  // requisições salvas, histórico, sub-abas
  $("reqSavedSelect").onchange = openSaved;
  $("reqSaveProfile").onclick = () => saveRequest(false);
  $("reqDuplicate").onclick = () => { closeMenu(); saveRequest(true); };
  $("reqRenameProfile").onclick = () => { closeMenu(); renameSaved(); };
  $("reqDeleteProfile").onclick = () => { closeMenu(); deleteSaved(); };
  $("reqCopyCurl").onclick = () => { closeMenu(); copyCurl(); };
  $("reqNew").onclick = () => {
    closeMenu();
    if (fields.length && !confirm("Começar uma nova requisição? Os campos atuais serão removidos (headers, token, opções e verificações são mantidos).")) return;
    $("reqUrl").value = "";
    $("reqSavedSelect").value = "";
    last = null;
    extra = null;
    renderExtra();
    renderResponse();
    setFields({});
    refreshIssues();
    notify("Nova requisição. Use ＋ Adicionar campos ou ⚡ Montar da página para começar.", "info");
  };
  $("reqClear").onclick = () => $("reqNew").click();
  $("reqClearHistory").onclick = async () => {
    if (!confirm("Apagar histórico local de requisições?")) return;
    await chrome.storage.local.remove(HISTORY_KEY);
    renderHistory();
  };

  document.querySelectorAll("#tabRequest .req-subtab[data-req-panel]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#tabRequest .req-subtab[data-req-panel]").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll("#tabRequest .req-panel").forEach((p) => (p.hidden = p.dataset.reqContent !== btn.dataset.reqPanel));
      if (btn.dataset.reqPanel === "history") renderHistory();
    };
  });

  for (const id of FORM_FIELDS) {
    if (id === "reqData" || id === "reqHeaders") continue;
    $(id)?.addEventListener("change", saveDraft);
    if ($(id)?.tagName === "INPUT" && $(id).type !== "checkbox") $(id).addEventListener("input", saveDraft);
  }
  $("reqUrl").addEventListener("input", scheduleIssues);
  document.querySelector('[data-tab="tabRequest"]')?.addEventListener("click", refreshMappingInfo);
  window.addEventListener("mapeador:active-profile", () => { refreshMappingInfo(); });

  // ---------- Inicialização ----------
  paintMethod();
  loadPessoas();
  store.get(DRAFT_KEY, {}).then((draft) => { applySnapshot(draft); paintMethod(); refreshIssues(); });
  refreshSaved().catch(fail);
  refreshMappingInfo();
  renderResponse();
})();
