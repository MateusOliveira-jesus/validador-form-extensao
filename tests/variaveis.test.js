// Rode com: node tests/variaveis.test.js
const V = require("../js/variaveis.js");
const assert = require("assert");
const v = { preco: "10,50", qtd: "3", total: "1.500,00", inicio: "8h", fim: "17:30", nasc: "15/03/1990",
  ini: "01/01/2026", fimd: "31/01/2026", nome: "  maria da silva souza ", cpf: "12345678901", tel: "11987654321", cep: "01310100", vazio: "", milhar: "1.500", en: "1,234,567", dec: "0.500" };
const cases = [
  ["preco * qtd", "31,5"], ["preco * qtd | 2", "31,50"], ["preco * qtd | moeda", "R$ 31,50"],
  ["total | moeda", "R$ 1.500,00"], ["total * 1000 | milhar", "1.500.000"], ["total * 0,1 | pct", "150%"],
  ["arred(preco / 3, 2)", "3,5"], ["max(preco, qtd, 2)", "10,5"], ["media(1, 2, 3, 4)", "2,5"], ["soma(1, 2, 3)", "6"], ["soma(1;2;3)", "6"],
  ['se(total > 1000, "Alto", "Baixo")', "Alto"], ['se(qtd >= 5 e preco < 20, "A", "B")', "B"],
  ["fim - inicio | h", "09:30"], ["fim - inicio | horas_dec", "9,50"], ["fim - inicio | min", "570"],
  ["ini + 30", "31/01/2026"], ["fimd - ini", "30"], ["meses(ini, 1) | iso", "2026-02-01"],
  ["dias_uteis(ini, 5)", "08/01/2026"], ["idade(nasc, ini)", "35"], ["nasc | data_extenso", "15 de março de 1990"],
  ["nasc | iso", "1990-03-15"], ["nasc | dia_semana", "quinta-feira"],
  ["nome | aparar | titulo", "Maria da Silva Souza"], ["nome | primeiro_nome | maiusculas", "MARIA"], ["nome | iniciais", "MSS"],
  ["nome | ultimo_nome", "souza"], ["cpf | cpf", "123.456.789-01"], ["tel | telefone", "(11) 98765-4321"], ["cep | cep", "01310-100"],
  ["vazio | padrao:N/A", "N/A"], ["qtd | zeros:5", "00003"], ["1234,56 | extenso_reais", "mil, duzentos e trinta e quatro reais e cinquenta e seis centavos"],
  ["=21 | extenso", "vinte e um"], ["=2000000 | extenso_reais", "dois milhões de reais"], ["preco | ponto", "10.5"],
  ["8:32 | h", "08:32"], ['juntar(nome | aparar)', null],
  // v32
  ["umMil | numero", null],
  ["milhar + 1", "1501"], ["dec + 1", "1,5"], ["en + 0", "1234567"], ["milhar | milhar", "1.500"],
  ["maiusculas(nome)", null], ['maiusculas(primeiro_nome(nome))', null],
  ['se(vazio(vazio), "-", "x")', "-"], ['juntar(esquerda(nome, 3), "-", cpf)', null],
  ['esquerda(cpf, 3)', "123"], ['moeda(total)', "R$ 1.500,00"], ['contem(nome, "SILVA")', "1"], ['se(contem(nome, "silva"), "S", "N")', "S"],
  ["cpf_valido(\"529.982.247-25\")", "1"], ["cpf_valido(cpf)", "0"], ["cnpj_valido(\"11.222.333/0001-81\")", "1"],
  ["dia_util(data(25, 12, 2027))", "27/12/2027"], ["dias_uteis_entre(ini, fimd)", "21"],
  ["total | valor", "1.500,00"], ["nasc | data_curta", "15/03/90"], ["nasc | mes_ano", "03/1990"], ["nome | sem_espacos", "mariadasilvasouza"],
  ["qtd | sim_nao", "Sim"], ["escolher(2, \"a\", \"b\", \"c\")", "b"], ["seerro(1 / 0, \"erro\")", "erro"],
  ["nome | maiuscula", "  MARIA DA SILVA SOUZA "], ["rg(cpf)", null],
];
let fail = 0;
for (const [expr, exp] of cases) {
  if (exp == null) continue;
  const got = V.resolve(expr, v);
  if (got !== exp) { fail++; console.log("FALHOU", JSON.stringify(expr), "=>", JSON.stringify(got), "esperado", JSON.stringify(exp)); }
}
// compatibilidade
assert.deepStrictEqual(V.parse("cor|Azul|Verde").options, ["Azul", "Verde"]);
assert.deepStrictEqual(V.variablesIn("se(total > 1, a, b)").map((x) => x.name).sort(), ["a", "b", "total"]);
assert.deepStrictEqual(V.variablesIn("nome | maiusculas").map((x) => x.name), ["nome"]);
// diagnóstico
const dg = (r) => V.diagnose(r).map((i) => i.level + ":" + i.msg);
assert.deepStrictEqual(dg("nome | maiusculas"), []);
assert.deepStrictEqual(dg("cor|Azul|Verde"), []);
assert.deepStrictEqual(dg("op|Sim|Não"), []);
assert.ok(dg("nome | maiusculs")[0].includes("Quis dizer | maiusculas"));
assert.ok(dg("total * (a + b")[0].includes("parêntese"));
assert.ok(dg("arredd(x, 2)")[0].includes("arred"));
assert.ok(dg("")[0].startsWith("erro"));
// dicas e padrão
assert.strictEqual(V.variablesIn("nasc | idade")[0].hint, "date");
assert.strictEqual(V.variablesIn("a * b")[0].hint, "number");
assert.strictEqual(V.variablesIn("fim - inicio | h")[0].hint, "time");
assert.strictEqual(V.variablesIn("cidade | padrao:SP")[0].default, "SP");
assert.strictEqual(V.variablesIn("idade(nascimento)")[0].hint, "date");
assert.ok(V.checkInput("31/02/2026", "date"));
assert.strictEqual(V.checkInput("15/03/1990", "date"), "");
assert.ok(V.checkInput("abc", "number"));
assert.deepStrictEqual(V.preview("preco * qtd | moeda", { preco: "2" }).missing, ["qtd"]);
// v32.2 — lista com repetição
const L = { "lista:-": "Mateus\nTeste\nTeste", "lista:*": "um\n\n  dois  \n", "lista:Equipe": "ana\nbia", "lista:•": "x", "lista:itens": "a\nb", "lista:->": "k" };
const rcases = [
  ["repetição('-')", "- Mateus\n- Teste\n- Teste"],              // o exemplo do pedido
  ["  repetição('-')  ", "- Mateus\n- Teste\n- Teste"],          // espaços em volta
  ["repeticao('-')", "- Mateus\n- Teste\n- Teste"],              // sem acento
  ["REPETIÇÃO('-')", "- Mateus\n- Teste\n- Teste"],              // maiúsculas
  ['repetição("-")', "- Mateus\n- Teste\n- Teste"],              // aspas duplas
  ["repetição(‘-’)", "- Mateus\n- Teste\n- Teste"],              // aspas curvas
  ["repetição('*')", "* um\n* dois"],                            // ignora linhas vazias e apara
  ["repetição('•')", "• x"],
  ["repetição('-', 'Equipe')", "- ana\n- bia"],                  // título identifica a lista
  ["repetição('-'; 'Equipe')", "- ana\n- bia"],                  // ; também separa
  ["repetição('')", "a\nb"],                                     // sem prefixo
  ["repetição('->')", "-> k"],
  ["repetição('-') | maiusculas", "- MATEUS\n- TESTE\n- TESTE"], // filtro por item
  ["repetição('-', 'Outra')", ""],                               // lista sem itens some
];
for (const [expr, exp] of rcases) {
  const got = V.resolve(expr, L);
  if (got !== exp) { fail++; console.log("FALHOU", JSON.stringify(expr), "=>", JSON.stringify(got), "esperado", JSON.stringify(exp)); }
}
// prefixo com espaço no fim é respeitado (sem espaço duplo)
assert.strictEqual(V.resolve("repetição('→ ')", { "lista:→": "a" }), "→ a");
// três itens exatos, como no pedido: três linhas
assert.strictEqual(V.resolve("repetição('*')", { "lista:*": "Mateus\nTeste\nTeste" }).split("\n").length, 3);
// o nome da chave é achado sem diferenciar maiúsculas
assert.strictEqual(V.resolve("repetição('-', 'EQUIPE')", { "lista:equipe": "z" }), "- z");
// perguntas: a lista aparece como UMA variável do tipo lista (e nunca como variável comum)
const vi = V.variablesIn("repetição('*', 'Participantes')");
assert.strictEqual(vi.length, 1);
assert.deepStrictEqual([vi[0].repeat, vi[0].prefix, vi[0].label, vi[0].name], [true, "*", "Participantes", "lista:Participantes"]);
assert.strictEqual(V.variablesIn("repetição('-')")[0].name, "lista:-");
assert.deepStrictEqual(V.preview("repetição('-')", {}).missing, []); // não conta como "variável faltando"
assert.strictEqual(V.parse("repetição('-')").kind, "repeat");
// a repetição não atrapalha o que já existia
assert.strictEqual(V.parse("repetir(x, 2)").kind, "calc");
assert.strictEqual(V.resolve("nome | primeiro_nome", { nome: "Ana Maria" }), "Ana");
// diagnóstico
assert.deepStrictEqual(dg("repetição('-')"), []);
assert.deepStrictEqual(dg("repetição('-', 'Equipe')"), []);
assert.ok(dg("repetição('-'")[0].startsWith("erro:Use repetição("));   // parêntese faltando
assert.ok(dg("repetição('-)")[0].startsWith("erro:Use repetição("));   // aspa faltando
assert.ok(dg("repetição()")[0].startsWith("aviso:Sem prefixo"));
assert.ok(dg("repetição('-', 'a', 'b')")[0].startsWith("aviso:"));
// texto completo, como a extensão faz: várias variáveis + lista na mesma mensagem
const msg = "Olá {{nome | primeiro_nome}}\n\n{{ repetição('-') }}";
const rx = /\{\{\s*([^{}]+?)\s*\}\}/g;
assert.strictEqual(msg.replace(rx, (_, r) => V.resolve(r, { nome: "Mateus Silva", ...L })), "Olá Mateus\n\n- Mateus\n- Teste\n- Teste");
// v33 — lista de editor  {{ lista('-') }}
const LI = { "itens:-": "Mateus\nTeste\nTeste", "itens:1.": "um\ndois", "itens:Equipe": "ana\nbia", "itens:*": "x", "lista:-": "rep1\nrep2" };
const M = V.LIST_MARKS;
const rich = (e, vals = LI) => V.resolve(e, vals, { rich: true });
const lcases = [
  // texto simples (prévia / campo sem editor): igual à repetição
  ["lista('-')", "- Mateus\n- Teste\n- Teste"],
  ["lista()", "- Mateus\n- Teste\n- Teste"],                      // sem argumento = marcadores
  ["LISTA('-')", "- Mateus\n- Teste\n- Teste"],                    // maiúsculas
  ['lista("-")', "- Mateus\n- Teste\n- Teste"],                    // aspas duplas
  ["lista(‘-’)", "- Mateus\n- Teste\n- Teste"],                    // aspas curvas
  ["lista('-', 'Equipe')", "- ana\n- bia"],                       // título
  ["lista('-'; 'Equipe')", "- ana\n- bia"],
  ["lista('*')", "* x"],
  ["lista('1.')", "1. um\n2. dois"],                              // numerada: numera de verdade
  ["lista('-') | maiusculas", "- MATEUS\n- TESTE\n- TESTE"],      // filtro por item
  ["lista('-', 'Outra')", ""],                                    // sem itens some
  ["repetição('-')", "- rep1\n- rep2"],                           // repetição continua independente da lista
];
for (const [expr, exp] of lcases) {
  const got = V.resolve(expr, LI);
  if (got !== exp) { fail++; console.log("FALHOU", JSON.stringify(expr), "=>", JSON.stringify(got), "esperado", JSON.stringify(exp)); }
}
// modo rich: marcas privadas (e nunca vazam no modo normal)
assert.strictEqual(rich("lista('-')"), M.open + "u-" + M.sep + "Mateus" + M.sep + "Teste" + M.sep + "Teste" + M.close);
assert.strictEqual(rich("lista('1.')"), M.open + "o1." + M.sep + "um" + M.sep + "dois" + M.close);
assert.strictEqual(rich("lista('-', 'Outra')"), "");
assert.ok(!/[\uE000-\uE002]/.test(V.resolve("lista('-')", LI)));
assert.strictEqual(rich("repetição('-')"), "- rep1\n- rep2");     // repetição nunca usa marcas, nem no modo rich
assert.strictEqual(rich("lista('-') | maiusculas"), M.open + "u-" + M.sep + "MATEUS" + M.sep + "TESTE" + M.sep + "TESTE" + M.close);
// itens com as marcas privadas não quebram o formato
assert.strictEqual(rich("lista('-')", { "itens:-": "a\uE002b\nc" }), M.open + "u-" + M.sep + "ab" + M.sep + "c" + M.close);
// lista e repetição com o mesmo prefixo NÃO compartilham itens
assert.notStrictEqual(V.parse("lista('-')").name, V.parse("repetição('-')").name);
assert.strictEqual(V.parse("lista('-')").kind, "repeat");
assert.deepStrictEqual([V.parse("lista('1.')").ordered, V.parse("lista('1)')").ordered, V.parse("lista('-')").ordered, V.parse("lista('1x')").ordered], [true, true, false, false]);
// perguntas: uma variável do tipo lista, marcada como lista de editor
const lv = V.variablesIn("lista('*', 'Participantes')");
assert.strictEqual(lv.length, 1);
assert.deepStrictEqual([lv[0].repeat, lv[0].rich, lv[0].ordered, lv[0].prefix, lv[0].label, lv[0].name], [true, true, false, "*", "Participantes", "itens:Participantes"]);
assert.strictEqual(V.variablesIn("repetição('-')")[0].rich, false);
assert.deepStrictEqual(V.preview("lista('-')", {}).missing, []);
// texto + lista na mesma mensagem, como a extensão faz (rich = envio ao formulário)
const lmsg = "Participantes:\n{{ lista('-') }}\nFim";
assert.strictEqual(lmsg.replace(rx, (_, r) => V.resolve(r, LI)), "Participantes:\n- Mateus\n- Teste\n- Teste\nFim");
assert.strictEqual(lmsg.replace(rx, (_, r) => V.resolve(r, LI, { rich: true })), "Participantes:\n" + rich("lista('-')") + "\nFim");
// não atrapalha o que já existia
assert.strictEqual(V.parse("lista_x").kind, "var");
assert.strictEqual(V.resolve("lista_x", { lista_x: "ok" }), "ok");
assert.strictEqual(V.resolve("lista", { lista: "ok" }), "ok");    // variável chamada "lista" (sem parênteses) continua sendo pergunta comum
// diagnóstico
assert.deepStrictEqual(dg("lista('-')"), []);
assert.deepStrictEqual(dg("lista()"), []);                        // sem aviso: lista() é um uso normal
assert.deepStrictEqual(dg("lista('-', 'Equipe')"), []);
assert.ok(dg("lista('-'")[0].startsWith("erro:Use lista("));      // parêntese faltando
assert.ok(dg("lista('-)")[0].startsWith("erro:Use lista("));      // aspa faltando
assert.ok(dg("lista('-', 'a', 'b')")[0].startsWith("aviso:Só os dois primeiros"));
// v53 — duração automática a partir de horários (HH:MM), com unidade no resultado
const bancoHoras = { priodoDas: "07:14", "priodoÀs": "8:00" };
assert.strictEqual(V.resolve("priodoÀs - priodoDas | duracao", bancoHoras), "46 min");
assert.strictEqual(V.resolve("fim - inicio | duracao", { fim: "09:30", inicio: "08:00" }), "1h 30 min");
assert.strictEqual(V.resolve("fim - inicio | duracao", { fim: "10:00", inicio: "08:00" }), "2h");
assert.strictEqual(V.resolve("fim - inicio | duracao", { fim: "08:30", inicio: "08:00" }), "30 min");
assert.deepStrictEqual(dg("priodoÀs - priodoDas | duracao"), []);
assert.strictEqual(V.resolve("fim - inicio | duracao_extenso", { fim: "18:30", inicio: "08:00" }), "10 horas e 30 min");
assert.strictEqual(V.resolve("fim - inicio | duracao_extenso", { fim: "09:30", inicio: "08:00" }), "1 hora e 30 min");
assert.strictEqual(V.resolve("fim - inicio | duracao_extenso", { fim: "10:00", inicio: "08:00" }), "2 horas");
assert.strictEqual(V.resolve("fim - inicio | duracao_extenso", { fim: "08:30", inicio: "08:00" }), "30 min");

