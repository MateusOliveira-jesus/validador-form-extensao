# Changelog

## v55.1.0 — bolinha arrastável
- **A bolinha flutuante agora pode ser arrastada** para qualquer ponto da tela. Um clique simples continua abrindo o painel; só arrastar (mover mais de 4 px) reposiciona, sem abrir.
- A posição é lembrada em todas as páginas e abas, e a bolinha é mantida dentro da janela quando ela é redimensionada.
- **Duplo clique** na bolinha devolve ela ao canto inferior direito.
- A posição não entra no backup (é estado de interface, como o tamanho do painel).

## v55.0.0 — Validador e Formulário
- **Novo nome:** a extensão agora se chama **Validador e Formulário** (manifest, título, cabeçalho, botão flutuante, janela "Sobre", banner de seleção e nome dos arquivos de backup: `validador-formulario-backup_AAAA-MM-DD_HH-MM.json`). Chaves de armazenamento e o formato interno do backup foram mantidos: seus dados e backups antigos continuam funcionando.
- **Testes avançados simplificados** — de 9 blocos para 4:
  - **Lote:** JSON/CSV colado ou pessoas lembradas, requisições por segundo, parar e exportar CSV.
  - **Casos negativos:** marque os campos e informe o status HTTP esperado (limites e caminho de erro agora usam padrões).
  - **Importar cURL.**
  - **Envio:** timeout, repetição em erro 5xx, arquivo multipart e cancelar.
- **Removidos** da área avançada: ambientes/variáveis e "extrair da resposta", árvore e busca no JSON, validação por JSON Schema, comparação com resposta anterior, prévia HTML, importação de coleção Postman, exportar/importar "dados avançados", autenticação Basic/API key (use a aba Headers ou Auth), pastas/modelos de verificações e relatório Markdown (o relatório HTML/CSV/JSON da aba Relatório continua). Configurações antigas salvas não são apagadas.
- **Params** agora é uma subaba própria e visível (antes ficava escondida dentro dos testes avançados).
- **Correções:** a execução em lote falhava ao iniciar (`ignored is not defined`) e travava os botões; a importação de cURL não reconhecia URL entre aspas nem corpo JSON com aspas duplas e não criava campos novos.
- `request-advanced.js` reescrito de forma legível (≈19 KB, antes ≈36 KB em linhas densas). Testes atualizados.

## v54.2.0 — dia útil com feriados
- Novo filtro/função `dia_util` automático: somar avança para o próximo dia útil, subtrair volta para o anterior (sábado → sexta; sexta feriada → quinta).
- Novas funções: `dia_util_auto`, `dia_util_depois`, `dia_util_antes`, `primeiro_dia_util`, `ultimo_dia_util`, `eh_dia_util`, `eh_feriado`.
- Feriados nacionais e Sexta-feira Santa considerados; campo "Feriados extras" para estaduais/municipais.
- `dias_uteis`, `dias_uteis_entre`, `proximo_dia_util` e `dia_util` passam a pular feriados (antes só fins de semana).
- Select "Dia útil" no painel de variáveis, com explicação em cada opção.

## v54.1.0 — duração por extenso
- Adicionado o filtro `duracao_extenso`: `10 horas e 30 min`, `1 hora e 30 min`, `2 horas`, `30 min`.
- Incluído na lista de ajuda do popup e nos testes.

## v54.0.0 — associação permanente por ID do perfil
- A seleção do mapeamento e as operações de edição, extração e salvamento agora usam o ID estável do perfil, não o nome exibido.
- Histórico, rascunhos da aba Dado e dados salvos com título passam a usar o ID como chave de armazenamento.
- Migração automática dos registros legados indexados pelo nome para o ID correspondente, preservando os dados existentes e dando preferência a registros já associados ao ID.
- Renomear um perfil não altera sua identidade nem rompe a associação com mapeamentos, JSON padrão, histórico, rascunhos ou dados salvos.
- Atualizado o schema interno para a versão 6; os formatos de backup continuam compatíveis.

## v53.0.0 — duração automática em horas e minutos
- Adicionado o filtro `duracao` para cálculos entre horários.
- O filtro ativa a interpretação dos valores `HH:MM` como horários antes da subtração; evita resultados incorretos como `86` para `08:00 - 07:14`.
- Formatação automática: `46 min`, `1h 30 min`, `2h`.
- Incluídos testes para minutos, horas completas, horas + minutos e diagnóstico do filtro.


## v52.0.0 — interface e usabilidade
- **Visual:** tipografia do sistema mais legível, cabeçalho com leve destaque, foco de teclado consistente, botões com resposta ao clique, modais com entrada suave e fundo desfocado, barras de rolagem finas.
- **Caixas JSON:** indicador "JSON válido / inválido" em tempo real, botões **Formatar** e **Copiar**, Tab indenta com 2 espaços.
- **Atalhos:** Alt+1…7 troca de aba, setas navegam entre abas, Ctrl+Enter confirma o modal aberto, Shift+Alt+F formata JSON, **?** mostra a ajuda.
- **Memória:** a última aba aberta é reaberta automaticamente.
- **Acessibilidade:** abas com role="tab"/aria-selected; respeita "reduzir movimento".
- Nenhum dado, formato de backup ou preenchimento foi alterado.

