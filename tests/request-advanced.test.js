'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/request-core.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const advanced = fs.readFileSync(path.join(root, 'js/request-advanced.js'), 'utf8');
const request = fs.readFileSync(path.join(root, 'js/request.js'), 'utf8');
const report = fs.readFileSync(path.join(root, 'js/request-report.js'), 'utf8');

// Lote: formatos JSON e CSV delimitados, preservação de colunas e valores entre aspas.
assert.deepEqual(C.parseBatchInput('[{"cpf":"001","nome":"Ana"}]'), [{ cpf: '001', nome: 'Ana' }]);
assert.deepEqual(C.parseBatchInput('cpf;nome\n001;"Ana; Maria"'), [{ cpf: '001', nome: 'Ana; Maria' }]);
assert.deepEqual(C.parseBatchInput('cpf\tnome\n001\tAna'), [{ cpf: '001', nome: 'Ana' }]);
assert.throws(() => C.parseBatchInput('cpf,cpf\n1,2'), /duplicados/);

// Casos negativos configuráveis e validação de schema/diferenças.
const negative = C.negativeCases('12', ['empty', 'spaces', 'long', 'wrongType', 'special', 'numericBounds'], { maxLength: 1500, minimum: 1, maximum: 10 });
assert.equal(negative.length, 7);
assert.equal(negative.find(x => x.kind === 'long').value.length, 1500);
assert.deepEqual(negative.filter(x => ['belowMinimum', 'aboveMaximum'].includes(x.kind)).map(x => x.value), [0, 11]);
assert.equal(C.validateJsonSchema({ id: 2, email: 'a@b.com' }, { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 }, email: { type: 'string', format: 'email' } } }).length, 0);
assert.ok(C.validateJsonSchema({ id: 0 }, { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } }).length);
assert.equal(C.jsonDiff({ id: 1 }, { id: 2 })[0].path, '$.id');
assert.equal(C.redactSensitive({ bearer: 'secret' }).bearer, '[REDACTED]');

// Integração estática da interface, segurança e compatibilidade de armazenamento.
for (const id of ['reqBatchRun', 'reqBatchStop', 'reqBatchExport', 'reqNegativeRun', 'reqParamsSync', 'reqImportCurl', 'reqAdvancedTimeout', 'reqAdvancedRetries', 'reqCancelCurrent', 'reqFileInput', 'reqExpectedFailure']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `controle ausente: ${id}`);
}
// A seção avançada foi simplificada: os recursos removidos não podem deixar controles órfãos.
for (const id of ['reqEnvSelect', 'reqSchemaRun', 'reqComparePrevious', 'reqImportPostman', 'reqAdvancedAuth', 'reqHtmlPreview', 'reqReportMarkdown', 'reqFolderAssign', 'reqTemplateSave']) {
  assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), `controle removido ainda presente: ${id}`);
}
// Params fica em painel próprio (antes ficava escondido dentro dos testes avançados).
assert.match(html, /data-req-content="params"/);
// Todo id usado pelo módulo avançado precisa existir no HTML.
for (const m of advanced.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)) assert.match(html, new RegExp(`id=["']${m[1]}["']`), `id usado no JS e ausente no HTML: ${m[1]}`);
// Nome da extensão.
assert.match(html, /<title>Validador e Formulário<\/title>/);
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).name, 'Validador e Formulário');
assert.match(html, /<script src="js\/request-advanced\.js"><\/script>/);
assert.doesNotMatch(advanced, /innerHTML\s*=/, 'módulo avançado não deve inserir dados de resposta com innerHTML');
assert.doesNotMatch(report, /\.innerHTML\s*=/, 'relatório deve construir a interface com APIs DOM seguras');
for (const key of ['requestV22', 'requestProfilesV24', 'requestHistoryV23']) assert.ok(request.includes(key), `compatibilidade perdida: ${key}`);
assert.match(report, /req-report-severity/);
assert.match(request, /AbortController/);
console.log('request-advanced: todos os testes passaram');
