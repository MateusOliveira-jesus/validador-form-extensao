/* Backup único e completo (v51).
   UM botão gera UM arquivo com tudo: mapeamentos, pastas, histórico/JSONs, dados salvos, rascunhos da aba Dado,
   variáveis lembradas, requisições salvas, pessoas geradas, relatório de testes e preferências.
   Restaurar lê esse arquivo (e também os arquivos antigos de "mapeamentos" e de "preferências"),
   valida antes de escrever, baixa uma cópia de segurança e mescla sem perder o que já existe. */
(() => {
  'use strict';
  const exportBtn = document.getElementById('backupAllBtn');
  const restoreBtn = document.getElementById('restoreFullBackupBtn');
  const fileInput = document.getElementById('restoreFullBackupFile');
  if (!restoreBtn || !fileInput) return;

  const FORMAT = 'mapeador-backup-completo';
  const BACKUP_VERSION = 3; // o formato do arquivo não mudou: backups antigos continuam valendo
  const PREFS_KEY = 'uiPrefsV3';
  // Chaves com dados do usuário: os NOMES de campos dentro delas (ex.: "senha", "token") são preservados.
  const DATA_KEYS = new Set(['history', 'dadoDraft2', 'dadosSalvos', 'variableValues', 'variableRecent', 'pessoasGeradas', 'requestProfilesV24', 'requestHistoryV23', 'requestV22']);
  // Estado temporário (não é dado do usuário): fica fora do backup.
  const VOLATILE_KEYS = new Set(['mapeadorDiscoverySelection', 'mapeadorDiscoveryQueueV17', 'floatingWindowSize', 'floatingPanelSize', 'folderOpenState']);
  const reserved = new Set(['__proto__', 'prototype', 'constructor']);
  const sensitive = /(^|[_-])(password|passwd|secret|token|authorization|authToken|apiKey|sessionId|accessToken|refreshToken)([_-]|$)/i;
  const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const status = (msg, type) => document.dispatchEvent(new CustomEvent('mapeador:status', { detail: { msg, type } }));
  const version = () => { try { return chrome.runtime.getManifest().version; } catch (_) { return ''; } };

  function sanitize(value, keepKeys = false, depth = 0) {
    if (depth > 35) throw new Error('Estrutura excessivamente profunda');
    if (Array.isArray(value)) return value.map((v) => sanitize(v, keepKeys, depth + 1));
    if (!isRecord(value)) return value;
    const out = Object.create(null);
    for (const [k, v] of Object.entries(value)) {
      if (reserved.has(k) || (!keepKeys && sensitive.test(k))) continue;
      out[k] = sanitize(v, keepKeys, depth + 1);
    }
    return out;
  }
  function sanitizeStore(store) {
    const out = Object.create(null);
    for (const [k, v] of Object.entries(store || {})) {
      const keep = DATA_KEYS.has(k);
      if (reserved.has(k) || VOLATILE_KEYS.has(k) || (!keep && sensitive.test(k))) continue;
      out[k] = sanitize(v, keep);
    }
    return out;
  }

  // ---------- resumo (o que existe dentro de um armazenamento) ----------
  const countObjLists = (o) => (isRecord(o) ? Object.values(o).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0) : 0);
  const countKeys = (o) => (isRecord(o) ? Object.keys(o).length : 0);
  function summarize(local) {
    local = local || {};
    return {
      mapeamentos: Array.isArray(local.profiles) ? local.profiles.length : 0,
      pastas: Array.isArray(local.mappingFolders) ? local.mappingFolders.length : 0,
      historico: countObjLists(local.history),
      dadosSalvos: countObjLists(local.dadosSalvos),
      rascunhosDado: countKeys(local.dadoDraft2),
      variaveis: countKeys(local.variableValues),
      requisicoes: countKeys(local.requestProfilesV24),
      pessoas: Array.isArray(local.pessoasGeradas) ? local.pessoasGeradas.length : 0,
    };
  }
  const LABELS = [
    ['mapeamentos', 'Mapeamentos'], ['pastas', 'Pastas'], ['historico', 'JSONs no histórico (aba Dados)'],
    ['dadosSalvos', 'Dados salvos com título (aba Dado)'], ['rascunhosDado', 'Rascunhos da aba Dado'], ['variaveis', 'Variáveis {{ }} lembradas'],
    ['requisicoes', 'Requisições salvas'], ['pessoas', 'Pessoas geradas'],
  ];

  async function readCurrent() {
    const [local, sync] = await Promise.all([chrome.storage.local.get(null), chrome.storage.sync.get(null)]);
    // rascunho antigo que ainda esteja só no localStorage (versões ≤ 31)
    try {
      const legacy = JSON.parse(localStorage.getItem('dadoDraft2') || '{}');
      if (isRecord(legacy) && Object.keys(legacy).length) local.dadoDraft2 = { ...legacy, ...(isRecord(local.dadoDraft2) ? local.dadoDraft2 : {}) };
    } catch (_) {}
    return { local, sync };
  }
  function buildBackup(local, sync) {
    const storageLocal = sanitizeStore(local);
    return { format: FORMAT, backupVersion: BACKUP_VERSION, extensionVersion: version(), exportedAt: new Date().toISOString(), resumo: summarize(storageLocal), storageLocal, storageSync: sanitizeStore(sync) };
  }
  function download(obj, name) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const pad = (n) => String(n).padStart(2, '0');
  function stamp(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  }

  async function exportAll() {
    try {
      const { local, sync } = await readCurrent();
      const backup = buildBackup(local, sync);
      download(backup, `mapeador-backup_${stamp()}.json`);
      const r = backup.resumo;
      status(`💾 Backup gerado: ${r.mapeamentos} mapeamento(s) · ${r.dadosSalvos} dado(s) salvo(s) · ${r.historico} JSON(s) no histórico · ${r.requisicoes} requisição(ões). O arquivo contém dados de teste/pessoais: guarde em local seguro.`, 'success');
    } catch (error) { status('❌ Falha ao gerar backup: ' + error.message, 'error'); }
  }

  // ---------- validação (aceita o backup atual e os arquivos antigos) ----------
  function validate(payload) {
    if (!isRecord(payload)) throw new Error('O JSON deve conter um objeto');
    if (payload.format === FORMAT && [2, 3].includes(payload.backupVersion)) {
      if (!isRecord(payload.storageLocal) || !isRecord(payload.storageSync)) throw new Error('Armazenamentos inválidos');
      return { local: sanitizeStore(payload.storageLocal), sync: sanitizeStore(payload.storageSync), meta: payload };
    }
    // arquivo antigo de "Exportar mapeamentos"
    if (Array.isArray(payload.profiles)) {
      const local = {};
      ['profiles', 'mappingFolders', 'appSettings', 'history', 'dadosSalvos', 'dadoDraft2', 'variableValues'].forEach((k) => { if (payload[k] != null) local[k] = payload[k]; });
      return { local: sanitizeStore(local), sync: {}, meta: payload };
    }
    // arquivo antigo de "Exportar preferências"
    if (payload.kind === 'preferencias-ui' && isRecord(payload.prefs)) {
      return { local: sanitizeStore({ [PREFS_KEY]: payload.prefs }), sync: {}, meta: payload };
    }
    throw new Error('Formato não reconhecido: use um arquivo de backup gerado por esta extensão');
  }
  function validateData(d) {
    if (Object.hasOwn(d, 'profiles') && (!Array.isArray(d.profiles) || d.profiles.some((p) => !isRecord(p) || typeof p.name !== 'string' || !p.name.trim()))) throw new Error('Lista de mapeamentos inválida');
    ['history', 'dadosSalvos', 'dadoDraft2', 'variableValues', 'variableRecent', 'requestProfilesV24'].forEach((k) => { if (Object.hasOwn(d, k) && !isRecord(d[k])) throw new Error(`Dados "${k}" inválidos`); });
    if (Object.hasOwn(d, 'pessoasGeradas') && !Array.isArray(d.pessoasGeradas)) throw new Error('Dados "pessoasGeradas" inválidos');
    if (isRecord(d.dadosSalvos) && Object.values(d.dadosSalvos).some((l) => !Array.isArray(l))) throw new Error('Dados salvos inválidos');
  }

  // ---------- mesclagem (o que você já tem nunca é apagado) ----------
  function mergeList(cur, inc, keyOf) {
    const out = [...cur]; const keys = new Set(out.map((x) => String(keyOf(x))));
    for (const x of inc) { const k = String(keyOf(x)); if (!keys.has(k)) { out.push(x); keys.add(k); } }
    return out;
  }
  const genericKey = (x) => (isRecord(x) && x.id != null ? x.id : JSON.stringify(x));
  function mergeHistory(cur, inc) {
    const out = { ...cur };
    for (const [key, items] of Object.entries(inc)) {
      if (!Array.isArray(items)) continue;
      const base = Array.isArray(out[key]) ? out[key] : [];
      const merged = mergeList(base, items, (i) => (isRecord(i) ? i.id ?? i.hash ?? `${i.timestamp}:${JSON.stringify(i.data)}` : JSON.stringify(i)));
      out[key] = merged.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
    }
    return out;
  }
  function mergeSaved(cur, inc) {
    const out = { ...cur };
    for (const [name, list] of Object.entries(inc)) {
      const base = Array.isArray(out[name]) ? [...out[name]] : [];
      for (const item of list) {
        if (!isRecord(item) || typeof item.title !== 'string') continue;
        const i = base.findIndex((d) => String(d.title).toLowerCase() === item.title.toLowerCase());
        if (i < 0) base.push(item);
        else if (String(item.savedAt || '') > String(base[i].savedAt || '')) base[i] = item; // fica a versão mais nova
      }
      out[name] = base;
    }
    return out;
  }
  function mergeDraft(cur, inc) {
    const out = { ...cur };
    for (const [name, d] of Object.entries(inc)) if (!(name in out) || (isRecord(d) && (d.updatedAt || 0) > (out[name]?.updatedAt || 0))) out[name] = d;
    return out;
  }
  function mergeRecent(cur, inc) {
    const out = { ...cur };
    for (const [name, list] of Object.entries(inc)) {
      if (!Array.isArray(list)) continue;
      out[name] = [...new Set([...(Array.isArray(out[name]) ? out[name] : []), ...list])].slice(0, 6);
    }
    return out;
  }
  function merge(existing, incoming) {
    const result = { ...existing };
    for (const [k, v] of Object.entries(incoming)) {
      const cur = existing[k];
      if (cur === undefined) result[k] = v;
      else if (k === 'profiles' && Array.isArray(cur) && Array.isArray(v)) result[k] = mergeList(cur, v, (p) => p.id ?? p.name);
      else if (k === 'mappingFolders' && Array.isArray(cur) && Array.isArray(v)) result[k] = mergeList(cur, v, (f) => f.id ?? f.name);
      else if (k === 'history' && isRecord(cur) && isRecord(v)) result[k] = mergeHistory(cur, v);
      else if (k === 'dadosSalvos' && isRecord(cur) && isRecord(v)) result[k] = mergeSaved(cur, v);
      else if (k === 'dadoDraft2' && isRecord(cur) && isRecord(v)) result[k] = mergeDraft(cur, v);
      else if (k === 'variableRecent' && isRecord(cur) && isRecord(v)) result[k] = mergeRecent(cur, v);
      else if (Array.isArray(cur) && Array.isArray(v)) result[k] = mergeList(cur, v, genericKey); // pessoas, relatório, modelos…
      else if (isRecord(cur) && isRecord(v)) result[k] = { ...v, ...cur }; // variáveis, requisições, preferências: o que você já tem vence
      // valores simples já existentes são mantidos
    }
    return result;
  }

  // ---------- janela de confirmação ----------
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function askMode(fileName, meta, inc, cur) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog'); dlg.className = 'bk-dialog';
      const when = meta.exportedAt ? new Date(meta.exportedAt).toLocaleString() : 'data desconhecida';
      const rows = LABELS.map(([k, label]) => `<tr><td>${label}</td><td>${inc[k]}</td><td>${cur[k]}</td></tr>`).join('');
      dlg.innerHTML = `
        <form method="dialog">
          <h3>📥 Restaurar backup</h3>
          <p class="bk-meta"><b>${esc(fileName)}</b><br>Gerado em ${esc(when)}${meta.extensionVersion ? ' · extensão v' + esc(meta.extensionVersion) : ''}</p>
          <table class="bk-table"><thead><tr><th>Conteúdo</th><th>No arquivo</th><th>Agora</th></tr></thead><tbody>${rows}</tbody></table>
          <label class="bk-opt"><input type="radio" name="bkmode" value="MESCLAR" checked><span><b>Mesclar</b> (recomendado)<small>Mantém o que você já tem e acrescenta o que falta. Dados salvos com o mesmo título ficam com a versão mais recente.</small></span></label>
          <label class="bk-opt"><input type="radio" name="bkmode" value="SUBSTITUIR"><span><b>Substituir tudo</b><small>Apaga os dados atuais e usa somente o conteúdo do arquivo.</small></span></label>
          <p class="bk-note">🛟 Uma cópia de segurança dos dados atuais é baixada antes de qualquer alteração (no mesmo formato, restaurável por este mesmo botão).</p>
          <div class="bk-actions"><button value="cancel" class="bk-btn">Cancelar</button><button value="ok" class="bk-btn bk-primary">Restaurar</button></div>
        </form>`;
      document.body.append(dlg);
      const done = (value) => { dlg.remove(); resolve(value); };
      dlg.addEventListener('close', () => done(dlg.returnValue === 'ok' ? dlg.querySelector('input[name=bkmode]:checked').value : null));
      dlg.addEventListener('cancel', () => { dlg.returnValue = 'cancel'; });
      dlg.showModal();
    });
  }

  async function restore(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo excede 20 MB');
    let parsed; try { parsed = JSON.parse((await file.text()).replace(/^﻿/, '')); } catch (_) { throw new Error('O arquivo não é um JSON válido'); }
    const incoming = validate(parsed);
    validateData(incoming.local);
    const current = await readCurrent();
    const choice = await askMode(file.name, incoming.meta, summarize(incoming.local), summarize(current.local));
    if (!choice) return;
    if (choice === 'SUBSTITUIR' && !confirm('Confirma a substituição de TODOS os dados armazenados pelo conteúdo do arquivo?')) return;
    const local = choice === 'MESCLAR' ? merge(current.local, incoming.local) : incoming.local;
    const sync = choice === 'MESCLAR' ? { ...current.sync, ...incoming.sync } : incoming.sync;
    validateData(local);
    download(buildBackup(current.local, current.sync), `mapeador-backup_antes-de-restaurar_${stamp()}.json`);
    try {
      if (choice === 'SUBSTITUIR') { await chrome.storage.local.clear(); await chrome.storage.sync.clear(); }
      await chrome.storage.local.set(local);
      if (Object.keys(sync).length) await chrome.storage.sync.set(sync);
      try { localStorage.removeItem('dadoDraft2'); } catch (_) {}
    } catch (error) {
      await chrome.storage.local.clear(); await chrome.storage.local.set(current.local);
      await chrome.storage.sync.clear(); await chrome.storage.sync.set(current.sync);
      throw new Error('Restauração revertida após erro: ' + error.message);
    }
    const r = summarize(local);
    alert(`Backup restaurado (${choice === 'MESCLAR' ? 'mesclado' : 'substituído'}): ${r.mapeamentos} mapeamento(s), ${r.dadosSalvos} dado(s) salvo(s), ${r.historico} JSON(s) no histórico, ${r.requisicoes} requisição(ões). A interface será atualizada.`);
    location.reload();
  }

  window.MapeadorBackup = { merge, summarize, validate, validateData, sanitizeStore }; // também usado nos testes
  if (exportBtn) exportBtn.addEventListener('click', exportAll);
  restoreBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; if (!file) return;
    try { await restore(file); }
    catch (error) { status('❌ Não foi possível restaurar: ' + error.message, 'error'); alert('Não foi possível restaurar: ' + error.message); }
    finally { fileInput.value = ''; }
  });
})();