## v51.0.0 — lapidação e backup único
- **Backup único:** o menu agora tem só **💾 Fazer backup** e **♻️ Restaurar backup**. Um arquivo (`mapeador-backup_AAAA-MM-DD_HH-MM.json`) guarda tudo: mapeamentos, pastas, histórico, dados salvos, rascunhos, variáveis, requisições salvas, pessoas geradas, relatório de testes e preferências.
- **Removidos** os fluxos separados "Exportar/Importar mapeamentos" e "Backup das preferências" (a importação de mapeamentos antigos substituía as pastas e perguntava perfil a perfil).
- **Restaurar** continua lendo backups antigos e também os arquivos antigos de mapeamentos e de preferências.
- **Mesclar de verdade:** listas e objetos de qualquer chave (requisições, pessoas, preferências…) são combinados sem apagar o que você já tem; antes, chaves fora da lista conhecida eram sobrescritas.
- A cópia de segurança automática antes de restaurar usa o mesmo formato e nome reconhecível.
- Estado temporário (fila de descoberta, tamanho de janela) deixou de entrar no backup.
- **Lapidação:** removido listener duplicado de Upload JSON (abria o seletor duas vezes), `console.log` de depuração (alguns imprimiam configurações) e versão unificada (manifest, selo v51).

## v50.0.0
- Adicionado botão de remoção em todas as linhas do mapeamento, incluindo campos detectados automaticamente.
- A remoção exclui a configuração do campo e persiste uma lista de campos ocultados no perfil para que não reapareçam ao reabrir ou extrair novamente.
- A exclusão pede confirmação antes de alterar o mapeamento.

# v49 — checkboxes em grupo e menu Mais opções

- **Checkboxes individuais e em grupo:** seletores que apontam para um contêiner com `input[type="checkbox"]` agora resolvem todos os checkboxes descendentes, não apenas o primeiro.
- **Seleção por valores:** ao mapear um grupo, um array com os valores nativos dos inputs (ex.: `["1", "3"]`) marca somente os itens correspondentes e desmarca os demais. Também reconhece ID e texto do label.
- **Checkbox individual:** mantém valores booleanos/textuais (`true`/`false`, `sim`/`não`, etc.) e usa setter nativo como fallback após a interação.
- **Menu Mais opções:** fica sempre abaixo do botão; se faltar espaço, o próprio menu ganha rolagem em vez de abrir para cima.
- **Compatibilidade:** preservados os tipos de mapeamento e os dados salvos.

# v48 — correção no preenchimento de checkboxes

- **Checkboxes:** o preenchimento agora usa o clique nativo do elemento para que formulários controlados por React/Vue recebam a interação corretamente.
- **Fallback:** se o clique não aplicar o estado solicitado, usa o setter nativo de `checked` e dispara `input`/`change`; o preenchimento é marcado como falha se o estado final não corresponder ao valor solicitado.
- **Valores aceitos:** `true`, `1`, `"true"`, `"1"`, `"sim"`, `"yes"`, `"checked"`, `"marcado"`, `"selecionado"` e `"on"` marcam; `false`, `0`, `"false"`, `"não"`, `"no"`, `"unchecked"` e `"desmarcado"` desmarcam.
- **Seletores:** ao mapear um `label`, a extensão agora resolve o checkbox/input associado por `label.control` ou `for`; seletores que apontam diretamente para o input continuam funcionando.
- **Compatibilidade:** preservados os tipos `Form JSON`, `Form` e `Default`, além dos formatos de dados e backups existentes.
- **Validação:** verificação sintática JavaScript e suítes automatizadas existentes. Não foi possível validar em um Chrome real ou no formulário externo nesta execução.

# v47 — revisão geral: segurança de interface e robustez

- **Segurança:** a lista de pessoas geradas agora escapa como texto os valores vindos do armazenamento (nome, CPF, e-mail/cidade e data). Isso impede que conteúdo salvo seja interpretado como HTML ao renderizar a lista.
- **Robustez:** leitura de `pessoasGeradas` valida o formato do armazenamento e evita falha quando a chave estiver ausente ou corrompida; registros sem objeto `dados` e datas inválidas recebem fallback seguro.
- **Preenchimento:** checkboxes e radios agora disparam `input` e `change` após atualizar `checked`, melhorando a comunicação com formulários que dependem de eventos para sincronizar o estado.
- **Identificação:** selo do cabeçalho e versão exibida na tela Sobre sincronizados com a versão do manifesto (47.0.0).
- **Preservação:** não altera o formato nem remove dados de perfis, mapeamentos, histórico, pessoas geradas ou requisições salvas.

