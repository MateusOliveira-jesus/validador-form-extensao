// ============================================
// AUTOMAÇÃO 4DEVS - COM MARCAÇÃO DE USADO
// ============================================

// ============================================
// 1. GERENCIADOR DE PESSOAS GERADAS
// ============================================

// Dados exibidos nesta lista vêm do armazenamento e devem ser tratados como texto.
function escapeHtmlPessoa(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

class PessoasGeradasManager {
  static async getPessoas() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['pessoasGeradas'], (result) => {
        resolve(Array.isArray(result?.pessoasGeradas) ? result.pessoasGeradas : []);
      });
    });
  }

  static async savePessoas(pessoas) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ pessoasGeradas: pessoas }, resolve);
    });
  }

  static async addPessoa(dados) {
    const pessoas = await this.getPessoas();
    pessoas.push({
      dados: dados,
      dataCriacao: Date.now(),
      usado: false // ← NOVO: marcador de usado
    });
    await this.savePessoas(pessoas);
    return pessoas;
  }

  static async addMultiplasPessoas(listaDados) {
    const pessoas = await this.getPessoas();
    listaDados.forEach(dados => {
      pessoas.push({
        dados: dados,
        dataCriacao: Date.now(),
        usado: false // ← NOVO: marcador de usado
      });
    });
    await this.savePessoas(pessoas);
    return pessoas;
  }

  static async deletePessoa(index) {
    const pessoas = await this.getPessoas();
    if (index >= 0 && index < pessoas.length) {
      pessoas.splice(index, 1);
      await this.savePessoas(pessoas);
    }
    return pessoas;
  }

  static async clearPessoas() {
    await this.savePessoas([]);
    return [];
  }

  // ============================================
  // NOVOS MÉTODOS PARA GERENCIAR "USADO"
  // ============================================

  static async marcarComoUsado(index) {
    const pessoas = await this.getPessoas();
    if (index >= 0 && index < pessoas.length) {
      pessoas[index].usado = true;
      await this.savePessoas(pessoas);
      return true;
    }
    return false;
  }

  static async desmarcarComoUsado(index) {
    const pessoas = await this.getPessoas();
    if (index >= 0 && index < pessoas.length) {
      pessoas[index].usado = false;
      await this.savePessoas(pessoas);
      return true;
    }
    return false;
  }

  static async toggleUsado(index) {
    const pessoas = await this.getPessoas();
    if (index >= 0 && index < pessoas.length) {
      pessoas[index].usado = !pessoas[index].usado;
      await this.savePessoas(pessoas);
      return pessoas[index].usado;
    }
    return false;
  }

  static async getNaoUsados() {
    const pessoas = await this.getPessoas();
    return pessoas.filter(p => !p.usado);
  }

  static async getUsados() {
    const pessoas = await this.getPessoas();
    return pessoas.filter(p => p.usado);
  }
}

// ============================================
// 2. AUTOMAÇÃO PRINCIPAL - 4DEVS
// ============================================

class Automacao4Devs {
  constructor() {
    this.isProcessing = false;
    this.ultimaPessoa = null;
    this.tabId = null;
  }

  // ============================================
  // GERAR PESSOA - AUTOMAÇÃO COMPLETA
  // ============================================

  async gerarPessoa(opcoes = {}) {
    if (this.isProcessing) {
      return {
        sucesso: false,
        mensagem: '⚠️ Aguarde, já estou gerando uma pessoa...'
      };
    }

    this.isProcessing = true;
    this.atualizarStatus('🔄 Iniciando automação...');

    try {
      const config = {
        sexo: opcoes.sexo || 'I',
        idade: opcoes.idade || '0',
        estado: opcoes.estado || '',
        qtde: Math.max(1, Math.floor(Number(opcoes.qtde) || 1)),
        pontuacao: opcoes.pontuacao !== false,
        fecharAba: opcoes.fecharAba === true,
        criarPerfil: opcoes.criarPerfil !== false
      };


      const url = 'https://www.4devs.com.br/gerador_de_pessoas';
      
      const tab = await chrome.tabs.create({ 
        url: url, 
        active: false
      });
      this.tabId = tab.id;

      await this._aguardar(6000);

      const verificar = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: () => {
          const sexoRadios = document.querySelectorAll('input[name="sexo"]');
          const btGerar = document.getElementById('bt_gerar_pessoa');
          return {
            temSexo: sexoRadios.length > 0,
            temBotao: !!btGerar,
            ready: sexoRadios.length > 0 && !!btGerar
          };
        }
      });

