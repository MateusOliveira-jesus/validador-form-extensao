// ============================================
// MAPEADOR DE FORMULÁRIOS - v5.10 UX
// Desenvolvido por: Mateus Oliveira de Jesus
// © 2024 - Todos os direitos reservados
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  // ============================================
  // ELEMENTOS
  // ============================================
  const profileList = document.getElementById("profileList");
  const profileSearchInput = document.getElementById("profileSearchInput");
  const uploadJsonBtn = document.getElementById("uploadJsonBtn");
  const newMappingBtn = document.getElementById("newMappingBtn");
  const fileInput = document.getElementById("fileInput");
  const fillProfileBtn = document.getElementById("fillProfileBtn");
  const deleteProfileBtn = document.getElementById("deleteProfileBtn");
  const profilePreview = document.getElementById("profilePreview");

  const newProfileModal = document.getElementById("newProfileModal");
  const newProfileName = document.getElementById("newProfileName");
  const newProfileJson = document.getElementById("newProfileJson");
  const confirmNewProfileBtn = document.getElementById("confirmNewProfileBtn");
  const cancelNewProfileBtn = document.getElementById("cancelNewProfileBtn");

  const editProfileBtn = document.getElementById("editProfileBtn");
  const editMappingBtn = document.getElementById("editMappingBtn");
  const editProfileModal = document.getElementById("editProfileModal");
  const editProfileName = document.getElementById("editProfileName");
  const editProfileJson = document.getElementById("editProfileJson");
  const confirmEditProfileBtn = document.getElementById(
    "confirmEditProfileBtn",
  );
  const cancelEditProfileBtn = document.getElementById("cancelEditProfileBtn");

  const uploadNewJsonBtn = document.getElementById("uploadNewJsonBtn");
  const newJsonModal = document.getElementById("newJsonModal");
  const newJsonData = document.getElementById("newJsonData");
  const confirmNewJsonBtn = document.getElementById("confirmNewJsonBtn");
  const cancelNewJsonBtn = document.getElementById("cancelNewJsonBtn");
  const selectedProfileName = document.getElementById("selectedProfileName");
  const expectedKeysDisplay = document.getElementById("expectedKeysDisplay");
  const saveHistoryCheck = document.getElementById("saveHistoryCheck");
  const historyContainer = document.getElementById("historyContainer");
  const historyList = document.getElementById("historyList");

  const editValueModal = document.getElementById("editValueModal");
  const editFieldName = document.getElementById("editFieldName");
  const editFieldValue = document.getElementById("editFieldValue");
  const confirmEditValueBtn = document.getElementById("confirmEditValueBtn");
  const cancelEditValueBtn = document.getElementById("cancelEditValueBtn");


  const mapperSelect = document.getElementById("mapperSelect");
  const extractBtn = document.getElementById("extractBtn");
  const mappingContainer = document.getElementById("mappingContainer");
  const mappingStats = document.getElementById("mappingStats");
  const autoMapBtn = document.getElementById("autoMapBtn");
  const saveMappingBtn = document.getElementById("saveMappingBtn");
  const clearMappingBtn = document.getElementById("clearMappingBtn");

  const statusDiv = document.getElementById("status");

  // ============================================
  // ELEMENTOS DO HISTÓRICO
  // ============================================
  const historyListContainer = document.getElementById("historyListContainer");
  const historyFilterSelect = document.getElementById("historyFilterSelect");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");

  // ============================================
  // CRÉDITOS
  // ============================================
  const creditsBtn = document.getElementById("creditsBtn");
  const creditsModal = document.getElementById("creditsModal");

  // ============================================
  // MODO DE TESTE
  // ============================================
  let isTestMode = false;
  let pendingTestData = null;

  // ============================================
  // ESTADO
  // ============================================
  let profiles = [];
  let selectedIndex = null;
  let profileSearchQuery = "";
  let historyStore = {};
  let appSettings = { historyLimit: 50, schemaVersion: 5 };
  let pageFields = [];
  let currentMapping = {};
  let currentProfileData = null;
  let currentProfileId = null;
  let editingFieldId = null;
  let mappingFolders = [];

  // Ponte para a aba Requisição: expõe o mapeamento ativo sem obrigar o usuário a escolhê-lo de novo.
  const notifyActiveProfile = () =>
    window.dispatchEvent(new CustomEvent("mapeador:active-profile"));
  window.MapeadorApp = {
    getActiveProfile: () =>
      selectedIndex !== null && profiles[selectedIndex] ? profiles[selectedIndex] : null,
    getProfiles: () => profiles.slice(),
    getCurrentData: (profile) =>
      (profile && profiles[selectedIndex] === profile && currentProfileData) || getLatestProfileData(profile),
    getTestSettings: (profile) => getTestSettings(profile),
    // v41: a aba Requisição grava as preferências de teste no mesmo perfil que o Início usa.
    saveTestSettings: (profile, { enabled, fields, remember } = {}) => {
      if (!profile) return;
      setTestSettings(profile, enabled, fields, remember !== undefined ? remember : getTestSettings(profile).remember);
      profile.testSettings.decisionMade = true;
      if (profiles[selectedIndex] === profile) {
        isTestMode = Boolean(enabled);
        const box = document.getElementById("is_test");
        if (box) box.checked = isTestMode;
        const label = document.getElementById("testPreferenceState");
        if (label) {
          const saved = Object.values(fields || {}).some((value) => value === true);
          label.textContent = isTestMode
            ? (saved ? "Ativo · usa as chaves de teste salvas neste mapeamento" : "Ativo · escolha as chaves de teste no primeiro preenchimento")
            : "Desativado · os dados serão usados sem alteração";
        }
      }
      persistAll(() => renderProfiles());
    },
    resolveMappedData: (profile, data) =>
      resolveMappedData(profile, data || currentProfileData || profile?.data || {}),
  };
  let folderOpenState = {};
  let currentPageUrl = "";

  if (uploadNewJsonBtn) uploadNewJsonBtn.disabled = true;
  if (editProfileBtn) editProfileBtn.disabled = true;
  if (editMappingBtn) editMappingBtn.disabled = true;

  // ============================================
  // UTILITÁRIOS
  // ============================================
  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // v10 — suporte a texto com quebra de linha no valor Default
  // Normaliza CRLF/CR para LF (padrão usado ao preencher a página)
  function normalizeNewlines(text) {
    return String(text ?? "").replace(/\r\n?/g, "\n");
  }
  // Versão de uma linha só, para exibir em campos/pré-visualizações (↵ marca a quebra)
  function flattenForDisplay(text) {
    return normalizeNewlines(text).replace(/\n/g, " ↵ ");
  }
  // Escapa para atributo HTML preservando as quebras de linha
  function escapeAttrMultiline(text) {
    return escapeHtml(normalizeNewlines(text)).replace(/\n/g, "&#10;");
  }
  // O valor real (com quebras) fica em data-raw; o input mostra só a versão de uma linha
  function getDefaultRaw(input) {
    if (!input) return "";
    return input.dataset.raw !== undefined ? input.dataset.raw : input.value;
  }

  let statusTimeout = null;
  function showStatus(message, type) {
    if (statusTimeout !== null) clearTimeout(statusTimeout);
    statusDiv.textContent = message;
    statusDiv.className = "status " + type;
    statusDiv.style.display = "block";
    // Erros e avisos permanecem visíveis; sucessos somem após 7 s.
    if (type === "success") {
      statusTimeout = setTimeout(() => {
        statusDiv.style.display = "none";
        statusTimeout = null;
      }, 7000);
    }
  }

  function renderFillReport(report) {
    const container = document.getElementById("fillReport");
    if (!container) return;
    container.replaceChildren();
    if (!report || !Array.isArray(report.fields)) { container.hidden = true; return; }
    container.hidden = false;
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = `Relatório: ${report.filled || 0} preenchido(s), ${(report.notFound || []).length} não encontrado(s), ${(report.failed || []).length} recusado(s)`;
    details.appendChild(summary);
    const list = document.createElement("ul");
    report.fields.forEach(item => {
      const li = document.createElement("li");
      li.className = item.result === "preenchido" ? "ok" : "failed";
      // Não exibir valores: podem conter dados pessoais/senhas.
      li.textContent = `${item.field}: ${item.result}${item.reason ? " — " + item.reason : ""}`;
      list.appendChild(li);
    });
    details.appendChild(list);
    container.appendChild(details);
  }

  // Normaliza JSONs compactos, minificados, com BOM ou até
  // JSON duplamente serializado (ex.: "{\"nome\":\"João\"}").
  // Não existe tamanho mínimo: {"a":1} é um JSON perfeitamente válido.
  function parseJsonObject(raw, context = "JSON") {
    if (raw === undefined || raw === null) {
      throw new Error(`${context} vazio`);
    }

    let text = String(raw)
      .replace(/^\uFEFF/, "")
      .trim();

    if (!text) throw new Error(`${context} vazio`);

    let parsed = JSON.parse(text);

    // Aceita JSON que veio como string serializada.
    if (typeof parsed === "string") {
      const nested = parsed.trim();
      if ((nested.startsWith("{") && nested.endsWith("}")) ||
          (nested.startsWith("[") && nested.endsWith("]"))) {
        parsed = JSON.parse(nested);
      }
    }

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return {};
      parsed = parsed[0];
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${context} deve conter um objeto JSON, por exemplo {\"nome\":\"João\"}`);
    }

    return parsed;
  }

  function getJsonKeys(data) {
    return data && typeof data === "object" ? Object.keys(data) : [];
  }

  // ============================================
  // FUNÇÕES PARA MODAIS BOOTSTRAP
  // ============================================
  function openModal(modalElement) {
    if (!modalElement) return;

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: false,
        keyboard: true,
      });
      modal.show();
    }
  }

  function closeModal(modalElement) {
    if (!modalElement) return;

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
        setTimeout(() => {
          const backdrop = document.querySelector(".modal-backdrop");
          if (backdrop) {
            backdrop.remove();
          }
          document.body.classList.remove("modal-open");
          modalElement.classList.remove("show");
          modalElement.style.display = "none";
        }, 150);
        return;
      }
    }

    modalElement.classList.remove("show");
    modalElement.style.display = "none";
    document.body.classList.remove("modal-open");

    const backdrop = document.querySelector(".modal-backdrop");
    if (backdrop) {
      backdrop.remove();
    }
  }

  // ============================================
  // FUNÇÃO PARA REATIVAR O MODAL (RESET)
  // ============================================
  function resetDontAskAgain() {
    if (selectedIndex === null || !profiles[selectedIndex]) {
      showStatus("❌ Nenhum perfil selecionado", "error");
      return;
    }

    const profile = profiles[selectedIndex];
    const settings = getTestSettings(profile);
    profile.testSettings = { ...settings, remember: false, decisionMade: false };
    profile.dontAskTestAgain = false;
    saveProfiles();

    showStatus("🔓 Modal de teste reativado para este perfil!", "success");
    renderProfiles();
  }

  // Tornar a função global para ser chamada pelo onclick
  window.resetDontAskAgain = resetDontAskAgain;

  // ============================================
  // FUNÇÃO PARA APLICAR TESTE AUTOMATICAMENTE
  // ============================================
  function applyTestToData(mappedData, selectedKeys) {
    const finalData = {};
    for (const [field, value] of Object.entries(mappedData)) {
      const profile = profiles[selectedIndex];
      const mapping = profile.mapping || {};
      const config = mapping[field];

      if (
        config &&
        config.type === "json" &&
        selectedKeys.includes(config.value)
      ) {
        finalData[field] = `TESTE ${value}`;
      } else {
        finalData[field] = value;
      }
    }

    showStatus(
      `🧪 Aplicando teste automático (${selectedKeys.length} chaves)...`,
      "info",
    );
    sendToContent(finalData);
    pendingTestData = null;
  }

  // ============================================
  // FUNÇÃO PARA SALVAR PREFERÊNCIAS DE TESTE
  // ============================================
  function saveTestPreferences() {
    if (selectedIndex === null || !profiles[selectedIndex]) {
      showStatus("❌ Nenhum perfil selecionado", "error");
      return;
    }

    const selectedKeys = [];
    document.querySelectorAll(".test-field-checkbox:checked").forEach((cb) => {
      selectedKeys.push(cb.dataset.key);
    });

    const profile = profiles[selectedIndex];
    const jsonKeys = Object.keys(getLatestProfileData(profile));
    const preferences = {};

    jsonKeys.forEach((key) => {
      preferences[key] = selectedKeys.includes(key);
    });

    profile.testPreferences = preferences;

    const dontAskCheckbox = document.getElementById("dontAskAgainCheckbox");
    if (dontAskCheckbox) {
      profile.dontAskTestAgain = dontAskCheckbox.checked;
    }
    const remember = dontAskCheckbox ? dontAskCheckbox.checked : true;
    setTestSettings(profile, selectedKeys.length > 0, preferences, remember);
    profile.testSettings.decisionMade = true;

    saveProfiles();

    showStatus(
      `💾 Preferências de teste salvas (${selectedKeys.length} chaves selecionadas)`,
      "success",
    );

    const modal = document.getElementById("testSelectionModal");
    closeModal(modal);
  }

  // ============================================
  // FUNÇÃO PARA ABRIR SELEÇÃO DE TESTE (COM PREFERÊNCIAS)
  // ============================================
  function openTestSelection(mappedData, profileData) {
    const profile = profiles[selectedIndex];
    if (profile && profile.dontAskTestAgain) {
      const savedPreferences = profile.testPreferences || {};
      const selectedKeys = Object.keys(savedPreferences).filter(
        (key) => savedPreferences[key] === true,
      );

      if (selectedKeys.length > 0) {
        applyTestToData(mappedData, selectedKeys);
        return;
      }
    }

    pendingTestData = mappedData;

    const modal = document.getElementById("testSelectionModal");
    const fieldList = document.getElementById("testFieldList");

    if (!modal || !fieldList) {
      console.error("Elementos do modal de teste não encontrados");
      return;
    }

    fieldList.innerHTML = "";

    const jsonKeys = Object.keys(profileData || {});

    if (jsonKeys.length === 0) {
      fieldList.innerHTML =
        '<div style="padding:12px;color:#ea4335;font-size:12px;">⚠️ Nenhuma chave encontrada no JSON</div>';
      return;
    }

    const savedPreferences = profile.testPreferences || {};
    const dontAsk = profile.testSettings?.remember !== undefined ? profile.testSettings.remember : true;

    let html = "";
    let allChecked = true;

    jsonKeys.forEach((key) => {
      const value = profileData[key];
      const isPreferred = savedPreferences[key] === true;
      const hasTestPrefix = String(value).startsWith("TESTE");
      const checked =
        isPreferred || (!hasTestPrefix && isPreferred !== false)
          ? "checked"
          : "";
      if (!checked) allChecked = false;

      html += `
        <div style="display:flex;align-items:center;padding:6px 8px;border-bottom:1px solid #f1f3f4;">
          <input type="checkbox" class="test-field-checkbox" data-key="${escapeHtml(key)}" ${checked} style="margin-right:10px;width:16px;height:16px;">
          <span style="flex:1;font-size:12px;font-weight:500;color:#1a73e8;">${escapeHtml(key)}</span>
          <span style="font-size:11px;color:#5f6368;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(String(value).substring(0, 30))}</span>
          ${isPreferred ? '<span style="font-size:9px;color:#34a853;margin-left:8px;">💾 salvo</span>' : ""}
        </div>
      `;
    });

    html += `
      <div style="display:flex;align-items:center;padding:8px 8px;border-top:1px solid #f1f3f4;margin-top:4px;">
        <input type="checkbox" id="dontAskAgainCheckbox" ${dontAsk ? "checked" : ""} style="margin-right:10px;width:16px;height:16px;">
        <span style="font-size:11px;color:#5f6368;">🔇 Não perguntar novamente para este perfil</span>
        <span style="font-size:9px;color:#34a853;margin-left:8px;">(usará as preferências salvas)</span>
      </div>
    `;

    fieldList.innerHTML = html;

    const selectAllBtn = document.getElementById("selectAllTestFields");
    const deselectAllBtn = document.getElementById("deselectAllTestFields");

    if (selectAllBtn) {
      selectAllBtn.onclick = function () {
        document
          .querySelectorAll(".test-field-checkbox")
          .forEach((cb) => (cb.checked = true));
        this.textContent = "Selecionar Todos ✅";
      };
      if (allChecked) {
        selectAllBtn.textContent = "Selecionar Todos ✅";
      }
    }

    if (deselectAllBtn) {
      deselectAllBtn.onclick = function () {
        document
          .querySelectorAll(".test-field-checkbox")
          .forEach((cb) => (cb.checked = false));
        const selectAll = document.getElementById("selectAllTestFields");
        if (selectAll) selectAll.textContent = "Selecionar Todos";
      };
    }

    const savePrefsBtn = document.getElementById("saveTestPreferencesBtn");
    if (savePrefsBtn) {
      savePrefsBtn.onclick = function () {
        saveTestPreferences();
      };
    }

    openModal(modal);
  }

  // ============================================
  // FUNÇÃO PARA CONFIRMAR E PREENCHER COM TESTE
  // ============================================
  function confirmTestSelection() {
    const modal = document.getElementById("testSelectionModal");

    const selectedKeys = [];
    document.querySelectorAll(".test-field-checkbox:checked").forEach((cb) => {
      selectedKeys.push(cb.dataset.key);
    });

    if (selectedIndex !== null && profiles[selectedIndex]) {
      const profile = profiles[selectedIndex];
      const jsonKeys = Object.keys(getLatestProfileData(profile));
      const preferences = {};
      jsonKeys.forEach((key) => {
        preferences[key] = selectedKeys.includes(key);
      });
      profile.testPreferences = preferences;

      const dontAskCheckbox = document.getElementById("dontAskAgainCheckbox");
      const remember = dontAskCheckbox ? dontAskCheckbox.checked : true;
      profile.dontAskTestAgain = remember;
      setTestSettings(profile, selectedKeys.length > 0, preferences, remember);
      profile.testSettings.decisionMade = true;

      saveProfiles();
    }

    const finalData = {};
    for (const [field, value] of Object.entries(pendingTestData)) {
      const profile = profiles[selectedIndex];
      const mapping = profile.mapping || {};
      const config = mapping[field];

      if (
        config &&
        config.type === "json" &&
        selectedKeys.includes(config.value)
      ) {
        finalData[field] = `TESTE ${value}`;
      } else {
        finalData[field] = value;
      }
    }

    closeModal(modal);
    showStatus(
      selectedKeys.length > 0
        ? `🧪 ${selectedKeys.length} chaves do JSON marcadas para teste, enviando...`
        : "📤 Dados de teste desativados para este perfil. Enviando valores normais...",
      "info",
    );
    sendToContent(finalData);
    pendingTestData = null;
  }

  // ============================================
  // FUNÇÃO PARA CANCELAR SELEÇÃO DE TESTE
  // ============================================
  function cancelTestSelection() {
    const modal = document.getElementById("testSelectionModal");
    closeModal(modal);
    pendingTestData = null;
    showStatus("❌ Preenchimento cancelado", "error");
  }

  // ============================================
  // TABS
  // ============================================
  document.querySelectorAll(".tab-group button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-group button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document
        .querySelectorAll(".tab-content")
        .forEach((t) => t.classList.remove("active"));
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "tabMapper") updateMapperView();
      if (btn.dataset.tab === "tabHistory") loadHistory();
      if (btn.dataset.tab === "tabManager") renderMappingManager();
    });
  });

  // ============================================
  // PERSISTÊNCIA V5 / MIGRAÇÃO / HISTÓRICO
  // ============================================
  function createId(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function stableJson(value) {
    try {
      if (!value || typeof value !== "object") return JSON.stringify(value);
      return JSON.stringify(value, Object.keys(value).sort());
    } catch (_) {
      return JSON.stringify(value);
    }
  }

  function normalizeProfile(profile) {
    const now = Date.now();
    const normalized = {
      id: profile.id || createId("profile"),
      name: String(profile.name || "Mapeamento"),
      mapping: profile.mapping || {},
      testPreferences: profile.testPreferences || {},
      dontAskTestAgain: Boolean(profile.dontAskTestAgain),
      testSettings: profile.testSettings || {
        enabled: false,
        fields: profile.testPreferences || {},
        remember: Boolean(profile.dontAskTestAgain),
      },
      createdAt: profile.createdAt || now,
      updatedAt: profile.updatedAt || now,
      mappingVersion: profile.mappingVersion || 1,
      mappingHistory: Array.isArray(profile.mappingHistory) ? profile.mappingHistory : [],
      data: profile.data && typeof profile.data === "object" ? profile.data : {},
      parentId: profile.parentId || null,
      url: profile.url || "",
    };

    if (!normalized.testSettings.fields || Object.keys(normalized.testSettings.fields).length === 0) {
      normalized.testSettings.fields = normalized.testPreferences || {};
    }
    if (normalized.testSettings.remember === undefined) {
      normalized.testSettings.remember = normalized.dontAskTestAgain;
    }
    return normalized;
  }

  function historyKey(profile) {
    return profile?.id || profile?.name;
  }

  function getProfileHistory(profile) {
    if (!profile) return [];
    const byId = historyStore[historyKey(profile)];
    if (Array.isArray(byId)) return byId;
    const legacy = historyStore[profile.name];
    return Array.isArray(legacy) ? legacy : [];
  }

  function getLatestHistoryItem(profile) {
    const items = getProfileHistory(profile);
    return items.length ? items[items.length - 1] : null;
  }

  function getLatestProfileData(profile) {
    // O JSON padrão do perfil existe somente quando foi definido no
    // cadastro ou em "Editar perfil". JSONs usados por upload/uso atual
    // ficam somente em memória e nunca substituem este dado padrão.
    return profile?.data && typeof profile.data === "object" ? profile.data : {};
  }

  function addHistoryItem(profile, data, meta = {}) {
    if (!profile || !data || typeof data !== "object") return null;
    const key = historyKey(profile);
    if (!Array.isArray(historyStore[key])) historyStore[key] = [];

    const hash = stableJson(data);
    const duplicate = historyStore[key].find((item) => item.hash === hash);
    const item = {
      id: createId("json"),
      timestamp: Date.now(),
      source: meta.source || "manual",
      filename: meta.filename || "",
      hash,
      data,
      fieldCount: Object.keys(data).length,
      note: meta.note || "",
      duplicateOf: duplicate?.id || null,
    };

    historyStore[key].push(item);
    const limit = Math.max(10, Number(appSettings.historyLimit) || 50);
    if (historyStore[key].length > limit) historyStore[key] = historyStore[key].slice(-limit);

    profile.lastJsonId = item.id;
    profile.updatedAt = Date.now();
    return item;
  }

  function persistAll(callback) {
    chrome.storage.local.set({ profiles, history: historyStore, appSettings, mappingFolders, folderOpenState }, callback);
  }

  function migrateStorage(result) {
    profiles = (result.profiles || []).map(normalizeProfile);
    historyStore = result.history || {};
    mappingFolders = Array.isArray(result.mappingFolders) ? result.mappingFolders : [];
    folderOpenState = result.folderOpenState && typeof result.folderOpenState === "object" ? result.folderOpenState : {};

    profiles.forEach((profile) => {
      if (historyStore[profile.name] && !historyStore[profile.id]) {
        historyStore[profile.id] = historyStore[profile.name];
        delete historyStore[profile.name];
      }
    });

    appSettings = {
      ...appSettings,
      ...(result.appSettings || {}),
      schemaVersion: 6,
    };

    // Os dados padrão existentes dos perfis são preservados.
    // JSONs temporários usados para preenchimento nunca substituem profile.data.
  }

  function getTestSettings(profile) {
    if (!profile) return { enabled: false, fields: {}, remember: false };
    const settings = profile.testSettings || {};
    const fields = settings.fields && Object.keys(settings.fields).length
      ? settings.fields
      : (profile.testPreferences || {});

    return {
      enabled: Boolean(settings.enabled),
      fields,
      remember: settings.remember !== undefined
        ? Boolean(settings.remember)
        : Boolean(profile.dontAskTestAgain),
    };
  }

  function setTestSettings(profile, enabled, fields = null, remember = true) {
    if (!profile) return;
    const current = getTestSettings(profile);
    const nextFields = fields || current.fields || {};

    profile.testSettings = {
      enabled: Boolean(enabled),
      fields: nextFields,
      remember: Boolean(remember),
      decisionMade: true,
    };
    profile.testPreferences = nextFields;
    profile.dontAskTestAgain = Boolean(remember);
    profile.updatedAt = Date.now();
  }

  function resolveMappedData(profile, sourceData) {
    const mapping = profile?.mapping || {};
    const data = sourceData || {};
    const mappedData = {};
    const missing = [];
    let mappedCount = 0;

    for (const [field, config] of Object.entries(mapping)) {
      if (!config) continue;
      let value;

      if (config.type === "json") {
        if (
          config.value &&
          Object.prototype.hasOwnProperty.call(data, config.value) &&
          data[config.value] !== "" &&
          data[config.value] !== null &&
          data[config.value] !== undefined
        ) {
          value = data[config.value];
        } else {
          missing.push(config.value || field);
        }
      } else if (config.type === "default" || config.type === "form") {
        value = config.value;
      }

      if (value !== undefined && value !== null && value !== "") {
        mappedData[field] = value;
        mappedCount++;
      }
    }

    return { mappedData, mappedCount, missing };
  }

  // Entrada única para qualquer JSON novo.
  // Regra estrutural: JSON pertence aos DADOS/HISTÓRICO; MAPPING nunca é substituído.
  function addJsonToProfile(profile, jsonData, meta = {}, options = {}) {
    if (!profile || !jsonData || typeof jsonData !== "object") return false;

    // JSON usado na extensão é somente temporário.
    // Nunca transforma o JSON em dado persistido/histórico.
    currentProfileData = JSON.parse(JSON.stringify(jsonData));

    const { mappedData, mappedCount, missing } = resolveMappedData(profile, currentProfileData);

    if (Object.keys(profile.mapping || {}).length === 0) {
      showStatus("✅ JSON carregado apenas para uso atual. O mapeamento permanece intacto.", "success");
      if (options.fill !== false) sendToContent(currentProfileData);
      return true;
    }

    if (mappedCount === 0) {
      showStatus("⚠️ Nenhum campo do JSON corresponde ao mapeamento. O JSON não foi salvo.", "info");
      return true;
    }

    const settings = getTestSettings(profile);
    const shouldPrompt = !profile.testSettings?.decisionMade;

    const finish = (data, modeLabel) => {
      let msg = `${modeLabel} — ${mappedCount} campo(s) preparado(s)`;
      if (missing.length) msg += ` • ${missing.length} chave(s) não encontrada(s)`;
      showStatus(msg, missing.length ? "info" : "success");
      if (options.fill !== false) sendToContent(data);
    };

    const hasSavedTestFields = Object.values(settings.fields || {}).some((value) => value === true);

    if (settings.enabled && hasSavedTestFields) {
      const result = applyRememberedTestSettings(profile, mappedData);
      finish(result.data, "🧪 Dados de teste aplicados");
      return true;
    }

    if ((shouldPrompt || (settings.enabled && !hasSavedTestFields)) && Object.keys(currentProfileData).length > 0) {
      pendingTestData = mappedData;
      openTestSelection(mappedData, currentProfileData);
      return true;
    }

    finish(mappedData, "📤 Dados normais preparados");
    return true;
  }

  function applyRememberedTestSettings(profile, mappedData) {
    const settings = getTestSettings(profile);
    if (!settings.enabled) return { data: mappedData, usedTest: false };

    const finalData = {};
    for (const [field, value] of Object.entries(mappedData)) {
      const config = profile.mapping?.[field];
      const shouldTest =
        config?.type === "json" &&
        settings.fields &&
        settings.fields[config.value] === true;

      finalData[field] = shouldTest ? `TESTE ${value}` : value;
    }

    return { data: finalData, usedTest: true };
  }

  function loadCurrentPageUrl(callback) {
    if (!chrome.tabs || !chrome.tabs.query) {
      currentPageUrl = "";
      callback?.();
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      currentPageUrl = tabs?.[0]?.url || "";
      callback?.();
    });
  }

  function loadAll() {
    chrome.storage.local.get(["profiles", "history", "appSettings", "mappingFolders"], (result) => {
      migrateStorage(result);
      persistAll(() => {
        renderProfiles();
        updateMapperSelect();
        renderMappingManager();
        notifyActiveProfile();
      });
    });
  }

  function createFolder(parentId = null) {
    const name = prompt(parentId ? "Nome da subpasta:" : "Nome da pasta:");
    if (!name || !name.trim()) return;
    mappingFolders.push({ id: createId("folder"), name: name.trim(), parentId: parentId || null, createdAt: Date.now(), updatedAt: Date.now() });
    saveProfiles();
    renderMappingManager();
  }

  function getFolderChildren(parentId = null) {
    return mappingFolders.filter((f) => (f.parentId || null) === (parentId || null));
  }

  function getFolderPath(folderId) {
    const parts = []; let current = mappingFolders.find((f) => f.id === folderId);
    while (current) { parts.unshift(current.name); current = mappingFolders.find((f) => f.id === current.parentId); }
    return parts;
  }

  function moveMappingToFolder(profileId, folderId) {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    profile.parentId = folderId || null;
    profile.updatedAt = Date.now();
    saveProfiles();
    renderMappingManager();
    renderProfiles();
  }

  function deleteFolder(folderId) {
    const folder = mappingFolders.find((f) => f.id === folderId);
    if (!folder) return;
    if (!confirm(`Excluir a pasta "${folder.name}"? Os mapeamentos serão movidos para a raiz.`)) return;
    const ids = new Set([folderId]);
    let changed = true;
    while (changed) { changed = false; mappingFolders.forEach((f) => { if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); changed = true; } }); }
    profiles.forEach((p) => { if (p.parentId && ids.has(p.parentId)) p.parentId = null; });
    mappingFolders = mappingFolders.filter((f) => !ids.has(f.id));
    saveProfiles();
    renderMappingManager();
    renderProfiles();
  }

  function renderMappingManager() {
    const container = document.getElementById("mappingManagerTree");
    if (!container) return;
    const renderLevel = (parentId, depth = 0) => {
      let html = "";
      getFolderChildren(parentId).forEach((folder) => {
        const children = getFolderChildren(folder.id);
        const mappings = profiles.filter((p) => (p.parentId || null) === folder.id);
        html += `<div class="mapping-manager-folder" data-folder-id="${escapeHtml(folder.id)}" style="--folder-depth:${depth}">
          <div class="mapping-manager-folder-head" data-folder-id="${escapeHtml(folder.id)}">
            <span>📁</span><strong>${escapeHtml(folder.name)}</strong>
            <button class="manager-add-subfolder" data-folder-id="${escapeHtml(folder.id)}" title="Criar subpasta">＋</button>
            <button class="manager-delete-folder" data-folder-id="${escapeHtml(folder.id)}" title="Excluir pasta">×</button>
          </div>
          <div class="mapping-manager-children">${renderLevel(folder.id, depth + 1)}${mappings.map((p) => renderManagerMapping(p, depth + 1)).join("")}</div>
        </div>`;
      });
      return html;
    };
    const rootMappings = profiles.filter((p) => !(p.parentId));
    container.innerHTML = `<div id="mappingRootDrop" class="mapping-manager-root-drop">📥 Raiz — arraste um mapeamento aqui</div>${renderLevel(null)}${rootMappings.map((p) => renderManagerMapping(p, 0)).join("")}`;

    container.querySelectorAll(".manager-add-subfolder").forEach((btn) => btn.addEventListener("click", () => createFolder(btn.dataset.folderId)));
    container.querySelectorAll(".manager-delete-folder").forEach((btn) => btn.addEventListener("click", () => deleteFolder(btn.dataset.folderId)));
    container.querySelectorAll(".manager-mapping").forEach((item) => {
      item.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/mapping-id", item.dataset.profileId); item.classList.add("dragging"); });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
    });
    container.querySelectorAll(".mapping-manager-folder-head").forEach((head) => {
      head.addEventListener("dragover", (e) => { e.preventDefault(); head.classList.add("drag-over"); });
      head.addEventListener("dragleave", () => head.classList.remove("drag-over"));
      head.addEventListener("drop", (e) => { e.preventDefault(); head.classList.remove("drag-over"); moveMappingToFolder(e.dataTransfer.getData("text/mapping-id"), head.dataset.folderId); });
    });
    const root = document.getElementById("mappingRootDrop");
    if (root) { root.addEventListener("dragover", (e) => { e.preventDefault(); root.classList.add("drag-over"); }); root.addEventListener("dragleave", () => root.classList.remove("drag-over")); root.addEventListener("drop", (e) => { e.preventDefault(); root.classList.remove("drag-over"); moveMappingToFolder(e.dataTransfer.getData("text/mapping-id"), null); }); }
  }

  function renderManagerMapping(profile, depth) {
    return `<div class="manager-mapping" draggable="true" data-profile-id="${escapeHtml(profile.id)}" style="--folder-depth:${depth}">↕️ <span>📄</span><span class="manager-mapping-name">${escapeHtml(profile.name)}</span><span class="manager-mapping-url">${escapeHtml(profile.url || "URL não registrada")}</span></div>`;
  }

  function renderManagedProfileTree(items) {
    const visibleIds = new Set(items.map(({ p }) => p.id));

    const renderMappingItem = ({ p, i }, depth) => {
      const isSelected = selectedIndex === i;
      const count = Object.keys(p.mapping || {}).length;
      const dataCount = Object.keys(getLatestProfileData(p)).length;
      // v5.15 — o nome ocupa toda a largura da coluna; badges e botões de ação ficam abaixo dele.
      // A exibição de cada badge é controlada pelas Preferências (data-pmapped / data-pdata no <html>).
      return `<div class="profile-tree-profile ${isSelected ? "selected" : ""}" data-index="${i}" style="--tree-depth:${depth}" tabindex="0" role="option" aria-selected="${isSelected ? "true" : "false"}">
        <div class="profile-tree-head">
          <span class="profile-tree-file">📄</span>
          <span class="profile-tree-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
        </div>
        <div class="profile-tree-foot">
          <span class="profile-tree-meta" aria-label="${count} campos mapeados, ${dataCount} dados">
            <span class="profile-chip profile-chip-mapped" title="Campos mapeados neste perfil"><b>${count}</b> ${count === 1 ? "mapeado" : "mapeados"}</span>
            <span class="profile-chip profile-chip-data" title="Dados padrão salvos neste perfil"><b>${dataCount}</b> ${dataCount === 1 ? "dado" : "dados"}</span>
          </span>
          <span class="profile-tree-actions">
            ${p.url ? `<button type="button" class="profile-go-url-btn" data-url="${escapeHtml(p.url)}" title="Ir para o formulário">Ir para</button>` : ""}
            <button class="delete-btn" data-index="${i}" title="Excluir perfil" aria-label="Excluir ${escapeHtml(p.name)}">×</button>
          </span>
        </div>
      </div>`;
    };

    const renderFolder = (folder, depth = 0) => {
      const children = getFolderChildren(folder.id);
      const folderMappings = items.filter(({ p }) => (p.parentId || null) === folder.id);
      const childHtml = children.map((child) => renderFolder(child, depth + 1)).filter(Boolean).join("");
      const mappingHtml = folderMappings.map((entry) => renderMappingItem(entry, depth + 1)).join("");
      if (!childHtml && !mappingHtml) return "";
      const isOpen = folderOpenState[folder.id] === true;
      return `<details class="profile-tree-node" data-folder-id="${escapeHtml(folder.id)}"${isOpen ? " open" : ""}>
        <summary><span class="tree-chevron">▶</span><span>📁</span><strong>${escapeHtml(folder.name)}</strong></summary>
        <div class="profile-tree-children">${childHtml}${mappingHtml}</div>
      </details>`;
    };

    const rootFolders = getFolderChildren(null);
    const rootFolderHtml = rootFolders.map((folder) => renderFolder(folder, 0)).filter(Boolean).join("");
    const rootMappings = items.filter(({ p }) => !(p.parentId || null));
    const rootMappingHtml = rootMappings.map((entry) => renderMappingItem(entry, 0)).join("");

    return rootFolderHtml + rootMappingHtml;
  }

  function renderProfiles() {
    if (profiles.length === 0) {
      profileList.innerHTML = `<div class="empty-message">Nenhum mapeamento salvo</div>`;
      fillProfileBtn.disabled = true; deleteProfileBtn.disabled = true; uploadNewJsonBtn.disabled = true; editProfileBtn.disabled = true; editMappingBtn.disabled = true; profilePreview.style.display = "none"; return;
    }

    const normalizedSearch = profileSearchQuery.trim().toLowerCase();
    const visibleProfiles = profiles.map((p, i) => ({ p, i })).filter(({ p }) =>
      !normalizedSearch ||
      p.name.toLowerCase().includes(normalizedSearch) ||
      (p.url || "").toLowerCase().includes(normalizedSearch)
    );

    if (!visibleProfiles.length) {
      profileList.innerHTML = `<div class="empty-message">Nenhum mapeamento encontrado</div>`;
      return;
    }

    profileList.innerHTML = renderManagedProfileTree(visibleProfiles);

    profileList.querySelectorAll(".profile-tree-node").forEach((node) => {
      node.addEventListener("toggle", () => {
        const folderId = node.dataset.folderId;
        if (!folderId) return;
        folderOpenState[folderId] = node.open;
        chrome.storage.local.set({ folderOpenState });
      });
    });

    profileList.querySelectorAll(".profile-tree-profile").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("delete-btn") || e.target.classList.contains("profile-go-url-btn")) return;
        selectProfile(parseInt(item.dataset.index));
      });

      const del = item.querySelector(".delete-btn");
      if (del) del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteProfile(parseInt(del.dataset.index));
      });

      const goUrl = item.querySelector(".profile-go-url-btn");
      if (goUrl) goUrl.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = goUrl.dataset.url;
        if (!url) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (tab && tab.id !== undefined) chrome.tabs.update(tab.id, { url });
        });
      });
    });

    if (selectedIndex !== null && profiles[selectedIndex]) {
      fillProfileBtn.disabled = false; deleteProfileBtn.disabled = false; uploadNewJsonBtn.disabled = false; editProfileBtn.disabled = false; editMappingBtn.disabled = false;
      const p = profiles[selectedIndex]; profilePreview.style.display = "block";
      const mappedCount = Object.keys(p.mapping || {}).length; const profileData = getLatestProfileData(p);
      const testSettings = getTestSettings(p);
      const latestLabel = Object.keys(profileData).length ? `${Object.keys(profileData).length} campo(s) no JSON padrão` : "Nenhum JSON padrão definido";
      profilePreview.innerHTML = `<div class="selected-profile-title"><span class="selected-profile-name">${escapeHtml(p.name)}</span><span class="selected-profile-state">Selecionado</span></div><div class="selected-profile-meta"><span>${mappedCount} campos mapeados</span><span>•</span><span>${Object.keys(profileData).length} dados padrão</span><span class="profile-test-state">${testSettings.enabled ? "🧪 teste automático" : "✓ dados normais"}</span></div><div class="profile-latest-data" title="${escapeHtml(latestLabel)}"><span>JSON padrão</span><strong>${escapeHtml(latestLabel)}</strong></div><div class="profile-url">🔗 ${escapeHtml(p.url || "URL não registrada")} ${p.url ? `<button type="button" class="profile-preview-go-url" data-url="${escapeHtml(p.url)}">Ir para</button>` : ""}</div>`;
      const previewGo = profilePreview.querySelector(".profile-preview-go-url");
      if (previewGo) previewGo.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (tab && tab.id !== undefined) chrome.tabs.update(tab.id, { url: previewGo.dataset.url });
        });
      });
    } else {
      fillProfileBtn.disabled = true; deleteProfileBtn.disabled = true; uploadNewJsonBtn.disabled = true; editProfileBtn.disabled = true; editMappingBtn.disabled = true; profilePreview.style.display = "none";
    }
  }

  function selectProfile(index) {
    selectedIndex = index;
    notifyActiveProfile();
    const settings = getTestSettings(profiles[index]);
    isTestMode = settings.enabled;
    const checkbox = document.getElementById("is_test");
    if (checkbox) checkbox.checked = isTestMode;
    const testState = document.getElementById("testPreferenceState");
    if (testState) {
      const hasSavedFields = Object.values(settings.fields || {}).some((value) => value === true);
      testState.textContent = isTestMode
        ? (hasSavedFields ? "Ativo · usa as chaves de teste salvas neste mapeamento" : "Ativo · escolha as chaves de teste no primeiro preenchimento")
        : "Desativado · os dados serão usados sem alteração";
    }
    renderProfiles();
    showStatus(`✅ "${profiles[index].name}" selecionado`, "success");
  }

  function deleteProfile(index) {
    if (!profiles[index]) return;
    const profile = profiles[index];
    const historyCount = getProfileHistory(profile).length;
    const message = historyCount
      ? `Deletar "${profile.name}" e seus ${historyCount} JSON(s) do histórico?`
      : `Deletar "${profile.name}"?`;
    if (!confirm(message)) return;

    delete historyStore[historyKey(profile)];
    profiles.splice(index, 1);
    if (selectedIndex === index) selectedIndex = null;
    else if (selectedIndex > index) selectedIndex--;
    saveProfiles();
    notifyActiveProfile();
  }

  function saveProfiles() {
    profiles.forEach((p) => { p.updatedAt = p.updatedAt || Date.now(); });
    persistAll(() => {
      renderProfiles();
      updateMapperSelect();
    });
  }

  // ============================================
  // UPLOAD JSON
  // ============================================
  uploadJsonBtn.addEventListener("click", () => fileInput.click());

  const quickJsonBtn = document.getElementById("quickJsonBtn");
  if (quickJsonBtn) {
    quickJsonBtn.addEventListener("click", () => {
      if (selectedIndex === null || !profiles[selectedIndex]) {
        showStatus("❌ Selecione ou crie um mapeamento primeiro", "error");
        return;
      }
      const profile = profiles[selectedIndex];
      selectedProfileName.textContent = `📝 ${profile.name}`;
      expectedKeysDisplay.textContent = getJsonKeys(getLatestProfileData(profile)).join(", ") || "nenhuma — JSON ainda não definido";
      newJsonData.value = "";
      openModal(newJsonModal);
      setTimeout(() => newJsonData.focus(), 150);
    });
  }

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const jsonData = parseJsonObject(ev.target.result, "Arquivo JSON");

        // Se já existe um mapeamento selecionado, o upload é DADO, nunca PERFIL.
        if (selectedIndex !== null && profiles[selectedIndex]) {
          const profile = profiles[selectedIndex];
          addJsonToProfile(profile, jsonData, { source: "file", filename: file.name });
          showStatus(`📎 ${file.name} adicionado aos dados de "${profile.name}". O mapeamento não foi alterado.`, "success");
        } else {
          showStatus("❌ Crie ou selecione um perfil antes de usar um JSON. O JSON só pode se tornar dado padrão no cadastro ou em Editar perfil.", "error");
        }
        fileInput.value = "";
      } catch (err) {
        showStatus("❌ Erro ao ler JSON: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  });

  // ============================================
  // NOVO MAPEAMENTO - JSON OPCIONAL
  // ============================================
  newMappingBtn.addEventListener("click", () => {
    newProfileName.value = "";
    newProfileJson.value = "";
    openModal(newProfileModal);
    setTimeout(() => newProfileName.focus(), 150);
  });

  confirmNewProfileBtn.addEventListener("click", () => {
    const normalizedName = newProfileName.value.trim();
    const jsonStr = newProfileJson.value.trim();
    if (!normalizedName) {
      showStatus("❌ Informe o nome do perfil", "error");
      return;
    }
    if (profiles.some((p) => p.name.toLowerCase() === normalizedName.toLowerCase())) {
      showStatus("⚠️ Já existe um mapeamento com este nome", "error");
      return;
    }

    let jsonData = {};
    try {
      if (jsonStr) jsonData = parseJsonObject(jsonStr, "JSON do perfil");
    } catch (e) {
      showStatus("❌ JSON inválido: " + e.message, "error");
      return;
    }

    profiles.push(normalizeProfile({
      id: createId("profile"),
      name: normalizedName,
      data: jsonData,
      mapping: {},
      testPreferences: {},
      testSettings: { enabled: false, fields: {}, remember: false },
      dontAskTestAgain: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      url: currentPageUrl || "",
    }));

    saveProfiles();
    selectedIndex = profiles.length - 1;
    selectProfile(selectedIndex);
    closeModal(newProfileModal);
    showStatus(`✅ "${normalizedName}" criado${jsonStr ? " com JSON padrão" : " sem JSON padrão"}.`, "success");

    const mapperTab = document.querySelector('[data-tab="tabMapper"]');
    if (mapperTab) mapperTab.click();
    updateMapperView();
  });

  cancelNewProfileBtn.addEventListener("click", () => closeModal(newProfileModal));

  // ============================================
  // PREENCHER (COM MODO DE TESTE)
  // ============================================
  fillProfileBtn.addEventListener("click", () => {
    if (selectedIndex === null) {
      showStatus("❌ Selecione um mapeamento", "error");
      return;
    }

    const profile = profiles[selectedIndex];
    const mapping = profile.mapping || {};
    const data = getLatestProfileData(profile);

    const mappedData = {};
    let mappedCount = 0;

    for (const [field, config] of Object.entries(mapping)) {
      let value = null;
      if (
        config.type === "json" &&
        data[config.value] !== undefined &&
        data[config.value] !== "" &&
        data[config.value] !== null
      ) {
        value = data[config.value];
      } else if (
        config.type === "default" &&
        config.value !== undefined &&
        config.value !== ""
      ) {
        value = config.value;
      } else if (
        config.type === "form" &&
        config.value !== undefined &&
        config.value !== ""
      ) {
        value = config.value;
      }
      if (value !== null && value !== undefined && value !== "") {
        mappedData[field] = value;
        mappedCount++;
      }
    }

    if (mappedCount === 0) {
      showStatus(
        '⚠️ Nenhum campo possui valor. No modo sem JSON, configure Form ou Default no mapeamento.',
        "error",
      );
      return;
    }

    const testSettings = getTestSettings(profile);
    const hasSavedTestFields = Object.values(testSettings.fields || {}).some((value) => value === true);

    if (testSettings.enabled && hasSavedTestFields) {
      const result = applyRememberedTestSettings(profile, mappedData);
      showStatus(`🧪 Modo de teste aplicado — ${mappedCount} campos enviados.`, "info");
      sendToContent(result.data);
      return;
    }

    if ((!profile.testSettings?.decisionMade || (testSettings.enabled && !hasSavedTestFields)) && Object.keys(data).length > 0) {
      openTestSelection(mappedData, data);
      return;
    }

    showStatus(`📤 ${mappedCount} campos mapeados, enviando...`, "info");
    sendToContent(mappedData);
  });

  // ============================================
  // EDITAR PERFIL
  // ============================================
  editProfileBtn.addEventListener("click", () => {
    if (selectedIndex === null || !profiles[selectedIndex]) {
      showStatus("❌ Selecione um perfil para editar", "error");
      return;
    }
    const profile = profiles[selectedIndex];
    editProfileName.value = profile.name;
    editProfileJson.value = JSON.stringify(getLatestProfileData(profile), null, 2);
    openModal(editProfileModal);
  });

  confirmEditProfileBtn.addEventListener("click", () => {
    if (selectedIndex === null) return;
    const newName = editProfileName.value.trim();
    const newJsonStr = editProfileJson.value.trim();
    if (!newName) {
      showStatus("❌ Informe o nome do perfil", "error");
      return;
    }
    try {
      // JSON continua opcional para perfis de mapeamento.
      const jsonData = newJsonStr ? parseJsonObject(newJsonStr, "JSON do perfil") : {};
      const existing = profiles.find(
        (p, i) => p.name === newName && i !== selectedIndex,
      );
      if (existing) {
        showStatus("⚠️ Já existe um perfil com este nome", "error");
        return;
      }
      const oldMapping = profiles[selectedIndex].mapping || {};
      const oldPreferences = profiles[selectedIndex].testPreferences || {};
      const oldDontAsk = profiles[selectedIndex].dontAskTestAgain || false;
      profiles[selectedIndex].name = newName;
      profiles[selectedIndex].mapping = oldMapping;
      profiles[selectedIndex].testPreferences = oldPreferences;
      profiles[selectedIndex].dontAskTestAgain = oldDontAsk;
      // O JSON informado em cadastro/edição é o único JSON que pode virar
      // dado padrão persistido do perfil.
      profiles[selectedIndex].data = jsonData;
      profiles[selectedIndex].url = currentPageUrl || profiles[selectedIndex].url || "";
      profiles[selectedIndex].updatedAt = Date.now();
      saveProfiles();
      closeModal(editProfileModal);
      showStatus("✅ Perfil atualizado! O mapeamento foi mantido.", "success");
    } catch (e) {
      showStatus("❌ JSON inválido: " + e.message, "error");
    }
  });

  cancelEditProfileBtn.addEventListener("click", () => {
    closeModal(editProfileModal);
  });

  // ============================================
  // EDITAR MAPEAMENTO
  // ============================================
  editMappingBtn.addEventListener("click", () => {
    if (selectedIndex === null || !profiles[selectedIndex]) {
      showStatus("❌ Selecione um perfil para editar o mapeamento", "error");
      return;
    }
    const profile = profiles[selectedIndex];
    mapperSelect.value = profile.id;
    mapperSelect.dispatchEvent(new Event("change"));
    document.querySelector('[data-tab="tabMapper"]').click();
    setTimeout(() => {
      updateMapperView();
      if (pageFields.length > 0) {
        renderMapping();
      } else {
        extractBtn.click();
      }
    }, 200);
    showStatus(
      `🔗 Editando "${profile.name}" — o JSON é opcional. Configure Form/Default e salve o mapeamento.`,
      "info",
    );
  });

  // ============================================
  // SUBIR NOVO JSON (COM MODO DE TESTE)
  // ============================================
  uploadNewJsonBtn.addEventListener("click", () => {
    if (selectedIndex === null || !profiles[selectedIndex]) {
      showStatus("❌ Selecione um perfil/mapeamento primeiro!", "error");
      return;
    }

    const profile = profiles[selectedIndex];
    selectedProfileName.textContent = `📄 ${profile.name}`;
    const expectedKeys = Object.keys(getLatestProfileData(profile));
    expectedKeysDisplay.textContent = expectedKeys.join(", ");

    const profileHistory = getProfileHistory(profile);
    if (profileHistory.length > 0) {
      historyContainer.style.display = "block";
      renderHistory(profileHistory);
    } else {
      historyContainer.style.display = "none";
    }

    openModal(newJsonModal);
    newJsonData.value = "";
    newJsonData.focus();
  });

  function renderHistory(historyItems) {
    let html = "";
    historyItems
      .slice()
      .reverse()
      .forEach((item, idx) => {
        const date = new Date(item.timestamp);
        const dateStr = date.toLocaleString();
        const preview = JSON.stringify(item.data).substring(0, 50) + "...";
        html += `
        <div class="history-item">
          <span>${escapeHtml(dateStr)}</span>
          <span style="color:#5f6368;font-size:8px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(preview)}</span>
          <button class="use-btn" data-index="${historyItems.length - 1 - idx}">📋 Usar</button>
        </div>
      `;
      });
    historyList.innerHTML = html;

    historyList.querySelectorAll(".use-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index);
        const profile = profiles[selectedIndex];
        const profileHistory = getProfileHistory(profile);
        if (profileHistory[idx]) {
          newJsonData.value = JSON.stringify(profileHistory[idx].data, null, 2);
          showStatus("📋 JSON do histórico carregado!", "info");
        }
      });
    });
  }

  confirmNewJsonBtn.addEventListener("click", () => {
    if (selectedIndex === null || !profiles[selectedIndex]) {
      showStatus("❌ Nenhum mapeamento selecionado", "error");
      return;
    }

    const jsonStr = newJsonData.value.trim();
    if (!jsonStr) {
      showStatus("❌ Cole um JSON válido!", "error");
      return;
    }

    try {
      const jsonData = parseJsonObject(jsonStr, "JSON");
      const profile = profiles[selectedIndex];

      // Nunca atribuir jsonData a profile.data/mapping.
      // A entrada passa exclusivamente pelo histórico.
      addJsonToProfile(profile, jsonData, { source: "manual" });
      closeModal(newJsonModal);
      newJsonData.value = "";
    } catch (e) {
      showStatus("❌ JSON inválido: " + e.message, "error");
    }
  });

  cancelNewJsonBtn.addEventListener("click", () => {
    closeModal(newJsonModal);
  });

  newJsonData.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      confirmNewJsonBtn.click();
    }
  });

  // ============================================
  // EDITAR VALOR (Default)
  // ============================================
  let editCtx = null; // v30: contexto alternativo (aba Dado)
  function openEditValue(fieldId, currentValue, ctx) {
    editCtx = ctx || null;
    editingFieldId = fieldId;
    const fieldName =
      pageFields.find(
        (f) => (f.name || f.id || f.placeholder || f["aria-label"]) === fieldId,
      )?.label || fieldId;
    editFieldName.textContent = ctx ? ctx.label || fieldName : fieldName;
    editFieldValue.value = normalizeNewlines(currentValue ?? "");
    openModal(editValueModal);
    // aguarda a animação do modal para focar e posicionar o cursor no fim do texto
    setTimeout(() => {
      editFieldValue.focus();
      const end = editFieldValue.value.length;
      try { editFieldValue.setSelectionRange(end, end); } catch (_) {}
    }, 200);
  }

  confirmEditValueBtn.addEventListener("click", () => {
    const problems = tokenProblems(editFieldValue.value || "");
    if (problems.length && !confirm("Há problema(s) nas variáveis deste valor:\n\n• " + problems.slice(0, 5).join("\n• ") + "\n\nSalvar mesmo assim?")) return;
    if (editCtx) {
      const ctx = editCtx; editCtx = null; editingFieldId = null;
      ctx.apply(normalizeNewlines(editFieldValue.value));
      closeModal(editValueModal);
      return;
    }
    if (editingFieldId) {
      // mantém as quebras de linha digitadas (apenas normaliza CRLF -> LF)
      const newValue = normalizeNewlines(editFieldValue.value);
      if (newValue.trim()) {
        if (currentMapping[editingFieldId]) {
          currentMapping[editingFieldId].type = "default";
          currentMapping[editingFieldId].value = newValue;
        } else {
          currentMapping[editingFieldId] = { type: "default", value: newValue };
        }
        renderMapping();
        showStatus("✅ Valor atualizado!", "success");
      } else if (currentMapping[editingFieldId]?.type === "default") {
        // texto apagado: limpa o valor Default
        currentMapping[editingFieldId].value = "";
        renderMapping();
        showStatus("ℹ️ Valor removido.", "info");
      }
      closeModal(editValueModal);
      editingFieldId = null;
    }
  });

  cancelEditValueBtn.addEventListener("click", () => {
    editCtx = null;
    closeModal(editValueModal);
    editingFieldId = null;
  });

  // v12: insere {{variavel}} na posição do cursor e seleciona o nome para renomear
  const insertVariableBtn = document.getElementById("insertVariableBtn");
  if (insertVariableBtn) {
    insertVariableBtn.addEventListener("click", () => {
      const name = "variavel";
      const token = "{{" + name + "}}";
      const start = editFieldValue.selectionStart ?? editFieldValue.value.length;
      const end = editFieldValue.selectionEnd ?? start;
      editFieldValue.value =
        editFieldValue.value.slice(0, start) + token + editFieldValue.value.slice(end);
      editFieldValue.focus();
      editFieldValue.setSelectionRange(start + 2, start + 2 + name.length);
      renderTokenPreview();
    });
  }

  // v18: variáveis rápidas (chips) no editor de valor
  function insertToken(token, selectName) {
    const start = editFieldValue.selectionStart ?? editFieldValue.value.length;
    const end = editFieldValue.selectionEnd ?? start;
    editFieldValue.value = editFieldValue.value.slice(0, start) + token + editFieldValue.value.slice(end);
    editFieldValue.focus();
    if (selectName) editFieldValue.setSelectionRange(start + 2, start + 2 + selectName.length);
    else editFieldValue.setSelectionRange(start + token.length, start + token.length);
  }
  // Funções de dia útil (select com dica em cada opção). value = o que será inserido no campo.
  const BUSINESS_DAY_OPTIONS = [
    ["Automático (segue a conta)", [
      ["{{data + 30 | dia_util}}", "Somar dias → próximo dia útil", "Soma 30 dias. Se cair em sábado, domingo ou feriado, vai para o próximo dia útil (sábado → segunda; segunda feriada → terça)."],
      ["{{data - 30 | dia_util}}", "Subtrair dias → dia útil anterior", "Subtrai 30 dias. Se cair em sábado, domingo ou feriado, volta para o dia útil anterior (sábado → sexta; sexta feriada → quinta, e assim por diante)."],
      ["{{dia_util_auto(data + 30)}}", "Função automática (somar)", "Mesma regra do filtro, em forma de função: o sentido vem do sinal da conta. Com + vai para o dia útil seguinte."],
      ["{{dia_util_auto(data - 30)}}", "Função automática (subtrair)", "Mesma regra do filtro, em forma de função. Com - volta para o dia útil anterior."],
      ["{{dia_util_auto(meses(data, 1))}}", "Somar meses → próximo dia útil", "Soma 1 mês e, se a data cair em fim de semana ou feriado, avança para o dia útil seguinte."],
      ["{{dia_util_auto(meses(data, -1))}}", "Subtrair meses → dia útil anterior", "Subtrai 1 mês e, se a data cair em fim de semana ou feriado, volta para o dia útil anterior."],
    ]],
    ["Forçar o sentido", [
      ["{{dia_util_depois(data)}}", "Sempre para o próximo dia útil", "Se a data já for dia útil, não muda. Se for fim de semana ou feriado, avança até o próximo dia útil."],
      ["{{dia_util_antes(data)}}", "Sempre para o dia útil anterior", "Se a data já for dia útil, não muda. Se for fim de semana ou feriado, volta até o dia útil anterior."],
    ]],
    ["Contar dias úteis", [
      ["{{dias_uteis(data, 5)}}", "Daqui a 5 dias úteis", "Conta só dias úteis para frente, pulando fins de semana e feriados."],
      ["{{dias_uteis(data, -5)}}", "5 dias úteis atrás", "Conta só dias úteis para trás, pulando fins de semana e feriados."],
      ["{{dias_uteis_entre(inicio, fim)}}", "Dias úteis entre duas datas", "Quantidade de dias úteis entre as duas datas (sem fins de semana e feriados)."],
    ]],
    ["Início e fim do mês", [
      ["{{primeiro_dia_util(data)}}", "1º dia útil do mês", "Primeiro dia útil do mês da data informada (ex.: dia 1º é feriado → vai para o dia seguinte útil)."],
      ["{{ultimo_dia_util(data)}}", "Último dia útil do mês", "Último dia útil do mês da data informada (ex.: dia 31 é domingo → sexta, dia 29)."],
    ]],
    ["Consultar", [
      ["{{eh_dia_util(data)}}", "É dia útil? (1 ou 0)", "Devolve 1 se a data for dia útil e 0 se for fim de semana ou feriado. Combine com se(...)."],
      ["{{eh_feriado(data)}}", "É feriado? (1 ou 0)", "Devolve 1 se a data for feriado (nacionais, Sexta-feira Santa e os extras que você cadastrou)."],
    ]],
  ];
  function businessDayGroup() {
    const opts = BUSINESS_DAY_OPTIONS.map(([g, items]) =>
      `<optgroup label="${escapeHtml(g)}">${items.map(([tok, label, tip]) => `<option value="${escapeHtml(tok)}" title="${escapeHtml(tip)}" data-tip="${escapeHtml(tip)}">${escapeHtml(label)}</option>`).join("")}</optgroup>`).join("");
    const holTip = "Feriados nacionais e a Sexta-feira Santa já são considerados. Aqui você soma os estaduais/municipais: dd/mm vale todo ano; dd/mm/aaaa vale só naquele ano. Separe por vírgula.";
    return `<div class="qv-group qv-bizday"><span class="qv-title">🗓️ Dia útil (fim de semana e feriado)</span>
      <select class="qv-dia-select" aria-label="Escolher função de dia útil" title="Passe o mouse nas opções para ver o que cada uma faz">
        <option value="" title="Escolha uma função para ver a explicação" data-tip="">Escolha uma função…</option>${opts}
      </select>
      <button type="button" class="qv-chip qv-dia-insert" data-insert="dia" title="Inserir dia útil feriado fim de semana sexta segunda no campo" disabled>Inserir</button>
      <div class="qv-dia-hint" aria-live="polite">Somar leva ao próximo dia útil; subtrair leva ao anterior. Feriados nacionais já contam.</div>
      <label class="qv-hol-label" title="${escapeHtml(holTip)}">Feriados extras (estaduais/municipais)
        <input type="text" class="qv-holidays" value="${escapeHtml(holidaysText)}" placeholder="ex.: 25/01, 09/07, 20/11/2026" autocomplete="off" spellcheck="false" title="${escapeHtml(holTip)}" />
      </label>
    </div>`;
  }
  let qvSaved = {}; // últimos valores usados: servem de exemplo na prévia
  function renderQuickVariables() {
    const box = document.getElementById("quickVariables");
    if (!box) return;
    const chip = (token, title, cls = "") =>
      `<button type="button" class="qv-chip ${cls}" data-token="${escapeHtml(token)}" title="${escapeHtml(title)}">${escapeHtml(token)}</button>`;
    const group = (title, items) => `<div class="qv-group"><span class="qv-title">${title}</span>${items.map(([t, d]) => chip(t, d)).join("")}</div>`;
    const draw = (saved) => {
      qvSaved = saved || {};
      const auto = Object.entries(BUILTIN_VARIABLES).map(([k, v]) => chip(`{{${k}}}`, v.label + " — preenchida automaticamente")).join("");
      const mine = Object.keys(saved || {}).filter((k) => !BUILTIN_VARIABLES[k.toLowerCase()] && !isListKey(k)).slice(0, 20)
        .map((k) => chip(`{{${k}}}`, "Já usada antes — será perguntada", "qv-mine")).join("");
      box.innerHTML = `
        <input type="search" class="qv-search" placeholder="🔎 Buscar: data, cpf, moeda, maiúsculas, idade…" autocomplete="off" spellcheck="false" aria-label="Buscar função ou filtro" />
        <div class="qv-group"><span class="qv-title">⚡ Automáticas</span>${auto}</div>
        ${mine ? `<div class="qv-group"><span class="qv-title">⭐ Suas variáveis</span>${mine}</div>` : ""}
        ${group("🔁 Listas (repetição)", [
          ["{{repetição('-')}}", "Repetição: você adiciona quantos itens quiser ao preencher; cada um vira uma linha com o prefixo -"],
          ["{{repetição('•')}}", "Repetição: lista com marcador •"],
          ["{{repetição('-', 'Participantes')}}", "Repetição com título (use títulos diferentes para ter várias listas independentes)"],
          ["{{repetição('-') | maiusculas}}", "Repetição: aplica o filtro em cada item"],
        ])}
        ${group("📋 Lista de editor", [
          ["{{lista('-')}}", "Lista: você adiciona os itens ao preencher; em editores (Word online, Zeev, TinyMCE…) vira lista de marcadores de verdade"],
          ["{{lista('1.')}}", "Lista numerada de verdade nos editores (1. 2. 3.)"],
          ["{{lista('-', 'Participantes')}}", "Lista com título (use títulos diferentes para ter várias listas independentes)"],
          ["{{lista('-') | maiusculas}}", "Lista: aplica o filtro em cada item"],
        ])}
        ${group("🧮 Cálculos e funções", [
          ["{{preco * qtd | moeda}}", "Multiplica e formata R$ 1.234,56"],
          ["{{total * 0,9 | 2}}", "Desconto de 10% com 2 casas"],
          ["{{se(total > 1000, \"Sim\", \"Não\")}}", "Condição: se ... então ... senão"],
          ["{{arred(valor, 2)}}", "Arredondar"], ["{{media(a, b, c)}}", "Média"], ["{{max(a, b)}}", "Maior valor"],
          ["{{pct(salario, 8)}}", "8% do salário"], ["{{seerro(a / b, 0)}}", "Valor alternativo se a conta falhar"],
          ["{{escolher(n, \"um\", \"dois\", \"três\")}}", "Escolhe pelo número"],
          ["{{fim - inicio | h}}", "Diferença de horários em HH:MM"], ["{{fim - inicio | horas_dec}}", "Horas em decimal (8,50)"], ["{{fim - inicio | duracao_extenso}}", "Duração por extenso (10 horas e 30 min)"],
        ])}
        ${group("📅 Datas", [
          ["{{hoje + 30}}", "Daqui a 30 dias"], ["{{dias_uteis(hoje, 5)}}", "Daqui a 5 dias úteis"], ["{{hoje + 30 | dia_util}}", "Se cair em fim de semana/feriado, vai para o próximo dia útil"], ["{{hoje - 30 | dia_util}}", "Se cair em fim de semana/feriado, volta para o dia útil anterior"],
          ["{{meses(hoje, 1)}}", "Daqui a 1 mês"], ["{{fim - inicio}}", "Dias entre duas datas"], ["{{dias_uteis_entre(inicio, fim)}}", "Dias úteis entre duas datas"],
          ["{{idade(nascimento)}}", "Idade em anos"], ["{{data_nasc | iso}}", "Converte para AAAA-MM-DD"], ["{{data | mes_ano}}", "MM/AAAA"],
          ["{{hoje | data_extenso}}", "28 de outubro de 2026"],
        ])}
        ${businessDayGroup()}
        ${group("🔤 Textos", [
          ["{{nome | maiusculas}}", "MAIÚSCULAS"], ["{{nome | titulo}}", "Primeira Letra Maiúscula"], ["{{nome | primeiro_nome}}", "Só o primeiro nome"],
          ["{{nome | iniciais}}", "Iniciais"], ["{{nome | sem_acentos}}", "Remove acentos"], ["{{nome | limite:30}}", "Corta em 30 caracteres"],
          ["{{obs | padrao:N/A}}", "Valor padrão se vazio"], ["{{trocar_aqui | trocar:de:para}}", "Troca um trecho por outro"],
          ["{{contem(nome, \"silva\")}}", "1 se o texto contém o trecho"],
        ])}
        ${group("🪪 Documentos e números", [
          ["{{cpf | cpf}}", "000.000.000-00"], ["{{cpf | numeros}}", "Só os dígitos"], ["{{cnpj | cnpj}}", "00.000.000/0000-00"],
          ["{{telefone | telefone}}", "(11) 98765-4321"], ["{{cep | cep}}", "00000-000"], ["{{rg | rg}}", "00.000.000-0"],
          ["{{valor | moeda}}", "R$ 1.234,56"], ["{{valor | valor}}", "1.234,56 (sem R$)"], ["{{valor | extenso_reais}}", "Valor por extenso em reais"],
          ["{{matricula | zeros:8}}", "Zeros à esquerda"], ["{{se(cpf_valido(cpf), \"ok\", \"inválido\")}}", "Valida CPF"],
        ])}
        <div class="qv-group"><span class="qv-title">➕ Criar</span>
          <button type="button" class="qv-chip qv-new" data-new="text" title="Pergunta um texto ao preencher">Pergunta (texto)</button>
          <button type="button" class="qv-chip qv-new" data-new="choice" title="Pergunta com lista de opções">Lista de opções</button>
          <button type="button" class="qv-chip qv-new" data-new="repeat" title="Lista com repetição: você adiciona quantos itens quiser ao preencher">Lista com repetição</button>
          <button type="button" class="qv-chip qv-new" data-new="lista" title="Lista de editor: cola como lista de marcadores de verdade nos editores de texto">Lista de editor</button>
        </div>
        <div class="qv-empty" hidden>Nada encontrado. Veja o guia completo em VARIAVEIS.md.</div>`;
      renderTokenPreview();
    };
    try { chrome.storage.local.get([VARIABLE_STORE_KEY, HOLIDAYS_KEY], (r) => { void chrome.runtime.lastError; if (r && typeof r[HOLIDAYS_KEY] === "string") applyHolidays(r[HOLIDAYS_KEY]); draw((r && r[VARIABLE_STORE_KEY]) || {}); }); }
    catch (_) { draw({}); }
    if (!box.dataset.bound) {
      box.dataset.bound = "1";
      box.addEventListener("click", (e) => {
        const b = e.target.closest(".qv-chip");
        if (!b) return;
        if (b.dataset.insert === "dia") {
          const sel = box.querySelector(".qv-dia-select");
          if (sel && sel.value) { insertToken(sel.value); renderTokenPreview(); }
          return;
        }
        if (b.dataset.token) { insertToken(b.dataset.token); renderTokenPreview(); return; }
        if (b.dataset.new === "text") { insertToken("{{variavel}}", "variavel"); renderTokenPreview(); return; }
        if (b.dataset.new === "repeat") { insertToken("{{repetição('-')}}"); renderTokenPreview(); return; }
        if (b.dataset.new === "lista") { insertToken("{{lista('-')}}"); renderTokenPreview(); return; }
        const name = (prompt("Nome da variável:", "opcao") || "").trim();
        if (!name) return;
        const opts = (prompt("Opções separadas por vírgula:", "Sim, Não") || "").split(",").map((x) => x.trim()).filter(Boolean);
        insertToken(`{{${name}${opts.length ? "|" + opts.join("|") : ""}}}`);
        renderTokenPreview();
      });
      box.addEventListener("change", (e) => {
        const t = e.target;
        if (t.classList.contains("qv-dia-select")) {
          const opt = t.selectedOptions[0]; const tip = (opt && opt.dataset.tip) || "";
          const hint = box.querySelector(".qv-dia-hint"); const ins = box.querySelector(".qv-dia-insert");
          if (hint) hint.textContent = tip || "Somar leva ao próximo dia útil; subtrair leva ao anterior. Feriados nacionais já contam.";
          t.title = tip || "Passe o mouse nas opções para ver o que cada uma faz";
          if (ins) ins.disabled = !t.value;
        } else if (t.classList.contains("qv-holidays")) {
          const n = applyHolidays(t.value);
          try { chrome.storage.local.set({ [HOLIDAYS_KEY]: t.value }); } catch (_) { /* ignora */ }
          const hint = box.querySelector(".qv-dia-hint");
          if (hint) hint.textContent = n ? `${n} feriado${n === 1 ? "" : "s"} extra${n === 1 ? "" : "s"} em uso.` : (t.value.trim() ? "Nenhum feriado reconhecido — use dd/mm ou dd/mm/aaaa." : "Feriados extras removidos.");
          renderTokenPreview();
        }
      });
      box.addEventListener("input", (e) => {
        if (!e.target.classList.contains("qv-search")) return;
        const q = e.target.value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let any = false;
        box.querySelectorAll(".qv-group").forEach((g) => {
          let vis = 0;
          g.querySelectorAll(".qv-chip").forEach((c) => {
            const hay = (c.textContent + " " + (c.title || "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const ok = !q || hay.includes(q); c.hidden = !ok; if (ok) vis++;
          });
          g.hidden = !vis; if (vis) any = true;
        });
        const empty = box.querySelector(".qv-empty"); if (empty) empty.hidden = any || !q;
      });
    }
  }

  // Prévia ao vivo de cada {{ ... }} do texto: resultado, o que será perguntado e avisos
  function tokenProblems(text) {
    const problems = [];
    const open = (text.match(/\{\{/g) || []).length, close = (text.match(/\}\}/g) || []).length;
    if (open !== close) problems.push(open > close ? "Falta fechar um {{ com }}." : "Há um }} sem o {{ correspondente.");
    const seen = new Set();
    for (const m of text.matchAll(VARIABLE_REGEX)) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      VARS.diagnose(m[1]).filter((i) => i.level === "erro").forEach((i) => problems.push(`{{${m[1].trim()}}} — ${i.msg}`));
    }
    return problems;
  }
  function renderTokenPreview() {
    const box = document.getElementById("tokenPreview");
    if (!box) return;
    const text = editFieldValue.value || "";
    const raws = []; const seen = new Set();
    for (const m of text.matchAll(VARIABLE_REGEX)) { if (!seen.has(m[1])) { seen.add(m[1]); raws.push(m[1]); } }
    const open = (text.match(/\{\{/g) || []).length, close = (text.match(/\}\}/g) || []).length;
    if (!raws.length && open === close) { box.hidden = true; box.innerHTML = ""; return; }
    const flat = (t) => { const x = String(t).replace(/\s*\n\s*/g, " ⏎ "); return x.length > 90 ? x.slice(0, 89) + "…" : x; };
    const rows = raws.slice(0, 8).map((raw) => {
      const pv = VARS.preview(raw, qvSaved);
      const parsed = VARS.parse(raw);
      const errors = pv.issues.filter((i) => i.level === "erro");
      let cls = "ok", out;
      if (errors.length) { cls = "bad"; out = errors[0].msg; }
      else if (parsed.kind === "repeat") {
        if (pv.text) out = flat(pv.text);
        else if (parsed.rich) { cls = "ask"; out = `lista de editor (${parsed.ordered ? "numerada" : "marcadores"}) — você adiciona os itens ao preencher; nos editores vira lista de verdade`; }
        else { cls = "ask"; out = `lista (${parsed.prefix ? "prefixo “" + parsed.prefix + "”" : "sem prefixo"}) — você adiciona os itens ao preencher`; }
      }
      else if (parsed.kind === "var" && parsed.options.length && !parsed.filters.length) { cls = "ask"; out = "pergunta com lista: " + parsed.options.join(" · "); }
      else if (pv.missing.length && !pv.text) { cls = "ask"; out = "pergunta " + pv.missing.map((n) => `“${n}”`).join(", ") + " ao preencher"; }
      else if (!pv.text) { cls = "warn"; out = "sem resultado com estes valores"; }
      else out = flat(pv.text);
      const extra = pv.missing.length && pv.text ? `<div class="tp-note">pergunta ${escapeHtml(pv.missing.join(", "))} ao preencher</div>` : "";
      const warns = pv.issues.filter((i) => i.level !== "erro").concat(errors.slice(1)).map((i) => `<div class="tp-issue">⚠ ${escapeHtml(i.msg)}</div>`).join("");
      return `<li class="tp-${cls}"><code>{{${escapeHtml(raw.trim())}}}</code><span class="tp-arrow">→</span><span class="tp-out">${escapeHtml(out)}</span>${extra}${warns}</li>`;
    }).join("");
    const unbalanced = open !== close ? `<li class="tp-bad"><span class="tp-out">⚠ ${open > close ? "Falta fechar um {{ com }}." : "Há um }} sem o {{ correspondente."}</span></li>` : "";
    box.hidden = false;
    box.innerHTML = `<div class="tp-title">👁 Como cada variável será resolvida <small>(com os últimos valores usados)</small></div><ul>${unbalanced}${rows}</ul>${raws.length > 8 ? `<div class="tp-note">+ ${raws.length - 8} variável(is)</div>` : ""}`;
  }
  let tpTimer = 0;
  editFieldValue.addEventListener("input", () => { clearTimeout(tpTimer); tpTimer = setTimeout(renderTokenPreview, 120); });
  const editModalEl = document.getElementById("editValueModal");
  if (editModalEl) editModalEl.addEventListener("show.bs.modal", () => { try { renderQuickVariables(); } catch (e) { console.warn(e); } });

  // Enter agora quebra linha (textarea); Ctrl+Enter / Cmd+Enter salva
  editFieldValue.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      confirmEditValueBtn.click();
    }
  });

  // ============================================
  // BACKUP
  // ============================================
  // Backup único e completo (fazer + restaurar): js/backup.js. Ele avisa o resultado por este evento:
  document.addEventListener("mapeador:status", (e) => { const d = e.detail || {}; if (d.msg) showStatus(d.msg, d.type || "info"); });

  // ============================================
  // DELETE
  // ============================================
  deleteProfileBtn.addEventListener("click", () => {
    if (selectedIndex !== null) deleteProfile(selectedIndex);
  });

  // ============================================
  // MAPPER
  // ============================================
  function updateMapperSelect() {
    const current = mapperSelect.value;
    mapperSelect.innerHTML = '<option value="">Selecione um mapeamento...</option>';
    profiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      const count = Object.keys(getLatestProfileData(p)).length;
      const suffix = count > 0 ? `${count} campos JSON` : "sem JSON";
      opt.textContent = `${p.name} (${suffix})`;
      mapperSelect.appendChild(opt);
    });
    if (current && profiles.some((p) => p.id === current)) {
      mapperSelect.value = current;
    } else if (selectedIndex !== null && profiles[selectedIndex]) {
      mapperSelect.value = profiles[selectedIndex].id;
    }
  }

  mapperSelect.addEventListener("change", () => {
    const profile = profiles.find((p) => p.id === mapperSelect.value);
    if (profile) {
      const idx = profiles.indexOf(profile);
      selectedIndex = idx;
      renderProfiles();
      loadMapping(profile);
    }
  });

  function loadMapping(profile) {
    currentMapping = JSON.parse(JSON.stringify(profile.mapping || {}));
    // Campos removidos pelo usuário não devem reaparecer ao reabrir o mapeamento.
    profile.excludedMappingFields = Array.isArray(profile.excludedMappingFields)
      ? profile.excludedMappingFields
      : [];
    currentProfileData = getLatestProfileData(profile);
    currentProfileId = profile.id;
    if (pageFields.length > 0 || getManualFields().length > 0) renderMapping();
    else {
      mappingContainer.innerHTML = `<div class="empty-message">Clique em "Extrair" para buscar os campos da página</div>`;
      mappingStats.innerHTML =
        "<span>📊 Campos: 0</span><span>🔗 Mapeados: 0</span>";
    }
  }

  function updateMapperView() {
    updateMapperSelect();
    const profile = profiles.find((p) => p.id === mapperSelect.value);
    if (profile) {
      loadMapping(profile);
    } else {
      mappingContainer.innerHTML = `<div class="empty-message">Selecione um mapeamento e clique em "Extrair"</div>`;
    }
  }

  // ============================================
  // EXTRAIR
  // ============================================
  extractBtn.addEventListener("click", () => {
    const profileId = mapperSelect.value;
    if (!profileId) {
      showStatus("❌ Selecione um mapeamento", "error");
      return;
    }

    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) {
      showStatus("❌ Perfil não encontrado", "error");
      return;
    }

    showStatus("🔍 Extraindo campos...", "info");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        showStatus("❌ Nenhuma aba ativa", "error");
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "EXTRACT_FIELDS" },
        { frameId: 0 },
        (response) => {
          if (chrome.runtime.lastError) {
            showStatus("❌ Erro: " + chrome.runtime.lastError.message, "error");
            return;
          }

          if (response && response.fields && response.fields.length > 0) {
            pageFields = response.fields;
            currentProfileData = getLatestProfileData(profile);
            currentMapping = JSON.parse(JSON.stringify(profile.mapping || {}));
            renderMapping();
            showStatus(`✅ ${pageFields.length} campos extraídos!`, "success");
          } else {
            showStatus("❌ Nenhum campo encontrado na página", "error");
            pageFields = [];
            renderMapping();
          }
        },
      );
    });
  });

  // ============================================
  // RENDER MAPPING - CORRIGIDO (MOSTRA INPUT DEFAULT)
  // ============================================

  // Campos adicionados à mão: ficam no mapeamento com a chave "css:<seletor>"
  function getManualFields() {
    const profile = profiles.find((p) => p.id === currentProfileId);
    const excluded = new Set(profile?.excludedMappingFields || []);
    const known = new Set(
      pageFields.map(
        (f) => f.name || f.id || f.placeholder || f["aria-label"] || "",
      ),
    );
    return Object.keys(currentMapping || {})
      .filter((k) => (k.startsWith("css:") || k.startsWith("js:")) && !known.has(k) && !excluded.has(k))
      .map((k) => ({ name: k, label: k.slice(4), type: "css", manual: true }));
  }

  function renderMapping() {
    const profile = profiles.find((p) => p.id === currentProfileId);
    const excluded = new Set(profile?.excludedMappingFields || []);
    const visiblePageFields = pageFields.filter((field) => {
      const id = field.name || field.id || field.placeholder || field["aria-label"] || "";
      return !excluded.has(id);
    });
    const allFields = [...visiblePageFields, ...getManualFields()];
    if (allFields.length === 0) {
      mappingContainer.innerHTML = `<div class="empty-message">Clique em "Extrair" para buscar os campos da página</div>`;
      mappingStats.innerHTML =
        "<span>📊 Campos: 0</span><span>🔗 Mapeados: 0</span>";
      return;
    }

    // O JSON agora é opcional. Com {} o usuário consegue criar
    // mapeamentos do tipo Form/Default normalmente.
    currentProfileData = currentProfileData || {};
    const jsonKeys = Object.keys(currentProfileData);
    const hasJson = jsonKeys.length > 0;
    let mappedCount = 0;
    let html = hasJson
      ? ""
      : `<div class="mapping-json-hint"><strong>🧩 Mapeamento independente de JSON</strong><span>Você pode configurar <b>Form</b> e <b>Default</b> agora. Depois use <b>Subir Novo JSON</b> para anexar os dados sem perder este mapeamento.</span></div>`;

    allFields.forEach((field) => {
      const fieldId =
        field.name ||
        field.id ||
        field.placeholder ||
        field["aria-label"] ||
        "";
      const fieldLabel = field.label || fieldId || "campo";
      const config = currentMapping[fieldId] || {
        type: hasJson ? "json" : "default",
        value: "",
      };

      let isMapped = false;
      let displayValue = "";

      // Verificar se está mapeado e qual o valor
      if (
        config.type === "json" &&
        config.value &&
        currentProfileData[config.value] !== undefined
      ) {
        isMapped = true;
        displayValue = String(currentProfileData[config.value]).substring(
          0,
          20,
        );
      } else if (
        config.type === "default" &&
        config.value &&
        config.value.trim() !== ""
      ) {
        isMapped = true;
        displayValue = flattenForDisplay(config.value);
      } else if (
        config.type === "form" &&
        config.value &&
        config.value.trim() !== ""
      ) {
        isMapped = true;
        displayValue = config.value;
      }

      if (isMapped) mappedCount++;

      // Opções para campos do tipo select
      let formOptionsHtml = "";
      if (field.options && field.options.length > 0) {
        formOptionsHtml = `<select class="form-options" data-field="${escapeHtml(fieldId)}">
        <option value="">Selecione uma opção...</option>`;
        field.options.forEach((opt) => {
          const selected =
            config.type === "form" && config.value === opt.value
              ? "selected"
              : "";
          formOptionsHtml += `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.text || opt.value)}</option>`;
        });
        formOptionsHtml += `</select>`;
      } else {
        formOptionsHtml = `<input class="default-input form-value" data-field="${escapeHtml(fieldId)}" type="text" placeholder="Valor" value="${config.type === "form" ? escapeHtml(config.value || "") : ""}" style="width:80px;font-size:8px;padding:1px 3px;border:1px solid #dadce0;border-radius:3px;">`;
      }

      // MOSTRAR TODOS OS CAMPOS, MAS CONTROLAR VISIBILIDADE
      // O campo default DEVE mostrar o input sempre que o modo for "default"
      const showJsonSelect =
        config.type === "json" ? "" : 'style="display:none;"';
      const showFormContainer =
        config.type === "form" ? "" : 'style="display:none;"';
      const showDefaultInput =
        config.type === "default" ? "" : 'style="display:none;"';

      // Botão de editar - mostra se tem valor (qualquer tipo)
      const showEditBtn =
        (config.type === "json" && config.value) ||
        (config.type === "default" && config.value) ||
        (config.type === "form" && config.value)
          ? ""
          : 'style="display:none;"';

      html += `
      <div class="mapping-item${field.manual ? " mapping-item-manual" : ""}" data-field="${escapeHtml(fieldId)}">
        <span class="field-name" title="${escapeHtml(fieldId)}">${escapeHtml(fieldLabel || fieldId || "campo")}</span>
        <span class="field-type">${field.type || "text"}</span>
  
        <div class="mapping-mode">
          <select class="mode-select" data-field="${escapeHtml(fieldId)}">
            <option value="json" ${config.type === "json" ? "selected" : ""} ${!hasJson ? "disabled" : ""}>JSON${!hasJson ? " (adicione um JSON)" : ""}</option>
            <option value="form" ${config.type === "form" ? "selected" : ""}>Form</option>
            <option value="default" ${config.type === "default" ? "selected" : ""}>Default</option>
          </select>
          
          <!-- Campo JSON (Select) -->
          <select class="value-select" data-field="${escapeHtml(fieldId)}" ${showJsonSelect} ${!hasJson ? "disabled" : ""}>
            <option value="">${hasJson ? "Selecione..." : "Adicione um JSON para usar esta opção"}</option>
            ${jsonKeys
              .map(
                (k) => `
              <option value="${escapeHtml(k)}" ${config.type === "json" && k === config.value ? "selected" : ""}>
                ${escapeHtml(k)}
              </option>
            `,
              )
              .join("")}
          </select>
          
          <!-- Campo Form (Select ou Input) -->
          <div class="form-options-container" ${showFormContainer}>
            ${formOptionsHtml}
          </div>
          
          <!-- CAMPO DEFAULT - somente leitura; o clique abre o modal com textarea (v10) -->
          <input class="default-input" data-field="${escapeHtml(fieldId)}" type="text" readonly placeholder="Clique para digitar o valor..." title="Clique para abrir o editor de texto" ${showDefaultInput} data-raw="${config.type === "default" ? escapeAttrMultiline(config.value || "") : ""}" value="${config.type === "default" ? escapeHtml(flattenForDisplay(config.value || "")) : ""}" style="width:100px;font-size:10px;padding:2px 4px;border:1px solid #dadce0;border-radius:3px;display:${config.type === "default" ? "inline-block" : "none"};">
          
          <button class="btn-edit-value" data-field="${escapeHtml(fieldId)}" title="Editar valor" ${showEditBtn}>✏️</button>
          ${field.manual ? `<button type="button" class="btn-test-manual" data-field="${escapeHtml(fieldId)}" title="Destacar este elemento na página">🎯</button>` : ""}
          <button type="button" class="btn-remove-field" data-field="${escapeHtml(fieldId)}" title="Remover este campo do mapeamento" aria-label="Remover campo ${escapeHtml(fieldLabel || fieldId)}">🗑️</button>
        </div>
        ${displayValue ? `<span class="json-preview">${escapeHtml(displayValue)}</span>` : ""}
        <span class="mapping-status ${isMapped ? "found" : "notfound"}">
          ${isMapped ? "✅" : "❌"}
        </span>
      </div>
    `;
    });

    mappingContainer.innerHTML = html;
    mappingStats.innerHTML = `<span>📊 Campos: ${allFields.length}</span><span>🔗 Mapeados: ${mappedCount}</span>`;

    setupMappingEvents();
  }

  // ============================================