**Validação desta versão:** testes automatizados existentes, verificação sintática dos arquivos JavaScript, JSON do manifesto e estrutura HTML. A extensão não foi validada em navegação real do Chrome nem em páginas externas nesta execução.

# Changelog v46

- Corrigido o registro duplicado do evento de clique em **Editar perfil**.
- O modal passa a ser aberto apenas pelo manipulador que carrega o nome e o JSON do perfil selecionado.
- Mantida a lógica de salvamento, os mapeamentos associados e os dados existentes.

# Changelog

## [45.0.0] - 2026-11-04

### Usabilidade
- A seção **Testes avançados** agora fica recolhida por padrão, reduzindo a poluição visual da aba Requisição.
- Adicionado controle expansível acessível por mouse e teclado para mostrar/ocultar os recursos avançados quando necessário.
- Nenhuma funcionalidade, configuração ou dado salvo foi removido; os controles continuam no DOM e são inicializados normalmente.

## v43.0.0 — Núcleo de testes de requisição (parcial)
- Adicionados helpers puros em `request-core.js` para ler linhas JSON/CSV, gerar casos negativos, validar um subconjunto seguro de JSON Schema, comparar respostas JSON e mascarar chaves sensíveis.
- Testes automatizados adicionados para essas funções.
- Os formatos persistidos `requestV22`, `requestProfilesV24` e `requestHistoryV23` não foram alterados.
- **Escopo ainda pendente:** esta entrega não conclui a interface/execução em lote nem os demais itens solicitados (ambientes/encadeamento, árvore de resposta, importação/exportação cURL/Postman, upload/retries/auth, exportação Markdown, modularização/E2E e edição de perfil/mapeamento). Não usar como implementação completa da especificação.

# Histórico de versões

## Versão 42.0.0 — edição de perfis e mapeamentos

- **Editar perfil:** permite alterar nome e JSON padrão do perfil selecionado. Valida JSON e impede nomes duplicados.
- **Preservação do mapeamento:** editar o perfil mantém o mapeamento e as preferências de teste existentes; o JSON editado altera somente os dados padrão do perfil.
- **Editar mapeamento:** abre a aba Mapear com o perfil selecionado para ajustar seletores/regras e salvar pelo fluxo já existente.
- **Compatibilidade:** mantém o formato de armazenamento e os dados existentes; não migra nem descarta perfis, mapeamentos, histórico ou preferências.
- **Validação executada:** `node --check js/popup.js` e os testes existentes `tests/backup.test.js`, `tests/request-core.test.js` e `tests/variaveis.test.js`.
- **Escopo não incluído nesta entrega:** os novos recursos da aba Requisição listados no pedido anterior (lote, casos negativos, ambientes/encadeamento, árvore/schema, importações/organização, upload/auth/retry, exportação Markdown e E2E Playwright) não foram implementados nesta versão. O pacote mantém a funcionalidade da v41 nessa área.


## Versão 41.0.0 — aba Requisição estilo Postman/Insomnia, com validação

### Campos fixos, valores intercambiáveis
- Os campos da requisição **só mudam quando você adiciona, remove, cola um JSON ou usa “Montar da página”** (que agora pede confirmação se já houver campos).
- 👤 Perfil, 🌐 Página e 🧠 Lembrados **só preenchem valores** dos campos existentes; nunca criam nem apagam campos.
- 🌐 Página lê **todos** os valores digitados no formulário e preenche os campos que já existem (campos vazios na página não apagam o que você digitou). O que a página tem e a requisição não aparece como sugestão: “＋ Adicionar à requisição”.
- Novo seletor **＋ Adicionar campos** (modal): 🗺️ Mapeamento · 📦 JSON de dados · 🌐 Página · ✍️ Manual, com filtro, “Todos / Nenhum / Só os que faltam” e opção de trazer os valores.

### Modo teste igual ao do Início
- 🧪 Modo teste abre o mesmo modal do Início (chaves do JSON, Selecionar/Desmarcar todos, Salvar preferências, “Não perguntar novamente”).
- Mesma regra do Início: pergunta na primeira vez; depois usa as preferências salvas. As preferências são **as mesmas do perfil** (valem nas duas abas).

### Interface de cliente HTTP
- Método colorido, atalho Ctrl/Cmd+Enter, avisos em barra própria (não misturam mais com a resposta).
- Headers em tabela (ligar/desligar por linha, headers comuns prontos), campo Bearer token, tipo e “obrigatório ★” por campo, filtro de campos.
- Resposta com status colorido, tempo, tamanho, JSON formatado/colorido ou bruto, aba de headers, aba “Enviado” e download.
- Histórico reabre a requisição completa (campos, headers e verificações), com resultado das verificações.
- Variáveis `{{ }}` (ex.: `{{hoje}}`, `{{nome | maiusculas}}`) resolvidas em URL, valores, token e headers no envio.

