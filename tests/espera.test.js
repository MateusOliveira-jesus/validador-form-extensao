// Rode com: node tests/espera.test.js
// Confere a espera (⏱) antes de cada campo no content.js.
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const noop = () => {};
const ctx = {
  console, setTimeout, clearTimeout, Promise,
  chrome: { runtime: { onMessage: { addListener: noop }, getURL: (p) => p, lastError: null }, storage: { local: { get: noop, set: noop }, onChanged: { addListener: noop } } },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  addEventListener: noop, MutationObserver: undefined,
};
ctx.window = ctx; ctx.window.top = {}; // window !== window.top: não inicia o painel flutuante
ctx.document = { getElementById: () => null, querySelectorAll: () => [], addEventListener: noop, documentElement: {}, body: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../js/content.js", "utf8"), ctx);

// fieldDelayMs
const ms = (d, k) => vm.runInContext(`fieldDelayMs(${JSON.stringify(d)}, ${JSON.stringify(k)})`, ctx);
assert.strictEqual(ms({ a: 2 }, "a"), 2000);
assert.strictEqual(ms({ a: 0.5 }, "a"), 500);
assert.strictEqual(ms({ a: -1 }, "a"), 0);
assert.strictEqual(ms({ a: "x" }, "a"), 0);
assert.strictEqual(ms({ a: 99999 }, "a"), 600000); // teto de 10 min
assert.strictEqual(ms(null, "a"), 0);
assert.strictEqual(ms({ a: 1 }, "b"), 0);

// fillForm: espera ANTES de localizar/preencher, só nos campos com espera
const log = [];
const t0 = Date.now();
ctx.findField = (key) => { log.push({ ev: "find", key, t: Date.now() - t0 }); return { isConnected: true, disabled: false, closest: () => null, getAttribute: () => null }; };
ctx.fillField = async (el) => ({ note: "" });
(async () => {
  const r = await ctx.fillForm({ a: "1", b: "2", c: "" }, { b: 0.2, c: 5 });
  const find = Object.fromEntries(log.map((l) => [l.key, l.t]));
  assert.ok(find.a < 100, "campo sem espera não deve aguardar");
  assert.ok(find.b >= 190, "campo b deveria esperar ~0,2 s antes de ser localizado: " + find.b);
  assert.ok(!("c" in find), "campo vazio é ignorado e não espera");
  assert.strictEqual(r.report.filled, 2);
  const fb = r.report.fields.find((f) => f.field === "b");
  assert.ok(/aguardou 0.2 s/.test(fb.reason), "relatório deve registrar a espera");
  assert.ok(!r.report.fields.find((f) => f.field === "a").reason);
  // sem o parâmetro delays continua funcionando como antes
  const r2 = await ctx.fillForm({ a: "1" });
  assert.strictEqual(r2.report.filled, 1);
  console.log("espera.test.js: ok");
})().catch((e) => { console.error(e); process.exit(1); });

// Regressão v55.2.4: o botão "Preencher" e o histórico montam os dados sozinhos e precisam
// carregar as esperas do perfil (antes: "Nenhuma espera configurada" mesmo com ⏱ salvo).
{
  const src = fs.readFileSync(__dirname + "/../js/popup.js", "utf8");
  const fillBtn = src.slice(src.indexOf('fillProfileBtn.addEventListener("click"'));
  const head = fillBtn.slice(0, 700);
  assert.ok(/pendingFillDelays = cleanFieldDelays\(profile\.fieldDelays\)/.test(head), "Preencher deve carregar as esperas do perfil");
  assert.ok(/pendingFillProfileId = profile\.id/.test(head), "Preencher deve registrar o id do perfil");
  const hist = src.slice(src.indexOf("function useHistoryItem"), src.indexOf("function viewHistoryItem"));
  assert.ok(/pendingFillDelays = cleanFieldDelays/.test(hist) && /pendingFillProfileId = profile\.id/.test(hist), "Histórico deve carregar esperas e id");
  console.log("ok: caminhos de preenchimento carregam as esperas");
}