// ---- dia útil: fim de semana e feriado (subtrai = volta, soma = avança) ----
const du = (e, d) => V.resolve(e, { d });
// 2026: 03/04 = Sexta-feira Santa · 07/09 = Independência (segunda) · 20/11 = Consciência Negra (sexta)
assert.strictEqual(du("d + 1 | dia_util", "05/09/2026"), "08/09/2026"); // dom 06 -> seg 07 feriado -> ter 08
assert.strictEqual(du("d - 1 | dia_util", "06/09/2026"), "04/09/2026"); // sáb 05 -> sex 04
assert.strictEqual(du("dia_util_auto(d - 3)", "06/04/2026"), "02/04/2026"); // sex 03 feriado -> qui 02
assert.strictEqual(du("dia_util_auto(d + 3)", "31/03/2026"), "06/04/2026"); // sex 03 feriado -> seg 06
assert.strictEqual(du("dia_util_antes(d)", "03/04/2026"), "02/04/2026");
assert.strictEqual(du("dia_util_depois(d)", "03/04/2026"), "06/04/2026");
assert.strictEqual(du("dia_util_antes(d)", "08/04/2026"), "08/04/2026"); // já é dia útil: não muda
assert.strictEqual(du("d | dia_util:antes", "03/04/2026"), "02/04/2026");
assert.strictEqual(du("dia_util(d)", "20/11/2026"), "23/11/2026"); // função antiga agora também pula feriado
assert.strictEqual(du("dia_util_auto(meses(d, -1))", "31/03/2026"), "27/02/2026"); // 28/02 sáb -> sex
assert.strictEqual(du("dia_util_auto(meses(d, 1))", "31/01/2026"), "02/03/2026"); // 28/02 sáb -> seg
assert.strictEqual(du("ultimo_dia_util(d)", "10/05/2026"), "29/05/2026");
assert.strictEqual(du("primeiro_dia_util(d)", "15/11/2026"), "03/11/2026"); // 01 dom, 02 feriado
assert.strictEqual(du("eh_feriado(d)", "20/11/2026"), "1");
assert.strictEqual(du("eh_dia_util(d)", "21/11/2026"), "0");
assert.strictEqual(du("dias_uteis(d, 1)", "02/04/2026"), "06/04/2026");
assert.strictEqual(du("dias_uteis(d, -1)", "06/04/2026"), "02/04/2026");
assert.strictEqual(du("dia_util_auto(d - 3)", ""), ""); // data vazia não vira 01/01/1970
assert.deepStrictEqual(dg("dia_util_auto(data + 30)"), []);
assert.deepStrictEqual(dg("ultimo_dia_util(data)"), []);
// feriados extras (estaduais/municipais)
assert.strictEqual(V.setExtraHolidays("02/04/2026, 25/01, lixo"), 2);
assert.strictEqual(du("dia_util_antes(d)", "03/04/2026"), "01/04/2026");
assert.strictEqual(du("dia_util(d)", "25/01/2027"), "26/01/2027");
V.setExtraHolidays("");
assert.strictEqual(du("dia_util_antes(d)", "03/04/2026"), "02/04/2026");
console.log(fail ? `${fail} falha(s)` : `todos os ${cases.length - 1 + rcases.length + lcases.length} casos ok`);
process.exit(fail ? 1 : 0);