### Validação
- **Avisos antes de enviar** (não bloqueiam; você pode estar testando dados inválidos): obrigatório vazio, número/JSON inválido, nome duplicado, variável sem valor. Só URL ou headers impossíveis de usar impedem o envio.
- **Verificações da resposta** (aba Validação): status, tempo, campo do JSON (`errors.cpf`), corpo e headers, com atalhos como “Validação falhou (422)” e “Erro no campo…”.
- O resultado (✅/❌) vira **Aprovado/Reprovado** automático no Relatório, que também exporta as verificações (HTML e CSV).

### Técnico
- Novo `js/request-core.js` (lógica pura) e `tests/request-core.test.js`.
- `MapeadorApp.saveTestSettings` exposto para a Requisição gravar as preferências de teste.
- Corrigido seletor CSS que dava aparência de caixa de status aos botões de origem.

## Versão 16.0.0 — atualização conservadora

## Implementado
- Manifest atualizado, ícone e dados da versão 15 preservados.
- Prevenção de execuções simultâneas e preenchimento duplicado do mesmo elemento em uma operação.
- Relatório com total, preenchidos, ignorados, não encontrados e falhas com motivo.
- Proteção contra substituição direta do DOM de editores ricos no último recurso.
- Exportação de backup com remoção recursiva de chaves sensíveis conhecidas e metadados da versão 16.
- Melhorias pontuais de legibilidade e foco no popup.

## Pendências (não afirmar como concluídas)
- Seleção visual de campos, prévia individual, mesclagem/restauração completa de backup, favoritos e rascunhos.
- Suporte abrangente a iframes e Shadow DOM, testes reais no Outlook e testes de integração no Chrome.
- Testes de regressão de toda a interface e fluxos de importação/restauração.

## Atenção
O backup v16 continua exportando dados persistentes desconhecidos; a filtragem de nomes sensíveis é uma mitigação, não garantia de ausência de segredos. Revise o JSON antes de compartilhar.
Instale como extensão descompactada para testar antes de substituir a v15. Faça backup dos dados antes de atualizar.

## Atualização de usabilidade: descoberta de campos
- Nova área **Descoberta de campos** na aba Mapear.
- Botão **Analisar página** lista até 500 campos acessíveis, com rótulo, seletor, correspondências e indicação de Shadow DOM.
- Botão **Selecionar visualmente** destaca campos na página; clique para selecionar, Escape para cancelar. O seletor escolhido fica salvo temporariamente e é carregado ao reabrir o popup.
- O botão **Usar seletor** transfere o CSS ao campo manual existente, sem alterar o formato dos mapeamentos armazenados.
- Restrições: campos em iframes não são agregados à lista do frame principal; raízes Shadow DOM fechadas não são acessíveis; seletores em Shadow DOM requerem suporte do mecanismo de preenchimento para o contexto do host. O recurso não lê valores digitados.
- Testes funcionais no Chrome e regressão com dados reais continuam pendentes. Verificações realizadas: sintaxe JS, JSON do manifesto e integridade ZIP.

## v17
- Tema adaptável: Automático (segue o sistema), Claro e Escuro — botão ◐ no cabeçalho, sincronizado entre popup, janela e painel flutuante.
- Descoberta: filtro de campos, ver na página (👁 / passar o mouse), copiar seletor, navegação por setas/Enter, marcação ✓ dos campos usados, ordenação (visíveis e alta qualidade primeiro).
- Seleção visual: modo "Vários" (seleciona em sequência até Esc), lista de selecionados, popup fecha sozinho ao iniciar a seleção.
- Correções: páginas protegidas do navegador com mensagem clara, botão Analisar bloqueado durante a análise.

## v17.1 — popup/iframe 760×760 e redimensionável
Duas formas de popup:
1. **Painel flutuante** (iframe na página, botão ↗): abre em **760×760** (reduz só se a janela do navegador for menor), com alças em todas as bordas e cantos para ajustar o tamanho. Duplo clique numa alça volta a 760×760. O tamanho escolhido é lembrado em todas as abas/sites. O botão ⤢ dentro do painel alterna tela cheia / restaurar.
2. **Janela separada** (botão ⤢ no popup do Chrome): abre com área interna de **760×760** (a moldura do sistema é compensada) e lembra o último tamanho usado; redimensiona pelo sistema.

Botão lançador (ícone redondo): agora vive em Shadow DOM, preso ao `<html>` — o CSS da página e a troca do `<body>` em SPAs não o escondem mais.

Outras correções no painel: não grava mais tamanho 0 ao fechar com o painel oculto; o popup.html só carrega na primeira abertura; comandos `postMessage` só são aceitos do próprio iframe; arraste do cabeçalho usa coordenadas de tela (sem tremor).
Arquivos alterados: js/content.js, js/popup.js, js/janela.js, popup.html.