      const status = verificar[0]?.result;
      if (!status || !status.ready) {
        await this._aguardar(3000);
      }

      this.atualizarStatus('🔄 Preenchendo campos...');

      const pessoas = [];
      const totalLotes = Math.ceil(config.qtde / 30);
      for (let indiceLote = 0; indiceLote < totalLotes; indiceLote++) {
        const numeroLote = indiceLote + 1;
        const quantidadeLote = Math.min(30, config.qtde - indiceLote * 30);
        this.atualizarStatus(`🔄 Processando lote ${numeroLote}/${totalLotes} (${quantidadeLote} pessoas)...`);
      await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: function(config) {
          
          const sexoRadios = document.querySelectorAll('input[name="sexo"]');
          for (const radio of sexoRadios) {
            if (radio.value === config.sexo) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }

          const idadeSelect = document.getElementById('idade');
          if (idadeSelect) {
            idadeSelect.value = config.idade;
            idadeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const estadoSelect = document.getElementById('cep_estado');
          if (estadoSelect && config.estado) {
            estadoSelect.value = config.estado;
            estadoSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const txtQtde = document.getElementById('txt_qtde');
          if (txtQtde) {
            txtQtde.value = config.qtde;
            txtQtde.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const pontuacaoRadios = document.querySelectorAll('input[name="pontuacao"]');
          const pontuacaoValor = config.pontuacao ? 'S' : 'N';
          for (const radio of pontuacaoRadios) {
            if (radio.value === pontuacaoValor) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }

          return true;
        },
        args: [{ ...config, qtde: quantidadeLote }]
      });

      await this._aguardar(1000);

      this.atualizarStatus(`🔄 Lote ${numeroLote}/${totalLotes}: gerando ${quantidadeLote} pessoa(s)...`);

      await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: function() {
          const btGerar = document.getElementById('bt_gerar_pessoa');
          if (btGerar) {
            btGerar.click();
            return true;
          }
          return false;
        }
      });

      const tempoEspera = quantidadeLote > 1 ? 8000 : 6000;
      await this._aguardar(tempoEspera);

      this.atualizarStatus('🔄 Extraindo JSON...');