// SETUP MAPPING EVENTS - CORRIGIDO
// ============================================

function setupMappingEvents() {
  // Eventos do mode-select (quando muda entre JSON, Form, Default)
  mappingContainer.querySelectorAll(".mode-select").forEach((select) => {
    select.addEventListener("change", function () {
      const field = this.dataset.field;
      const mode = this.value;
      const item = this.closest(".mapping-item");
      const valueSelect = item.querySelector(".value-select");
      const formContainer = item.querySelector(".form-options-container");
      const defaultInput = item.querySelector(".default-input:not(.form-value)");
      const formInput = item.querySelector(".form-value");
      const editBtn = item.querySelector(".btn-edit-value");
      const status = item.querySelector(".mapping-status");
      const preview = item.querySelector(".json-preview");

      // Esconder todos os elementos
      if (valueSelect) valueSelect.style.display = "none";
      if (formContainer) formContainer.style.display = "none";
      if (defaultInput) defaultInput.style.display = "none";
      if (editBtn) editBtn.style.display = "none";

      if (mode === "json") {
        if (valueSelect) {
          valueSelect.style.display = "inline-block";
          const key = valueSelect.value;
          if (key && currentProfileData && currentProfileData[key] !== undefined) {
            currentMapping[field] = { type: "json", value: key };
            status.textContent = "✅";
            status.className = "mapping-status found";
            if (preview) preview.textContent = String(currentProfileData[key]).substring(0, 20);
            if (editBtn) editBtn.style.display = "inline-block";
          } else {
            currentMapping[field] = { type: "json", value: "" };
            status.textContent = "❌";
            status.className = "mapping-status notfound";
            if (preview) preview.textContent = "";
            if (editBtn) editBtn.style.display = "none";
          }
        }
      } else if (mode === "form") {
        if (formContainer) {
          formContainer.style.display = "inline-block";
          const formSelect = formContainer.querySelector(".form-options");
          const formInputEl = formContainer.querySelector(".form-value");
          let val = "";
          if (formSelect) {
            val = formSelect.value;
          } else if (formInputEl) {
            val = formInputEl.value.trim();
          }
          if (val) {
            currentMapping[field] = { type: "form", value: val };
            status.textContent = "✅";
            status.className = "mapping-status found";
            if (preview) preview.textContent = val;
          } else {
            currentMapping[field] = { type: "form", value: "" };
            status.textContent = "❌";
            status.className = "mapping-status notfound";
            if (preview) preview.textContent = "";
          }
        } else {
          currentMapping[field] = { type: "form", value: "" };
          status.textContent = "❌";
          status.className = "mapping-status notfound";
          if (preview) preview.textContent = "";
        }
      } else if (mode === "default") {
        // MOSTRAR O INPUT DEFAULT
        if (defaultInput) {
          defaultInput.style.display = "inline-block";
          const raw = getDefaultRaw(defaultInput); // valor real, com quebras de linha
          if (raw.trim()) {
            currentMapping[field] = { type: "default", value: raw };
            status.textContent = "✅";
            status.className = "mapping-status found";
            if (preview) preview.textContent = flattenForDisplay(raw);
            if (editBtn) editBtn.style.display = "inline-block";
          } else {
            currentMapping[field] = { type: "default", value: "" };
            status.textContent = "❌";
            status.className = "mapping-status notfound";
            if (preview) preview.textContent = "";
            if (editBtn) editBtn.style.display = "none";
            // sem valor ainda: abre o modal para digitar o texto
            openEditValue(field, "");
          }
        } else {
          currentMapping[field] = { type: "default", value: "" };
          status.textContent = "❌";
          status.className = "mapping-status notfound";
          if (preview) preview.textContent = "";
        }
      }
      updateStats();
    });
  });

  // Eventos do value-select (JSON)
  mappingContainer.querySelectorAll(".value-select").forEach((select) => {
    select.addEventListener("change", function () {
      const field = this.dataset.field;
      const key = this.value;
      const item = this.closest(".mapping-item");
      const modeSelect = item.querySelector(".mode-select");
      const status = item.querySelector(".mapping-status");
      const preview = item.querySelector(".json-preview");
      const editBtn = item.querySelector(".btn-edit-value");

      if (modeSelect.value === "json") {
        if (key && currentProfileData && currentProfileData[key] !== undefined) {
          currentMapping[field] = { type: "json", value: key };
          status.textContent = "✅";
          status.className = "mapping-status found";
          if (preview) preview.textContent = String(currentProfileData[key]).substring(0, 20);
          if (editBtn) editBtn.style.display = "inline-block";
        } else {
          currentMapping[field] = { type: "json", value: "" };
          status.textContent = "❌";
          status.className = "mapping-status notfound";
          if (preview) preview.textContent = "";
          if (editBtn) editBtn.style.display = "none";
        }
      }
      updateStats();
    });
  });

  // Eventos para DEFAULT INPUT (v10): o campo da linha é somente leitura.
  // Clicar (ou Enter/Espaço) abre o modal com a textarea para digitar o texto.
  mappingContainer.querySelectorAll(".default-input:not(.form-value)").forEach((input) => {
    const openFromInput = () => {
      const field = input.dataset.field;
      openEditValue(field, getDefaultRaw(input));
    };
    input.addEventListener("click", openFromInput);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFromInput();
      }
    });
  });

  // Eventos para Form Options (select)
  mappingContainer.querySelectorAll(".form-options").forEach((select) => {
    select.addEventListener("change", function () {
      const field = this.dataset.field;
      const val = this.value;
      const item = this.closest(".mapping-item");
      const status = item.querySelector(".mapping-status");
      const preview = item.querySelector(".json-preview");
      if (val) {
        currentMapping[field] = { type: "form", value: val };
        status.textContent = "✅";
        status.className = "mapping-status found";
        if (preview) preview.textContent = val;
      } else {
        currentMapping[field] = { type: "form", value: "" };
        status.textContent = "❌";
        status.className = "mapping-status notfound";
        if (preview) preview.textContent = "";
      }
      updateStats();
    });
  });

  // Eventos para Form Value (input)
  mappingContainer.querySelectorAll(".form-value").forEach((input) => {
    input.addEventListener("change", function () {
      const field = this.dataset.field;
      const val = this.value.trim();
      const item = this.closest(".mapping-item");
      const status = item.querySelector(".mapping-status");
      const preview = item.querySelector(".json-preview");
      if (val) {
        currentMapping[field] = { type: "form", value: val };
        status.textContent = "✅";
        status.className = "mapping-status found";
        if (preview) preview.textContent = val;
      } else {
        currentMapping[field] = { type: "form", value: "" };
        status.textContent = "❌";
        status.className = "mapping-status notfound";
        if (preview) preview.textContent = "";
      }
      updateStats();
    });
  });

  // Botões de editar valor
  mappingContainer.querySelectorAll(".btn-edit-value").forEach((btn) => {
    btn.addEventListener("click", function () {
      const field = this.dataset.field;
      const config = currentMapping[field] || { type: "json", value: "" };
      let currentValue = "";
      
      if (config.type === "json") {
        currentValue = (currentProfileData && currentProfileData[config.value]) || "";
      } else {
        currentValue = config.value || "";
      }
      
      openEditValue(field, currentValue);
    });
  });
}