## v19.0 — campos com máscara

## Problema
O content script roda em "mundo isolado": `input.inputmask`, `jQuery.data('mask')` etc. ficam invisíveis
(a v18 tinha um `console.log` de `input.inputmask` que sempre dava `false`, e ele ainda lia `textValue` antes
de declará-lo no ramo de data, gerando erro).

## O que mudou
- `js/mask-bridge.js` (novo, `world: "MAIN"`): lê a máscara real da página (Inputmask, jQuery Mask, jQuery MaskedInput) e aplica o valor pela API da biblioteca.
- `content.js`: `detectMask()` (biblioteca, atributos `*mask*`, classes tipo cpf/cnpj/cep/telefone, placeholder `__/__/____`) e `fillMaskedField()` em camadas, conferindo o resultado a cada passo:
  1. API da biblioteca → 2. valor + eventos → 3. inserção de texto → 4. digitação tecla a tecla (completa e só alfanumérica) → 5. aceita ajuste da máscara ou falha.
- Rede de segurança: se um campo sem máscara declarada "devolve" outro valor, o fluxo de máscara roda automaticamente.
- Relatório mostra como cada campo mascarado foi preenchido (sem exibir valores). Descoberta de campos mostra 🎭 + máscara.
- `frames.js`: ao reinjetar em iframes, injeta também a ponte MAIN.

## Teste
Recarregue a extensão em chrome://extensions e **recarregue a aba do Zeev** (a ponte só entra em páginas carregadas após a atualização). Teste os campos de CPF, data, telefone e valor.
Não consegui rodar no Chrome real aqui: validei sintaxe JS e JSON do manifest.

## v20 — Redesenho visual

- Nova camada de design `css/v20-design.css` (carregada por último), sem mudar funcionalidades.
- Paleta "Studio": papel quente + tinta grafite + destaque esmeralda; modo escuro equivalente.
- Navegação com ícones e nomes curtos: Início · Mapear · Organizar · Dados · Gerar.
- Textos mínimos de 11,5px (antes 8–10px), botões e campos com 36px de altura.
- Hierarquia clara de botões: verde = ação principal, contorno = secundária, vermelho só no contorno = destrutiva.
- Guia de 3 passos (Escolher → Adicionar dados → Preencher) mais limpo.
- Correção: a dica de fluxo e a prévia do perfil apareciam em todas as abas; agora só em Início.
- Estilos fixos espalhados no HTML foram removidos e centralizados no CSS.
- Cor de destaque padrão: Esmeralda (as outras cores das Preferências continuam funcionando).

## Versão 21

- Geração 4Devs dividida em lotes sequenciais de até 30 pessoas por solicitação.
- Exemplo: 75 pessoas = 30 + 30 + 15.
- Verificação da quantidade retornada em cada lote; erros interrompem o processamento.
- Histórico não descarta automaticamente pessoas acima de 50 registros.
- Limite do campo de quantidade ajustado para 10.000.


## v29 — Requisição mais simples e código organizado
- Requisição: não é mais preciso escolher perfil. O mapeamento escolhido em Início (ou o salvo para a página atual) é usado automaticamente.
- Botão único "Montar a partir da página": captura destino, método e campos e já aplica os valores do mapeamento.
- Método + URL + Enviar na mesma linha; Enter na URL envia. Requisições salvas abrem ao escolher na lista; ações extras no menu ⋯.
- Confirmação antes de enviar opcional (Opções) e nunca pedida para GET.
- Arquivos de versões antigas removidos: CSS unificado em css/app.css e css/request.css; scripts renomeados sem número de versão; notas reunidas neste arquivo.
- Dados salvos das versões anteriores (rascunho, requisições salvas, histórico, relatório) continuam sendo lidos.

## v30.2
- O cálculo com horários agora só acontece quando você pede a conversão: use `{{fim - inicio | h}}` (ou `| hora` / `| horas`) e o resultado sai em HH:MM (ex.: 8h e 8:32h = 00:32).
- Sem o `| h`, todo valor é tratado como número comum, como nas versões anteriores.

## v30.1
- Cálculos com horários (8h, 8:32, 8:32h, 8h32): subtração/soma em minutos e resultado em HH:MM (ex.: {{fim - inicio}} com 8h e 8:32h = 00:32). A partir da v30.2 isso exige o `| h`.

