// Rode com: node tests/backup.test.js
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const el = () => ({ addEventListener() {}, click() {} });
const win = { };
const ctx = { window: win, document: { getElementById: el, dispatchEvent() {}, createElement: el, body: {} }, chrome: { runtime: { getManifest: () => ({ version: "32.0.0" }) } },
  localStorage: { getItem: () => null, removeItem() {} }, CustomEvent: function () {}, Blob: function () {}, URL: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../js/backup.js", "utf8"), ctx);
const B = win.MapeadorBackup;
assert.ok(B, "backup.js não expôs MapeadorBackup");

const cur = {
  profiles: [{ id: "a", name: "A" }], history: { a: [{ id: "h1", timestamp: 2, data: { x: 1 } }] },
  dadosSalvos: { A: [{ title: "Maria", json: "old", savedAt: "2026-01-01" }] },
  dadoDraft2: { A: { cfg: {}, json: "{}", updatedAt: 5 } }, variableValues: { nome: "Ana" }, variableRecent: { nome: ["Ana"] },
};
const inc = {
  profiles: [{ id: "a", name: "A" }, { id: "b", name: "B" }], history: { a: [{ id: "h1", timestamp: 2, data: { x: 1 } }, { id: "h0", timestamp: 1, data: { y: 1 } }], b: [{ id: "h9", timestamp: 3, data: {} }] },
  dadosSalvos: { A: [{ title: "maria", json: "new", savedAt: "2026-06-01" }, { title: "João", json: "j", savedAt: "2026-02-01" }], B: [{ title: "Z", savedAt: "2026-02-01" }] },
  dadoDraft2: { A: { cfg: { c: 1 }, json: "{}", updatedAt: 9 }, B: { cfg: {}, json: "", updatedAt: 1 } }, variableValues: { nome: "Bia", cpf: "1" }, variableRecent: { nome: ["Bia", "Ana"] },
};
const m = B.merge(cur, inc);
assert.strictEqual(m.profiles.length, 2);
const J = (x) => JSON.stringify(x);
assert.strictEqual(J(m.history.a.map((i) => i.id)), J(["h0", "h1"]));
assert.strictEqual(m.history.b.length, 1);
assert.strictEqual(m.dadosSalvos.A.length, 2);
assert.strictEqual(m.dadosSalvos.A.find((d) => d.title.toLowerCase() === "maria").json, "new"); // versão mais nova
assert.ok(m.dadosSalvos.B);
assert.strictEqual(m.dadoDraft2.A.updatedAt, 9); assert.ok(m.dadoDraft2.B);
assert.strictEqual(J(m.variableValues), J({ nome: "Ana", cpf: "1" })); // o existente vence
assert.strictEqual(J(m.variableRecent.nome), J(["Ana", "Bia"]));
// chaves sensíveis: removidas fora dos dados, preservadas dentro deles
const s = B.sanitizeStore({ apiKey: "x", outra: { token: "t" }, dadosSalvos: { A: [{ title: "t", cfg: { password: { type: "default", value: "123" } } }] } });
assert.ok(!("apiKey" in s)); assert.ok(!("token" in s.outra)); assert.ok("password" in s.dadosSalvos.A[0].cfg);
assert.strictEqual(B.summarize(m).dadosSalvos, 3);
assert.throws(() => B.validate({ foo: 1 }));
assert.throws(() => B.validateData({ dadosSalvos: { A: "x" } }));
// arquivos antigos continuam restauráveis
assert.ok(B.validate({ profiles: [{ id: "x", name: "X" }], mappingFolders: [] }).local.profiles);
assert.ok(B.validate({ kind: "preferencias-ui", prefs: { theme: "dark" } }).local.uiPrefsV3);
// mesclar mantém o existente também em chaves desconhecidas e une listas
const m2 = B.merge({ uiPrefsV3: { theme: "dark" }, pessoasGeradas: [{ id: 1 }], requestProfilesV24: { a: { u: 1 } } },
  { uiPrefsV3: { theme: "light", x: 1 }, pessoasGeradas: [{ id: 1 }, { id: 2 }], requestProfilesV24: { a: { u: 2 }, b: { u: 3 } } });
assert.strictEqual(m2.uiPrefsV3.theme, "dark"); assert.strictEqual(m2.uiPrefsV3.x, 1);
assert.strictEqual(m2.pessoasGeradas.length, 2); assert.strictEqual(m2.requestProfilesV24.a.u, 1); assert.ok(m2.requestProfilesV24.b);
// estado temporário fica fora do backup
assert.ok(!("mapeadorDiscoveryQueueV17" in B.sanitizeStore({ mapeadorDiscoveryQueueV17: [1], profiles: [] })));
console.log("backup: todos os casos ok");
