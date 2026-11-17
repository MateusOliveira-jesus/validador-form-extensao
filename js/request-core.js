/*
 * Núcleo da aba Requisição (v41): funções puras, sem DOM e sem chrome.*.
 * Exposto em window.ReqCore (e module.exports para os testes em tests/request-core.test.js).
 *
 *  - tipos de valor (detectar / converter)
 *  - caminho em JSON (a.b[0].c) para as verificações
 *  - verificações da resposta (status, tempo, JSON, corpo, header)
 *  - validação antes de enviar (avisos que NÃO bloqueiam: você pode estar testando dados inválidos)
 *  - variáveis {{ }} resolvidas com o motor MapeadorVars
 *  - realce de JSON e formatação de tamanho
 */
(function (root) {
  "use strict";

  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const stringify = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const short = (v, n = 120) => { const t = stringify(v).replace(/\s+/g, " "); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

  // ---------------------------------------------------------------- tipos de valor
  const TYPES = [
    ["string", "Texto"], ["number", "Número"], ["boolean", "Booleano"],
    ["list", "Lista"], ["json", "Objeto JSON"], ["null", "Nulo"],
  ];

  /** Chave no estilo PHP/Laravel ("c_comunicacao[]"): o valor é sempre uma lista. */
  const isListKey = (key) => /\[\]$/.test(String(key).trim());
  function asList(key, value) {
    if (!isListKey(key) || Array.isArray(value)) return value;
    return value === "" || value === null || value === undefined ? [] : [value];
  }

  function detectType(raw) {
    if (raw === null) return "null";
    if (Array.isArray(raw)) return "list";
    if (typeof raw === "number") return "number";
    if (typeof raw === "boolean") return "boolean";
    if (typeof raw === "object") return "json";
    const t = String(raw ?? "").trim();
    if (!t) return "string";
    if (/^(true|false)$/i.test(t)) return "boolean";
    if (t.length < 16 && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(t)) return "number"; // "0123" (CPF, CEP) continua texto
    if (/^[[{]/.test(t)) {
      try { const v = JSON.parse(t); if (v && typeof v === "object") return Array.isArray(v) ? "list" : "json"; } catch { /* texto */ }
    }
    return "string";
  }

  function convertValue(text, type) {
    const t = String(text ?? "");
    switch (type) {
      case "number": { const n = Number(t.trim().replace(",", ".")); return t.trim() && Number.isFinite(n) ? n : t; }
      case "boolean": return /^(true|1|sim|s|on|yes|verdadeiro)$/i.test(t.trim());
      case "null": return null;
      case "list": {
        try { const v = JSON.parse(t); if (Array.isArray(v)) return v; } catch { /* separado por vírgula */ }
        return t.trim() ? t.split(",").map((x) => x.trim()).filter(Boolean) : [];
      }
      case "json": try { return JSON.parse(t); } catch { return t; }
      default: return t;
    }
  }

  /** Mensagem quando o texto não serve para o tipo escolhido (senão ""). */
  function typeProblem(text, type) {
    const t = String(text ?? "").trim();
    if (type === "number" && t && !Number.isFinite(Number(t.replace(",", ".")))) return "não é um número válido";
    if (type === "json") { try { const v = JSON.parse(t); if (!v || typeof v !== "object" || Array.isArray(v)) return "não é um objeto JSON"; } catch { return "JSON inválido"; } }
    if (type === "list" && /^\[/.test(t)) { try { if (!Array.isArray(JSON.parse(t))) return "lista inválida"; } catch { return "JSON da lista inválido"; } }
    return "";
  }

  // ---------------------------------------------------------------- caminho em JSON
  /** "data.items[0].id", "$.errors['cpf']", "errors.cpf.0" → ["data","items","0","id"] */
  function parsePath(path) {
    let p = String(path ?? "").trim().replace(/^\$\.?/, "");
    const out = [];
    const re = /\[\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(-?\d+))\s*\]|([^.[\]]+)/g;
    let m;
    while ((m = re.exec(p))) out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
    return out;
  }

  function getPath(obj, path) {
    const parts = parsePath(path);
    if (!parts.length) return { found: obj !== undefined, value: obj };
    let cur = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined || typeof cur !== "object") return { found: false, value: undefined };
      if (Array.isArray(cur)) {
        const i = Number(part);
        if (part === "length") { cur = cur.length; continue; }
        if (!Number.isInteger(i)) return { found: false, value: undefined };
        cur = cur[i < 0 ? cur.length + i : i];
        if (cur === undefined) return { found: false, value: undefined };
      } else {
        if (!Object.hasOwn(cur, part)) return { found: false, value: undefined };
        cur = cur[part];
      }
    }
    return { found: true, value: cur };
  }

  // ---------------------------------------------------------------- verificações da resposta
  const OPS = {
    eq: { label: "é igual a", needs: true },
    ne: { label: "é diferente de", needs: true },
    in: { label: "é um de (vírgulas)", needs: true },
    class: { label: "está na faixa (2xx, 4xx…)", needs: true },
    lt: { label: "é menor que", needs: true },
    gt: { label: "é maior que", needs: true },
    contains: { label: "contém", needs: true },
    notcontains: { label: "não contém", needs: true },
    regex: { label: "bate com a regex", needs: true },
    exists: { label: "existe", needs: false },
    notexists: { label: "não existe", needs: false },
    type: { label: "é do tipo", needs: true },
    len: { label: "tem tamanho", needs: true },
    empty: { label: "está vazio", needs: false },
    notempty: { label: "não está vazio", needs: false },
  };

  const ASSERT_TYPES = {
    status: { label: "Status HTTP", target: "", ops: ["eq", "ne", "in", "class"], expected: "422" },
    time: { label: "Tempo (ms)", target: "", ops: ["lt", "gt"], expected: "2000" },
    json: { label: "Campo do JSON", target: "caminho (ex.: errors.cpf)", ops: ["exists", "notexists", "eq", "ne", "contains", "notcontains", "regex", "type", "len", "gt", "lt", "empty", "notempty"], expected: "" },
    body: { label: "Corpo (texto)", target: "", ops: ["contains", "notcontains", "regex", "notempty"], expected: "" },
    header: { label: "Header da resposta", target: "nome (ex.: content-type)", ops: ["exists", "eq", "contains", "regex"], expected: "" },
  };

  const jsType = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  const isEmptyValue = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && v && !Array.isArray(v) && !Object.keys(v).length);
  const sameValue = (actual, expected) => {
    const a = typeof actual === "object" && actual !== null ? JSON.stringify(actual) : String(actual);
    const e = String(expected).trim();
    if (a === e) return true;
    const na = Number(a), ne = Number(e);
    return a.trim() !== "" && e !== "" && Number.isFinite(na) && Number.isFinite(ne) && na === ne;
  };
  const hay = (v) => norm(typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));
  const hasText = (v, needle) => {
    const n = norm(needle);
    if (Array.isArray(v)) return v.some((x) => hay(x).includes(n));
    return hay(v).includes(n);
  };
  function makeRegex(src) {
    const m = /^\/(.+)\/([a-z]*)$/.exec(String(src).trim());
    return m ? new RegExp(m[1], m[2]) : new RegExp(String(src), "i");
  }

  /** Avalia uma verificação. ctx = { status, ms, body (já convertido de JSON), text, headers (nomes em minúsculas) } */
  function evaluate(a, ctx) {
    const op = a.op, exp = String(a.expected ?? "");
    const fail = (actual, message) => ({ pass: false, actual: short(actual), message });
    const ok = (actual, message = "") => ({ pass: true, actual: short(actual), message });
    const need = OPS[op]?.needs && exp.trim() === "";
    if (need) return fail("", "valor esperado não informado");

    try {
      switch (a.type) {
        case "status": {
          const s = ctx.status;
          if (!s) return fail("sem resposta", "a requisição não recebeu resposta HTTP");
          if (op === "eq") return sameValue(s, exp) ? ok(s) : fail(s, `esperado ${exp}`);
          if (op === "ne") return !sameValue(s, exp) ? ok(s) : fail(s, `não deveria ser ${exp}`);
          if (op === "in") { const list = exp.split(",").map((x) => x.trim()).filter(Boolean); return list.some((x) => sameValue(s, x)) ? ok(s) : fail(s, `esperado um de ${list.join(", ")}`); }
          if (op === "class") {
            const classes = exp.split(",").map((x) => x.trim()[0]).filter((c) => /\d/.test(c));
            return classes.includes(String(Math.floor(s / 100))) ? ok(s) : fail(s, `esperado ${exp}`);
          }
          break;
        }
        case "time": {
          const n = Number(exp.replace(",", "."));
          if (!Number.isFinite(n)) return fail(ctx.ms, "limite inválido");
          return (op === "lt" ? ctx.ms < n : ctx.ms > n) ? ok(`${ctx.ms} ms`) : fail(`${ctx.ms} ms`, `esperado ${op === "lt" ? "<" : ">"} ${n} ms`);
        }
        case "header": {
          const name = String(a.target || "").trim().toLowerCase();
          if (!name) return fail("", "informe o nome do header");
          const v = ctx.headers?.[name];
          if (op === "exists") return v !== undefined ? ok(v) : fail("(ausente)", "header não veio na resposta");
          if (v === undefined) return fail("(ausente)", "header não veio na resposta");
          if (op === "eq") return sameValue(v, exp) ? ok(v) : fail(v, `esperado ${exp}`);
          if (op === "contains") return hasText(v, exp) ? ok(v) : fail(v, `não contém “${exp}”`);
          if (op === "regex") return makeRegex(exp).test(v) ? ok(v) : fail(v, "regex não bateu");
          break;
        }
        case "body": {
          const text = ctx.text ?? stringify(ctx.body);
          if (op === "contains") return hasText(text, exp) ? ok(`${text.length} caracteres`) : fail(short(text, 80), `não contém “${exp}”`);
          if (op === "notcontains") return !hasText(text, exp) ? ok(`${text.length} caracteres`) : fail(short(text, 80), `contém “${exp}”`);
          if (op === "regex") return makeRegex(exp).test(text) ? ok("") : fail(short(text, 80), "regex não bateu");
          if (op === "notempty") return text.trim() ? ok(`${text.length} caracteres`) : fail("(vazio)", "corpo vazio");
          break;
        }
        case "json": {
          if (ctx.body === null || typeof ctx.body !== "object") {
            if (op === "notexists") return ok("(resposta não é JSON)");
            return fail(short(ctx.text ?? ctx.body, 60) || "(vazio)", "a resposta não é um JSON");
          }
          const { found, value } = getPath(ctx.body, a.target);
          if (op === "exists") return found ? ok(value) : fail("(não existe)", `caminho “${a.target}” não encontrado`);
          if (op === "notexists") return !found ? ok("(não existe)") : fail(value, "o caminho existe");
          if (!found) return fail("(não existe)", `caminho “${a.target}” não encontrado`);
          if (op === "eq") return sameValue(value, exp) ? ok(value) : fail(value, `esperado ${exp}`);
          if (op === "ne") return !sameValue(value, exp) ? ok(value) : fail(value, `não deveria ser ${exp}`);
          if (op === "contains") return hasText(value, exp) ? ok(value) : fail(value, `não contém “${exp}”`);
          if (op === "notcontains") return !hasText(value, exp) ? ok(value) : fail(value, `contém “${exp}”`);
          if (op === "regex") return makeRegex(exp).test(stringify(value)) ? ok(value) : fail(value, "regex não bateu");
          if (op === "type") return jsType(value) === exp.trim().toLowerCase() ? ok(jsType(value)) : fail(jsType(value), `esperado ${exp}`);
          if (op === "len") { const len = Array.isArray(value) || typeof value === "string" ? value.length : value && typeof value === "object" ? Object.keys(value).length : NaN; return len === Number(exp) ? ok(len) : fail(Number.isNaN(len) ? "(sem tamanho)" : len, `esperado ${exp}`); }
          if (op === "gt" || op === "lt") { const n = Number(value), e = Number(exp.replace(",", ".")); if (!Number.isFinite(n) || !Number.isFinite(e)) return fail(value, "valor não numérico"); return (op === "gt" ? n > e : n < e) ? ok(value) : fail(value, `esperado ${op === "gt" ? ">" : "<"} ${exp}`); }
          if (op === "empty") return isEmptyValue(value) ? ok(value) : fail(value, "não está vazio");
          if (op === "notempty") return !isEmptyValue(value) ? ok(value) : fail(value, "está vazio");
          break;
        }
        default:
      }
    } catch (e) {
      return fail("", "verificação inválida: " + e.message);
    }
    return fail("", "operador não suportado");
  }

  /** Texto legível de uma verificação: "JSON errors.cpf existe". */
  function describe(a) {
    const t = ASSERT_TYPES[a.type];
    const op = OPS[a.op];
    if (!t || !op) return "Verificação";
    const target = a.type === "json" || a.type === "header" ? ` ${a.target || "…"}` : "";
    const exp = op.needs ? ` ${a.expected === "" || a.expected == null ? "…" : a.expected}` : "";
    return `${t.label}${target} ${op.label}${exp}`;
  }

  function runAssertions(list, ctx) {
    return (list || []).filter((a) => a && a.enabled !== false).map((a) => {
      const r = evaluate(a, ctx);
      return { id: a.id, label: describe(a), pass: r.pass, actual: r.actual, expected: OPS[a.op]?.needs ? String(a.expected ?? "") : "", message: r.message };
    });
  }

  /** Atalhos prontos (aba Validação). Cada preset devolve verificações novas. */
  const PRESETS = [
    { id: "ok", label: "Sucesso (HTTP 2xx)", make: () => [{ type: "status", op: "class", expected: "2" }] },
    { id: "created", label: "Criado (HTTP 201)", make: () => [{ type: "status", op: "eq", expected: "201" }] },
    { id: "invalid", label: "Validação falhou (HTTP 422)", make: () => [{ type: "status", op: "eq", expected: "422" }] },
    { id: "client", label: "Erro do cliente (HTTP 4xx)", make: () => [{ type: "status", op: "class", expected: "4" }] },
    { id: "unauth", label: "Sem permissão (HTTP 401 ou 403)", make: () => [{ type: "status", op: "in", expected: "401,403" }] },
    { id: "json", label: "Resposta é JSON", make: () => [{ type: "header", target: "content-type", op: "contains", expected: "json" }] },
    { id: "fast", label: "Responde em até 2 s", make: () => [{ type: "time", op: "lt", expected: "2000" }] },
    { id: "errorField", label: "Erro no campo… (422 + errors.campo)", ask: "Nome do campo com erro (ex.: cpf):", make: (name) => [{ type: "status", op: "eq", expected: "422" }, { type: "json", target: `errors.${name}`, op: "exists", expected: "" }] },
    { id: "msg", label: "Mensagem contém…", ask: "Texto esperado na resposta:", make: (text) => [{ type: "body", op: "contains", expected: text }] },
  ];

  // ---------------------------------------------------------------- variáveis {{ }}
  const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const hasVars = (text) => typeof text === "string" && text.includes("{{");

  function resolveTemplate(text, values, vars) {
    if (!hasVars(text) || !vars) return text;
    return text.replace(VAR_RE, (full, inner) => { try { return vars.resolve(inner, values || {}); } catch { return full; } });
  }

  /** Nomes de variáveis (não automáticas) usadas no texto que não têm valor nos dados. */
  function missingVars(text, values, vars) {
    if (!hasVars(text) || !vars) return [];
    const keys = Object.keys(values || {}).map(norm);
    const missing = new Set();
    for (const m of String(text).matchAll(VAR_RE)) {
      let list = [];
      try { list = vars.variablesIn(m[1]) || []; } catch { continue; }
      for (const v of list) {
        if (v.repeat || vars.isBuiltin(v.name)) continue;
        if (!keys.includes(norm(v.name))) missing.add(v.name);
      }
    }
    return [...missing];
  }

  // ---------------------------------------------------------------- validação antes de enviar
  /**
   * Devolve avisos; só "error" impede o envio (URL/headers impossíveis de usar).
   * Valores inválidos são só "warn": você pode estar testando justamente a validação do servidor.
   */
  function validateRequest({ url, fields, headersError, values, vars }) {
    const issues = [];
    const add = (level, msg, field) => issues.push({ level, msg, field });
    const u = String(url ?? "").trim();
    if (!u) add("error", "Informe a URL de destino.");
    else if (!hasVars(u)) { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) add("error", "A URL precisa começar com http:// ou https://."); } catch { add("error", "URL inválida."); } }
    if (headersError) add("error", headersError);
    for (const name of missingVars(u, values, vars)) add("warn", `Variável {{${name}}} na URL sem valor.`);

    const seen = new Map();
    for (const f of fields || []) {
      const key = String(f.key ?? "").trim();
      if (!f.enabled) { if (f.required && key) add("warn", `“${key}” é obrigatório, mas está desativado.`, key); continue; }
      if (!key) { if (String(f.value ?? "").trim()) add("warn", "Há um campo com valor e sem nome — ele será ignorado."); continue; }
      if (seen.has(key) && !isListKey(key)) add("warn", `Nome duplicado: “${key}” — vale o último.`, key);
      seen.set(key, true);
      const text = String(f.value ?? "");
      if (f.required && f.type !== "null" && (!text.trim() || text.trim() === "[]")) add("warn", `“${key}” é obrigatório e está vazio.`, key);
      const prob = typeProblem(text, f.type);
      if (prob) add("warn", `“${key}” ${prob} (tipo ${(TYPES.find((t) => t[0] === f.type) || [, f.type])[1]}).`, key);
      for (const name of missingVars(text, values, vars)) add("warn", `“${key}” usa {{${name}}}, que não tem valor nos dados.`, key);
    }
    return issues;
  }

  // ---------------------------------------------------------------- apresentação
  /** Quebra um JSON já formatado em pedaços para colorir (sem innerHTML). */
  function tokenizeJson(text) {
    const out = [];
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: "p", s: text.slice(last, m.index) });
      if (m[1] !== undefined) {
        if (m[2]) { out.push({ t: "key", s: m[1] }); out.push({ t: "p", s: m[2] }); } else out.push({ t: "str", s: m[1] });
      } else if (m[3] !== undefined) out.push({ t: "bool", s: m[0] });
      else if (m[0] === "null") out.push({ t: "null", s: m[0] });
      else out.push({ t: "num", s: m[0] });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ t: "p", s: text.slice(last) });
    return out;
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  /** ok (2xx) · redirect (3xx) · client (4xx) · server (5xx) · error (sem resposta) */
  function statusClass(status) {
    const s = Number(status) || 0;
    if (s >= 200 && s < 300) return "ok";
    if (s >= 300 && s < 400) return "redirect";
    if (s >= 400 && s < 500) return "client";
    if (s >= 500) return "server";
    return "error";
  }


  // ---------- ferramentas puras para execução em lote e validação avançada
  function parseBatchInput(input, format = "auto") {
    const text = String(input ?? "").replace(/^\uFEFF/, "").trim();
    if (!text) return [];
    const mode = format === "auto" ? (/^[\[{]/.test(text) ? "json" : "csv") : format;
    if (mode === "json") {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [parsed];
      if (!rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) throw new Error("JSON deve conter objetos ou uma lista de objetos.");
      return rows.map((r) => ({ ...r }));
    }
    // Detecta vírgula, ponto e vírgula ou tabulação pelo cabeçalho, respeitando aspas.
    let delimiter = ",", best = -1;
    for (const candidate of [",", ";", "\t"]) {
      let count = 0, quoted = false;
      for (let i = 0; i < text.length && text[i] !== "\n" && text[i] !== "\r"; i++) {
        if (text[i] === '"' && quoted && text[i + 1] === '"') i++;
        else if (text[i] === '"') quoted = !quoted;
        else if (!quoted && text[i] === candidate) count++;
      }
      if (count > best) { best = count; delimiter = candidate; }
    }
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === delimiter) { row.push(cell); cell = ""; }
      else if (!quoted && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); if (row.some((v) => v !== "")) rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (quoted) throw new Error("CSV contém aspas não fechadas.");
    row.push(cell); if (row.some((v) => v !== "")) rows.push(row);
    if (!rows.length) return [];
    const headers = rows.shift().map((h) => h.trim());
    if (headers.some((h) => !h)) throw new Error("CSV contém coluna sem nome.");
    if (new Set(headers).size !== headers.length) throw new Error("CSV contém cabeçalhos duplicados.");
    return rows.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));
  }

  function negativeCases(value, kinds = ["empty", "spaces", "long", "wrongType", "special"], options = {}) {
    const v = value, out = [], add = (kind, val) => out.push({ kind, value: val });
    const maxLength = Math.max(1, Math.min(100000, Number(options.maxLength) || 1001));
    if (kinds.includes("empty")) add("empty", "");
    if (kinds.includes("spaces")) add("spaces", "   ");
    if (kinds.includes("long")) add("long", String(v ?? "x").repeat(Math.max(1, Math.ceil(maxLength / Math.max(1, String(v ?? "x").length)))));
    if (kinds.includes("wrongType")) add("wrongType", typeof v === "number" ? "texto" : { unexpected: true });
    if (kinds.includes("special")) add("special", "<>&'\"\\/;--");
    if (kinds.includes("numericBounds")) {
      const min = Number.isFinite(Number(options.minimum)) ? Number(options.minimum) : 0;
      const max = Number.isFinite(Number(options.maximum)) ? Number(options.maximum) : Number.MAX_SAFE_INTEGER;
      add("belowMinimum", min - 1); add("aboveMaximum", max + 1);
    }
    return out;
  }

  function validateJsonSchema(value, schema, path = "$") {
    const errors = [], fail = (p, message) => errors.push({ path: p, message });
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [{ path, message: "Schema inválido." }];
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
    const typeMatches = (type) => type === actual || (type === "number" && actual === "integer");
    if (schema.type && !(Array.isArray(schema.type) ? schema.type.some(typeMatches) : typeMatches(schema.type))) fail(path, `tipo esperado: ${[].concat(schema.type).join(" | ")}; obtido: ${actual}`);
    if (schema.enum && !schema.enum.some(x => JSON.stringify(x) === JSON.stringify(value))) fail(path, "valor fora do enum");
    if (Object.hasOwn(schema, "const") && JSON.stringify(schema.const) !== JSON.stringify(value)) fail(path, "valor diferente de const");
    if (Array.isArray(schema.allOf)) for (const sub of schema.allOf) errors.push(...validateJsonSchema(value, sub, path));
    if (Array.isArray(schema.anyOf) && !schema.anyOf.some(sub => validateJsonSchema(value, sub, path).length === 0)) fail(path, "não corresponde a nenhuma alternativa anyOf");
    if (Array.isArray(schema.oneOf)) { const matches = schema.oneOf.filter(sub => validateJsonSchema(value, sub, path).length === 0).length; if (matches !== 1) fail(path, `oneOf exige exatamente uma alternativa válida; obtidas ${matches}`); }
    if (schema.not && validateJsonSchema(value, schema.not, path).length === 0) fail(path, "corresponde ao schema proibido (not)");
    if (typeof value === "string") {
      if (schema.minLength != null && value.length < schema.minLength) fail(path, `mínimo de ${schema.minLength} caracteres`);
      if (schema.maxLength != null && value.length > schema.maxLength) fail(path, `máximo de ${schema.maxLength} caracteres`);
      if (schema.pattern) { try { if (!(new RegExp(schema.pattern)).test(value)) fail(path, "não corresponde ao pattern"); } catch { fail(path, "pattern inválido no schema"); } }
      if (schema.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(path, "e-mail inválido");
      if (schema.format === "date-time" && !/^\d{4}-\d\d-\d\dT/.test(value) || schema.format === "date-time" && !Number.isFinite(Date.parse(value))) fail(path, "date-time inválido");
      if (schema.format === "uri") { try { new URL(value); } catch { fail(path, "URI inválida"); } }
    }
    if (typeof value === "number") {
      if (schema.minimum != null && value < schema.minimum) fail(path, `mínimo: ${schema.minimum}`);
      if (schema.maximum != null && value > schema.maximum) fail(path, `máximo: ${schema.maximum}`);
      if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) fail(path, `deve ser maior que ${schema.exclusiveMinimum}`);
      if (schema.exclusiveMaximum != null && value >= schema.exclusiveMaximum) fail(path, `deve ser menor que ${schema.exclusiveMaximum}`);
      if (schema.multipleOf != null && schema.multipleOf > 0 && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-10) fail(path, `deve ser múltiplo de ${schema.multipleOf}`);
    }
    if (Array.isArray(value)) {
      if (schema.minItems != null && value.length < schema.minItems) fail(path, `mínimo de ${schema.minItems} itens`);
      if (schema.maxItems != null && value.length > schema.maxItems) fail(path, `máximo de ${schema.maxItems} itens`);
      if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) fail(path, "itens duplicados");
      if (schema.items) value.forEach((v, i) => errors.push(...validateJsonSchema(v, schema.items, `${path}[${i}]`)));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const props = schema.properties || {};
      for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "propriedade obrigatória ausente");
      for (const [key, sub] of Object.entries(props)) if (Object.hasOwn(value, key)) errors.push(...validateJsonSchema(value[key], sub, `${path}.${key}`));
      if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(props, key)) fail(`${path}.${key}`, "propriedade adicional não permitida");
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") for (const key of Object.keys(value)) if (!Object.hasOwn(props, key)) errors.push(...validateJsonSchema(value[key], schema.additionalProperties, `${path}.${key}`));
      if (schema.minProperties != null && Object.keys(value).length < schema.minProperties) fail(path, `mínimo de ${schema.minProperties} propriedades`);
      if (schema.maxProperties != null && Object.keys(value).length > schema.maxProperties) fail(path, `máximo de ${schema.maxProperties} propriedades`);
    }
    return errors;
  }

  function jsonDiff(expected, actual, path = "$", out = []) {
    if (Object.is(expected, actual)) return out;
    const eo = expected && typeof expected === "object", ao = actual && typeof actual === "object";
    if (eo && ao && Array.isArray(expected) === Array.isArray(actual)) {
      const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
      for (const key of keys) {
        const p = Array.isArray(expected) ? `${path}[${key}]` : `${path}.${key}`;
        if (!Object.hasOwn(expected, key)) out.push({ path: p, expected: "<ausente>", actual: actual[key] });
        else if (!Object.hasOwn(actual, key)) out.push({ path: p, expected: expected[key], actual: "<ausente>" });
        else jsonDiff(expected[key], actual[key], p, out);
      }
    } else out.push({ path, expected, actual });
    return out;
  }

  function redactSensitive(value) {
    const sensitive = /(?:authorization|auth|bearer|cookie|token|password|passwd|secret|api[-_]?key|csrf)/i;
    if (Array.isArray(value)) return value.map(redactSensitive);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sensitive.test(k) ? "[REDACTED]" : redactSensitive(v)]));
    return value;
  }

  const api = {
    TYPES, OPS, ASSERT_TYPES, PRESETS,
    norm, stringify, short,
    isListKey, asList, detectType, convertValue, typeProblem,
    parsePath, getPath, evaluate, describe, runAssertions,
    hasVars, resolveTemplate, missingVars, validateRequest,
    tokenizeJson, formatBytes, statusClass,
    parseBatchInput, negativeCases, validateJsonSchema, jsonDiff, redactSensitive,
  };
  root.ReqCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