## v31 — Variáveis com mais cálculos e conversões
- Novo motor em `js/variaveis.js` (sem eval), com guia completo em `VARIAVEIS.md`.
- Funções: `se`, `arred`, `piso`, `teto`, `min`, `max`, `soma`, `media`, `pct`, `aleatorio`, `vazio`, `juntar`, `tamanho`; comparações e `e`/`ou`/`nao`.
- Datas: `{{hoje + 30}}`, diferença em dias, `dias_uteis`, `meses`, `anos`, `idade`, `fim_mes`; novas automáticas (data por extenso, início/fim do mês, próximo dia útil...).
- Horas: além de `| h`, agora `| min` e `| horas_dec`.
- Filtros encadeáveis: moeda (R$/US$/€), milhar, %, extenso e extenso em reais, maiúsculas/título/primeiro nome/iniciais, máscaras de CPF/CNPJ/CEP/telefone, só números, valor padrão, zeros à esquerda, etc.
- Atalhos novos no editor de valor (Cálculos, Datas, Conversões).
- Compatível: `{{cor|Azul|Verde}}`, `{{a + b}}` e `{{fim - inicio | h}}` continuam iguais.
- Testes: `node tests/variaveis.test.js` (38 cenários). Não testado no Chrome real.

## v32 — Dado no backup, variáveis mais robustas e interface mais clara
**Backup**
- O rascunho da aba **Dado** ficava no `localStorage` e por isso **não entrava no backup**. Agora fica em `chrome.storage.local` (chave `dadoDraft2`); rascunhos antigos são migrados sozinhos na primeira abertura.
- O backup (formato v3, ainda lê v2) traz um `resumo` e inclui: mapeamentos, pastas, histórico de JSONs, dados salvos com título, rascunhos do Dado, variáveis lembradas e atalhos recentes. Nomes de campos como `senha`/`token` **dentro dos dados** não são mais removidos (fora dos dados a filtragem de chaves sensíveis continua).
- Restauração: novo diálogo com o que há no arquivo × o que há agora, opção Mesclar/Substituir e cópia de segurança automática. A mesclagem agora é inteligente para histórico (por id), dados salvos (por título, vence o mais novo), rascunhos, variáveis e atalhos — antes, `dadosSalvos` e afins eram sobrescritos por inteiro.
- `js/backup.js` concentra exportar + restaurar (o exportador antigo saiu do `popup.js`).

**Variáveis**
- Qualquer filtro vira função (`maiusculas(nome)`, `esquerda(cpf, 3)`); novas funções (`dia_util`, `dias_uteis_entre`, `contem`, `seerro`, `escolher`, `cpf_valido`…) e filtros (`valor`, `data_curta`, `mes_ano`, `rg`, `sim_nao`…); mais apelidos.
- Diagnóstico com sugestão de correção, dica de tipo por variável e valor padrão pré-preenchido.
- Correções: `1.500` = 1500; `vazio()` de variável sem valor; literais como `{{1234,56 | extenso}}` não são mais perguntados.

**Interface**
- Editor de valor: prévia ao vivo de cada `{{ }}`, avisos de erro, busca nos atalhos, mais atalhos; confirmação ao salvar com erros.
- Janela de perguntas: tipo esperado, validação leve, atalhos de últimos valores, prévia por campo, Enter → próxima, "Esquecer valores lembrados".
- Selo de versão do cabeçalho corrigido (mostrava v29).

Testes: `node tests/variaveis.test.js` (65 casos) e `node tests/backup.test.js`. Interface e backup verificados em Chromium headless com a API `chrome.*` simulada; **não** testado na extensão real instalada nem no Zeev.

## v32.1 — Requisição: criar campos a partir do formulário da página
- Novo botão **📋 Campos da página** na aba Campos da Requisição. Lista os campos de **cada formulário** da aba atual (e os campos soltos fora de `<form>`) com tipo, rótulo e valor atual.
- Mostra também o que o `FormData` esconderia: checkbox/radio sem marcação, campos desabilitados e campos sem `name` (usa o `id`). Você marca quais criar; filtro, Todos/Nenhum e "Trazer os valores atuais da página" (desmarque para criar só os nomes).
- Campos que o navegador não enviaria entram **desativados** (caixa desmarcada), prontos para ativar. Se há mapeamento ativo, os valores dele são aplicados aos campos novos. Campos já existentes não são sobrescritos.
- Ao adicionar, "Formulário da página" (Opções) passa a apontar para o formulário escolhido e, se a URL estiver vazia, ela e o método vêm da ação do formulário.
- Senhas têm o valor **não lido**; campos de arquivo são listados mas não podem ser adicionados.
- Correção: campos com vários valores (checkboxes de mesmo nome, `select multiple`) agora são enviados como valores repetidos, e não como um texto `["a","b"]`; a pré-visualização também mostra todos.
- Limitação: lê só o documento principal da aba (iframes e Shadow DOM fechado não entram). Testado em Chromium headless com `chrome.*` simulado; não testado na extensão instalada.

