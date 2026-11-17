// v19: envia mensagens para a página principal e para todos os iframes.
(() => {
  async function listFrames(tabId) {
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      if (frames && frames.length) return frames.filter(f => /^(https?:|about:|file:)/i.test(f.url || '') || f.frameId === 0).map(f => f.frameId);
    } catch (_) {}
    return [0];
  }
  function sendOne(tabId, frameId, msg) {
    return new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(tabId, msg, { frameId }, response => {
          const err = chrome.runtime.lastError;
          resolve(err ? { frameId, error: err.message } : { frameId, response });
        });
      } catch (e) { resolve({ frameId, error: e.message }); }
    });
  }
  async function sendAll(tabId, msg, files) {
    const ids = await listFrames(tabId);
    return Promise.all(ids.map(async frameId => {
      let r = await sendOne(tabId, frameId, msg);
      if (r.error && files && /Receiving end does not exist|Could not establish connection/i.test(r.error)) {
        try {
          await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files });
          try { await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['js/mask-bridge.js'], world: 'MAIN' }); } catch (_) {}
          r = await sendOne(tabId, frameId, msg);
        } catch (e) { r = { frameId, error: e.message }; }
      }
      return r;
    }));
  }
  function mergeFillReports(results, data) {
    const reports = results.map(r => r.response && r.response.report).filter(Boolean);
    if (!reports.length) return null;
    const keys = Object.keys(data || {});
    const found = new Set();
    reports.forEach(rep => keys.forEach(k => { if (!(rep.notFound || []).includes(k)) found.add(k); }));
    const notFound = keys.filter(k => !found.has(k));
    const merged = { total: keys.length, filled: 0, notFound, failed: [], skipped: [], fields: [], frames: reports.length };
    reports.forEach(rep => {
      merged.filled += rep.filled || 0;
      merged.failed.push(...(rep.failed || []));
      merged.skipped.push(...(rep.skipped || []));
      (rep.fields || []).forEach(f => { if (f.result !== 'não encontrado') merged.fields.push(f); });
    });
    notFound.forEach(k => merged.fields.push({ field: k, result: 'não encontrado' }));
    return merged;
  }
  globalThis.mapeadorFrames = { sendAll, sendOne, mergeFillReports };
})();