      await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: function() {
          const btnJson = document.getElementById('btn_json_tab');
          if (btnJson) {
            btnJson.click();
            return true;
          }
          return false;
        }
      });

      await this._aguardar(2000);

      const result = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: function() {
          const textarea = document.getElementById('dados_json');
          if (textarea && textarea.value) {
            try {
              const parsed = JSON.parse(textarea.value);
              return JSON.stringify(parsed, null, 2);
            } catch (e) {
              return textarea.value;
            }
          }
          return null;
        }
      });

      const jsonContent = result[0]?.result;

      if (!jsonContent) {
        throw new Error('Não foi possível extrair o JSON do 4Devs');
      }

      const jsonData = JSON.parse(jsonContent);
      const pessoasLote = Array.isArray(jsonData) ? jsonData : [jsonData];
      if (pessoasLote.length !== quantidadeLote) {
        throw new Error(`Lote ${numeroLote}/${totalLotes}: esperadas ${quantidadeLote} pessoas, recebidas ${pessoasLote.length}.`);
      }
      pessoas.push(...pessoasLote);
      

      }

      // Salvar múltiplas pessoas no histórico (com usado: false)
      await PessoasGeradasManager.addMultiplasPessoas(pessoas);

      let perfisCriados = 0;
      if (config.criarPerfil) {
        for (const pessoa of pessoas) {
          const criado = this._criarPerfil(pessoa);
          if (criado) perfisCriados++;
        }
      }

      this.ultimaPessoa = pessoas[0];

      const nomes = pessoas.map(p => p.nome || p.name || 'Sem nome').join(', ');
      this.atualizarStatus(`✅ ${pessoas.length} pessoa(s) gerada(s): ${nomes}`);

      if (config.fecharAba && this.tabId) {
        try {
          chrome.tabs.remove(this.tabId);
          this.tabId = null;
        } catch (e) {
        }
      } else if (this.tabId) {
      }

      return {
        sucesso: true,
        pessoas: pessoas,
        quantidade: pessoas.length,
        perfisCriados: perfisCriados,
        tabId: this.tabId,
        mensagem: `✅ ${pessoas.length} pessoa(s) gerada(s)`
      };

    } catch (error) {
      console.error('Erro na automação:', error);
      
      if (this.tabId) {
        try {
          chrome.tabs.remove(this.tabId);
          this.tabId = null;
        } catch (e) {}
      }

      this.atualizarStatus(`❌ Erro: ${error.message}`);
      
      return {
        sucesso: false,
        mensagem: `❌ ${error.message}`
      };
    } finally {
      this.isProcessing = false;
    }
  }

  // ============================================
  // FUNÇÕES AUXILIARES
  // ============================================

  _aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  atualizarStatus(mensagem) {
    const statusEl = document.getElementById('aiStatus');
    if (statusEl) {
      statusEl.textContent = mensagem;
    }
  }

  _criarPerfil(pessoa) {
    try {
      if (typeof window.criarPerfil4Devs === 'function') {
        return window.criarPerfil4Devs(pessoa);
      }

      if (typeof window.profiles !== 'undefined' && window.profiles !== null) {
        const nomePerfil = pessoa.nome || pessoa.name || 'Pessoa 4Devs';
        let nome = nomePerfil;
        let contador = 1;
        while (window.profiles.some(p => p.name === nome)) {
          nome = `${nomePerfil}_${contador}`;
          contador++;
        }

        const profile = typeof window.normalizeProfile === 'function'
          ? window.normalizeProfile({
              id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: nome,
              data: {},
              mapping: {},
              testPreferences: {},
              testSettings: { enabled: false, fields: {}, remember: false },
            })
          : {
              name: nome,
              data: {},
              mapping: {},
              testPreferences: {},
              dontAskTestAgain: false
            };

        window.profiles.push(profile);
        if (typeof window.addHistoryItem === 'function') {
          window.addHistoryItem(profile, pessoa, { source: '4devs' });
        }

        window.selectedIndex = window.profiles.length - 1;
        
        if (typeof window.saveProfiles === 'function') {
          window.saveProfiles();
        }
        if (typeof window.renderProfiles === 'function') {
          window.renderProfiles();
        }
        if (typeof window.updateMapperSelect === 'function') {
          window.updateMapperSelect();
        }

        return true;
      }
    } catch (error) {
      console.error('Erro ao criar perfil:', error);
    }
    return false;
  }

  // ============================================
  // GERAR E PREENCHER FORMULÁRIO
  // ============================================

  async gerarEPreencher(opcoes = {}) {
    const resultado = await this.gerarPessoa({
      ...opcoes,
      criarPerfil: false
    });

    if (resultado.sucesso && resultado.pessoas && resultado.pessoas.length > 0) {
      const pessoa = resultado.pessoas[0];
      const dadosMapeados = this._mapearDadosParaFormulario(pessoa);
      
      if (typeof window.sendToContent === 'function') {
        window.sendToContent(dadosMapeados);
        return {
          sucesso: true,
          mensagem: `✅ Pessoa gerada e formulário preenchido: ${pessoa.nome || 'Sem nome'}`
        };
      } else {
        return {
          sucesso: true,
          mensagem: `✅ Pessoa gerada: ${pessoa.nome || 'Sem nome'}\n\n⚠️ Não foi possível preencher o formulário.`
        };
      }
    }
    return resultado;
  }

  // ============================================
  // MAPEAR DADOS PARA FORMULÁRIO
  // ============================================

  _mapearDadosParaFormulario(pessoa) {
    return {
      nome_completo: pessoa.nome || '',
      nome: pessoa.nome || '',
      cpf: pessoa.cpf || '',
      rg: pessoa.rg || '',
      data_nasc: pessoa.data_nasc || '',
      data_nascimento: pessoa.data_nasc || '',
      sexo: pessoa.sexo || '',
      email: pessoa.email || '',
      telefone: pessoa.celular || pessoa.telefone_fixo || '',
      celular: pessoa.celular || '',
      telefone_fixo: pessoa.telefone_fixo || '',
      endereco: pessoa.endereco || '',
      numero: pessoa.numero || '',
      bairro: pessoa.bairro || '',
      cidade: pessoa.cidade || '',
      estado: pessoa.estado || '',
      cep: pessoa.cep || '',
      mae: pessoa.mae || '',
      pai: pessoa.pai || '',
      senha: pessoa.senha || '',
      signo: pessoa.signo || '',
      tipo_sanguineo: pessoa.tipo_sanguineo || '',
      altura: pessoa.altura || '',
      peso: pessoa.peso || '',
      cor: pessoa.cor || ''
    };
  }

  // ============================================
  // LISTAR PESSOAS GERADAS
  // ============================================

  async listarPessoas() {
    const pessoas = await PessoasGeradasManager.getPessoas();
    if (pessoas.length === 0) {
      return '📋 Nenhuma pessoa gerada ainda.';
    }

    let msg = '📋 **PESSOAS GERADAS:**\n\n';
    pessoas.slice().reverse().forEach((item, index) => {
      const data = new Date(item.dataCriacao);
      const dataStr = data.toLocaleString();
      const nome = item.dados.nome || item.dados.name || 'Sem nome';
      const cpf = item.dados.cpf ? ` | CPF: ${item.dados.cpf}` : '';
      const status = item.usado ? ' ✅ USADO' : ' ⬜ DISPONÍVEL';
      msg += `${index + 1}. ${nome}${cpf} ${status}\n   📅 ${dataStr}\n\n`;
    });
    return msg;
  }
}

