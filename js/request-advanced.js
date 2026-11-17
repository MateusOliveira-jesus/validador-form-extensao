/* Testes avançados da aba Requisição: lote, casos negativos, importar cURL e opções de envio.
 * Sem dependências externas e sem HTML dinâmico (apenas textContent / APIs DOM). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const C = window.ReqCore;
  if (!$('reqAdvanced') || !C) return;

  const KEY = 'requestAdvancedV1';          // mesma chave de antes: preserva as configurações já salvas
  const REPORT_KEY = 'requestTestReportV25';
  const MAX_ROWS = 500;                     // limite de segurança por execução
  const NEGATIVE_KINDS = ['empty', 'spaces', 'long', 'wrongType', 'special', 'numericBounds'];

  let running = false;
  let stopping = false;
  let batchResults = [];

  // ---------- utilidades ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getStore = (keys) => chrome.storage.local.get(keys);
  const setStore = (value) => chrome.storage.local.set(value);
  const say = (id, text) => { $(id).textContent = String(text ?? ''); };
  const clamp = (n, min, max, fallback) => Math.max(min, Math.min(max, Number(n) || fallback));
  const rateDelay = () => Math.ceil(1000 / clamp($('reqBatchRate').value, 0.01, 100, 1));
  const fire = (el, type = 'input') => el.dispatchEvent(new Event(type, { bubbles: true }));

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ---------- campos da requisição ----------
  const currentFields = () => [...$('reqFieldRows').querySelectorAll('.req-field-row')].map((row) => {
    const input = row.querySelector('[aria-label="Valor do campo"]');
    return { key: row.querySelector('[aria-label="Nome do campo"]')?.value || '', value: input?.value || '', input };
  });
  const captureFieldValues = () => currentFields().map(({ key, value }) => ({ key, value }));
  function setField(key, value) {
    const f = currentFields().find((x) => x.key === key);
    if (!f?.input) return false;
    f.input.value = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    fire(f.input);
    return true;
  }
  const restoreFieldValues = (rows) => { for (const r of rows || []) setField(r.key, r.value); };
  const clearFieldFilter = () => { const f = $('reqFieldFilter'); f.value = ''; fire(f); };

  // ---------- execução da requisição atual ----------
  const snapshotResponse = () => {
    const x = window.__mapeadorRequestLast;
    if (!x) return null;
    return { status: x.status || 0, durationMs: x.durationMs || 0, response: x.response, rawText: x.rawText || '', assertions: x.assertions || [], error: x.error || '' };
  };

  async function executeCurrent() {
    const button = $('reqSend');
    if (button.disabled) throw new Error('Já existe uma requisição em andamento.');
    const before = snapshotResponse();
    delete window.__mapeadorRequestUiError;
    window.__mapeadorReqReuseVars = true;
    try { button.click(); } finally { setTimeout(() => { window.__mapeadorReqReuseVars = false; }, 0); }
    let started = false;
    for (let i = 0; i < 2600; i++) {
      if (button.disabled) started = true;
      if (started && !button.disabled) break;
      if (!started && i >= 4) {
        if (window.__mapeadorRequestUiError) return window.__mapeadorRequestUiError;
        const quick = snapshotResponse();
        if (quick && quick !== before) return quick;
        const msg = $('reqNotice')?.textContent || 'A requisição não iniciou.';
        return { status: 0, durationMs: 0, response: null, rawText: msg, error: msg, assertions: [] };
      }
      await sleep(50);
    }
    if (button.disabled) throw new Error('A requisição não terminou dentro do timeout configurado.');
    return snapshotResponse();
  }

  // Pede confirmação uma vez e desliga a confirmação por envio durante a execução em série.
  async function withSeries(count, label, task) {
    const confirmNode = $('reqConfirm');
    const wasChecked = !!confirmNode?.checked;
    if (wasChecked && $('reqMethod').value !== 'GET'
      && !confirm(`Executar ${count} ${label} para ${$('reqUrl').value}? A operação pode alterar dados no servidor.`)) return;
    const originalValues = captureFieldValues();
    if (confirmNode) confirmNode.checked = false;
    running = true; stopping = false;
    $('reqBatchRun').disabled = true; $('reqNegativeRun').disabled = true; $('reqBatchStop').disabled = false;
    try { await task(); }
    finally {
      restoreFieldValues(originalValues);
      if (confirmNode) confirmNode.checked = wasChecked;
      running = false; stopping = false;
      $('reqBatchRun').disabled = false; $('reqNegativeRun').disabled = false; $('reqBatchStop').disabled = true;
    }
  }

  // ---------- lote ----------
  function renderBatchRows(rows) {
    const body = $('reqBatchRows');
    body.replaceChildren();
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      [i + 1, JSON.stringify(C.redactSensitive(r.data)), r.status || '—', r.ms == null ? '—' : `${r.ms} ms`, r.checks || '—'].forEach((v) => {
        const td = document.createElement('td'); td.textContent = String(v); tr.append(td);
      });
      body.append(tr);
    });
  }

  function batchSummary() {
    const ok = batchResults.filter((x) => x.status >= 200 && x.status < 300).length;
    say('reqBatchSummary', `${batchResults.length} executada(s) · ${ok} HTTP 2xx · ${batchResults.length - ok} outra(s)${stopping ? ' · interrompido' : ''}`);
  }

  async function batchInput() {
    if ($('reqBatchSource').value === 'remembered') {
      const people = (await getStore('pessoasGeradas')).pessoasGeradas || [];
      return people.filter((p) => p?.dados && typeof p.dados === 'object').map((p) => ({ ...p.dados }));
    }
    return C.parseBatchInput($('reqBatchInput').value, 'auto');
  }

  async function runBatch(rows) {
    if (running) return;
    if (!rows.length) throw new Error('Nenhuma linha de dados foi encontrada.');
    if (rows.length > MAX_ROWS) throw new Error(`O limite seguro é ${MAX_ROWS} requisições por execução. Divida os dados em lotes menores.`);
    clearFieldFilter();
    const keys = new Set(currentFields().map((f) => f.key));
    const invalid = rows.findIndex((r) => Object.keys(r).some((k) => !keys.has(k)));
    if (invalid >= 0) throw new Error(`A linha ${invalid + 1} tem um campo que não existe na requisição. Adicione o campo antes de executar; o lote não cria campos.`);

    await withSeries(rows.length, 'requisição(ões) em lote', async () => {
      batchResults = [];
      renderBatchRows([]);
      say('reqBatchSummary', `Iniciando ${rows.length} linha(s)…`);
      for (let i = 0; i < rows.length; i++) {
        if (stopping) break;
        for (const [k, v] of Object.entries(rows[i])) setField(k, v);
        const started = performance.now();
        let result;
        try { result = await executeCurrent(); }
        catch (e) { result = { status: 0, durationMs: Math.round(performance.now() - started), error: e.message, assertions: [] }; }
        const checks = result?.assertions || [];
        batchResults.push({
          data: C.redactSensitive(rows[i]),
          status: result?.status || 0,
          ms: result?.durationMs ?? Math.round(performance.now() - started),
          checks: checks.length ? `${checks.filter((x) => x.pass).length}/${checks.length}` : '—',
          error: result?.error || '',
        });
        renderBatchRows(batchResults);
        batchSummary();
        if (i < rows.length - 1) await sleep(rateDelay());
      }
    });
    batchSummary();
  }

  $('reqBatchRun').addEventListener('click', async () => {
    try { await runBatch(await batchInput()); }
    catch (e) { say('reqBatchSummary', `Erro: ${e.message}`); }
  });
  $('reqBatchStop').addEventListener('click', () => {
    stopping = true; $('reqBatchStop').disabled = true;
    say('reqBatchSummary', 'Parada solicitada; a requisição atual termina antes de interromper.');
  });
  $('reqBatchExport').addEventListener('click', () => {
    if (!batchResults.length) return;
    const cols = ['status', 'ms', 'checks', 'error', 'data'];
    const cell = (v) => '"' + String(typeof v === 'object' ? JSON.stringify(v) : v ?? '').replace(/"/g, '""') + '"';
    const csv = [cols.join(';'), ...batchResults.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\r\n');
    download('resultado-lote.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  });

  // ---------- casos negativos ----------
  function renderNegativeFields() {
    const box = $('reqNegativeFields');
    const checked = new Set([...box.querySelectorAll('input:checked')].map((x) => x.value));
    box.replaceChildren();
    for (const f of currentFields()) {
      if (!f.key) continue;
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = f.key; cb.checked = checked.has(f.key);
      label.append(cb, document.createTextNode(' ' + f.key));
      box.append(label);
    }
  }

  async function annotateLatestReport(note, passed, expected, actual) {
    await sleep(120); // aguarda o relatório registrar a resposta
    const rows = (await getStore(REPORT_KEY))[REPORT_KEY] || [];
    if (!rows[0]) return;
    rows[0].notes = [rows[0].notes, note, `Esperado: ${expected}; obtido: ${actual}`].filter(Boolean).join('\n');
    rows[0].verdict = passed ? 'pass' : 'fail';
    rows[0].auto = true;
    await setStore({ [REPORT_KEY]: rows });
  }

  $('reqNegativeRun').addEventListener('click', async () => {
    if (running) return;
    clearFieldFilter();
    renderNegativeFields();
    // renderNegativeFields mantém a seleção; relê depois de redesenhar
    const selected = [...$('reqNegativeFields').querySelectorAll('input:checked')].map((x) => x.value);
    if (!selected.length) { say('reqNegativeSummary', 'Marque ao menos um campo.'); return; }

    const base = currentFields();
    const cases = [];
    for (const key of selected) {
      const f = base.find((x) => x.key === key);
      for (const c of C.negativeCases(f?.value || '', NEGATIVE_KINDS, { minimum: 0, maximum: 2147483647 })) cases.push({ key, kind: c.kind, value: c.value });
    }
    if (cases.length > MAX_ROWS) { say('reqNegativeSummary', `O limite seguro é ${MAX_ROWS} casos por execução. Marque menos campos.`); return; }

    const expectedStatus = Number($('reqNegativeStatus').value) || 422;
    let passed = 0;
    try {
      await withSeries(cases.length, 'casos negativos', async () => {
        $('reqBatchRows').replaceChildren();
        for (let i = 0; i < cases.length; i++) {
          if (stopping) break;
          const c = cases[i];
          setField(c.key, c.value);
          const r = await executeCurrent();
          const valid = r?.status === expectedStatus;
          if (valid) passed++;
          await annotateLatestReport(`Caso negativo ${c.kind} no campo ${c.key}`, valid, `HTTP ${expectedStatus}`, `HTTP ${r?.status || 0}`);
          const tr = document.createElement('tr');
          [c.key, c.kind, r?.status || 0, valid ? 'Conforme' : 'Divergente'].forEach((v) => {
            const td = document.createElement('td'); td.textContent = String(v); tr.append(td);
          });
          $('reqBatchRows').append(tr);
          say('reqNegativeSummary', `${i + 1}/${cases.length} executados · ${passed} conforme(s) · ${i + 1 - passed} divergente(s)`);
          if (i < cases.length - 1) await sleep(rateDelay());
        }
      });
    } catch (e) { say('reqNegativeSummary', `Erro: ${e.message}`); }
  });

  // ---------- importar cURL ----------
  function importCurl(text) {
    const m = text.match(/(?:^|[\s'"])(https?:\/\/[^\s'"\\]+)/); // aceita URL entre aspas, como no "Copiar como cURL" do navegador
    if (!m) throw new Error('Não encontrei uma URL HTTP no cURL.');
    $('reqUrl').value = m[1].replace(/[;,]+$/, '');
    const method = text.match(/\s-X\s+['"]?([A-Z]+)['"]?/i);
    if (method) $('reqMethod').value = method[1].toUpperCase();
    const headers = {};
    for (const h of text.matchAll(/-H\s+['"]([^:'"]+):\s*([^'"]*)['"]/g)) headers[h[1]] = h[2];
    if (Object.keys(headers).length) { $('reqHeaders').value = JSON.stringify(headers, null, 2); fire($('reqHeaders')); }
    // corpo entre aspas simples (pode conter aspas duplas, como todo JSON) ou entre aspas duplas
    const data = text.match(/(?:--data-raw|--data-binary|--data|-d)\s+(?:'([^']*)'|"((?:\\.|[^"\\])*)")/);
    if (data) {
      try {
        const obj = JSON.parse(data[1] ?? data[2].replace(/\\(["\\$`])/g, '$1'));
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj)) {
            if (!currentFields().some((f) => f.key === k)) {
              // cria a linha e já dá o nome, senão setField não a encontra
              $('reqAddRow').click();
              const rows = $('reqFieldRows').querySelectorAll('.req-field-row');
              const nameInput = rows[rows.length - 1]?.querySelector('[aria-label="Nome do campo"]');
              if (nameInput) { nameInput.value = k; fire(nameInput); }
            }
            setField(k, v);
          }
        }
      } catch { /* corpo que não é JSON: ignora */ }
    }
    fire($('reqUrl'));
  }
  $('reqImportCurl').addEventListener('click', () => {
    try { importCurl($('reqImportText').value); alert('cURL importado. Confira URL, headers e campos antes de enviar.'); }
    catch (e) { alert(e.message); }
  });

  // ---------- params da URL (aba Params) ----------
  function paramRow(k = '', v = '') {
    const row = document.createElement('div');
    row.className = 'req-advanced-row';
    const a = document.createElement('input'), b = document.createElement('input'), del = document.createElement('button');
    a.className = b.className = 'form-control';
    a.placeholder = 'Parâmetro'; b.placeholder = 'Valor';
    a.setAttribute('aria-label', 'Nome do parâmetro'); b.setAttribute('aria-label', 'Valor do parâmetro');
    a.value = k; b.value = v;
    del.type = 'button'; del.className = 'btn btn-sm btn-outline-danger'; del.textContent = '×'; del.setAttribute('aria-label', 'Remover parâmetro');
    del.onclick = () => row.remove();
    row.append(a, b, del);
    return row;
  }
  function renderParams() {
    const box = $('reqParamsRows');
    box.replaceChildren();
    let params = [];
    try { params = [...new URL($('reqUrl').value).searchParams.entries()]; } catch { /* URL ainda incompleta */ }
    if (!params.length) params = [['', '']];
    for (const [k, v] of params) box.append(paramRow(k, v));
  }
  $('reqParamsAdd').onclick = () => $('reqParamsRows').append(paramRow());
  $('reqParamsSync').onclick = () => {
    try {
      const url = new URL($('reqUrl').value);
      url.search = '';
      for (const row of $('reqParamsRows').children) {
        const [k, v] = row.querySelectorAll('input');
        if (k?.value) url.searchParams.append(k.value, v?.value || '');
      }
      $('reqUrl').value = url.href;
      fire($('reqUrl'));
    } catch (e) { alert('URL inválida: ' + e.message); }
  };
  $('reqUrl').addEventListener('change', renderParams);
  document.querySelector('[data-req-panel="params"]')?.addEventListener('click', renderParams);

  // ---------- envio: timeout, repetições, cancelar ----------
  async function loadSettings() {
    const data = (await getStore(KEY))[KEY] || {};
    $('reqAdvancedTimeout').value = data.timeout || 30000;
    $('reqAdvancedRetries').value = data.retries || 0;
    $('reqBatchRate').value = data.maxRps || 1;
  }
  async function saveSettings() {
    // Mescla com o que já existe para não apagar dados de versões anteriores (ambientes, autenticação…).
    const data = (await getStore(KEY))[KEY] || {};
    data.timeout = clamp($('reqAdvancedTimeout').value, 100, 120000, 30000);
    data.retries = clamp($('reqAdvancedRetries').value, 0, 5, 0);
    data.maxRps = clamp($('reqBatchRate').value, 0.01, 100, 1);
    await setStore({ [KEY]: data });
  }
  for (const id of ['reqAdvancedTimeout', 'reqAdvancedRetries', 'reqBatchRate']) $(id).addEventListener('change', () => saveSettings().catch(() => {}));

  // Repetição automática em erro de rede ou 5xx (só quando configurada).
  const originalSend = $('reqSend').onclick;
  $('reqSend').onclick = async function (event) {
    const retries = clamp($('reqAdvancedRetries').value, 0, 5, 0);
    if (!retries) return originalSend.call(this, event);
    for (let i = 0; i <= retries; i++) {
      window.__mapeadorReqReuseVars = i > 0;
      try { await originalSend.call(this, event); } finally { window.__mapeadorReqReuseVars = false; }
      const r = snapshotResponse();
      if (i === retries || !r || (r.status > 0 && r.status < 500)) break;
      await sleep(Math.max(300 * (i + 1), rateDelay()));
    }
  };

  $('reqCancelCurrent').onclick = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Nenhuma aba ativa.');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => window.__mapeadorReqAbortController?.abort(new DOMException('Cancelado pelo usuário', 'AbortError')) });
      say('reqBatchSummary', 'Cancelamento solicitado para a requisição ativa.');
    } catch (e) { alert('Não foi possível cancelar: ' + e.message); }
  };

  // ---------- arquivo multipart (convertido para base64 só em memória) ----------
  function refreshFileFields() {
    const sel = $('reqFileField'), old = sel.value;
    sel.replaceChildren(new Option('Selecione um campo…', ''));
    for (const f of currentFields()) if (f.key) sel.add(new Option(f.key, f.key));
    if (old) sel.value = old;
  }
  $('reqFileInput').addEventListener('change', async () => {
    const file = $('reqFileInput').files[0], key = $('reqFileField').value;
    if (!file) return;
    if (!key) { alert('Selecione o campo que receberá o arquivo.'); $('reqFileInput').value = ''; return; }
    if (file.size > 8 * 1024 * 1024) { alert('Por segurança, o limite de upload pela extensão é 8 MB.'); $('reqFileInput').value = ''; return; }
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    window.__mapeadorRequestFiles = window.__mapeadorRequestFiles || {};
    window.__mapeadorRequestFiles[key] = { __mapeadorFile: true, name: file.name, type: file.type, base64 };
    $('reqFormat').value = 'form';
    alert(`Arquivo “${file.name}” pronto para envio no campo ${key}.`);
  });
  function clearSelectedFile() { window.__mapeadorRequestFiles = {}; $('reqFileInput').value = ''; }
  $('reqFileClear').onclick = clearSelectedFile;
  $('reqClear')?.addEventListener('click', clearSelectedFile);

  new MutationObserver(() => { refreshFileFields(); renderNegativeFields(); })
    .observe($('reqFieldRows'), { childList: true, subtree: true });

  refreshFileFields();
  renderNegativeFields();
  renderParams();
  loadSettings().catch(() => {});
})();
