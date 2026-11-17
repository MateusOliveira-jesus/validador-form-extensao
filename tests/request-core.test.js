// Rode com: node tests/request-core.test.js
const assert = require("assert");
const C = require("../js/request-core.js");
const V = require("../js/variaveis.js");

let n = 0;
const t = (name, fn) => { fn(); n++; };

// ---- tipos
t("detectType", () => {
  assert.strictEqual(C.detectType("42"), "number");
  assert.strictEqual(C.detectType("0123"), "string"); // CPF/CEP continuam texto
  assert.strictEqual(C.detectType("true"), "boolean");
  assert.strictEqual(C.detectType('["a"]'), "list");
  assert.strictEqual(C.detectType('{"a":1}'), "json");
  assert.strictEqual(C.detectType(null), "null");
});
t("convertValue", () => {
  assert.strictEqual(C.convertValue("12,5", "number"), 12.5);
  assert.strictEqual(C.convertValue("abc", "number"), "abc"); // inválido segue como texto
  assert.deepStrictEqual(C.convertValue("a, b", "list"), ["a", "b"]);
  assert.strictEqual(C.convertValue("sim", "boolean"), true);
  assert.strictEqual(C.convertValue("", "null"), null);
});
t("typeProblem", () => {
  assert.strictEqual(C.typeProblem("12", "number"), "");
  assert.ok(C.typeProblem("x", "number"));
  assert.ok(C.typeProblem("{", "json"));
  assert.ok(C.typeProblem("[1", "list"));
});
t("asList", () => {
  assert.deepStrictEqual(C.asList("c[]", "2"), ["2"]);
  assert.deepStrictEqual(C.asList("c[]", ""), []);
  assert.strictEqual(C.asList("c", "2"), "2");
});

// ---- caminho
t("getPath", () => {
  const o = { data: { items: [{ id: 7 }, { id: 8 }] }, errors: { cpf: ["inválido"] }, "a b": 1, nada: null };
  assert.deepStrictEqual(C.getPath(o, "data.items[1].id"), { found: true, value: 8 });
  assert.deepStrictEqual(C.getPath(o, "$.errors.cpf.0"), { found: true, value: "inválido" });
  assert.deepStrictEqual(C.getPath(o, "errors['cpf'][0]"), { found: true, value: "inválido" });
  assert.deepStrictEqual(C.getPath(o, "data.items.length"), { found: true, value: 2 });
  assert.deepStrictEqual(C.getPath(o, "data.items[-1].id"), { found: true, value: 8 });
  assert.deepStrictEqual(C.getPath(o, '["a b"]'), { found: true, value: 1 });
  assert.strictEqual(C.getPath(o, "nada").found, true);
  assert.strictEqual(C.getPath(o, "errors.nome").found, false);
  assert.strictEqual(C.getPath(o, "nada.x").found, false);
});