// ============================================
// 3. INICIALIZAÇÃO
// ============================================

const automacao4Devs = new Automacao4Devs();

window.automacao4Devs = automacao4Devs;
window.gerarPessoa4Devs = automacao4Devs.gerarPessoa.bind(automacao4Devs);
window.gerarEPreencher4Devs = automacao4Devs.gerarEPreencher.bind(automacao4Devs);

// ============================================
// 4. EVENTOS DO DOM
// ============================================

document.addEventListener('DOMContentLoaded', function() {

    const gerarBtn = document.getElementById('gerar4devsBtn');
    const statusEl = document.getElementById('aiStatus');
    const sexoSelect = document.getElementById('sexo4devs');
    const idadeSelect = document.getElementById('idade4devs');
    const estadoSelect = document.getElementById('estado4devs');
    const qtdeInput = document.getElementById('qtde4devs');
    const pontuacaoCheck = document.getElementById('pontuacao4devs');
    const fecharAbaCheck = document.getElementById('fecharAba4devs');
    const pessoasList = document.getElementById('pessoasGeradasList');
    const limparBtn = document.getElementById('limparPessoasBtn');
    const preencherBtn = document.getElementById('preencher4devsBtn');

    // ============================================
    // FUNÇÃO PARA RENDERIZAR LISTA DE PESSOAS (COM USADO)
    // ============================================

    async function renderizarPessoas() {
      if (!pessoasList) return;

      const pessoas = await PessoasGeradasManager.getPessoas();
      
      if (pessoas.length === 0) {
        pessoasList.innerHTML = '<div style="color: #999; text-align: center; padding: 10px; font-size: 10px;">Nenhuma pessoa gerada ainda</div>';
        return;
      }

      let html = '';
      const reversed = pessoas.slice().reverse();
      reversed.forEach((item, idx) => {
        const realIndex = pessoas.length - 1 - idx;
        const data = new Date(item.dataCriacao);
        const dataStr = Number.isNaN(data.getTime()) ? 'Data não informada' : escapeHtmlPessoa(data.toLocaleString());
        const dados = item && item.dados && typeof item.dados === 'object' ? item.dados : {};
        const nome = escapeHtmlPessoa(dados.nome || dados.name || 'Sem nome');
        const cpf = escapeHtmlPessoa(dados.cpf || '');
        const preview = escapeHtmlPessoa(dados.email || dados.cidade || '');
        const usado = item.usado || false;
        
        // Estilo visual para itens usados
        const estiloUsado = usado ? 'opacity:0.6; background:#f0f0f0;' : '';
        const badgeUsado = usado 
          ? '<span style="font-size:6px; background:#34a853; color:white; padding:1px 6px; border-radius:3px; margin-left:4px;">✅ USADO</span>' 
          : '<span style="font-size:6px; background:#fbbc04; color:#333; padding:1px 6px; border-radius:3px; margin-left:4px;">⬜ DISPONÍVEL</span>';
        
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; border-bottom: 1px solid #eee; font-size: 9px; ${estiloUsado}">
            <div style="flex: 1; overflow: hidden;">
              <strong style="color: #1a73e8;">${nome}</strong>
              ${badgeUsado}
              ${cpf ? `<span style="color: #666;"> | ${cpf}</span>` : ''}
              ${preview ? `<span style="color: #999; font-size: 8px; display: block;">${preview}</span>` : ''}
              <span style="color: #999; font-size: 7px; display: block;">${dataStr}</span>
            </div>
            <div style="display: flex; gap: 3px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end;">
              <button class="usarPessoaBtn" data-index="${realIndex}" style="font-size: 7px; padding: 2px 6px; border: none; border-radius: 3px; background: #1a73e8; color: white; cursor: pointer;">📤 Usar</button>
              <button class="copiarPessoaBtn" data-index="${realIndex}" style="font-size: 7px; padding: 2px 6px; border: none; border-radius: 3px; background: #34a853; color: white; cursor: pointer;">📋 Copiar</button>
              <button class="toggleUsadoBtn ${usado ? '' : 'd-none'}" data-index="${realIndex}" style="font-size: 7px; padding: 2px 6px; border: none; border-radius: 3px; background: ${usado ? '#fbbc04' : '#ea4335'}; color: ${usado ? '#333' : 'white'}; cursor: pointer;">${usado ? '↺ desmarcar' : ''}</button>
              <button class="deletarPessoaBtn" data-index="${realIndex}" style="font-size: 7px; padding: 2px 6px; border: none; border-radius: 3px; background: #ea4335; color: white; cursor: pointer;">✕</button>
            </div>
          </div>
        `;
      });

      pessoasList.innerHTML = html;

      // Evento USAR
      pessoasList.querySelectorAll('.usarPessoaBtn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.dataset.index);
          usarPessoa(index);
        });
      });

      // Evento COPIAR
      pessoasList.querySelectorAll('.copiarPessoaBtn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.dataset.index);
          copiarPessoa(index);
        });
      });

      // Evento TOGGLE USADO
      pessoasList.querySelectorAll('.toggleUsadoBtn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.dataset.index);
          toggleUsado(index);
        });
      });

      // Evento DELETAR
      pessoasList.querySelectorAll('.deletarPessoaBtn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.dataset.index);
          deletarPessoa(index);
        });
      });
    }

    // ============================================
    // FUNÇÃO PARA USAR PESSOA (abrir modal Subir Novo JSON + MARCAR COMO USADO)
    // ============================================

    async function usarPessoa(index) {
      const pessoas = await PessoasGeradasManager.getPessoas();
      if (index < 0 || index >= pessoas.length) {
        alert('Pessoa não encontrada!');
        return;
      }

      const pessoa = pessoas[index].dados;
      
      // MARCAR COMO USADO
      await PessoasGeradasManager.marcarComoUsado(index);
      
      // Abrir o modal com os dados
      const modal = document.getElementById('newJsonModal');
      if (modal) {
        const textarea = document.getElementById('newJsonData');
        if (textarea) {
          textarea.value = JSON.stringify(pessoa, null, 2);
        }
        
        const profileName = document.getElementById('selectedProfileName');
        if (profileName) {
          profileName.textContent = `📄 ${pessoa.nome || pessoa.name || 'Pessoa 4Devs'}`;
        }
        
        const expectedKeys = document.getElementById('expectedKeysDisplay');
        if (expectedKeys) {
          expectedKeys.textContent = Object.keys(pessoa).join(', ');
        }
        
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          const modalInstance = new bootstrap.Modal(modal);
          modalInstance.show();
        } else {
          modal.style.display = 'block';
          modal.classList.add('show');
          document.body.classList.add('modal-open');
          
          let backdrop = document.querySelector('.modal-backdrop');
          if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            document.body.appendChild(backdrop);
          }
        }
        
        if (statusEl) statusEl.textContent = `📋 Dados de "${pessoa.nome || 'Sem nome'}" carregados no modal`;
      }
      
      // Atualizar a lista para mostrar o status "USADO"
      renderizarPessoas();
    }

    // ============================================
    // FUNÇÃO PARA COPIAR JSON DA PESSOA
    // ============================================

    async function copiarPessoa(index) {
      const pessoas = await PessoasGeradasManager.getPessoas();
      if (index < 0 || index >= pessoas.length) {
        alert('Pessoa não encontrada!');
        return;
      }

      const pessoa = pessoas[index].dados;
      const jsonStr = JSON.stringify(pessoa, null, 2);
      
      try {
        await navigator.clipboard.writeText(jsonStr);
        if (statusEl) statusEl.textContent = `📋 JSON de "${pessoa.nome || 'Sem nome'}" copiado!`;
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = jsonStr;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        if (statusEl) statusEl.textContent = `📋 JSON copiado!`;
      }
    }

    // ============================================
    // FUNÇÃO PARA MARCAR/DESMARCAR COMO USADO
    // ============================================

    async function toggleUsado(index) {
      const pessoas = await PessoasGeradasManager.getPessoas();
      if (index < 0 || index >= pessoas.length) {
        alert('Pessoa não encontrada!');
        return;
      }

      const usado = await PessoasGeradasManager.toggleUsado(index);
      const nome = pessoas[index].dados.nome || 'Sem nome';
      
      renderizarPessoas();
      if (statusEl) {
        statusEl.textContent = usado 
          ? `✅ "${nome}" marcado como USADO` 
          : `↺ "${nome}" reativado como DISPONÍVEL`;
      }
    }

    // ============================================
    // FUNÇÃO PARA DELETAR PESSOA
    // ============================================

    async function deletarPessoa(index) {
      const pessoas = await PessoasGeradasManager.getPessoas();
      if (index < 0 || index >= pessoas.length) return;
      
      const nome = pessoas[index].dados.nome || 'Sem nome';
      if (confirm(`Deletar "${nome}" do histórico?`)) {
        await PessoasGeradasManager.deletePessoa(index);
        renderizarPessoas();
        if (statusEl) statusEl.textContent = `🗑️ "${nome}" removido`;
      }
    }

    // ============================================
    // FUNÇÃO PARA GERAR PESSOA (MARCA COMO NÃO USADO)
    // ============================================

    async function gerarPessoa() {
      if (!gerarBtn) return;

      const sexo = sexoSelect ? sexoSelect.value : 'I';
      const idade = idadeSelect ? idadeSelect.value : '0';
      const estado = estadoSelect ? estadoSelect.value : '';
      const qtde = qtdeInput ? parseInt(qtdeInput.value) || 1 : 1;
      const pontuacao = pontuacaoCheck ? pontuacaoCheck.checked : true;
      const fecharAba = fecharAbaCheck ? fecharAbaCheck.checked : false;


      gerarBtn.disabled = true;
      gerarBtn.textContent = '⏳ Gerando...';
      if (statusEl) statusEl.textContent = `🔄 Gerando ${qtde} pessoa(s)...`;

      try {
        const resultado = await automacao4Devs.gerarPessoa({
          sexo: sexo,
          idade: idade,
          estado: estado,
          qtde: qtde,
          pontuacao: pontuacao,
          fecharAba: fecharAba,
          criarPerfil: true
        });

        if (resultado.sucesso) {
          if (statusEl) statusEl.textContent = `✅ ${resultado.mensagem}`;
          renderizarPessoas();
          if (!fecharAba) {
          }
        } else {
          if (statusEl) statusEl.textContent = `❌ ${resultado.mensagem || 'Erro ao gerar'}`;
        }
      } catch (error) {
        if (statusEl) statusEl.textContent = `❌ Erro: ${error.message}`;
        console.error('Erro:', error);
      } finally {
        gerarBtn.disabled = false;
        gerarBtn.textContent = '✨ Gerar Pessoa 4Devs';
      }
    }

    // ============================================
    // FUNÇÃO PARA GERAR E PREENCHER
    // ============================================

    async function gerarEPreencher() {
      if (!preencherBtn) return;

      const sexo = sexoSelect ? sexoSelect.value : 'I';
      const idade = idadeSelect ? idadeSelect.value : '0';
      const estado = estadoSelect ? estadoSelect.value : '';
      const qtde = qtdeInput ? parseInt(qtdeInput.value) || 1 : 1;
      const pontuacao = pontuacaoCheck ? pontuacaoCheck.checked : true;
      const fecharAba = fecharAbaCheck ? fecharAbaCheck.checked : false;

      preencherBtn.disabled = true;
      preencherBtn.textContent = '⏳ Gerando...';
      if (statusEl) statusEl.textContent = `🔄 Gerando ${qtde} pessoa(s) e preenchendo...`;

      try {
        const resultado = await automacao4Devs.gerarEPreencher({
          sexo: sexo,
          idade: idade,
          estado: estado,
          qtde: qtde,
          pontuacao: pontuacao,
          fecharAba: fecharAba
        });
        
        if (resultado.sucesso) {
          if (statusEl) statusEl.textContent = resultado.mensagem;
          renderizarPessoas();
        } else {
          if (statusEl) statusEl.textContent = `❌ ${resultado.mensagem}`;
        }
      } catch (error) {
        if (statusEl) statusEl.textContent = `❌ Erro: ${error.message}`;
      } finally {
        preencherBtn.disabled = false;
        preencherBtn.textContent = '📤 Gerar e Preencher';
      }
    }

    // ============================================
    // EVENTOS
    // ============================================

    if (gerarBtn) {
      gerarBtn.addEventListener('click', gerarPessoa);
    }

    if (preencherBtn) {
      preencherBtn.addEventListener('click', gerarEPreencher);
    }

    if (limparBtn) {
      limparBtn.addEventListener('click', async function() {
        if (confirm('Limpar todo o histórico de pessoas geradas?')) {
          await PessoasGeradasManager.clearPessoas();
          renderizarPessoas();
          if (statusEl) statusEl.textContent = '🗑️ Histórico limpo!';
        }
      });
    }

    renderizarPessoas();

  });

// ============================================
// 5. FUNÇÃO GLOBAL PARA CRIAR PERFIL
// ============================================

window.criarPerfil4Devs = function(dados) {
  try {
    const nomePerfil = dados.nome || dados.name || 'Pessoa 4Devs';
    let nome = nomePerfil;
    let contador = 1;
    while (window.profiles && window.profiles.some(p => p.name === nome)) {
      nome = `${nomePerfil}_${contador}`;
      contador++;
    }

    if (window.profiles) {
      const profile = typeof window.normalizeProfile === 'function'
        ? window.normalizeProfile({
            id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: nome,
            data: {},
            mapping: {},
            testPreferences: {},
            testSettings: { enabled: false, fields: {}, remember: false },
          })
        : {
            name: nome,
            data: {},
            mapping: {},
            testPreferences: {},
            dontAskTestAgain: false
          };

      window.profiles.push(profile);
      if (typeof window.addHistoryItem === 'function') {
        window.addHistoryItem(profile, dados, { source: '4devs' });
      }

      window.selectedIndex = window.profiles.length - 1;
      
      if (typeof window.saveProfiles === 'function') {
        window.saveProfiles();
      }
      if (typeof window.renderProfiles === 'function') {
        window.renderProfiles();
      }
      if (typeof window.updateMapperSelect === 'function') {
        window.updateMapperSelect();
      }

      return true;
    }
  } catch (error) {
    console.error('Erro ao criar perfil:', error);
  }
  return false;
};