// ============================================
// FUNÇÃO AUTO SAVE (SALVAMENTO AUTOMÁTICO)
// ============================================

function autoSaveMapping() {
  const profileId = mapperSelect.value;
  if (!profileId) return;

  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return;

  // Salvar o mapping atual no perfil
  profile.mapping = { ...currentMapping };
  profile.excludedMappingFields = Array.isArray(profile.excludedMappingFields)
    ? profile.excludedMappingFields
    : [];
  profile.updatedAt = Date.now();
  persistAll(() => {
    renderProfiles();
    updateMapperSelect();
  });
}

  function updateStats() {
    const mapped = Object.keys(currentMapping).filter((k) => {
      const cfg = currentMapping[k];
      if (!cfg) return false;
      if (cfg.type === "form" && cfg.value && cfg.value.trim() !== "")
        return true;
      if (cfg.type === "default" && cfg.value && cfg.value.trim() !== "")
        return true;
      if (
        cfg.type === "json" &&
        cfg.value &&
        currentProfileData &&
        currentProfileData[cfg.value] !== undefined
      )
        return true;
      return false;
    }).length;
    mappingStats.innerHTML = `<span>📊 Campos: ${pageFields.length}</span><span>🔗 Mapeados: ${mapped}</span>`;
  }

  // ============================================
  // AUTO MAPEAR
  // ============================================
  autoMapBtn.addEventListener("click", () => {
    if (pageFields.length === 0) {
      showStatus("❌ Extraia os campos primeiro", "error");
      return;
    }

    if (!currentProfileData || Object.keys(currentProfileData).length === 0) {
      showStatus("ℹ️ O Auto Mapear precisa de um JSON. Para um mapeamento sem JSON, use Form ou Default.", "info");
      return;
    }

    const jsonKeys = Object.keys(currentProfileData);
    // Preserva Form/Default existentes. O Auto Mapear apenas atualiza
    // correspondências JSON encontradas.
    const newMapping = { ...currentMapping };

    pageFields.forEach((field) => {
      const fieldId =
        field.name ||
        field.id ||
        field.placeholder ||
        field["aria-label"] ||
        "";
      const fieldLabel = (field.label || fieldId || "").toLowerCase();

      let bestMatch = "";
      let bestScore = 0;

      jsonKeys.forEach((key) => {
        const keyLower = key.toLowerCase();
        let score = 0;

        if (fieldId.toLowerCase() === keyLower || fieldLabel === keyLower)
          score = 100;
        else if (
          fieldId.toLowerCase().includes(keyLower) ||
          keyLower.includes(fieldId.toLowerCase())
        )
          score = 80;
        else if (fieldLabel.includes(keyLower) || keyLower.includes(fieldLabel))
          score = 70;

        const variations = getVariations(key);
        for (let v of variations) {
          if (fieldId.toLowerCase().includes(v) || fieldLabel.includes(v)) {
            score = Math.max(score, 60);
          }
        }

        if (
          keyLower.includes("responsavel") ||
          keyLower.includes("responsável")
        ) {
          if (fieldLabel.includes("mae") || fieldLabel.includes("mãe"))
            score = 90;
          if (fieldLabel.includes("pai")) score = 85;
        }
        if (
          keyLower.includes("email") &&
          (fieldLabel.includes("email") ||
            fieldId.toLowerCase().includes("email"))
        )
          score = 95;
        if (
          (keyLower.includes("telefone") || keyLower.includes("celular")) &&
          (fieldLabel.includes("telefone") ||
            fieldLabel.includes("celular") ||
            fieldLabel.includes("fone"))
        )
          score = 90;
        if (
          keyLower.includes("cpf") &&
          (fieldLabel.includes("cpf") || fieldLabel.includes("documento"))
        )
          score = 95;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = key;
        }
      });

      if (bestScore > 50 && bestMatch) {
        newMapping[fieldId] = { type: "json", value: bestMatch };
      }
    });

    currentMapping = newMapping;
      renderMapping();
    showStatus(
      `🤖 Auto mapeado: ${Object.keys(newMapping).length} campos`,
      "success",
    );
  });

  function getCurrentFormUrl(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      callback(tab && tab.url ? tab.url : "");
    });
  }

  // ============================================
  // SALVAR MAPEAMENTO
  // ============================================
  saveMappingBtn.addEventListener("click", () => {
    const profileId = mapperSelect.value;
    if (!profileId) {
      showStatus("❌ Selecione um mapeamento", "error");
      return;
    }

    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) {
      showStatus("❌ Perfil não encontrado", "error");
      return;
    }

    const mapping = {};
    mappingContainer.querySelectorAll(".mapping-item").forEach((item) => {
      const field = item.querySelector(".field-name")?.title || "";
      if (currentMapping[field]) {
        mapping[field] = currentMapping[field];
      }
    });

    profile.mapping = mapping;
    profile.mappingVersion = (profile.mappingVersion || 0) + 1;
    profile.mappingHistory = profile.mappingHistory || [];
    profile.mappingHistory.push({
      version: profile.mappingVersion,
      timestamp: Date.now(),
      mapping: JSON.parse(JSON.stringify(mapping)),
    });
    if (profile.mappingHistory.length > 20) {
      profile.mappingHistory = profile.mappingHistory.slice(-20);
    }
    profile.updatedAt = Date.now();
    getCurrentFormUrl((currentUrl) => {
      if (currentUrl) profile.url = currentUrl;
      saveProfiles();
      showStatus(
        `✅ Mapeamento salvo — versão ${profile.mappingVersion} (${Object.keys(mapping).length} campos)`,
        "success",
      );
    });
  });

  // ============================================
  // LIMPAR MAPEAMENTO
  // ============================================
  clearMappingBtn.addEventListener("click", () => {
    if (!confirm("Limpar mapeamento atual?")) return;
    currentMapping = {};
    renderMapping();
    showStatus("🗑️ Alteração limpa apenas da edição atual. Clique em Salvar Mapeamento para persistir.", "info");
  });

  // ============================================
  // VARIATIONS
  // ============================================
  function getVariations(key) {
    const map = {
      nome: ["name", "nom", "nom_candidato", "nome_completo", "full_name"],
      email: ["e-mail", "email_address", "endereco_email", "mail"],
      telefone: ["phone", "tel", "fone", "telefone_fixo"],
      celular: ["mobile", "cel", "whatsapp"],
      data_nasc: ["data_nascimento", "nascimento", "birth_date", "dt_nasc"],
      cpf: ["documento", "doc", "cpf_candidato"],
      rg: ["registro_geral", "identidade"],
      endereco: ["endereço", "logradouro", "rua", "address"],
      cidade: ["city", "municipio"],
      estado: ["uf", "state"],
      cep: ["zip", "zipcode", "codigo_postal"],
      senha: ["password", "pass"],
      sexo: ["genero", "gender"],
      mae: ["mãe", "mother", "nome_mae", "nome_da_mae"],
      pai: ["father", "nome_pai", "nome_do_pai"],
      responsavel: ["responsável", "responsible", "nome_responsavel"],
    };
    const keyLower = key.toLowerCase();
    const result = [keyLower];
    for (const [orig, aliases] of Object.entries(map)) {
      if (keyLower.includes(orig) || orig.includes(keyLower)) {
        result.push(...aliases);
      }
    }
    return [...new Set(result)];
  }

  // ============================================
  // SEND TO CONTENT
  // ============================================
  // ============================================
  // VARIÁVEIS {{nome}} (v12)
  // Se algum valor a preencher tiver {{variavel}}, abre um modal pedindo o
  // conteúdo de cada uma e só então envia ao formulário.
  // ============================================
  const VARIABLE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const VARIABLE_STORE_KEY = "variableValues"; // últimos valores usados (sugestão)
  const HOLIDAYS_KEY = "feriadosExtras"; // feriados estaduais/municipais digitados pela pessoa ("25/01, 09/07, 20/11/2026")
  let holidaysText = "";
  function applyHolidays(text) {
    holidaysText = String(text || "");
    try { return window.MapeadorVars ? window.MapeadorVars.setExtraHolidays(holidaysText) : 0; } catch (_) { return 0; }
  }
  try { chrome.storage.local.get([HOLIDAYS_KEY], (r) => { void chrome.runtime.lastError; applyHolidays(r && r[HOLIDAYS_KEY]); }); } catch (_) { /* fora da extensão */ }

  // v31: motor de variáveis em js/variaveis.js (cálculos, funções, datas, filtros)
  const VARS = window.MapeadorVars;
  const BUILTIN_VARIABLES = VARS.BUILTIN;

  // known = valores já conhecidos (vindos do "Dado"): não são perguntados
  const VARIABLE_RECENT_KEY = "variableRecent"; // últimos valores por variável (atalhos no modal)
  const isListKey = (k) => /^(lista|itens):/.test(String(k)); // itens de {{ repetição() }} e {{ lista() }} (v33) não viram atalho
  const HINT_LABEL = { date: "📅 data", number: "🔢 número", time: "🕒 hora", cpf: "🪪 CPF", cnpj: "🏢 CNPJ" };
  const LITERAL_NAME = /^-?\d[\d.,:\/\-h ]*$/i; // {{1234,56 | extenso}} não é pergunta

  function collectVariables(data, known) {
    const has = (n) => Object.keys(known || {}).some((k) => k.toLowerCase() === n.toLowerCase());
    const found = new Map(); // nome -> { count, options, hint, default }
    const betterHint = (a, b) => (a && a !== "text" ? a : b);
    Object.values(data || {}).forEach((value) => {
      if (typeof value !== "string") return;
      const inThisValue = new Map();
      for (const m of value.matchAll(VARIABLE_REGEX)) {
        for (const v of VARS.variablesIn(m[1])) {
          if (!v.name || has(v.name) || LITERAL_NAME.test(v.name) || (VARS.isBuiltin(v.name) && !v.options.length)) continue;
          const prev = inThisValue.get(v.name) || { options: [], hint: null, default: "" };
          inThisValue.set(v.name, { options: [...new Set([...prev.options, ...v.options])], hint: betterHint(prev.hint, v.hint), default: prev.default || v.default,
            repeat: v.repeat || prev.repeat, prefix: v.prefix ?? prev.prefix, label: v.label || prev.label, rich: v.rich || prev.rich, ordered: v.ordered || prev.ordered }); // v32.2: listas com repetição · v33: lista de editor
        }
      }
      inThisValue.forEach((info, name) => {
        const cur = found.get(name) || { count: 0, options: [], hint: null, default: "" };
        found.set(name, { count: cur.count + 1, options: [...new Set([...cur.options, ...info.options])], hint: betterHint(cur.hint, info.hint), default: cur.default || info.default,
          repeat: info.repeat || cur.repeat, prefix: info.prefix ?? cur.prefix, label: info.label || cur.label, rich: info.rich || cur.rich, ordered: info.ordered || cur.ordered });
      });
    });
    return found;
  }

  // rich = true só no envio ao formulário: {{ lista() }} leva as marcas que o content.js transforma em lista de editor.
  // Prévias e textos exibidos usam rich = false (lista aparece como "- item").
  function applyVariables(data, values, known, rich) {
    const all = { ...(known || {}), ...(values || {}) };
    const result = {};
    for (const [field, value] of Object.entries(data || {})) {
      result[field] = typeof value === "string" ? value.replace(VARIABLE_REGEX, (_, raw) => VARS.resolve(raw, all, { rich: !!rich })) : value;
    }
    return result;
  }

  // ctx = { data, known } — usados só para a prévia ao vivo
  function askVariables(variables, onConfirm, ctx = {}) {
    const modalEl = document.getElementById("variablesModal");
    const listEl = document.getElementById("variablesList");
    const confirmBtn = document.getElementById("confirmVariablesBtn");
    const cancelBtn = document.getElementById("cancelVariablesBtn");
    if (!modalEl || !listEl || !confirmBtn || !cancelBtn) {
      onConfirm({}); // modal indisponível: não bloqueia o preenchimento
      return;
    }
    const shortLabel = (v) => { const t = String(v).replace(/\s*\n\s*/g, " ⏎ "); return t.length > 26 ? t.slice(0, 25) + "…" : t; };
    const autosize = (el) => { if (el.tagName !== "TEXTAREA") return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight + 2, 170) + "px"; };
    const inputs = () => [...listEl.querySelectorAll(".var-input")];
    const focusables = () => [...listEl.querySelectorAll(".var-input, .rep-item")]; // ordem de Enter/Tab
    // v32.2: listas com repetição {{ repetição('-') }} — itens de uma linha; o valor da lista = um item por linha
    const repRows = () => [...listEl.querySelectorAll(".var-row[data-repeat]")];
    const repItems = (row) => [...row.querySelectorAll(".rep-item")];
    const currentValues = () => {
      const v = {};
      inputs().forEach((el) => { v[el.dataset.var] = normalizeNewlines(el.value); });
      repRows().forEach((row) => { v[row.dataset.var] = repItems(row).map((el) => el.value.trim()).filter(Boolean).join("\n"); });
      return v;
    };
    const repItemHtml = (value) => `
        <div class="rep-line">
          <input type="text" class="form-control form-control-sm rep-item" spellcheck="false" value="${escapeHtml(value)}" />
          <button type="button" class="rep-del" title="Remover este item" aria-label="Remover este item">×</button>
        </div>`;
    const repRowHtml = ([name, info], saved) => {
      const items = String(saved[name] ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (!items.length) items.push("");
      const pfx = info.rich ? (info.ordered ? "cola como lista numerada" : "cola como lista") : info.prefix ? `prefixo “${escapeHtml(info.prefix)}”` : "sem prefixo";
      return `
        <div class="var-row var-repeat" data-repeat="1" data-var="${escapeHtml(name)}" data-hint="list">
          <label class="form-label mb-0 var-head">
            <span class="var-name">${info.rich ? "📋" : "☰"} ${escapeHtml(info.label || "Lista")}</span>
            <span class="var-type">${pfx}</span>
            <span class="var-usage">${info.count} campo${info.count > 1 ? "s" : ""}</span>
          </label>
          <div class="rep-items">${items.map(repItemHtml).join("")}</div>
          <button type="button" class="rep-add">＋ Adicionar item</button>
          <div class="rep-hint">Enter adiciona outro item · Backspace num item vazio o remove · itens vazios são ignorados</div>
        </div>`;
    };
    const renumber = (row) => repItems(row).forEach((el, i) => { el.placeholder = "Item " + (i + 1); el.setAttribute("aria-label", "Item " + (i + 1)); });
    const setRepeat = (row, text) => {
      const items = String(text ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      row.querySelector(".rep-items").innerHTML = (items.length ? items : [""]).map(repItemHtml).join("");
      renumber(row);
    };
    const addRepItem = (row, after) => {
      const tmp = document.createElement("div"); tmp.innerHTML = repItemHtml("");
      const line = tmp.firstElementChild; const afterLine = after && after.closest(".rep-line");
      if (afterLine) afterLine.after(line); else row.querySelector(".rep-items").appendChild(line);
      renumber(row); const el = line.querySelector(".rep-item"); el.focus(); return el;
    };
    const removeRepItem = (row, line) => {
      const items = repItems(row);
      if (items.length <= 1) { items[0].value = ""; items[0].focus(); return; }
      const idx = items.indexOf(line.querySelector(".rep-item")); line.remove(); renumber(row);
      const rest = repItems(row); (rest[Math.max(0, idx - 1)] || rest[0]).focus();
    };

    const rowHtml = ([name, info], saved, recent) => {
      if (info.repeat) return repRowHtml([name, info], saved);
      const cur = saved[name] ?? info.default ?? "";
      const tag = HINT_LABEL[info.hint] || "";
      const chips = [];
      if (info.hint === "date") chips.push({ label: "hoje", value: BUILTIN_VARIABLES.hoje.fn(), title: "Data de hoje" });
      (recent[name] || []).filter((v) => v !== cur).slice(0, 4).forEach((v) => chips.push({ label: shortLabel(v), value: v, title: "Usado antes: " + v }));
      const field = info.options.length
        ? `<select class="form-select form-select-sm var-input" data-var="${escapeHtml(name)}">
             ${info.options.map((o) => `<option ${o === cur ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
           </select>`
        : `<textarea class="form-control var-input" rows="1" spellcheck="false" data-var="${escapeHtml(name)}"
             placeholder="${escapeHtml(info.hint === "date" ? "dd/mm/aaaa" : info.hint === "time" ? "8:30" : info.hint === "number" ? "1.234,56" : "Conteúdo para " + name + "...")}">${escapeHtml(cur)}</textarea>`;
      return `
        <div class="var-row" data-hint="${escapeHtml(info.hint || "")}">
          <label class="form-label mb-0 var-head">
            <span class="var-name">{{${escapeHtml(name)}}}</span>
            ${tag ? `<span class="var-type">${tag}</span>` : ""}
            <span class="var-usage">${info.count} campo${info.count > 1 ? "s" : ""}</span>
          </label>
          ${field}
          <div class="var-msg" role="status"></div>
          ${chips.length ? `<div class="var-chips">${chips.map((c) => `<button type="button" class="var-chip" data-value="${escapeHtml(c.value)}" title="${escapeHtml(c.title)}">${escapeHtml(c.label)}</button>`).join("")}</div>` : ""}
        </div>`;
    };

    const updateRow = (row) => {
      const el = row.querySelector(".var-input"); const msgEl = row.querySelector(".var-msg");
      if (!el || !msgEl) return; // linhas de lista não têm validação de tipo
      const msg = el.tagName === "TEXTAREA" ? VARS.checkInput(el.value, row.dataset.hint) : "";
      msgEl.textContent = msg ? "⚠ " + msg : "";
      row.classList.toggle("has-warn", !!msg);
    };
    const drawPreview = () => {
      const box = listEl.querySelector(".var-preview"); if (!box) return;
      const entries = Object.entries(ctx.data || {}).filter(([, v]) => typeof v === "string" && v.includes("{{"));
      if (!entries.length) { box.hidden = true; return; }
      const out = applyVariables(Object.fromEntries(entries), currentValues(), ctx.known);
      const items = entries.slice(0, 6).map(([k]) => {
        const t = String(out[k] ?? "").replace(/\s*\n\s*/g, " ⏎ ");
        const shown = t.length > 140 ? t.slice(0, 139) + "…" : t;
        return `<li><span class="pv-field">${escapeHtml(k)}</span><span class="pv-arrow">→</span><span class="pv-val${t.trim() ? "" : " is-empty"}">${t.trim() ? escapeHtml(shown) : "(vazio)"}</span></li>`;
      }).join("");
      box.hidden = false;
      box.innerHTML = `<div class="var-preview-title">👁 Prévia do que será preenchido</div><ul>${items}</ul>${entries.length > 6 ? `<div class="var-preview-more">+ ${entries.length - 6} campo(s) com variáveis</div>` : ""}`;
    };
    let pvTimer = 0;
    const refresh = (row) => { if (row) updateRow(row); clearTimeout(pvTimer); pvTimer = setTimeout(drawPreview, 60); };

    const render = (saved, recent) => {
      listEl.innerHTML = [...variables.entries()].map((e) => rowHtml(e, saved, recent)).join("")
        + `<div class="var-preview" hidden></div>
           <div class="var-tools"><button type="button" class="var-forget" title="Apaga os valores e atalhos guardados das variáveis">🧹 Esquecer valores lembrados</button></div>`;
      inputs().forEach(autosize);
      repRows().forEach(renumber);
      listEl.querySelectorAll(".var-row").forEach(updateRow);
      drawPreview();

      listEl.oninput = (e) => {
        const el = e.target.closest(".var-input"); if (el) { autosize(el); refresh(el.closest(".var-row")); return; }
        const it = e.target.closest(".rep-item"); if (it) refresh(it.closest(".var-row"));
      };
      listEl.onchange = listEl.oninput;
      listEl.onclick = (e) => {
        const add = e.target.closest(".rep-add");
        if (add) { const row = add.closest(".var-row"); addRepItem(row); refresh(row); return; }
        const del = e.target.closest(".rep-del");
        if (del) { const row = del.closest(".var-row"); removeRepItem(row, del.closest(".rep-line")); refresh(row); return; }
        const chip = e.target.closest(".var-chip");
        if (chip) { const el = chip.closest(".var-row").querySelector(".var-input"); el.value = chip.dataset.value; autosize(el); refresh(el.closest(".var-row")); el.focus(); return; }
        if (e.target.closest(".var-forget")) {
          if (!confirm("Esquecer todos os valores lembrados das variáveis?")) return;
          try { chrome.storage.local.remove([VARIABLE_STORE_KEY, VARIABLE_RECENT_KEY]); } catch (_) {}
          const vals = currentValues(); render({}, {}); inputs().forEach((el) => { if (vals[el.dataset.var] != null) { el.value = vals[el.dataset.var]; autosize(el); } });
          repRows().forEach((row) => setRepeat(row, vals[row.dataset.var])); drawPreview();
          showStatus("🧹 Valores lembrados apagados", "success");
        }
      };
      listEl.onkeydown = (e) => {
        const rep = e.target.closest(".rep-item");
        if (rep) { // v32.2: item de lista
          const row = rep.closest(".var-row");
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) { confirmBtn.click(); return; }
            if (rep.value.trim()) { addRepItem(row, rep); refresh(row); return; } // Enter num item preenchido = novo item logo abaixo
            const all = focusables(); const next = all.slice(all.indexOf(rep) + 1).find((x) => !row.contains(x)); // item vazio: segue adiante
            if (next) next.focus(); else confirmBtn.click();
          } else if (e.key === "Backspace" && !rep.value && repItems(row).length > 1) {
            e.preventDefault(); removeRepItem(row, rep.closest(".rep-line")); refresh(row);
          }
          return;
        }
        const el = e.target.closest(".var-input"); if (!el || e.key !== "Enter") return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); confirmBtn.click(); return; }
        if (e.shiftKey && el.tagName === "TEXTAREA") return; // Shift+Enter = nova linha
        e.preventDefault();
        const all = focusables(); const next = all[all.indexOf(el) + 1];
        if (next) next.focus(); else confirmBtn.click();
      };
    };

    const show = (saved, recent) => {
      render(saved || {}, recent || {});
      confirmBtn.onclick = () => {
        const values = currentValues();
        const nextRecent = { ...(recent || {}) };
        Object.entries(values).forEach(([k, v]) => { if (!isListKey(k) && String(v).trim()) nextRecent[k] = [v, ...(nextRecent[k] || []).filter((x) => x !== v)].slice(0, 6); });
        try { chrome.storage.local.set({ [VARIABLE_STORE_KEY]: { ...(saved || {}), ...values }, [VARIABLE_RECENT_KEY]: nextRecent }); } catch (_) {}
        closeModal(modalEl);
        onConfirm(values);
      };
      cancelBtn.onclick = () => {
        closeModal(modalEl);
        showStatus("ℹ️ Preenchimento cancelado.", "info");
      };
      openModal(modalEl);
      setTimeout(() => { const first = listEl.querySelector(".var-input, .rep-item"); if (first) { first.focus(); if (first.select) first.select(); } }, 200);
    };

    try {
      chrome.storage.local.get([VARIABLE_STORE_KEY, VARIABLE_RECENT_KEY], (result) => {
        void chrome.runtime.lastError;
        show((result && result[VARIABLE_STORE_KEY]) || {}, (result && result[VARIABLE_RECENT_KEY]) || {});
      });
    } catch (_) {
      show({}, {});
    }
  }

  function sendToContent(data, known) {
    const variables = collectVariables(data, known);
    if (variables.size === 0) {
      sendFillToTab(applyVariables(data, {}, known, true));
      return;
    }
    askVariables(variables, (values) => sendFillToTab(applyVariables(data, values, known, true)), { data, known });
  }

  function sendFillToTab(data) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) { showStatus("❌ Nenhuma aba ativa", "error"); return; }
      renderFillReport(null);
      mapeadorFrames.sendAll(tab.id, { action: "FILL_FORM", data }, ["js/content.js"]).then((results) => {
        const ok = results.filter(r => r.response);
        if (!ok.length) {
          const msg = (results[0] && results[0].error) || "";
          showStatus(/Receiving end|Could not establish|Cannot access|chrome:\/\//i.test(msg) || !msg ? "❌ Não foi possível conectar à página. Atualize a aba e tente novamente (páginas internas do Chrome não permitem preenchimento)." : "❌ Falha ao preencher: " + msg, "error");
          return;
        }
        const r = mapeadorFrames.mergeFillReports(ok, data);
        if (!r) {
          const msg = String(ok[0].response.status || "Resposta desconhecida").replace(/^[✅⚠️❌]\s*/, "");
          showStatus((/^Erro:/i.test(msg) ? "❌ " : "✅ ") + msg, /^Erro:/i.test(msg) ? "error" : "success");
          return;
        }
        renderFillReport(r);
        const hasProblems = r.failed.length || r.notFound.length;
        const framesNote = r.frames > 1 ? ` (página + ${r.frames - 1} quadro(s) interno(s))` : "";
        showStatus(`${hasProblems ? "⚠️" : "✅"} ${r.filled} campo(s) preenchido(s)${framesNote}; ${r.notFound.length} não encontrado(s); ${r.failed.length} recusado(s).`, hasProblems ? "info" : "success");
      });
    });
  }

  // ============================================
  // ABA DADO (v30): valores avulsos (campos ou JSON) aplicados sobre um mapeamento
  // existente, sem alterar o mapeamento. Aceita {{variáveis}} e cálculos.
  // ============================================
  (function initDado() {
    const $ = (id) => document.getElementById(id);
    const sel = $("dadoProfile"), box = $("dadoContainer"), stats = $("dadoStats");
    if (!sel || !box) return;
    // v32: o rascunho do Dado fica em chrome.storage.local (antes: localStorage, que o backup não enxergava)
    const LS = "dadoDraft2";
    let dadoCfg = {};      // só os campos que o dado sobrescreve: { campo: {type, value} }
    let dadoJson = {};     // JSON do dado
    let dadoFields = [];   // campos extraídos da página (opcional)
    let draftCache = {};   // { profileId: { cfg, json } }
    const profile = () => profiles[sel.value];
    const fid = (f) => f.name || f.id || f.placeholder || f["aria-label"] || "";

    let saveTimer = 0, pending = null;
    function flushDraft() {
      if (!pending) return;
      const { name, entry } = pending; pending = null; clearTimeout(saveTimer);
      try {
        chrome.storage.local.get([LS], (r) => {
          void chrome.runtime.lastError;
          const all = (r && r[LS] && typeof r[LS] === "object") ? r[LS] : {};
          if (entry) all[name] = entry; else delete all[name];
          chrome.storage.local.set({ [LS]: all });
        });
      } catch (_) {}
    }
    function save() {
      const p = profile(); if (!p) return;
      const json = $("dadoJsonText").value;
      const empty = !Object.keys(dadoCfg).length && !json.trim();
      const entry = empty ? null : { cfg: JSON.parse(JSON.stringify(dadoCfg)), json, updatedAt: Date.now() };
      if (entry) draftCache[p.id] = entry; else delete draftCache[p.id];
      pending = { name: p.id, entry };
      clearTimeout(saveTimer); saveTimer = setTimeout(flushDraft, 200);
    }
    window.addEventListener("pagehide", flushDraft);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushDraft(); });
    function load() {
      dadoCfg = {}; $("dadoJsonText").value = ""; dadoJson = {};
      const p = profile();
      if (p && draftCache[p.id] == null && draftCache[p.name] != null) {
        draftCache[p.id] = draftCache[p.name];
        delete draftCache[p.name];
        chrome.storage.local.set({ [LS]: draftCache });
      }
      const d = draftCache[p?.id];
      if (d) { dadoCfg = JSON.parse(JSON.stringify(d.cfg || {})); $("dadoJsonText").value = d.json || ""; parseJson(true); }
    }
    // carrega do chrome.storage e traz rascunhos antigos do localStorage (uma única vez)
    try {
      chrome.storage.local.get([LS], (r) => {
        void chrome.runtime.lastError;
        const stored = (r && r[LS] && typeof r[LS] === "object") ? r[LS] : {};
        let legacy = {};
        try { legacy = JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (_) {}
        const merged = { ...legacy, ...stored }; // o que já está no chrome.storage vence
        draftCache = { ...merged, ...draftCache };
        // Migra rascunhos antigos indexados pelo nome para o ID permanente.
        profiles.forEach((p) => {
          if (draftCache[p.id] == null && draftCache[p.name] != null) draftCache[p.id] = draftCache[p.name];
          if (p.name !== p.id) delete draftCache[p.name];
        });
        if (Object.keys(legacy).some((k) => !(k in stored)) || profiles.some((p) => Object.hasOwn(merged, p.name))) {
          chrome.storage.local.set({ [LS]: merged }, () => { if (!chrome.runtime.lastError) { try { localStorage.removeItem(LS); } catch (_) {} } });
        } else { try { localStorage.removeItem(LS); } catch (_) {} }
        if (!pending) { load(); render(); }
      });
    } catch (_) {}
    function parseJson(silent) {
      const t = $("dadoJsonText").value.trim();
      if (!t) { dadoJson = {}; return true; }
      try {
        const o = JSON.parse(t);
        if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("precisa ser um objeto { ... }");
        const flat = {};
        for (const [k, v] of Object.entries(o)) flat[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : v == null ? "" : String(v);
        dadoJson = flat; return true;
      } catch (e) { if (!silent) showStatus("❌ JSON inválido: " + e.message, "error"); return false; }
    }
    function refreshProfiles() {
      const cur = (profile() || {}).name;
      sel.innerHTML = profiles.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join("") || '<option value="">Nenhum mapeamento</option>';
      const idx = profiles.findIndex((p) => p.name === cur);
      sel.value = idx >= 0 ? idx : selectedIndex != null ? selectedIndex : 0;
    }
    function allFields() {
      const p = profile(); const map = (p && p.mapping) || {};
      const byId = new Map(dadoFields.map((f) => [fid(f), f]));
      const ids = Object.keys(dadoCfg);
      return ids.map((id) => {
        const f = byId.get(id) || {};
        const manual = /^(css|js):/.test(id);
        return { id, label: manual ? id.slice(id.indexOf(":") + 1) : f.label || id, type: manual ? "css" : f.type || "text", options: f.options || [], manual };
      });
    }
    function fieldMeta(id) { return allFields.byId && allFields.byId.get(id); }
    function fillPicker() {
      const pick = $("dadoAddSelect"); if (!pick) return;
      const p = profile(); const map = (p && p.mapping) || {};
      const labels = new Map(dadoFields.map((f) => [fid(f), f.label || fid(f)]));
      const ids = [...new Set([...Object.keys(map), ...dadoFields.map(fid)])].filter((k) => k && !dadoCfg[k]);
      pick.innerHTML = '<option value="">Escolha um campo…</option>' + ids.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml((labels.get(k) || k.replace(/^(css|js):/, "")).substring(0, 60))}</option>`).join("");
    }
    function valueOf(cfg) {
      if (!cfg) return "";
      return cfg.type === "json" ? (dadoJson[cfg.value] != null ? String(dadoJson[cfg.value]) : "") : cfg.value || "";
    }
    function render() {
      const p = profile();
      if (!p) { box.innerHTML = '<div class="empty-message">Crie um mapeamento primeiro</div>'; stats.innerHTML = ""; return; }
      const fields = allFields(); const jsonKeys = Object.keys(dadoJson); const hasJson = jsonKeys.length > 0;
      let used = 0, html = "";
      fillPicker();
      if (!fields.length) html = '<div class="empty-message">Nenhum campo no dado — o preenchimento usará só o mapeamento. Adicione um campo acima para trocar o valor dele.</div>';
      fields.forEach((f) => {
        const cfg = dadoCfg[f.id]; const base = (p.mapping || {})[f.id];
        const type = cfg ? cfg.type : "inherit";
        const val = valueOf(cfg);
        const ok = cfg ? !!val : false; if (ok) used++;
        let inherited = "";
        if (!cfg && base) inherited = base.type === "json" ? `JSON: ${base.value}` : flattenForDisplay(base.value || "");
        const e = escapeHtml(f.id);
        const formCtl = f.options.length
          ? `<select class="form-options" data-field="${e}"><option value="">Selecione uma opção...</option>${f.options.map((o) => `<option value="${escapeHtml(o.value)}" ${type === "form" && cfg.value === o.value ? "selected" : ""}>${escapeHtml(o.text || o.value)}</option>`).join("")}</select>`
          : `<input class="default-input form-value" data-field="${e}" type="text" placeholder="Valor" value="${type === "form" ? escapeHtml(cfg.value || "") : ""}" style="width:80px;font-size:8px;padding:1px 3px;border:1px solid #dadce0;border-radius:3px;">`;
        const hide = (m) => (type === m ? "" : 'style="display:none;"');
        html += `<div class="mapping-item${f.manual ? " mapping-item-manual" : ""}" data-field="${e}">
          <span class="field-name" title="${e}">${escapeHtml(f.label)}</span>
          <span class="field-type">${escapeHtml(f.type)}</span>
          <div class="mapping-mode">
            <select class="mode-select" data-field="${e}">
              <option value="json" ${type === "json" ? "selected" : ""} ${!hasJson ? "disabled" : ""}>JSON${!hasJson ? " (adicione um JSON)" : ""}</option>
              <option value="form" ${type === "form" ? "selected" : ""}>Form</option>
              <option value="default" ${type === "default" ? "selected" : ""}>Default</option>
            </select>
            <select class="value-select" data-field="${e}" ${hide("json")}>
              <option value="">Selecione...</option>
              ${jsonKeys.map((k) => `<option value="${escapeHtml(k)}" ${type === "json" && k === cfg.value ? "selected" : ""}>${escapeHtml(k)}</option>`).join("")}
            </select>
            <div class="form-options-container" ${hide("form")}>${formCtl}</div>
            <input class="default-input" data-field="${e}" type="text" readonly placeholder="Clique para digitar o valor..." ${hide("default")} value="${type === "default" ? escapeHtml(flattenForDisplay(cfg.value || "")) : ""}" style="width:100px;font-size:10px;padding:2px 4px;border:1px solid #dadce0;border-radius:3px;display:${type === "default" ? "inline-block" : "none"};">
            <button class="btn-edit-value" data-field="${e}" title="Editar valor" ${ok && type !== "form" ? "" : 'style="display:none;"'}>✏️</button>
            <button type="button" class="dado-remove" data-field="${e}" title="Remover do dado (volta a usar o mapeamento)">🗑️</button>
          </div>
          ${ok ? `<span class="json-preview">${escapeHtml(val.substring(0, 20))}</span>` : inherited ? `<span class="json-preview" style="opacity:.6">↩ ${escapeHtml(inherited.substring(0, 20))}</span>` : ""}
          <span class="mapping-status ${ok ? "found" : "notfound"}">${ok ? "✅" : cfg ? "❌" : "·"}</span>
        </div>`;
      });
      box.innerHTML = html;
      stats.innerHTML = `<span>📊 Campos: ${fields.length}</span><span>🔗 Do dado: ${used}</span>`;
    }
    const setCfg = (f, c) => { if (!c) delete dadoCfg[f]; else dadoCfg[f] = c; save(); render(); };
    const edit = (field) => {
      const cfg = dadoCfg[field] || {};
      openEditValue(field, cfg.type === "json" ? valueOf(cfg) : cfg.value || "", {
        label: field.replace(/^(css|js):/, ""),
        apply: (v) => { if (v.trim()) setCfg(field, { type: "default", value: v }); else if (cfg.type === "default") setCfg(field, { type: "default", value: "" }); },
      });
    };

    // eventos delegados (mesma dinâmica do Mapear)
    box.addEventListener("change", (e) => {
      const t = e.target, field = t.dataset.field; if (!field) return;
      if (t.classList.contains("mode-select")) {
        const m = t.value;
        setCfg(field, { type: m, value: "" });
        if (m === "default") edit(field);
      } else if (t.classList.contains("value-select")) setCfg(field, { type: "json", value: t.value });
      else if (t.classList.contains("form-options") || t.classList.contains("form-value")) setCfg(field, { type: "form", value: t.value.trim() });
    });
    box.addEventListener("click", (e) => {
      const t = e.target.closest(".default-input:not(.form-value), .btn-edit-value, .dado-remove"); if (!t) return;
      const field = t.dataset.field;
      if (t.classList.contains("dado-remove")) return setCfg(field, null);
      edit(field);
    });

    $("dadoJsonApply").addEventListener("click", () => { if (parseJson()) { save(); render(); showStatus(`✅ JSON carregado (${Object.keys(dadoJson).length} chaves)`, "success"); } });
    $("dadoJsonText").addEventListener("input", save);
    sel.addEventListener("change", () => { dadoFields = []; load(); render(); });
    $("dadoExtractBtn").addEventListener("click", () => {
      if (!profile()) return showStatus("❌ Selecione um mapeamento", "error");
      showStatus("🔍 Extraindo campos...", "info");
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return showStatus("❌ Nenhuma aba ativa", "error");
        chrome.tabs.sendMessage(tabs[0].id, { action: "EXTRACT_FIELDS" }, { frameId: 0 }, (r) => {
          if (chrome.runtime.lastError) return showStatus("❌ Erro: " + chrome.runtime.lastError.message, "error");
          if (r && r.fields && r.fields.length) { dadoFields = r.fields; render(); showStatus(`✅ ${r.fields.length} campos extraídos!`, "success"); }
          else showStatus("❌ Nenhum campo encontrado na página", "error");
        });
      });
    });
    $("dadoAddBtn").addEventListener("click", () => {
      const id = $("dadoAddSelect").value; if (!id) return showStatus("❌ Escolha um campo", "error");
      dadoCfg[id] = { type: Object.keys(dadoJson).length ? "json" : "default", value: "" };
      save(); render();
    });
    $("dadoAddManual").addEventListener("click", () => {
      const v = $("dadoManualInput").value.trim(); if (!v) return showStatus("❌ Informe o seletor", "error");
      const key = ($("dadoManualMode").value === "js" ? "js:" : "css:") + v;
      if (!dadoCfg[key]) dadoCfg[key] = { type: "default", value: "" };
      $("dadoManualInput").value = ""; save(); render(); edit(key);
    });
    $("dadoClear").addEventListener("click", () => { dadoCfg = {}; $("dadoJsonText").value = ""; dadoJson = {}; save(); render(); });
    $("dadoRun").addEventListener("click", () => {
      const p = profile(); if (!p) return showStatus("❌ Escolha um mapeamento", "error");
      if (!parseJson()) return;
      const eff = { ...(p.mapping || {}) };
      Object.entries(dadoCfg).forEach(([k, c]) => { if (c && c.value) eff[k] = c; });
      const hasJson = Object.keys(dadoJson).length > 0;
      const source = hasJson ? { ...getLatestProfileData(p), ...dadoJson } : getLatestProfileData(p);
      const { mappedData } = resolveMappedData({ ...p, mapping: eff }, source);
      if (!Object.keys(mappedData).length) return showStatus("⚠️ Nenhum campo com valor para preencher", "error");
      showStatus(`📤 "${p.name}" + ${Object.keys(dadoCfg).filter((k) => dadoCfg[k] && dadoCfg[k].value).length} valor(es) do dado…`, "info");
      sendToContent(mappedData, dadoJson); // as chaves do dado também viram {{variáveis}}
    });
    document.querySelector('[data-tab="tabDado"]')?.addEventListener("click", () => {
      const cur = sel.value; refreshProfiles(); if (sel.value !== cur) { dadoFields = []; load(); } render();
    });
    // v30: dados salvos com título (por mapeamento), em chrome.storage.local → entram no backup
    const SAVED = "dadosSalvos";
    let savedAll = {};
    const savedList = () => {
      const p = profile();
      if (!p) return [];
      if (savedAll[p.id] == null && Array.isArray(savedAll[p.name])) {
        savedAll[p.id] = savedAll[p.name];
        delete savedAll[p.name];
        chrome.storage.local.set({ [SAVED]: savedAll });
      }
      return savedAll[p.id] || [];
    };
    function renderSaved() {
      const s = $("dadoSavedSelect"); if (!s) return;
      const list = savedList();
      
    s.innerHTML = list.length
        ? '<option value="" selected disabled>Selecione um dado salvo...</option>' +
          list.map((d, i) => `<option value="${i}">${escapeHtml(d.title)}</option>`).join("")
        : '<option value="">Nenhum dado salvo</option>';
    }
    function persistSaved() { chrome.storage.local.set({ [SAVED]: savedAll }); renderSaved(); }
    chrome.storage.local.get([SAVED], (r) => {
      savedAll = (r && r[SAVED]) || {};
      let migrated = false;
      profiles.forEach((p) => {
        if (savedAll[p.id] == null && Array.isArray(savedAll[p.name])) savedAll[p.id] = savedAll[p.name];
        if (p.name !== p.id && Object.hasOwn(savedAll, p.name)) { delete savedAll[p.name]; migrated = true; }
      });
      if (migrated) chrome.storage.local.set({ [SAVED]: savedAll });
      renderSaved();
    });
    $("dadoSaveBtn")?.addEventListener("click", () => {
      const p = profile(); if (!p) return showStatus("❌ Selecione um mapeamento", "error");
      const title = $("dadoSaveTitle").value.trim(); if (!title) return showStatus("❌ Informe um título", "error");
      const list = savedAll[p.id] = savedList().slice();
      const item = { title, cfg: JSON.parse(JSON.stringify(dadoCfg)), json: $("dadoJsonText").value, savedAt: new Date().toISOString() };
      const idx = list.findIndex((d) => d.title.toLowerCase() === title.toLowerCase());
      if (idx >= 0) { if (!confirm(`Já existe um dado "${title}". Substituir?`)) return; list[idx] = item; } else list.push(item);
      persistSaved(); $("dadoSaveTitle").value = "";
      $("dadoSavedSelect").value = String(idx >= 0 ? idx : list.length - 1);
      showStatus(`💾 Dado "${title}" salvo`, "success");
    });
    $("dadoSavedLoad")?.addEventListener("click", () => {
      const d = savedList()[Number($("dadoSavedSelect").value)]; if (!d || $("dadoSavedSelect").value === "") return showStatus("❌ Nenhum dado salvo selecionado", "error");
      dadoCfg = JSON.parse(JSON.stringify(d.cfg || {})); $("dadoJsonText").value = d.json || ""; dadoJson = {}; parseJson(true);
      save(); render(); showStatus(`✅ Dado "${d.title}" carregado`, "success");
    });
    $("dadoSavedDelete")?.addEventListener("click", () => {
      const i = $("dadoSavedSelect").value; const d = savedList()[Number(i)]; if (!d || i === "") return;
      if (!confirm(`Excluir o dado salvo "${d.title}"?`)) return;
      savedAll[profile().id] = savedList().filter((_, k) => k !== Number(i)); persistSaved();
      showStatus(`🗑️ Dado "${d.title}" excluído`, "success");
    });
    sel.addEventListener("change", renderSaved);
    document.querySelector('[data-tab="tabDado"]')?.addEventListener("click", renderSaved);
    refreshProfiles(); load(); render();
  })();

  // ============================================
  // FUNÇÕES DO HISTÓRICO (COM MODO DE TESTE)
  // ============================================
  function loadHistory() {
      const history = historyStore || {};
      const currentFilter = historyFilterSelect.value;
      historyFilterSelect.innerHTML =
        '<option value="">Todos os perfis</option>';
      profiles.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        historyFilterSelect.appendChild(opt);
      });
      if (currentFilter && profiles.some((p) => p.name === currentFilter)) {
        historyFilterSelect.value = currentFilter;
      }

      renderHistoryList(history, historyFilterSelect.value);
  }

  function renderHistoryList(history, filterProfile) {
    let allItems = [];

    for (const [profileId, items] of Object.entries(history)) {
      const profile = profiles.find((p) => p.id === profileId) || profiles.find((p) => p.name === profileId);
      const profileName = profile?.name || profileId;
      if (filterProfile && profileName !== filterProfile) continue;
      items.forEach((item, index) => {
        allItems.push({
          profileId,
          profileName,
          index: index,
          timestamp: item.timestamp,
          data: item.data,
          source: item.source || "manual",
          duplicateOf: item.duplicateOf || null,
          dataPreview:
            JSON.stringify(item.data).substring(0, 80) +
            (JSON.stringify(item.data).length > 80 ? "..." : ""),
        });
      });
    }

    allItems.sort((a, b) => b.timestamp - a.timestamp);

    if (allItems.length === 0) {
      historyListContainer.innerHTML = `<div class="empty-message">Nenhum histórico encontrado</div>`;
      return;
    }

    let html = "";
    allItems.forEach((item) => {
      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleString();
      const keyCount = Object.keys(item.data).length;

      html += `
        <div class="list-item" style="flex-wrap:wrap;padding:6px 8px;">
          <div style="display:flex;justify-content:space-between;width:100%;margin-bottom:2px;">
            <span class="name" style="font-weight:600;color:#1a73e8;">${escapeHtml(item.profileName)}</span>
            <span style="font-size:8px;color:#5f6368;">${escapeHtml(dateStr)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;width:100%;font-size:9px;color:#5f6368;">
            <span style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.dataPreview)}</span>
            <span>${keyCount} campos${item.duplicateOf ? " · duplicado" : ""}</span>
          </div>
          <div style="display:flex;gap:4px;margin-top:4px;width:100%;">
            <button class="use-history-btn btn-primary" style="flex:1;padding:3px 6px;font-size:9px;border:none;border-radius:3px;cursor:pointer;background:#1a73e8;color:white;" data-profile="${escapeHtml(item.profileId)}" data-index="${item.index}">📤 Usar e Preencher</button>
            <button class="view-history-btn btn-secondary" style="flex:1;padding:3px 6px;font-size:9px;border:none;border-radius:3px;cursor:pointer;background:#e8eaed;color:#3c4043;" data-profile="${escapeHtml(item.profileId)}" data-index="${item.index}">👁️ Visualizar</button>
            <button class="delete-history-btn btn-danger" style="flex:0 0 30px;padding:3px 6px;font-size:9px;border:none;border-radius:3px;cursor:pointer;background:#ea4335;color:white;" data-profile="${escapeHtml(item.profileId)}" data-index="${item.index}">✕</button>
          </div>
        </div>
      `;
    });

    historyListContainer.innerHTML = html;

    historyListContainer.querySelectorAll(".use-history-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const profileId = this.dataset.profile;
        const index = parseInt(this.dataset.index);
        useHistoryItem(profileId, index);
      });
    });

    historyListContainer
      .querySelectorAll(".view-history-btn")
      .forEach((btn) => {
        btn.addEventListener("click", function () {
          const profileId = this.dataset.profile;
          const index = parseInt(this.dataset.index);
          viewHistoryItem(profileId, index);
        });
      });

    historyListContainer
      .querySelectorAll(".delete-history-btn")
      .forEach((btn) => {
        btn.addEventListener("click", function () {
          const profileId = this.dataset.profile;
          const index = parseInt(this.dataset.index);
          deleteHistoryItem(profileId, index);
        });
      });
  }

  function useHistoryItem(profileId, index) {
      const profile = profiles.find((p) => p.id === profileId);
      const profileName = profile?.name || profileId;
      const key = profile ? historyKey(profile) : profileId;
      const history = historyStore || {};

      if (!history[key] || !history[key][index]) {
        showStatus("❌ Item do histórico não encontrado", "error");
        return;
      }

      const item = history[key][index];

      if (!profile) {
        showStatus("❌ Perfil não encontrado", "error");
        return;
      }

      const mapping = profile.mapping || {};
      const mappedData = {};
      let mappedCount = 0;
      let notFoundKeys = [];

      for (const [field, config] of Object.entries(mapping)) {
        let value = null;
        if (
          config.type === "json" &&
          item.data[config.value] !== undefined &&
          item.data[config.value] !== "" &&
          item.data[config.value] !== null
        ) {
          value = item.data[config.value];
        } else if (
          config.type === "default" &&
          config.value !== undefined &&
          config.value !== ""
        ) {
          value = config.value;
        } else if (
          config.type === "form" &&
          config.value !== undefined &&
          config.value !== ""
        ) {
          value = config.value;
        }
        if (value !== null && value !== undefined && value !== "") {
          mappedData[field] = value;
          mappedCount++;
        } else if (config.type === "json") {
          notFoundKeys.push(config.value);
        }
      }

      if (mappedCount === 0) {
        showStatus("⚠️ Nenhum campo mapeado para este JSON", "error");
        return;
      }

      const testSettings = getTestSettings(profile);
      const hasSavedTestFields = Object.values(testSettings.fields || {}).some((value) => value === true);
      if (testSettings.enabled && hasSavedTestFields) {
        const result = applyRememberedTestSettings(profile, mappedData);
        let msg = `📤 ${mappedCount} campos preenchidos com JSON do histórico (${profileName})`;
        if (notFoundKeys.length > 0) msg += ` ⚠️ Chaves não encontradas: ${notFoundKeys.join(", ")}`;
        showStatus(`🧪 ${msg}`, "info");
        sendToContent(result.data);
        return;
      }

      if (!profile.testSettings?.decisionMade || (testSettings.enabled && !hasSavedTestFields)) {
        openTestSelection(mappedData, item.data);
        return;
      }

      let msg = `📤 ${mappedCount} campos preenchidos com JSON do histórico (${profileName})`;
      if (notFoundKeys.length > 0) msg += ` ⚠️ Chaves não encontradas: ${notFoundKeys.join(", ")}`;
      showStatus(msg, "info");
      sendToContent(mappedData);
  }

  function viewHistoryItem(profileId, index) {
      const profile = profiles.find((p) => p.id === profileId);
      const profileName = profile?.name || profileId;
      const key = profile ? historyKey(profile) : profileId;
      const history = historyStore || {};
      if (!history[key] || !history[key][index]) {
        showStatus("❌ Item não encontrado", "error");
        return;
      }

      const item = history[key][index];
      const jsonStr = JSON.stringify(item.data, null, 2);

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>JSON - ${profileName}</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
            pre { white-space: pre-wrap; word-wrap: break-word; }
            .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .close-btn { background: #ea4335; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
            .close-btn:hover { background: #c62828; }
          </style>
        </head>
        <body>
          <div class="header">
            <span style="font-size:16px;font-weight:bold;">📄 JSON de ${escapeHtml(profileName)}</span>
            <button class="close-btn" onclick="window.close()">Fechar</button>
          </div>
          <pre>${escapeHtml(jsonStr)}</pre>
        </body>
        </html>
      `;

      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url: url });
  }

  function deleteHistoryItem(profileId, index) {
    const profile = profiles.find((p) => p.id === profileId);
    const profileName = profile?.name || profileId;
    if (!confirm(`Deletar este item do histórico de "${profileName}"?`)) return;

    const key = profile ? historyKey(profile) : profileId;
    if (historyStore[key] && historyStore[key][index]) {
      historyStore[key].splice(index, 1);
      if (historyStore[key].length === 0) delete historyStore[key];
      persistAll(() => {
        showStatus("🗑️ Item deletado do histórico", "info");
        loadHistory();
      });
    }
  }

  // ============================================
  // EVENTOS DO HISTÓRICO
  // ============================================
  historyFilterSelect.addEventListener("change", () => {
    loadHistory();
  });

  clearHistoryBtn.addEventListener("click", () => {
    if (
      !confirm(
        "Tem certeza que deseja limpar TODO o histórico de todos os perfis?",
      )
    )
      return;
    historyStore = {};
    persistAll(() => {
      showStatus("🗑️ Histórico completamente limpo!", "success");
      loadHistory();
    });
  });

  refreshHistoryBtn.addEventListener("click", () => {
    loadHistory();
    showStatus("🔄 Histórico atualizado!", "success");
  });

  // ============================================
  // CRÉDITOS - Mateus Oliveira de Jesus
  // ============================================
  if (creditsBtn && creditsModal) {
    creditsBtn.addEventListener("click", function () {
      openModal(creditsModal);
    });
  }

  // ============================================
  // EVENTOS DO MODAL DE SELEÇÃO DE TESTE
  // ============================================
  const confirmTestBtn = document.getElementById("confirmTestSelectionBtn");
  const cancelTestBtn1 = document.getElementById("cancelTestSelectionBtn");
  const cancelTestBtn2 = document.getElementById("cancelTestSelectionBtn2");

  if (confirmTestBtn)
    confirmTestBtn.addEventListener("click", confirmTestSelection);
  if (cancelTestBtn1)
    cancelTestBtn1.addEventListener("click", cancelTestSelection);
  if (cancelTestBtn2)
    cancelTestBtn2.addEventListener("click", cancelTestSelection);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const modal = document.getElementById("testSelectionModal");
      if (modal && modal.classList.contains("show")) {
        cancelTestSelection();
      }
    }
  });

  // ============================================
  // MODO DE TESTE - CHECKBOX
  // ============================================
  const isTestCheckbox = document.getElementById("is_test");
  if (isTestCheckbox) {
    const profile = selectedIndex !== null ? profiles[selectedIndex] : null;
    isTestMode = getTestSettings(profile).enabled;
    isTestCheckbox.checked = isTestMode;

    isTestCheckbox.addEventListener("change", function () {
      isTestMode = this.checked;
      if (selectedIndex !== null && profiles[selectedIndex]) {
        const profile = profiles[selectedIndex];
        const current = getTestSettings(profile);
        setTestSettings(profile, isTestMode, current.fields, true);
        profile.testSettings.decisionMade = true;
        const stateLabel = document.getElementById("testPreferenceState");
        const hasSavedFields = Object.values(current.fields || {}).some((value) => value === true);
        if (stateLabel) {
          stateLabel.textContent = isTestMode
            ? (hasSavedFields ? "Ativo · usa as chaves de teste salvas neste mapeamento" : "Ativo · escolha as chaves de teste no primeiro preenchimento")
            : "Desativado · os dados serão usados sem alteração";
        }
        persistAll(() => renderProfiles());
      }
      renderProfiles();
      showStatus(
        `🧪 Modo de teste ${isTestMode ? "ATIVADO" : "DESATIVADO"} e salvo para este perfil.`,
        "info",
      );
    });
  }

  // ============================================
  // BOTÃO RESET NO MENU "MAIS"
  // ============================================
  const resetModalBtn = document.getElementById("resetModalBtn");
  if (resetModalBtn) {
    resetModalBtn.addEventListener("click", function () {
      if (typeof window.resetDontAskAgain === "function") {
        window.resetDontAskAgain();
      } else {
        if (selectedIndex !== null && profiles[selectedIndex]) {
          const profile = profiles[selectedIndex];
          profile.dontAskTestAgain = false;
          saveProfiles();
          showStatus(
            "🔓 Modal de teste reativado para este perfil!",
            "success",
          );
          renderProfiles();
        } else {
          showStatus("❌ Nenhum perfil selecionado", "error");
        }
      }
    });
  }

  if (profileSearchInput) {
    profileSearchInput.addEventListener("input", function () {
      profileSearchQuery = this.value || "";
      renderProfiles();
    });
  }

  // ============================================
  // PAINEL FLUTUANTE OPCIONAL
  // ============================================
  const floatPopupBtn = document.getElementById("floatPopupBtn");
  const minimizePopupBtn = document.getElementById("minimizePopupBtn");
  const closeFloatingPopupBtn = document.getElementById("closeFloatingPopupBtn");
  const isFloatingPopup =
    new URLSearchParams(window.location.search).get("floating") === "1";

  const isWindowMode =
    new URLSearchParams(window.location.search).get("window") === "1";
  const expandPopupBtn = document.getElementById("expandPopupBtn");

  if (isFloatingPopup && isWindowMode) {
    // Janela destacada: já é grande e redimensionável pelo sistema
    document.body.classList.add("floating-mode", "window-mode");
    if (floatPopupBtn) floatPopupBtn.hidden = true;
    if (expandPopupBtn) expandPopupBtn.hidden = true;
  } else if (isFloatingPopup) {
    document.body.classList.add("floating-mode");

    if (floatPopupBtn) floatPopupBtn.hidden = true;
    if (minimizePopupBtn) minimizePopupBtn.hidden = false;
    if (closeFloatingPopupBtn) closeFloatingPopupBtn.hidden = false;

    if (minimizePopupBtn) {
      minimizePopupBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        window.parent.postMessage(
          { source: "mapeador-formularios", action: "MINIMIZE_FLOATING" },
          "*",
        );
      });
    }

    if (closeFloatingPopupBtn) {
      closeFloatingPopupBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        window.parent.postMessage(
          { source: "mapeador-formularios", action: "CLOSE_FLOATING" },
          "*",
        );
      });
    }

    // Arrastar o painel pelo cabeçalho.
    const appHeader = document.querySelector(".app-header");
    if (appHeader) {
      let dragging = false;
      let lastX = 0;
      let lastY = 0;

      appHeader.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button, input, a, select, textarea")) return;
        dragging = true;
        lastX = event.screenX;
        lastY = event.screenY;
        appHeader.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });

      appHeader.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        // screenX/Y não mudam quando o próprio iframe se move (clientX/Y mudariam)
        const dx = event.screenX - lastX;
        const dy = event.screenY - lastY;
        lastX = event.screenX;
        lastY = event.screenY;
        if (!dx && !dy) return;

        window.parent.postMessage(
          {
            source: "mapeador-formularios",
            action: "FLOATING_DRAG",
            dx,
            dy,
          },
          "*",
        );
      });

      const stopDragging = (event) => {
        if (!dragging) return;
        dragging = false;
        try {
          appHeader.releasePointerCapture?.(event.pointerId);
        } catch (_) {}
      };

      appHeader.addEventListener("pointerup", stopDragging);
      appHeader.addEventListener("pointercancel", stopDragging);
    }
  } else if (floatPopupBtn) {
    const FLOAT_PREF_KEY = "floatingPanelEnabled";
    const FLOAT_TITLE_IDLE = "Painel flutuante na página (760 × 760, redimensionável). Permanece ativo até fechar no ×";
    const FLOAT_TITLE_ACTIVE = "Painel flutuante já está ativo";

    // Reflete o estado: se o painel já está ativo, o botão fica desabilitado
    const updateFloatBtnState = (active) => {
      floatPopupBtn.disabled = !!active;
      const label = active ? FLOAT_TITLE_ACTIVE : FLOAT_TITLE_IDLE;
      floatPopupBtn.title = label;
      floatPopupBtn.setAttribute("aria-label", label);
    };

    try {
      chrome.storage.local.get([FLOAT_PREF_KEY], (result) => {
        void chrome.runtime.lastError;
        updateFloatBtnState(!!result && result[FLOAT_PREF_KEY] === true);
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[FLOAT_PREF_KEY]) {
          updateFloatBtnState(changes[FLOAT_PREF_KEY].newValue === true);
        }
      });
    } catch (_) {}

    floatPopupBtn.addEventListener("click", () => {
      if (floatPopupBtn.disabled) return;

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) return;

        chrome.tabs.sendMessage(
          tab.id,
          { action: "TOGGLE_FLOATING" },
          { frameId: 0 },
          () => {
            // Sem content script na aba (ex.: chrome://): mantém o popup aberto
            if (chrome.runtime.lastError) return;
            // Fecha o popup imediatamente (feedback visual); o content.js salva a preferência
            window.close();
          },
        );
      });
    });
  }


  // Botão EXPANDIR (v12)
  //  - popup do Chrome (limitado a 800×600): abre a mesma interface numa janela maior
  //  - painel flutuante: alterna entre tamanho normal e tela quase cheia
  if (expandPopupBtn && !isWindowMode) {
    expandPopupBtn.addEventListener("click", () => {
      if (isFloatingPopup) {
        window.parent.postMessage(
          { source: "mapeador-formularios", action: "TOGGLE_MAXIMIZE" },
          "*",
        );
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || tab.id === undefined) {
          showStatus("❌ Nenhuma aba ativa", "error");
          return;
        }

        // Tamanho INTERNO da janela: 760 × 760 por padrão; lembra o último tamanho usado.
        // O janela.js corrige a diferença da moldura do sistema depois que a janela abre.
        chrome.storage.local.get(["floatingWindowSize"], (result) => {
          void chrome.runtime.lastError;
          const saved = (result && result.floatingWindowSize) || {};
          const availW = screen.availWidth || 1280;
          const availH = screen.availHeight || 800;
          const innerW = Math.min(availW, Math.max(480, Number(saved.w) || 760));
          const innerH = Math.min(availH, Math.max(420, Number(saved.h) || 760));

          const url = chrome.runtime.getURL(
            "popup.html?floating=1&window=1&sourceTabId=" + tab.id +
              "&iw=" + innerW + "&ih=" + innerH +
              "&sourceUrl=" + encodeURIComponent(tab.url || ""),
          );
          // estimativa inicial (moldura + barra de título)
          const width = Math.min(availW, innerW + 16);
          const height = Math.min(availH, innerH + 40);
          chrome.windows.create(
            {
              url,
              type: "popup",
              width,
              height,
              left: Math.max(0, Math.round((availW - width) / 2)),
              top: Math.max(0, Math.round((availH - height) / 2)),
            },
            () => {
              if (chrome.runtime.lastError) {
                showStatus("❌ Não foi possível abrir a janela: " + chrome.runtime.lastError.message, "error");
                return;
              }
              window.close(); // fecha o popup pequeno
            },
          );
        });
      });
    });
  }

  // ============================================
  // CAMPO MANUAL (seletor CSS)
  // ============================================
  const manualBox = document.getElementById("manualFieldBox");
  const manualSelectorInput = document.getElementById("manualSelectorInput");
  const manualSelectorMode = document.getElementById("manualSelectorMode");
  const testSelectorBtn = document.getElementById("testSelectorBtn");
  const addManualFieldBtn = document.getElementById("addManualFieldBtn");
  const manualSelectorHint = document.getElementById("manualSelectorHint");

  function setManualHint(message, state) {
    if (!manualSelectorHint) return;
    manualSelectorHint.textContent = message;
    manualSelectorHint.dataset.state = state || "";
  }

  function isValidSelector(selector) {
    if (manualSelectorMode?.value === "js") return /^document\.(?:querySelector|querySelectorAll)\(/.test(selector);
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Pergunta ao content script se o seletor acha algo na aba atual (e destaca o elemento)
  function checkSelectorOnPage(selector, onResult, mode = "css") {
    if (!chrome.tabs || !chrome.tabs.query) {
      onResult({ ok: false, error: "Sem acesso à aba atual" });
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || tab.id === undefined) {
        onResult({ ok: false, error: "Nenhuma aba ativa" });
        return;
      }
      mapeadorFrames.sendAll(tab.id, { action: "CHECK_SELECTOR", selector, mode }).then((results) => {
        const resps = results.map(r => r.response).filter(Boolean);
        if (!resps.length) { onResult({ ok: false, error: "Não foi possível acessar a página. Recarregue a aba e tente de novo." }); return; }
        const hit = resps.find(r => r.ok && r.count > 0);
        if (!hit) { onResult(resps.find(r => r.ok) || resps[0]); return; }
        onResult({ ...hit, count: resps.reduce((n, r) => n + (r.ok ? r.count || 0 : 0), 0) });
      });
    });
  }

  function describeSelectorCheck(r) {
    if (!r.ok) return { text: "❌ " + (r.error || "Falha ao testar"), state: "error" };
    if (r.count === 0) return { text: "⚠️ Nenhum elemento encontrado nesta página", state: "warn" };
    let text = `✅ Encontrado: <${r.tag}${r.type ? " type=" + r.type : ""}>`;
    if (r.count > 1) text += ` · ${r.count} elementos encontrados; todos serão preenchidos`;
    if (!r.editable) text += " · atenção: não parece um campo editável";
    return { text, state: r.editable ? "ok" : "warn" };
  }

  function testManualSelector() {
    const selector = manualSelectorInput.value.trim();
    if (!selector) { setManualHint("Digite um seletor CSS para testar.", "warn"); return; }
    if (!isValidSelector(selector)) { setManualHint("❌ Seletor CSS inválido.", "error"); return; }
    setManualHint("Testando...", "");
    checkSelectorOnPage(selector, (r) => {
      const d = describeSelectorCheck(r);
      setManualHint(d.text, d.state);
    }, manualSelectorMode?.value || "css");
  }

  function addManualField() {
    const selector = manualSelectorInput.value.trim();
    const profile = profiles.find((p) => p.id === mapperSelect.value);
    if (!profile) { setManualHint("❌ Selecione um mapeamento acima antes de adicionar.", "error"); return; }
    if (!selector) { setManualHint("Digite um seletor CSS.", "warn"); return; }
    if (!isValidSelector(selector)) { setManualHint("❌ Seletor CSS inválido.", "error"); return; }

    if (currentProfileId !== profile.id) loadMapping(profile);

    const key = (manualSelectorMode?.value === "js" ? "js:" : "css:") + selector;
    if (currentMapping[key]) { setManualHint("ℹ️ Este seletor já está no mapeamento.", "warn"); return; }

    // Começa como "Default" (valor fixo digitado por você); dá para trocar para JSON/Form na linha.
    currentMapping[key] = { type: "default", value: "" };
    renderMapping();
    manualSelectorInput.value = "";
    setManualHint("✅ Campo adicionado. Defina o valor abaixo e clique em Salvar Mapeamento.", "ok");

    const row = Array.from(mappingContainer.querySelectorAll(".mapping-item-manual"))
      .find((el) => el.dataset.field === key);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
      openEditValue(key, ""); // abre o modal para digitar o valor Default
    }
  }

  if (testSelectorBtn) testSelectorBtn.addEventListener("click", testManualSelector);
  if (addManualFieldBtn) addManualFieldBtn.addEventListener("click", addManualField);
  if (manualSelectorInput) {
    manualSelectorInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addManualField(); }
    });
  }

  // Ações das linhas manuais (testar/remover), por delegação — a lista é recriada a cada render
  mappingContainer.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".btn-remove-field, .btn-remove-manual");
    if (removeBtn) {
      const fieldId = removeBtn.dataset.field;
      const profile = profiles.find((p) => p.id === currentProfileId);
      if (!profile || !fieldId) return;
      if (!confirm(`Remover o campo "${fieldId}" deste mapeamento?`)) return;

      delete currentMapping[fieldId];
      profile.excludedMappingFields = Array.isArray(profile.excludedMappingFields)
        ? profile.excludedMappingFields
        : [];
      if (!profile.excludedMappingFields.includes(fieldId)) {
        profile.excludedMappingFields.push(fieldId);
      }
      profile.mapping = { ...currentMapping };
      profile.updatedAt = Date.now();
      saveProfiles();
      renderMapping();
      showStatus("🗑️ Campo removido do mapeamento e salvo. Para exibi-lo novamente, extraia os campos e remapeie-o.", "success");
      return;
    }
    const testBtn = e.target.closest(".btn-test-manual");
    if (testBtn) {
      const selector = (testBtn.dataset.field || "").slice(4);
      checkSelectorOnPage(selector, (r) => {
        const d = describeSelectorCheck(r);
        showStatus(d.text, d.state === "ok" ? "success" : d.state === "warn" ? "info" : "error");
      });
    }
  });

  const newFolderBtn = document.getElementById("newFolderBtn");
  if (newFolderBtn) newFolderBtn.addEventListener("click", () => createFolder(null));

  // ============================================
  // INICIAR
  // ============================================
  loadCurrentPageUrl(loadAll);
  // ============================================
  // EXPORTAÇÃO PARA INTEGRAÇÃO IA
  // ============================================

  // Variáveis
  window.profiles = profiles;
  window.selectedIndex = selectedIndex;
  window.pageFields = pageFields;
  window.currentMapping = currentMapping;
  window.currentProfileData = currentProfileData;
  window.currentProfileId = currentProfileId;
  window.isTestMode = isTestMode;
  window.editingFieldId = editingFieldId;

  // Funções principais
  window.saveProfiles = saveProfiles;
  window.renderProfiles = renderProfiles;
  window.updateMapperSelect = updateMapperSelect;
  window.loadHistory = loadHistory;
  window.sendToContent = sendToContent;
  window.createFolder = createFolder;
  window.renderMappingManager = renderMappingManager;
  window.renderMapping = renderMapping;
  window.loadMapping = loadMapping;
  window.updateMapperView = updateMapperView;
  window.updateStats = updateStats;
  window.resetDontAskAgain = resetDontAskAgain;
  window.applyTestToData = applyTestToData;
  window.saveTestPreferences = saveTestPreferences;
  window.openTestSelection = openTestSelection;
  window.confirmTestSelection = confirmTestSelection;
  window.cancelTestSelection = cancelTestSelection;
  window.addHistoryItem = addHistoryItem;
  window.normalizeProfile = normalizeProfile;
  window.getProfileHistory = getProfileHistory;
  window.getLatestProfileData = getLatestProfileData;
  window.getTestSettings = getTestSettings;
  window.setTestSettings = setTestSettings;


  // Botões
  window.extractBtn = extractBtn;
  window.autoMapBtn = autoMapBtn;
  window.fillProfileBtn = fillProfileBtn;
  window.saveMappingBtn = saveMappingBtn;
  window.clearMappingBtn = clearMappingBtn;
  window.uploadJsonBtn = uploadJsonBtn;
  window.uploadNewJsonBtn = uploadNewJsonBtn;
  window.deleteProfileBtn = deleteProfileBtn;
  window.editProfileBtn = editProfileBtn;
  window.editMappingBtn = editMappingBtn;
  window.newMappingBtn = newMappingBtn;

  // Modais
  window.openModal = openModal;
  window.closeModal = closeModal;

});

// ============================================
// CONFIGURAÇÕES ADICIONAIS (MENU "MAIS", MODAIS, ETC)
// ============================================
document.addEventListener("DOMContentLoaded", function () {
  // Tabs
  document.querySelectorAll(".tab-group button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll(".tab-group button[data-tab]")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      document
        .querySelectorAll(".tab-content")
        .forEach((content) => content.classList.remove("active"));
      document.getElementById(this.dataset.tab).classList.add("active");
    });
  });

  // Dropdown "Mais"
  const moreBtn = document.getElementById("moreOptionsBtn");
  const moreMenu = document.getElementById("moreOptionsMenu");

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setMoreOpen(!moreMenu.classList.contains("show"));
    });

    // v49: o menu permanece sempre abaixo do botão. Quando o espaço é
    // pequeno, limita a altura e habilita rolagem; nunca inverte a posição.
    function setMoreOpen(open) {
      moreMenu.classList.toggle("show", open);
      moreBtn.setAttribute("aria-expanded", String(open));
      moreMenu.classList.remove("open-up");
      if (!open) return;
      const r = moreBtn.getBoundingClientRect();
      const below = Math.max(120, window.innerHeight - r.bottom - 20);
      moreMenu.style.setProperty("--more-max-h", Math.min(420, below) + "px");
    }

    document.addEventListener("click", function (e) {
      if (!moreBtn.contains(e.target) && !moreMenu.contains(e.target)) setMoreOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && moreMenu.classList.contains("show")) { setMoreOpen(false); moreBtn.focus(); }
    });
    window.addEventListener("resize", function () { if (moreMenu.classList.contains("show")) setMoreOpen(true); });

    moreMenu.querySelectorAll("button").forEach((item) => {
      item.addEventListener("click", function () { setMoreOpen(false); });
    });
  }

  // ============================================
  // FUNÇÕES PARA MODAIS BOOTSTRAP (FALLBACK)
  // ============================================
  function openModal(modalElement) {
    if (!modalElement) return;

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: true,
        keyboard: true,
      });
      modal.show();
    } else {
      modalElement.classList.add("show");
      modalElement.style.display = "block";
      document.body.classList.add("modal-open");

      let backdrop = document.querySelector(".modal-backdrop");
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop fade show";
        document.body.appendChild(backdrop);
      }
    }
  }

  function closeModal(modalElement) {
    if (!modalElement) return;

    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
        setTimeout(() => {
          const backdrop = document.querySelector(".modal-backdrop");
          if (backdrop) backdrop.remove();
          document.body.classList.remove("modal-open");
          modalElement.classList.remove("show");
          modalElement.style.display = "none";
        }, 150);
        return;
      }
    }

    modalElement.classList.remove("show");
    modalElement.style.display = "none";
    document.body.classList.remove("modal-open");

    const backdrop = document.querySelector(".modal-backdrop");
    if (backdrop) backdrop.remove();
  }

  // ============================================
  // CONFIGURAR MODAIS
  // ============================================
  const newJsonModal = document.getElementById("newJsonModal");
  const editProfileModal = document.getElementById("editProfileModal");
  const editValueModal = document.getElementById("editValueModal");
  const creditsModal = document.getElementById("creditsModal");
  const testSelectionModal = document.getElementById("testSelectionModal");

  // Botão Subir Novo JSON
  const uploadNewJsonBtn = document.getElementById("uploadNewJsonBtn");
  if (uploadNewJsonBtn && newJsonModal) {
    uploadNewJsonBtn.addEventListener("click", function () {
      if (!this.disabled) openModal(newJsonModal);
    });
  }

  const cancelNewJsonBtn = document.getElementById("cancelNewJsonBtn");
  if (cancelNewJsonBtn && newJsonModal) {
    cancelNewJsonBtn.addEventListener("click", function () {
      closeModal(newJsonModal);
    });
  }

  // Botão Editar Perfil
  const newProfileModal = document.getElementById("newProfileModal");
  const newProfileName = document.getElementById("newProfileName");
  const newProfileJson = document.getElementById("newProfileJson");
  const confirmNewProfileBtn = document.getElementById("confirmNewProfileBtn");
  const cancelNewProfileBtn = document.getElementById("cancelNewProfileBtn");

  // O evento principal de Editar Perfil já preenche os campos e abre o modal.
  // Não registrar um segundo clique aqui: isso criava duas instâncias do modal.

  const cancelEditProfileBtn = document.getElementById("cancelEditProfileBtn");
  if (cancelEditProfileBtn && editProfileModal) {
    cancelEditProfileBtn.addEventListener("click", function () {
      closeModal(editProfileModal);
    });
  }

  // Botão Editar Valor
  const cancelEditValueBtn = document.getElementById("cancelEditValueBtn");
  if (cancelEditValueBtn && editValueModal) {
    cancelEditValueBtn.addEventListener("click", function () {
      closeModal(editValueModal);
    });
  }

  // Botão Créditos
  const creditsBtn = document.getElementById("creditsBtn");
  if (creditsBtn && creditsModal) {
    creditsBtn.addEventListener("click", function () {
      openModal(creditsModal);
    });
  }

  // Fechar modais ao clicar no backdrop
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", function (e) {
      if (e.target === this) closeModal(this);
    });
  });

  // Fechar modais com ESC
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document
        .querySelectorAll(".modal.show")
        .forEach((modal) => closeModal(modal));
    }
  });

});