// ---- verificações
const ctx = (over = {}) => ({
  status: 422, ms: 350, body: { message: "Dados inválidos", errors: { cpf: ["CPF inválido"], nome: [] }, total: 3 },
  text: '{"message":"Dados inválidos"}', headers: { "content-type": "application/json; charset=utf-8" }, ...over,
});
const run = (a, c) => C.evaluate({ enabled: true, ...a }, c || ctx());
t("status", () => {
  assert.ok(run({ type: "status", op: "eq", expected: "422" }).pass);
  assert.ok(!run({ type: "status", op: "eq", expected: "200" }).pass);
  assert.ok(run({ type: "status", op: "ne", expected: "500" }).pass);
  assert.ok(run({ type: "status", op: "in", expected: "401, 422" }).pass);
  assert.ok(run({ type: "status", op: "class", expected: "4xx" }).pass);
  assert.ok(!run({ type: "status", op: "class", expected: "2" }).pass);
  assert.ok(!run({ type: "status", op: "eq", expected: "200" }, ctx({ status: 0 })).pass); // sem resposta
});
t("time", () => {
  assert.ok(run({ type: "time", op: "lt", expected: "1000" }).pass);
  assert.ok(!run({ type: "time", op: "lt", expected: "100" }).pass);
  assert.ok(run({ type: "time", op: "gt", expected: "100" }).pass);
});
t("json", () => {
  assert.ok(run({ type: "json", target: "errors.cpf", op: "exists" }).pass);
  assert.ok(run({ type: "json", target: "errors.email", op: "notexists" }).pass);
  assert.ok(!run({ type: "json", target: "errors.email", op: "exists" }).pass);
  assert.ok(run({ type: "json", target: "message", op: "eq", expected: "Dados inválidos" }).pass);
  assert.ok(run({ type: "json", target: "message", op: "contains", expected: "invalidos" }).pass); // sem acento / caixa
  assert.ok(run({ type: "json", target: "errors.cpf", op: "contains", expected: "cpf inválido" }).pass);
  assert.ok(run({ type: "json", target: "errors.cpf", op: "type", expected: "array" }).pass);
  assert.ok(run({ type: "json", target: "errors.cpf", op: "len", expected: "1" }).pass);
  assert.ok(run({ type: "json", target: "errors.nome", op: "empty" }).pass);
  assert.ok(run({ type: "json", target: "errors.cpf", op: "notempty" }).pass);
  assert.ok(run({ type: "json", target: "total", op: "gt", expected: "2" }).pass);
  assert.ok(run({ type: "json", target: "total", op: "eq", expected: "3" }).pass);
  assert.ok(run({ type: "json", target: "message", op: "regex", expected: "/^dados/i" }).pass);
  assert.ok(!run({ type: "json", target: "x", op: "exists" }, ctx({ body: "<html>", text: "<html>" })).pass); // não é JSON
});
t("body e header", () => {
  assert.ok(run({ type: "body", op: "contains", expected: "inválidos" }).pass);
  assert.ok(run({ type: "body", op: "notcontains", expected: "exception" }).pass);
  assert.ok(run({ type: "body", op: "notempty" }).pass);
  assert.ok(run({ type: "header", target: "Content-Type", op: "contains", expected: "json" }).pass);
  assert.ok(!run({ type: "header", target: "x-nada", op: "exists" }).pass);
});
t("valor esperado obrigatório", () => {
  const r = run({ type: "status", op: "eq", expected: "" });
  assert.ok(!r.pass && /não informado/.test(r.message));
});
t("runAssertions ignora desativadas e descreve", () => {
  const res = C.runAssertions([
    { id: "a", enabled: true, type: "status", op: "eq", expected: "422" },
    { id: "b", enabled: false, type: "status", op: "eq", expected: "200" },
    { id: "c", enabled: true, type: "json", target: "errors.cpf", op: "exists" },
  ], ctx());
  assert.strictEqual(res.length, 2);
  assert.ok(res.every((r) => r.pass));
  assert.strictEqual(res[1].label, "Campo do JSON errors.cpf existe");
});
t("presets", () => {
  const list = C.PRESETS.find((p) => p.id === "errorField").make("cpf");
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[1].target, "errors.cpf");
});

// ---- variáveis
t("variáveis", () => {
  assert.strictEqual(C.resolveTemplate("Oi {{ nome | maiusculas }}", { nome: "ana" }, V), "Oi ANA");
  assert.strictEqual(C.resolveTemplate("sem variável", {}, V), "sem variável");
  assert.deepStrictEqual(C.missingVars("{{nome}} {{hoje}} {{outro}}", { nome: "a" }, V), ["outro"]);
  assert.deepStrictEqual(C.missingVars("{{NOME}}", { nome: "a" }, V), []); // sem diferenciar caixa
});

// ---- validação antes de enviar
t("validateRequest", () => {
  const f = (o) => ({ key: "", value: "", enabled: true, type: "string", ...o });
  const issues = C.validateRequest({
    url: "https://x.com/api",
    fields: [
      f({ key: "cpf", required: true }),
      f({ key: "idade", value: "abc", type: "number" }),
      f({ key: "dup", value: "1" }), f({ key: "dup", value: "2" }),
      f({ key: "tags[]", value: "a" }), f({ key: "tags[]", value: "b" }),
      f({ key: "nome", value: "{{semvalor}}" }),
      f({ key: "off", required: true, enabled: false }),
      f({ value: "orfão" }),
    ],
    values: {}, vars: V,
  });
  const msgs = issues.map((i) => i.msg).join("\n");
  assert.ok(/cpf.*obrigatório e está vazio/.test(msgs));
  assert.ok(/idade.*número/.test(msgs));
  assert.ok(/Nome duplicado: “dup”/.test(msgs));
  assert.ok(!/tags/.test(msgs)); // nome[] repetido é normal
  assert.ok(/semvalor/.test(msgs));
  assert.ok(/off.*desativado/.test(msgs));
  assert.ok(/sem nome/.test(msgs));
  assert.ok(issues.every((i) => i.level === "warn")); // nada bloqueia
  assert.strictEqual(C.validateRequest({ url: "", fields: [] })[0].level, "error");
  assert.strictEqual(C.validateRequest({ url: "ftp://x", fields: [] })[0].level, "error");
  assert.strictEqual(C.validateRequest({ url: "https://x.com", fields: [], headersError: "Headers: JSON inválido" })[0].level, "error");
  assert.deepStrictEqual(C.validateRequest({ url: "https://x.com", fields: [] }), []);
});