## v32.2 — Variáveis: lista com repetição
- Nova variável `{{ repetição('-') }}`: ao preencher, a janela de perguntas mostra uma **lista dinâmica** (＋ Adicionar item, × remover, Enter adiciona outro item, Backspace em item vazio remove). Cada item sai numa linha com o prefixo (`- Mateus`, `- Teste`…). Sem limite de itens.
- Argumento opcional de título: `{{ repetição('*', 'Participantes') }}` — repetições com títulos diferentes são listas independentes; iguais compartilham os itens. Filtros valem por item (`| maiusculas`). Aceita `repeticao` sem acento e aspas simples, duplas ou curvas.
- Editor de valor: prévia ao vivo da lista, erro claro para aspas/parêntese faltando, grupo **🔁 Listas** nos atalhos e botão **Lista com repetição** em ➕ Criar.
- Motor em `js/variaveis.js` (`parse` → `kind: "repeat"`; itens ficam em `values["lista:<título ou prefixo>"]`, um por linha); modal em `js/popup.js`; estilos em `css/app.css`.
- Testes: `node tests/variaveis.test.js` ganhou os casos de repetição. Não testado na extensão instalada nem no Zeev.

## v33 — Variáveis: lista de editor
- Nova variável `{{ lista('-') }}`: igual à repetição (lista dinâmica na janela de perguntas, título opcional, filtros por item), mas **cola como lista de editor**. Em editores de texto (`contenteditable`, inclusive dentro de iframes, como TinyMCE/CKEditor 4) vira `<ul><li>` de verdade; `lista('1.')` vira lista numerada (`<ol>`); em `<textarea>`/`<input>` vira linhas `- item` / `1. item`.
- Colagem em camadas (`js/content.js`): 1) `insertHTML`; 2) colagem simulada com `text/html` (editores com framework); 3) texto simples com marcadores se o editor recusar lista (o relatório indica). Em editores com assinatura (`id="Signature"`), a assinatura é preservada intacta (o `insertHTML` sozinho a fundia com o último parágrafo).
- O popup envia a lista entre marcas privadas (`U+E000…U+E002`) só no preenchimento; prévias, janela de perguntas e cópias continuam mostrando `- item`. `{{ repetição() }}` não mudou e nunca usa as marcas. Itens de `lista` ficam em `values["itens:<título ou marcador>"]` (os de repetição continuam em `"lista:…"`).
- Editor de valor: grupo **📋 Lista de editor** nos atalhos, botão **Lista de editor** em ➕ Criar, prévia e diagnóstico (`Use lista('-') — confira as aspas…`). Selo de versão: v33.
- Testes: `node tests/variaveis.test.js` ganhou os casos de `lista` (91 casos). Verificado em Chromium headless (`content.js` real): editor vazio, com conteúdo, com assinatura, iframe com `<body contenteditable>`, editor que só aceita colagem, editor que recusa lista, `<textarea>`, `<input>`, lista numerada e itens com HTML (escapados); e o popup real (Preencher → janela de perguntas → valores enviados) com `chrome.*` simulado. **Não** testado na extensão instalada nem no Zeev.

## v33.1 — Requisição: chaves com colchetes (`nome[]`) no envio JSON
- Corrige o caso `"c_comunicacao[]": "2"` enviado como JSON: o Laravel procura `c_comunicacao`, não `c_comunicacao[]`, e respondia "Selecione pelo menos um meio de comunicação".
- No formato **JSON**, chaves no estilo PHP são convertidas: `nome[]` → `nome: ["2"]` (sempre array, mesmo com um só valor); `a[b]` → `a: { b }`; `a[0]`, `a[1]` → lista.
- No editor, campos cujo nome termina em `[]` passam a guardar sempre uma lista (capturados, do mapeamento, do seletor de campos e do rascunho).
- A prévia mostra o corpo JSON já convertido; o cURL copiado usa o mesmo formato.
- Em **URL encoded** e **multipart** nada muda: a chave `nome[]` continua sendo enviada repetida, como o navegador faz.

## v34
- **Requisição › Campos:** novo seletor de **tipo** ao lado de cada campo (Texto, Número, Booleano, Lista, Objeto JSON, Nulo). O tipo é identificado automaticamente pelo valor (ex.: `42` → Número, `true` → Booleano, `[...]` → Lista; `0123` continua Texto) e você pode trocá-lo. Tipo trocado manualmente fica destacado, é mantido ao editar o valor e salvo no rascunho e nas requisições salvas.
- No corpo **JSON** os valores seguem o tipo escolhido (número sem aspas, `true/false`, `null`, arrays e objetos). Em FormData/URL encoded são enviados como texto equivalente.
- **Início › Mais opções:** menu reorganizado em grupos (Perfil, Dados JSON, Mapeamentos e backup, Outros), com rolagem própria, abre para cima quando falta espaço, fecha com Esc e usa duas colunas em telas largas.
- Responsividade: linha de campo em duas linhas em telas estreitas; botões principais empilham abaixo de 380px.

