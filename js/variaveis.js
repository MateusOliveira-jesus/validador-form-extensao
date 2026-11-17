// =====================================================================
// v32 — Motor de variáveis {{ }}: cálculos, funções, datas, horas,
// condições e conversões/formatação por filtros encadeados ( | ).
// Sem eval. Exposto em window.MapeadorVars (e module.exports p/ testes).
// =====================================================================
(function (root) {
  "use strict";

  const pad2 = (n) => String(n).padStart(2, "0");
  const DAY = 86400000;
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const norm = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // ---------- datas: trabalhamos com "dias desde 1970" em UTC (sem fuso/horário de verão) ----------
  const today = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
  const ymd = (days) => { const d = new Date(days * DAY); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCDay()]; };
  const fromYmd = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
  const fmtDateBR = (days) => { const [y, m, d] = ymd(days); return `${pad2(d)}/${pad2(m)}/${y}`; };
  const fmtDateISO = (days) => { const [y, m, d] = ymd(days); return `${y}-${pad2(m)}-${pad2(d)}`; };
  const fmtDateLong = (days) => { const [y, m, d] = ymd(days); return `${d} de ${MESES[m - 1]} de ${y}`; };
  function parseDate(x) {
    const s = String(x == null ? "" : x).trim();
    let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
    if (m) { let y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900; return validDate(y, +m[2], +m[1]); }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (m) return validDate(+m[1], +m[2], +m[3]);
    return null;
  }
  function validDate(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const days = fromYmd(y, mo, d); const [yy, mm, dd] = ymd(days);
    return yy === y && mm === mo && dd === d ? days : null;
  }
  const addMonths = (days, n) => {
    const [y, m, d] = ymd(days); const t = y * 12 + (m - 1) + Math.trunc(n);
    const ny = Math.floor(t / 12), nm = (t % 12) + 1;
    const last = ymd(fromYmd(ny, nm + 1, 1) - 1)[2];
    return fromYmd(ny, nm, Math.min(d, last));
  };
  const isWeekend = (days) => { const w = ymd(days)[3]; return w === 0 || w === 6; };

  // ---------- feriados nacionais (Brasil) ----------
  // Fixos: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12.
  // Móvel: Sexta-feira Santa (2 dias antes da Páscoa). Carnaval e Corpus Christi são
  // "ponto facultativo", então não entram. Feriados estaduais/municipais: setExtraHolidays().
  const FIXED_HOLIDAYS = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25]];
  const easterDays = (y) => { // Páscoa (algoritmo de Meeus/Jones/Butcher)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return fromYmd(y, month, day);
  };
  const holidayCache = new Map();
  let extraHolidays = []; // [{ d, m, y|null }]
  function holidaysOf(y) {
    if (holidayCache.has(y)) return holidayCache.get(y);
    const set = new Set(FIXED_HOLIDAYS.map(([m, d]) => fromYmd(y, m, d)));
    set.add(easterDays(y) - 2); // Sexta-feira Santa
    extraHolidays.forEach((h) => { if (h.y == null || h.y === y) set.add(fromYmd(y, h.m, h.d)); });
    holidayCache.set(y, set); return set;
  }
  const isHoliday = (days) => holidaysOf(ymd(days)[0]).has(days);
  const isBusinessDay = (days) => !isWeekend(days) && !isHoliday(days);
  // Aceita "dd/mm" (todo ano) ou "dd/mm/aaaa" (só naquele ano). Devolve quantos foram aceitos.
  function setExtraHolidays(list) {
    const out = [];
    (Array.isArray(list) ? list : String(list || "").split(/[\n,;]+/)).forEach((raw) => {
      const m = String(raw).trim().match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?$/); if (!m) return;
      const d = +m[1], mo = +m[2], y = m[3] ? +m[3] : null;
      if (validDate(y || 2024, mo, d) != null) out.push({ d, m: mo, y });
    });
    extraHolidays = out; holidayCache.clear(); return out.length;
  }
  const addBusinessDays = (days, n) => {
    let left = Math.abs(Math.trunc(n)); const step = n < 0 ? -1 : 1; let d = days;
    while (left > 0) { d += step; if (isBusinessDay(d)) left--; }
    return d;
  };
  // Se a data não for dia útil, anda para a frente (dir > 0) ou para trás (dir < 0) até achar um.
  const toBusinessDay = (days, dir) => { let d = days; const step = dir < 0 ? -1 : 1; while (!isBusinessDay(d)) d += step; return d; };
  const firstBusinessOfMonth = (days) => { const [y, m] = ymd(days); return toBusinessDay(fromYmd(y, m, 1), 1); };
  const lastBusinessOfMonth = (days) => { const [y, m] = ymd(days); return toBusinessDay(fromYmd(y, m + 1, 1) - 1, -1); };
  const ageYears = (birth, ref) => { const [y1, m1, d1] = ymd(birth), [y2, m2, d2] = ymd(ref); return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0); };

  // ---------- horas ----------
  function parseTime(x) {
    const m = String(x == null ? "" : x).trim().match(/^(-?)(\d{1,3})\s*(?::\s*(\d{1,2})(?::\d{1,2})?\s*h?|h\s*(\d{1,2})?\s*(?:min|m)?)$/i);
    if (!m) return null;
    const mins = parseInt(m[2], 10) * 60 + parseInt(m[3] || m[4] || "0", 10);
    return m[1] ? -mins : mins;
  }
  const formatTime = (mins) => { const t = Math.round(Math.abs(mins)); return (mins < 0 ? "-" : "") + pad2(Math.floor(t / 60)) + ":" + pad2(t % 60); };

  // ---------- números ----------
  function parseNumberBR(x) {
    if (typeof x === "number") return x;
    let s = String(x == null ? "" : x).replace(/[^\d.,\-]/g, "");
    if (!s || s === "-") return NaN;
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if ((s.match(/,/g) || []).length > 1) s = s.replace(/,/g, "");
    else if (s.includes(",")) s = s.replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
    else if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace(".", ""); // 1.500 (pt-BR) = 1500
    return parseFloat(s);
  }
  const clean = (n) => Math.round(n * 1e10) / 1e10;
  function fmtNumber(n, decimals, sep) {
    if (!isFinite(n)) return "";
    const s = decimals != null ? n.toFixed(decimals) : String(clean(n));
    if (!sep) return s.replace(".", ",");
    const neg = s.startsWith("-"); const [i, f] = s.replace("-", "").split(".");
    return (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
  }

  // ---------- número por extenso ----------
  const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  function ext999(n) {
    if (n === 100) return "cem";
    const c = Math.floor(n / 100), r = n % 100, parts = [];
    if (c) parts.push(CEN[c]);
    if (r) parts.push(r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? " e " + UN[r % 10] : ""));
    return parts.join(" e ");
  }
  function extensoInt(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return "zero";
    const scales = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"], ["trilhão", "trilhões"]];
    const groups = []; while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
    const out = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i]; if (!g) continue;
      const words = i === 1 && g === 1 ? "mil" : ext999(g) + (i ? " " + scales[i][g > 1 ? 1 : 0] : "");
      out.push({ g, words });
    }
    return out.reduce((acc, p, idx) => {
      if (!idx) return p.words;
      const lastJoin = idx === out.length - 1 && (p.g < 100 || p.g % 100 === 0);
      return acc + (lastJoin ? " e " : ", ") + p.words;
    }, "");
  }
  function extenso(n) { if (!isFinite(n)) return ""; const neg = n < 0; const i = Math.trunc(Math.abs(n)); const f = Math.round((Math.abs(n) - i) * 100); return (neg ? "menos " : "") + extensoInt(i) + (f ? " vírgula " + extensoInt(f) : ""); }
  function extensoReais(n) {
    if (!isFinite(n)) return "";
    const tot = Math.round(Math.abs(n) * 100), r = Math.floor(tot / 100), c = tot % 100, parts = [];
    if (r) parts.push(extensoInt(r) + (/(ões|ão)$/.test(extensoInt(r)) && r % 1000000 === 0 ? " de" : "") + (r === 1 ? " real" : " reais"));
    if (c) parts.push(extensoInt(c) + (c === 1 ? " centavo" : " centavos"));
    return (n < 0 ? "menos " : "") + (parts.join(" e ") || "zero real");
  }

  // ---------- documentos / textos ----------
  const digits = (s) => String(s).replace(/\D/g, "");
  const mask = (s, pattern) => { const d = digits(s); let i = 0; const out = pattern.replace(/#/g, () => (i < d.length ? d[i++] : "")); return out.replace(/[^\d]+$/, ""); };
  const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s\-'(])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(D[aeo]s?|E)\b/g, (w, _1, off, all) => (off === 0 ? w : w.toLowerCase()));
  const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);

  function cpfOk(s) {
    const d = digits(s); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (let t = 9; t < 11; t++) { let sum = 0; for (let i = 0; i < t; i++) sum += +d[i] * (t + 1 - i); if (((sum * 10) % 11) % 10 !== +d[t]) return false; }
    return true;
  }
  function cnpjOk(s) {
    const d = digits(s); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const dv = (n) => { let sum = 0, pos = n - 7; for (let i = n; i >= 1; i--) { sum += +d[n - i] * pos--; if (pos < 2) pos = 9; } const r = sum % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === +d[12] && dv(13) === +d[13];
  }
  const lev = (a, b) => { const m = []; for (let i = 0; i <= a.length; i++) { m[i] = [i]; } for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length]; };

  // ---------- valores tipados ----------
  // {k:"n", v} número | {k:"t", v:min} hora | {k:"d", v:dias} data | {k:"s", v} texto
  const N = (v) => ({ k: "n", v }), T = (v) => ({ k: "t", v }), D = (v, dir) => (dir ? { k: "d", v, dir } : { k: "d", v }), S = (v) => ({ k: "s", v: String(v) });
  const num = (x) => (x.k === "s" ? parseNumberBR(x.v) : x.v);
  const truthy = (x) => (x.k === "s" ? x.v !== "" && !/^(0|false|falso|nao|não|n)$/i.test(x.v.trim()) : isFinite(x.v) && x.v !== 0);
  function toText(x, decimals) {
    if (!x) return "";
    if (x.k === "s") return x.v;
    if (x.k === "t") return isFinite(x.v) ? formatTime(x.v) : "";
    if (x.k === "d") return isFinite(x.v) ? fmtDateBR(x.v) : "";
    if (x.raw != null && decimals == null) return x.raw;
    return fmtNumber(x.v, decimals);
  }

  // ---------- variáveis automáticas ----------
  const nowHM = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const BUILTIN = {
    hoje: { label: "Data de hoje", fn: () => fmtDateBR(today()) },
    ontem: { label: "Data de ontem", fn: () => fmtDateBR(today() - 1) },
    amanha: { label: "Data de amanhã", fn: () => fmtDateBR(today() + 1) },
    hora: { label: "Hora atual", fn: nowHM },
    hora_seg: { label: "Hora com segundos", fn: () => { const d = new Date(); return `${nowHM()}:${pad2(d.getSeconds())}`; } },
    data_hora: { label: "Data e hora", fn: () => `${fmtDateBR(today())} ${nowHM()}` },
    dia: { label: "Dia", fn: () => pad2(ymd(today())[2]) },
    mes: { label: "Mês", fn: () => pad2(ymd(today())[1]) },
    mes_extenso: { label: "Mês por extenso", fn: () => MESES[ymd(today())[1] - 1] },
    ano: { label: "Ano", fn: () => String(ymd(today())[0]) },
    dia_semana: { label: "Dia da semana", fn: () => SEMANA[ymd(today())[3]] },
    data_extenso: { label: "Data por extenso", fn: () => fmtDateLong(today()) },
    data_iso: { label: "Data AAAA-MM-DD", fn: () => fmtDateISO(today()) },
    inicio_mes: { label: "1º dia do mês", fn: () => { const [y, m] = ymd(today()); return fmtDateBR(fromYmd(y, m, 1)); } },
    fim_mes: { label: "Último dia do mês", fn: () => { const [y, m] = ymd(today()); return fmtDateBR(fromYmd(y, m + 1, 1) - 1); } },
    proximo_dia_util: { label: "Próximo dia útil", fn: () => fmtDateBR(addBusinessDays(today(), 1)) },
    timestamp: { label: "Data/hora em milissegundos", fn: () => String(Date.now()) },
    numero: { label: "Nº aleatório (6 dígitos)", fn: () => String(Math.floor(100000 + Math.random() * 900000)) },
    uuid: { label: "Código único", fn: () => (root.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) },
  };

  // ---------- funções dentro das contas ----------
  const nums = (args) => args.map(num).filter((n) => isFinite(n));
  const dateArg = (x) => (x.k === "d" ? x.v : parseDate(x.v));
  // No diagnóstico as variáveis valem "2" (não são datas): lá, uma data inválida não deve virar falso aviso.
  let diagnosing = false;
  const dateOrToday = (x) => { const d = dateArg(x); return d == null && diagnosing ? today() : d; };
  const bizDate = (a, dir) => { const d = dateOrToday(a); return d == null ? N(NaN) : D(toBusinessDay(d, dir)); };
  const FUNCS = {
    arred: (a, d) => N(+num(a).toFixed(d ? num(d) : 0)),
    arredondar: (a, d) => FUNCS.arred(a, d),
    piso: (a) => N(Math.floor(num(a))), teto: (a) => N(Math.ceil(num(a))), inteiro: (a) => N(Math.trunc(num(a))),
    abs: (a) => N(Math.abs(num(a))), raiz: (a) => N(Math.sqrt(num(a))),
    min: (...a) => N(Math.min(...nums(a))), max: (...a) => N(Math.max(...nums(a))),
    soma: (...a) => N(nums(a).reduce((s, n) => s + n, 0)),
    media: (...a) => { const v = nums(a); return N(v.length ? v.reduce((s, n) => s + n, 0) / v.length : NaN); },
    pct: (a, p) => N((num(a) * num(p)) / 100), // pct(valor, 10) = 10% de valor
    aleatorio: (a, b) => { const lo = a ? num(a) : 0, hi = b ? num(b) : 100; return N(Math.floor(lo + Math.random() * (hi - lo + 1))); },
    se: (c, a, b) => (truthy(c) ? a || S("") : b || S("")),
    vazio: (a) => N(!a || (a.k !== "s" && !isFinite(a.v)) || String(a.v).trim() === "" ? 1 : 0), // variável sem valor também é "vazia"
    // datas
    data: (a, b, c) => (b ? D(fromYmd(num(c), num(b), num(a))) : D(dateArg(a))),
    dias_uteis: (a, n) => D(addBusinessDays(dateArg(a), num(n))),
    meses: (a, n) => D(addMonths(dateArg(a), num(n)), Math.sign(num(n)) || 1),
    anos: (a, n) => D(addMonths(dateArg(a), num(n) * 12), Math.sign(num(n)) || 1),
    idade: (a, ref) => N(ageYears(dateArg(a), ref ? dateArg(ref) : today())),
    dias_entre: (a, b) => N(dateArg(b) - dateArg(a)),
    fim_mes: (a) => { const [y, m] = ymd(dateArg(a)); return D(fromYmd(y, m + 1, 1) - 1); },
    inicio_mes: (a) => { const [y, m] = ymd(dateArg(a)); return D(fromYmd(y, m, 1)); },
    ultimo_dia: (a) => FUNCS.fim_mes(a),
    proximo_dia_util: (a) => D(addBusinessDays(a ? dateArg(a) : today(), 1)),
    // Ajuste para dia útil (fim de semana ou feriado). A data só muda se não for dia útil.
    dia_util: (a) => bizDate(a, 1), // sempre para frente (compatível com a versão anterior)
    dia_util_depois: (a) => bizDate(a, 1),
    dia_util_antes: (a) => bizDate(a, -1),
    // Automático: segue o sinal da conta. hoje + 30 -> frente · hoje - 30 -> trás · sem conta -> frente
    dia_util_auto: (a) => bizDate(a, a.dir || 1),
    primeiro_dia_util: (a) => { const d = a ? dateOrToday(a) : today(); return d == null ? N(NaN) : D(firstBusinessOfMonth(d)); },
    ultimo_dia_util: (a) => { const d = a ? dateOrToday(a) : today(); return d == null ? N(NaN) : D(lastBusinessOfMonth(d)); },
    eh_dia_util: (a) => N(isBusinessDay(dateArg(a)) ? 1 : 0),
    eh_feriado: (a) => N(isHoliday(dateArg(a)) ? 1 : 0),
    dias_uteis_entre: (a, b) => { let x = dateArg(a), y = dateArg(b), n = 0; const st = x <= y ? 1 : -1; while (x !== y) { x += st; if (isBusinessDay(x)) n += st; } return N(n); },
    mod: (a, b) => N(num(a) % num(b)), potencia: (a, b) => N(Math.pow(num(a), num(b))),
    numero: (a) => N(num(a)), texto: (a) => S(toText(a)),
    contem: (a, b) => N(norm(toText(a)).includes(norm(toText(b))) ? 1 : 0),
    comeca: (a, b) => N(norm(toText(a)).startsWith(norm(toText(b))) ? 1 : 0),
    seerro: (a, b) => (a.k !== "s" && !isFinite(a.v) ? b || S("") : a),
    escolher: (i, ...o) => o[Math.max(0, Math.min(o.length - 1, Math.trunc(num(i)) - 1))] || S(""),
    repetir: (a, n) => S(toText(a).repeat(Math.max(0, Math.min(200, Math.trunc(num(n)) || 0)))),
    cpf_valido: (a) => N(cpfOk(toText(a)) ? 1 : 0), cnpj_valido: (a) => N(cnpjOk(toText(a)) ? 1 : 0),
    // horas
    horas: (a) => T(num(a) * 60), minutos: (a) => T(num(a)),
    // textos
    tamanho: (a) => N(String(a.v).length),
    juntar: (...a) => S(a.map((x) => toText(x)).join("")),
  };
  FUNCS["média"] = FUNCS.media; FUNCS["raíz"] = FUNCS.raiz;

  // ---------- tokenizador ----------
  function tokenize(expr) {
    const toks = []; const re = /\s*(?:(\d+(?:[.,]\d+)?)|"([^"]*)"|'([^']*)'|([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)|(>=|<=|==|!=|<>|&&|\|\||[-+*\/%^()<>=,;!]))/gy;
    let m, last = 0;
    while (last < expr.length && (m = re.exec(expr))) {
      last = re.lastIndex;
      if (m[1] != null) toks.push({ t: "n", v: parseFloat(m[1].replace(",", ".")) });
      else if (m[2] != null || m[3] != null) toks.push({ t: "s", v: m[2] != null ? m[2] : m[3] });
      else if (m[4] != null) toks.push({ t: "v", v: m[4] });
      else toks.push({ t: "o", v: m[5] });
    }
    if (expr.slice(last).trim()) return null;
    return toks;
  }
  const KEYWORDS = new Set(["e", "ou", "nao", "não", "verdadeiro", "falso"]);
  function exprVariables(expr) {
    const toks = tokenize(expr) || [];
    return [...new Set(toks.filter((t, i) => t.t === "v" && !KEYWORDS.has(t.v.toLowerCase()) && !(toks[i + 1] && toks[i + 1].v === "(")).map((t) => t.v))];
  }

  // ---------- aritmética tipada ----------
  function arith(op, a, b) {
    const ka = a.k, kb = b.k;
    if (op === "+") {
      if (ka === "s" && kb === "s" && !isFinite(parseNumberBR(a.v)) ) return S(a.v + b.v);
      if (ka === "d" && kb !== "d") return D(a.v + num(b), Math.sign(num(b)) || 1); if (kb === "d" && ka !== "d") return D(b.v + num(a), Math.sign(num(a)) || 1);
      if (ka === "t" || kb === "t") return T(num(a) + num(b));
      return N(num(a) + num(b));
    }
    if (op === "-") {
      if (ka === "d" && kb === "d") return N(a.v - b.v);
      if (ka === "d") return D(a.v - num(b), -(Math.sign(num(b)) || 1));
      if (ka === "t" || kb === "t") return T(num(a) - num(b));
      return N(num(a) - num(b));
    }
    if (op === "*") return ka === "t" || kb === "t" ? T(num(a) * num(b)) : N(num(a) * num(b));
    if (op === "/") return ka === "t" && kb === "t" ? N(a.v / b.v) : ka === "t" ? T(a.v / num(b)) : N(num(a) / num(b));
    if (op === "%") return N(num(a) % num(b));
    if (op === "^") return N(Math.pow(num(a), num(b)));
    return N(NaN);
  }
  function compare(op, a, b) {
    let x = num(a), y = num(b);
    if ((a.k === "s" || b.k === "s") && !(isFinite(x) && isFinite(y))) { x = norm(toText(a)); y = norm(toText(b)); }
    const r = op === ">" ? x > y : op === "<" ? x < y : op === ">=" ? x >= y : op === "<=" ? x <= y : op === "==" || op === "=" ? x === y : x !== y;
    return N(r ? 1 : 0);
  }

  // ctx: { lookup(name) -> typed | null, timeMode }
  function evaluate(expr, ctx) {
    const toks = tokenize(expr);
    if (!toks || !toks.length) return N(NaN);
    let i = 0;
    const isOp = (...v) => toks[i] && toks[i].t === "o" && v.includes(toks[i].v);
    const isWord = (w) => toks[i] && toks[i].t === "v" && norm(toks[i].v) === w;
    function primary() {
      const t = toks[i++];
      if (!t) return N(NaN);
      if (t.t === "n") return N(t.v);
      if (t.t === "s") return S(t.v);
      if (t.t === "v") {
        if (toks[i] && toks[i].v === "(") {
          i++; const args = [];
          if (!isOp(")")) { do { args.push(or()); } while (isOp(",", ";") && ++i); }
          if (!isOp(")")) return N(NaN); i++;
          let f = FUNCS[t.v.toLowerCase()] || FUNCS[norm(t.v)];
          if (!f) { // qualquer filtro também funciona como função: maiusculas(nome), esquerda(nome, 3), moeda(total)
            const fn = filterName(t.v);
            if (fn) f = (x, ...rest) => FILTERS[fn](x || S(""), ...rest.map((a) => toText(a)));
          }
          return f ? f(...args) : N(NaN);
        }
        const w = norm(t.v);
        if (w === "verdadeiro") return N(1); if (w === "falso") return N(0);
        return ctx.lookup(t.v) || N(NaN);
      }
      if (t.v === "(") { const r = or(); if (isOp(")")) i++; else return N(NaN); return r; }
      if (t.v === "-") { const r = power(); return r.k === "t" ? T(-r.v) : N(-num(r)); }
      if (t.v === "+") return power();
      if (t.v === "!") return N(truthy(power()) ? 0 : 1);
      return N(NaN);
    }
    function power() { const b = primary(); if (isOp("^")) { i++; return arith("^", b, power()); } return b; }
    function mul() { let l = power(); while (isOp("*", "/", "%")) { const o = toks[i++].v; l = arith(o, l, power()); } return l; }
    function add() { let l = mul(); while (isOp("+", "-")) { const o = toks[i++].v; l = arith(o, l, mul()); } return l; }
    function cmp() { let l = add(); while (isOp(">", "<", ">=", "<=", "==", "!=", "<>", "=")) { const o = toks[i++].v; l = compare(o === "<>" ? "!=" : o, l, add()); } return l; }
    function not() { if (isWord("nao")) { i++; return N(truthy(not()) ? 0 : 1); } return cmp(); }
    function and() { let l = not(); while (isOp("&&") || isWord("e")) { i++; const r = not(); l = N(truthy(l) && truthy(r) ? 1 : 0); } return l; }
    function or() { let l = and(); while (isOp("||") || isWord("ou")) { i++; const r = and(); l = N(truthy(l) || truthy(r) ? 1 : 0); } return l; }
    const res = or();
    return i === toks.length ? res : N(NaN);
  }

  // ---------- filtros (conversões / formatação) ----------
  // Cada filtro recebe um valor tipado e devolve outro. "nome:arg" passa argumento.
  const asNum = (x) => (x.k === "s" ? parseNumberBR(x.v) : x.v);
  const asText = (x) => toText(x);
  const asDate = (x) => (x.k === "d" ? x.v : parseDate(asText(x)));
  const money = (sym, dec = 2) => (x) => { const n = asNum(x); return S(isFinite(n) ? (n < 0 ? "-" : "") + sym + fmtNumber(Math.abs(n), dec, true) : ""); };
  const FILTERS = {
    // números
    inteiro: (x) => S(fmtNumber(Math.trunc(asNum(x)), 0)),
    arred: (x, a) => S(fmtNumber(asNum(x), a ? +a : 0)),
    moeda: money("R$ "), real: money("R$ "), brl: money("R$ "), reais: money("R$ "),
    usd: (x) => { const n = asNum(x); return S(isFinite(n) ? "US$ " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""); },
    eur: money("€ "),
    milhar: (x, a) => S(fmtNumber(asNum(x), a != null ? +a : undefined, true)),
    pct: (x, a) => S(isFinite(asNum(x)) ? fmtNumber(asNum(x), a != null ? +a : undefined) + "%" : ""),
    porcento: (x, a) => FILTERS.pct(x, a),
    ponto: (x, a) => S(isFinite(asNum(x)) ? (a != null ? asNum(x).toFixed(+a) : String(clean(asNum(x)))) : ""),
    numero: (x) => S(fmtNumber(asNum(x))),
    extenso: (x) => S(extenso(asNum(x))),
    extenso_reais: (x) => S(extensoReais(asNum(x))),
    zeros: (x, a) => S(asText(x).padStart(+a || 0, "0")),
    // horas
    h: (x) => (x.k === "t" ? x : T(parseTime(asText(x)) ?? NaN)),
    min: (x) => S(fmtNumber(x.k === "t" ? x.v : parseTime(asText(x)) ?? NaN, 0)),
    // Duração legível: 46 min | 1h 30min | 2h. O filtro também ativa
    // a leitura das variáveis de origem como horários antes da operação matemática.
    duracao: (x) => {
      const raw = x.k === "t" ? x.v : parseTime(asText(x));
      if (!isFinite(raw)) return S("");
      const total = Math.round(Math.abs(raw));
      const horas = Math.floor(total / 60), minutos = total % 60;
      const partes = [];
      if (horas) partes.push(`${horas}h`);
      if (minutos || !horas) partes.push(`${minutos} min`);
      return S((raw < 0 ? "-" : "") + partes.join(" "));
    },
    // Duração por extenso: 30 min | 1 hora | 1 hora e 30 min | 10 horas e 30 min
    duracao_extenso: (x) => {
      const raw = x.k === "t" ? x.v : parseTime(asText(x));
      if (!isFinite(raw)) return S("");
      const total = Math.round(Math.abs(raw));
      const horas = Math.floor(total / 60), minutos = total % 60;
      const partes = [];
      if (horas) partes.push(`${horas} ${horas === 1 ? "hora" : "horas"}`);
      if (minutos || !horas) partes.push(`${minutos} min`);
      return S((raw < 0 ? "-" : "") + partes.join(" e "));
    },
    horas_dec: (x, a) => S(fmtNumber((x.k === "t" ? x.v : parseTime(asText(x)) ?? NaN) / 60, a != null ? +a : 2)),
    // datas
    data: (x) => { const d = asDate(x); return S(d == null ? "" : fmtDateBR(d)); },
    iso: (x) => { const d = asDate(x); return S(d == null ? "" : fmtDateISO(d)); },
    data_extenso: (x) => { const d = asDate(x); return S(d == null ? "" : fmtDateLong(d)); },
    dia_semana: (x) => { const d = asDate(x); return S(d == null ? "" : SEMANA[ymd(d)[3]]); },
    mes_extenso: (x) => { const d = asDate(x); return S(d == null ? "" : MESES[ymd(d)[1] - 1]); },
    dia: (x) => { const d = asDate(x); return S(d == null ? "" : pad2(ymd(d)[2])); },
    mes: (x) => { const d = asDate(x); return S(d == null ? "" : pad2(ymd(d)[1])); },
    ano: (x) => { const d = asDate(x); return S(d == null ? "" : String(ymd(d)[0])); },
    // Ajusta para dia útil. Sem argumento, segue a conta: {{vence + 30 | dia_util}} vai para frente,
    // {{vence - 5 | dia_util}} vai para trás. Force com dia_util:antes ou dia_util:depois.
    dia_util: (x, a) => {
      const d = asDate(x); if (d == null) return S("");
      const m = norm(a || ""); const dir = m === "antes" || m === "tras" ? -1 : m === "depois" || m === "frente" ? 1 : (x.dir || 1);
      return D(toBusinessDay(d, dir));
    },
    dias: (x) => S(fmtNumber(asNum(x), 0)),
    idade: (x) => { const d = asDate(x); return S(d == null ? "" : String(ageYears(d, today()))); },
    // textos
    maiusculas: (x) => S(asText(x).toLocaleUpperCase("pt-BR")),
    minusculas: (x) => S(asText(x).toLocaleLowerCase("pt-BR")),
    titulo: (x) => S(titleCase(asText(x))),
    capitalizar: (x) => { const s = asText(x); return S(s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()); },
    aparar: (x) => S(asText(x).trim().replace(/\s+/g, " ")),
    sem_acentos: (x) => S(asText(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
    slug: (x) => S(norm(asText(x)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
    primeiro_nome: (x) => S(words(asText(x))[0] || ""),
    ultimo_nome: (x) => { const w = words(asText(x)); return S(w.length > 1 ? w[w.length - 1] : ""); },
    sobrenome: (x) => S(words(asText(x)).slice(1).join(" ")),
    iniciais: (x) => S(words(asText(x)).filter((w) => !/^(d[aeo]s?|e)$/i.test(w)).map((w) => w[0].toUpperCase()).join("")),
    esquerda: (x, a) => S(asText(x).slice(0, +a || 0)),
    direita: (x, a) => S(+a ? asText(x).slice(-a) : ""),
    limite: (x, a) => S(asText(x).slice(0, +a || undefined)),
    trocar: (x, a, b) => S(asText(x).split(a || "").join(b || "")),
    prefixo: (x, a) => S(asText(x) ? (a || "") + asText(x) : ""),
    sufixo: (x, a) => S(asText(x) ? asText(x) + (a || "") : ""),
    padrao: (x, a) => (asText(x).trim() === "" ? S(a || "") : x),
    // documentos e máscaras
    numeros: (x) => S(digits(asText(x))),
    cpf: (x) => S(mask(asText(x), "###.###.###-##")),
    cnpj: (x) => S(mask(asText(x), "##.###.###/####-##")),
    cep: (x) => S(mask(asText(x), "#####-###")),
    telefone: (x) => { const d = digits(asText(x)); return S(d.length > 10 ? mask(d, "(##) #####-####") : mask(d, "(##) ####-####")); },
    mascara: (x, a) => S(mask(asText(x), a || "")),
    rg: (x) => S(mask(asText(x), "##.###.###-#")),
    cartao: (x) => S(mask(asText(x), "#### #### #### ####")),
    // v32
    valor: (x, a) => { const n = asNum(x); return S(isFinite(n) ? fmtNumber(n, a != null ? +a : 2, true) : ""); }, // 1.234,56 sem R$
    data_curta: (x) => { const d = asDate(x); return S(d == null ? "" : `${pad2(ymd(d)[2])}/${pad2(ymd(d)[1])}/${String(ymd(d)[0]).slice(-2)}`); },
    mes_ano: (x) => { const d = asDate(x); return S(d == null ? "" : `${pad2(ymd(d)[1])}/${ymd(d)[0]}`); },
    sem_espacos: (x) => S(asText(x).replace(/\s+/g, "")),
    inverter: (x) => S([...asText(x)].reverse().join("")),
    repetir: (x, a) => S(asText(x).repeat(Math.max(0, Math.min(200, +a || 0)))),
    sim_nao: (x) => { const t = asText(x).trim(); const v = x.k === "s" ? truthy(x) : isFinite(x.v) && x.v !== 0; return S(t === "" ? "" : v ? "Sim" : "Não"); },
    contar: (x) => S(String(asText(x).length)),
    absoluto: (x) => S(fmtNumber(Math.abs(asNum(x)))),
  };
  const ALIASES = { hora: "h", horas: "h", upper: "maiusculas", "maiúsculas": "maiusculas", lower: "minusculas", "minúsculas": "minusculas", "título": "titulo", minutos: "min", "porcentagem": "pct", "%": "pct", "r$": "moeda", default: "padrao", "padrão": "padrao", digitos: "numeros", "dígitos": "numeros", fone: "telefone", celular: "telefone", "números": "numeros", maiuscula: "maiusculas", "maiúscula": "maiusculas", minuscula: "minusculas", "minúscula": "minusculas", uppercase: "maiusculas", lowercase: "minusculas", trim: "aparar", currency: "moeda", somente_numeros: "numeros", apenas_numeros: "numeros", so_numeros: "numeros", valor_extenso: "extenso_reais", reais_extenso: "extenso_reais", nome_proprio: "titulo", primeironome: "primeiro_nome", ultimonome: "ultimo_nome", data_br: "data", data_iso: "iso", dd_mm_aa: "data_curta", sem_espaco: "sem_espacos", sim_ou_nao: "sim_nao" };
  // Modos que mudam como os valores das variáveis são lidos dentro da conta
  const TIME_FILTERS = new Set(["h", "min", "horas_dec", "duracao", "duracao_extenso"]);

  // nome (com apelidos, sem acento) -> nome real do filtro, ou null
  function filterName(raw) {
    let name = String(raw).trim().toLowerCase();
    name = ALIASES[name] || ALIASES[norm(name)] || name;
    if (FILTERS[name]) return name;
    const n2 = norm(name); return FILTERS[n2] ? n2 : null;
  }
  function parseFilter(part) {
    const p = String(part).trim(); if (!p) return null;
    if (/^\d+$/.test(p)) return { name: "#dec", args: [p] };
    const idx = p.indexOf(":");
    const name = filterName(idx >= 0 ? p.slice(0, idx) : p);
    return name ? { name, args: idx >= 0 ? p.slice(idx + 1).split(":") : [] } : null;
  }

  // ---------- v32.2: lista com repetição  {{ repetição('-') }} ----------
  // Ao preencher, a pessoa adiciona quantos itens quiser; cada item vira uma linha com o prefixo.
  //   {{ repetição('-') }}                  -> "- Mateus\n- Teste"
  //   {{ repetição('*', 'Participantes') }} -> 2º argumento = título da lista (e identifica listas diferentes)
  //   {{ repetição('-') | maiusculas }}     -> filtros valem para cada item
  // Os itens ficam guardados nos valores como texto, um por linha, na chave "lista:<título ou prefixo>".
  const REPEAT_HEAD = /^repeti[cç][aã]o\s*\(([\s\S]*)\)$/iu;
  const REPEAT_START = /^repeti[cç][aã]o\s*\(/iu;
  // v33: {{ lista('-') }} = igual à repetição, mas cola como LISTA DE EDITOR (marcadores/numeração reais)
  //   {{ lista() }} / {{ lista('-') }} -> marcadores · {{ lista('1.') }} -> numerada
  //   {{ lista('-', 'Participantes') }} -> 2º argumento = título (listas independentes)
  // Num campo de texto simples vira linhas "- item" (ou "1. item"); num editor rico vira <ul>/<ol>.
  const LIST_HEAD = /^lista\s*\(([\s\S]*)\)$/iu;
  const LIST_START = /^lista\s*\(/iu;
  // Marcas privadas (invisíveis) que levam a lista até o content.js: ABRE + tipo(u|o) + marcador + SEP + itens(SEP) + FECHA
  const LIST_OPEN = "\uE000", LIST_SEP = "\uE001", LIST_CLOSE = "\uE002";
  const noMarks = (t) => String(t).replace(/[\uE000-\uE002]/g, "");
  // separa argumentos por , ou ; respeitando aspas simples/duplas (inclusive as "curvas")
  function splitArgs(src) {
    const s = String(src).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    const out = []; let quoted = "", loose = "", q = null, had = false;
    const push = () => { out.push(had ? quoted : loose.trim()); quoted = ""; loose = ""; had = false; };
    for (const ch of s) {
      if (q) { if (ch === q) q = null; else quoted += ch; continue; }
      if (ch === "'" || ch === '"') { q = ch; had = true; continue; }
      if (ch === "," || ch === ";") { push(); continue; }
      loose += ch;
    }
    if (q) return null; // aspas sem fechar
    push();
    return out;
  }
  function parseRepeat(head) {
    const src = String(head).trim();
    const rich = !REPEAT_HEAD.test(src) && LIST_HEAD.test(src); // v33: lista(...)
    const m = (rich ? LIST_HEAD : REPEAT_HEAD).exec(src); if (!m) return null;
    const args = splitArgs(m[1]); if (!args) return null;
    const implicit = !m[1].trim(); // repetição()/lista() sem nada: usa "-"
    // lista() sempre tem marcador: '' também vale "-" (repetição('') = sem prefixo)
    const prefix = implicit || (rich && !args[0].trim()) ? "-" : args[0];
    const label = (args[1] || "").trim();
    const ordered = rich && /^\d+\s*[.)]?$/.test(prefix.trim()); // lista('1.') = numerada
    // listas de editor guardam os itens em "itens:", as de repetição em "lista:" (não se misturam)
    return { prefix, label, implicit, rich, ordered, extra: args.length > 2, name: (rich ? "itens:" : "lista:") + (label || prefix.trim() || "itens") }; // espaços do prefixo não distinguem listas
  }
  const repeatItems = (value) => String(value == null ? "" : value).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  // Analisa o conteúdo de {{ ... }}
  // -> { kind: "calc", expr, filters } | { kind: "var", name, options, filters } | { kind: "repeat", prefix, label, name, filters }
  function parse(raw) {
    const parts = String(raw).split("|");
    const head = parts[0].trim();
    const rest = parts.slice(1);
    const rep = parseRepeat(head);
    if (rep) return { kind: "repeat", ...rep, options: [], filters: rest.map(parseFilter).filter(Boolean) };
    const filters = rest.map(parseFilter);
    const allFilters = rest.length > 0 && filters.every(Boolean);
    const isCalc = /^=/.test(head) || /[+*\/%^<>!]|\s-\s|\(|==/.test(head) || /^"[^"]*"$|^'[^']*'$/.test(head);
    if (isCalc) return { kind: "calc", expr: head.replace(/^=\s*/, ""), filters: allFilters ? filters : rest.length ? filters.filter(Boolean) : [] };
    if (allFilters) return { kind: "var", name: head, options: [], filters };
    return { kind: "var", name: head, options: rest.map((x) => x.trim()).filter(Boolean), filters: [] };
  }

  function findKey(values, name) {
    const ks = Object.keys(values || {});
    return ks.find((k) => k === name) ?? ks.find((k) => k.toLowerCase() === name.toLowerCase()) ?? ks.find((k) => norm(k) === norm(name));
  }
  function rawValue(name, values) {
    const k = findKey(values, name);
    if (k != null && values[k] != null && values[k] !== "") return values[k];
    const b = BUILTIN[name.toLowerCase()] || BUILTIN[norm(name)];
    if (b) return b.fn();
    return /^-?[\d][\d.,:\/\-h ]*$/i.test(name) ? name : null; // literal: {{1234,56 | extenso}}
  }
  // Converte texto bruto em valor tipado: data > (hora, só no modo h) > número > texto
  function typed(raw, timeMode) {
    if (raw == null) return null;
    const s = String(raw);
    const d = parseDate(s); if (d != null) return D(d);
    if (timeMode) { const t = parseTime(s); if (t != null) return T(t); }
    const n = parseNumberBR(s);
    if (isFinite(n) && /^\s*[-+]?\s*(R\$|US\$|€)?\s*[-+]?[\d.,]+\s*%?\s*$/.test(s)) return { k: "n", v: n, raw: s };
    return S(s);
  }

  function applyFilters(val, filters) {
    let decimals = null;
    for (const f of filters) {
      if (f.name === "#dec") { decimals = +f.args[0]; continue; }
      val = FILTERS[f.name](val, ...f.args);
    }
    return toText(val, decimals);
  }

  // Resolve um token {{raw}} usando os valores informados.
  // opts.rich (v33): {{ lista() }} sai com as marcas privadas de lista (só para enviar ao campo da página);
  // sem isso, sai como texto simples ("- item" / "1. item"), próprio para prévias e cópias.
  function resolve(raw, values, opts) {
    const p = parse(raw);
    if (p.kind === "repeat") {
      const k = findKey(values, p.name);
      const timeMode = p.filters.some((f) => TIME_FILTERS.has(f.name));
      const items = repeatItems(k != null ? values[k] : "")
        .map((it) => (p.filters.length ? applyFilters(typed(it, timeMode) || S(it), p.filters) : it));
      if (!items.length) return "";
      const lead = !p.prefix ? "" : /\s$/.test(p.prefix) ? p.prefix : p.prefix + " ";
      if (p.rich && opts && opts.rich) return LIST_OPEN + (p.ordered ? "o" : "u") + noMarks(p.prefix) + LIST_SEP + items.map(noMarks).join(LIST_SEP) + LIST_CLOSE;
      return items.map((it, i) => (p.ordered ? `${i + 1}. ` : lead) + it).join("\n");
    }
    if (p.kind === "calc") {
      const timeMode = p.filters.some((f) => TIME_FILTERS.has(f.name));
      const val = evaluate(p.expr, { lookup: (n) => typed(rawValue(n, values), timeMode) });
      if (val.k !== "s" && !isFinite(val.v)) return "";
      return applyFilters(val, p.filters);
    }
    const raw2 = rawValue(p.name, values);
    if (!p.filters.length) return raw2 == null ? "" : String(raw2);
    const timeMode = p.filters.some((f) => TIME_FILTERS.has(f.name));
    return applyFilters(typed(raw2 == null ? "" : raw2, timeMode) || S(""), p.filters);
  }

  // ---------- dicas de tipo (para a janela de perguntas) ----------
  const DATE_FILTERS = new Set(["data", "iso", "data_extenso", "dia_semana", "mes_extenso", "dia", "mes", "ano", "idade", "data_curta", "mes_ano", "dia_util"]);
  const NUM_FILTERS = new Set(["moeda", "usd", "eur", "milhar", "pct", "ponto", "inteiro", "arred", "extenso", "extenso_reais", "valor", "numero", "absoluto", "sim_nao"]);
  const DATE_FUNCS = new Set(["idade", "meses", "anos", "dias_uteis", "dias_entre", "fim_mes", "inicio_mes", "ultimo_dia", "dia_util", "dia_util_depois", "dia_util_antes", "dia_util_auto", "primeiro_dia_util", "ultimo_dia_util", "eh_dia_util", "eh_feriado", "proximo_dia_util", "dias_uteis_entre"]);
  const NUM_FUNCS = new Set(["arred", "arredondar", "piso", "teto", "inteiro", "abs", "raiz", "min", "max", "soma", "media", "média", "pct", "mod", "potencia", "aleatorio"]);
  // palpite pelo NOME (usado só quando a expressão não indica o tipo)
  function hintFor(name) {
    const n = norm(name).replace(/[^a-z0-9]+/g, "_");
    if (/(^|_)(cpf)(_|$)/.test(n)) return "cpf";
    if (/(^|_)(cnpj)(_|$)/.test(n)) return "cnpj";
    if (/(^|_)(data|dt|nasc|nascimento|vencimento|venc|admissao|demissao|emissao|validade)(_|$)/.test(n)) return "date";
    if (/(^|_)(valor|preco|total|salario|qtd|quantidade|parcelas|desconto|taxa|juros|saldo)(_|$)/.test(n)) return "number";
    return "text";
  }
  function expressionHints(p) {
    const out = {};
    if (p.kind === "calc") {
      const toks = tokenize(p.expr) || []; const stack = [];
      const timeMode = p.filters.some((f) => TIME_FILTERS.has(f.name));
      const arithmetic = toks.some((t) => t.t === "o" && /[*\/%^]/.test(t.v));
      toks.forEach((t, i) => {
        if (t.v === "(") stack.push(i > 0 && toks[i - 1].t === "v" ? norm(toks[i - 1].v) : "");
        else if (t.v === ")") stack.pop();
        else if (t.t === "v" && !KEYWORDS.has(norm(t.v)) && !(toks[i + 1] && toks[i + 1].v === "(")) {
          const fn = stack.length ? stack[stack.length - 1] : "";
          out[t.v] = timeMode ? "time" : DATE_FUNCS.has(fn) ? "date" : NUM_FUNCS.has(fn) || arithmetic ? "number" : null;
        }
      });
    } else {
      const names = p.filters.map((f) => f.name);
      const last = names.find((n) => TIME_FILTERS.has(n)) ? "time" : names.find((n) => DATE_FILTERS.has(n)) ? "date" : names.find((n) => NUM_FILTERS.has(n)) ? "number"
        : names.includes("cpf") ? "cpf" : names.includes("cnpj") ? "cnpj" : null;
      out[p.name] = last;
    }
    return out;
  }

  // Nomes que precisam ser perguntados ao usuário
  // -> [{ name, options, hint, default }]
  function variablesIn(raw) {
    const p = parse(raw);
    if (p.kind === "repeat") return [{ name: p.name, options: [], hint: "list", default: "", repeat: true, prefix: p.prefix, label: p.label, rich: !!p.rich, ordered: !!p.ordered }];
    const hints = expressionHints(p);
    const pad = p.filters.find((f) => f.name === "padrao");
    const def = pad ? (pad.args || []).join(":") : "";
    if (p.kind === "calc") return exprVariables(p.expr).map((name) => ({ name, options: [], hint: hints[name] || hintFor(name), default: "" }));
    return [{ name: p.name, options: p.options, hint: hints[p.name] || hintFor(p.name), default: def }];
  }
  const isBuiltin = (name) => !!(BUILTIN[String(name).toLowerCase()] || BUILTIN[norm(name)]);

  // Confere o que a pessoa digitou conforme o tipo esperado. "" = tudo certo (avisos nunca bloqueiam).
  function checkInput(value, hint) {
    const v = String(value == null ? "" : value).trim();
    if (!v) return "";
    if (hint === "date") return parseDate(v) == null && !isBuiltin(v) ? "Data não reconhecida — use dd/mm/aaaa." : "";
    if (hint === "number") return isFinite(parseNumberBR(v)) ? "" : "Número não reconhecido — ex.: 1.234,56.";
    if (hint === "time") return parseTime(v) == null ? "Hora não reconhecida — ex.: 8:30 ou 8h30." : "";
    if (hint === "cpf") return digits(v).length === 11 && cpfOk(v) ? "" : "CPF com dígitos verificadores inválidos.";
    if (hint === "cnpj") return digits(v).length === 14 && cnpjOk(v) ? "" : "CNPJ com dígitos verificadores inválidos.";
    return "";
  }

  // ---------- diagnóstico e prévia ----------
  function suggestFilter(word) {
    const n = norm(word); if (n.length < 4) return null;
    const max = n.length < 7 ? 1 : 2; let best = null, bd = max + 1;
    for (const k of new Set([...Object.keys(FILTERS), ...Object.keys(ALIASES)])) {
      const d = lev(n, norm(k)); if (d < bd) { bd = d; best = filterName(k) || k; }
    }
    return best;
  }
  function suggestFunc(word) {
    const n = norm(word); if (n.length < 3) return null;
    let best = null, bd = (n.length < 6 ? 1 : 2) + 1;
    for (const k of [...Object.keys(FUNCS), ...Object.keys(FILTERS)]) { const d = lev(n, norm(k)); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  // -> [{ level: "erro" | "aviso", msg }]
  function diagnose(raw) {
    const issues = []; const text = String(raw);
    const parts = text.split("|"); const head = parts[0].trim();
    const rest = parts.slice(1).map((x) => x.trim()).filter(Boolean);
    if (!head) return [{ level: "erro", msg: "Variável sem nome: escreva algo como {{nome}}." }];
    if (REPEAT_START.test(head) && !parseRepeat(head)) return [{ level: "erro", msg: "Use repetição('prefixo') — confira as aspas e o parêntese final." }];
    if (LIST_START.test(head) && !parseRepeat(head)) return [{ level: "erro", msg: "Use lista('-') — confira as aspas e o parêntese final." }];
    const p = parse(raw);
    if (p.kind === "repeat") {
      if (p.implicit && !p.rich) issues.push({ level: "aviso", msg: "Sem prefixo: vai usar \"-\". Escreva repetição('-') para escolher." });
      if (p.extra) issues.push({ level: "aviso", msg: p.rich ? "Só os dois primeiros argumentos são usados: marcador e título da lista." : "Só os dois primeiros argumentos são usados: prefixo e título da lista." });
    }
    if (p.kind === "calc") {
      const toks = tokenize(p.expr);
      if (!toks) { issues.push({ level: "erro", msg: "Há um caractere que não entendi na conta." }); }
      else {
        let depth = 0; toks.forEach((t) => { if (t.v === "(") depth++; if (t.v === ")") depth--; });
        if (depth !== 0) issues.push({ level: "erro", msg: depth > 0 ? "Falta fechar um parêntese ')'." : "Há um ')' a mais." });
        toks.forEach((t, i) => {
          if (t.t === "v" && toks[i + 1] && toks[i + 1].v === "(" && !FUNCS[t.v.toLowerCase()] && !FUNCS[norm(t.v)] && !filterName(t.v)) {
            const sg = suggestFunc(t.v);
            issues.push({ level: "erro", msg: `Função "${t.v}" não existe.` + (sg ? ` Você quis dizer ${sg}?` : "") });
          }
        });
        if (!issues.length) {
          diagnosing = true; let r; try { r = evaluate(p.expr, { lookup: () => N(2) }); } finally { diagnosing = false; }
          if (r.k !== "s" && !isFinite(r.v)) issues.push({ level: "aviso", msg: "A conta parece incompleta — confira operadores e parênteses." });
        }
      }
    }
    const valid = rest.map(parseFilter);
    rest.forEach((r, i) => {
      if (valid[i]) return;
      const word = r.split(":")[0].trim();
      const mixed = valid.some(Boolean) || p.kind === "calc";
      if (/\s/.test(word) || (!mixed && !(rest.length === 1 && /^[a-zà-ÿ_]+$/.test(word)))) return; // parece opção de lista
      const sg = suggestFilter(word);
      if (sg) issues.push({ level: "aviso", msg: `"${word}" não é um filtro conhecido` + (p.kind === "var" ? " — o conteúdo está sendo tratado como lista de opções" : " (foi ignorado)") + `. Quis dizer | ${sg}?` });
      else if (p.kind === "calc") issues.push({ level: "aviso", msg: `Filtro "${word}" desconhecido — foi ignorado.` });
    });
    if (p.kind === "var" && p.filters.some((f) => f.name === "trocar") && p.filters.find((f) => f.name === "trocar").args.length < 2)
      issues.push({ level: "aviso", msg: "Use | trocar:de:para (dois argumentos)." });
    return issues;
  }

  // Resolve um token mostrando também o que ainda falta e os avisos.
  // -> { text, missing: [nomes sem valor], issues }
  function preview(raw, values) {
    const missing = variablesIn(raw).filter((v) => !v.repeat).map((v) => v.name).filter((n) => !isBuiltin(n) && rawValue(n, values) == null);
    return { text: resolve(raw, values), missing: [...new Set(missing)], issues: diagnose(raw) };
  }

  const api = { LIST_MARKS: { open: LIST_OPEN, sep: LIST_SEP, close: LIST_CLOSE }, parseRepeat, BUILTIN, FILTERS, FUNCS, parse, resolve, variablesIn, isBuiltin, evaluate, parseNumberBR, parseDate, parseTime, formatTime, setExtraHolidays, isHoliday, isBusinessDay, extenso, extensoReais, fmtDateBR, diagnose, preview, checkInput, hintFor, cpfOk, cnpjOk };
  root.MapeadorVars = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