// ---- apresentação
t("tokenizeJson", () => {
  const tk = C.tokenizeJson('{\n  "a": [1, true, null, "x"]\n}');
  assert.strictEqual(tk.map((x) => x.s).join(""), '{\n  "a": [1, true, null, "x"]\n}'); // não perde nada
  assert.deepStrictEqual(tk.filter((x) => x.t !== "p").map((x) => x.t), ["key", "num", "bool", "null", "str"]);
});
t("formatBytes e statusClass", () => {
  assert.strictEqual(C.formatBytes(512), "512 B");
  assert.strictEqual(C.formatBytes(2048), "2.0 KB");
  assert.strictEqual(C.formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.deepStrictEqual([200, 302, 404, 500, 0].map(C.statusClass), ["ok", "redirect", "client", "server", "error"]);
});


// ---- ferramentas puras para lote, casos negativos, schema, diff e mascaramento
t("parseBatchInput JSON e CSV", () => {
  assert.deepStrictEqual(C.parseBatchInput('[{"nome":"Ana"},{"nome":"Bia"}]'), [{nome:"Ana"},{nome:"Bia"}]);
  assert.deepStrictEqual(C.parseBatchInput('nome,obs\nAna,"a,b"\nBia,"linha 1\nlinha 2"'), [{nome:"Ana",obs:"a,b"},{nome:"Bia",obs:"linha 1\nlinha 2"}]);
  assert.throws(() => C.parseBatchInput('nome,\nAna,1'), /sem nome/);
  assert.deepStrictEqual(C.parseBatchInput('cpf;nome\n123;Ana'), [{cpf:'123',nome:'Ana'}]);
  assert.throws(() => C.parseBatchInput('cpf,cpf\n1,2'), /duplicados/);
});
t("negativeCases", () => {
  const cases = C.negativeCases("x", ["empty", "spaces", "long", "wrongType", "special"]);
  assert.strictEqual(cases.length, 5);
  assert.strictEqual(cases[0].value, "");
  assert.strictEqual(cases[2].value.length, 1001);
  const bounded=C.negativeCases(10,['numericBounds'],{minimum:1,maximum:20});
  assert.deepStrictEqual(bounded.map(x=>x.value),[0,21]);
});
t("validateJsonSchema", () => {
  const schema = {type:"object", required:["id"], properties:{id:{type:"integer", minimum:1}, name:{type:"string", minLength:2}}, additionalProperties:false};
  assert.deepStrictEqual(C.validateJsonSchema({id:2,name:"Ana"}, schema), []);
  assert.ok(C.validateJsonSchema({id:0,x:true}, schema).length >= 2);
  assert.deepStrictEqual(C.validateJsonSchema('ana',{type:'string',format:'email'}).map(x=>x.message),['e-mail inválido']);
  assert.ok(C.validateJsonSchema({x:1},{type:'object',oneOf:[{required:['x']},{required:['x']}]}).some(x=>/oneOf/.test(x.message)));
  assert.ok(C.validateJsonSchema({a:2},{type:'object',properties:{a:{type:'number',multipleOf:3}}}).length);
});
t("jsonDiff e redactSensitive", () => {
  assert.deepStrictEqual(C.jsonDiff({a:1,b:2},{a:2,c:3}), [
    {path:"$.a",expected:1,actual:2},{path:"$.b",expected:2,actual:"<ausente>"},{path:"$.c",expected:"<ausente>",actual:3}
  ]);
  assert.deepStrictEqual(C.redactSensitive({token:"abc",authorization:"Basic xyz",bearer:"abc",nested:{password:"pw",name:"Ana"}}), {token:"[REDACTED]",authorization:"[REDACTED]",bearer:"[REDACTED]",nested:{password:"[REDACTED]",name:"Ana"}});
});

console.log(`todos os ${n} grupos de testes ok`);