## v35 — Requisição com o mesmo visual de Mapear
- **Aba Requisição** reorganizada com os mesmos componentes da aba Mapear: cartão de requisição salva (como o seletor de JSON), painéis **Montar campos** e **Dados para preencher** (como "Descoberta de campos", com linha de status), cartão **método + URL + Enviar**, lista de campos em cartões (como os itens do mapeamento), barra de contagem (**Campos / Ativos / Mapeados**) e grupo de botões no rodapé (**🤖 Aplicar mapeamento · 💾 Salvar requisição · 🗑️ Limpar**).
- Sub-abas (Campos, Headers, Token, Opções, Histórico, Relatório) com o desenho da navegação principal; painéis secundários e a **Resposta** em cartões.
- Aba Requisição ganhou ícone na navegação; menu ⋯ sem a moldura de cartão herdada do tema.
- Botão **Limpar** (mesma ação de "Nova requisição"); passos numerados removidos.
- IDs e lógica de envio preservados; `js/request.js` só ganhou a contagem e o botão Limpar. Claro/escuro verificados em Chromium headless com `chrome.*` simulado; não testado na extensão instalada.


## v44 — Requisição: ferramentas avançadas integradas
- **Execução em lote:** JSON e CSV (vírgula, ponto e vírgula ou tabulação), ou pessoas lembradas; execução sequencial, intervalo configurável, botão de parar entre requisições, tabela de status/tempo/verificações e exportação CSV. Os campos continuam fixos: somente chaves já cadastradas recebem valores; chaves desconhecidas são ignoradas e contabilizadas, sem criar/remover campos.
- **Casos negativos:** gera vazio, espaços, texto longo, tipo incorreto, caracteres especiais e limites numéricos para os campos escolhidos; expectativa configurável de HTTP e caminho JSON; registra o resultado no relatório existente.
- **Ambientes e encadeamento:** variáveis `{{nome}}` aplicáveis à URL e aos valores dos campos existentes; extração por caminho JSON da última resposta para variável reutilizável. Segredos de autenticação não são persistidos no armazenamento de ambientes.
- **Params:** editor de parâmetros que sincroniza a query string da URL.
- **Resposta:** árvore JSON recolhível com busca, criação assistida de verificação a partir de valor, validação de JSON Schema (tipos, required, properties, enum, const, limites, pattern, formatos email/date-time/uri, allOf/anyOf/oneOf/not), comparação com resposta anterior e visualização HTML em iframe com `sandbox` sem permissões de script.
- **Importação/organização:** importação cURL; importação de todos os itens de uma coleção Postman v2.1 para Requisições salvas; pastas para requisições salvas; modelos reutilizáveis de verificações; backup/importação dos dados avançados.
- **Envio:** timeout com AbortController e botão para cancelar requisição ativa; repetição configurável em erros de rede/HTTP 5xx; autenticação Basic e API key em header ou query; upload multipart com limite de 8 MB e conversão em memória.
- **Relatórios:** exportação Markdown, severidade selecionável por caso, opção “falha esperada” (HTTP não-2xx pode ser aprovado quando configurado) e diferenças esperado × obtido nas verificações negativas. O relatório HTML existente continua disponível.
- **Privacidade:** histórico mascara chaves de token, segredo, senha, autenticação, API key e parâmetros de chave configurados; arquivos e credenciais de autenticação ficam somente em memória durante o uso.
- **Compatibilidade:** preservadas as chaves `requestV22`, `requestProfilesV24` e `requestHistoryV23`; metadados de pasta são campos adicionais opcionais nas requisições salvas. Edição de perfil e mapeamento permanece disponível na aba Início/Mapear, preservando o mapeamento ao editar o JSON do perfil.
- **Testes:** `node tests/request-core.test.js`, `node tests/request-advanced.test.js`, `node tests/variaveis.test.js` e `node tests/backup.test.js`; cobrem CSV delimitado, cabeçalhos duplicados, limites numéricos, JSON Schema, mascaramento, IDs/controles da interface, sandbox do HTML e compatibilidade de armazenamento.

**Limitações conhecidas da v44:** a importação Postman cria todas as requisições como salvas, mas não converte variáveis de coleção/ambiente Postman nem scripts pré/pós-request; importação cURL cobre URL, método, headers e corpo JSON simples, não todos os operadores cURL; JSON Schema implementa um subconjunto útil do padrão, não toda a especificação Draft 2020-12; o botão Parar interrompe o lote após a requisição atual, enquanto Cancelar requisição ativa aborta a chamada em andamento; repetição é aplicada a falhas de rede e HTTP 5xx; arquivos acima de 8 MB são recusados para evitar consumo excessivo de memória. O layout recebeu CSS responsivo para largura de popup (~760 px), tema herdado claro/escuro e painel flutuante; a modularização avançou com `request-advanced.js`, mantendo o núcleo puro em `request-core.js` e o relatório em `request-report.js`, mas a extração integral do legado `request.js` ainda não foi concluída. Não houve teste E2E Playwright real nesta execução porque o runtime Playwright não está disponível neste ambiente; os testes de lógica e as verificações estáticas foram executados.
