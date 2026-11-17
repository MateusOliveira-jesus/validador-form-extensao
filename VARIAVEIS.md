# Guia das variáveis {{ }} — v33

Formato geral: `{{ conteúdo | filtro | filtro:argumento }}`. Os filtros são aplicados da esquerda para a direita.

## 1. Perguntas e listas (como antes)
- `{{nome}}` pergunta na hora · `{{cor|Azul|Verde}}` lista de opções.
- Se depois do `|` vier um **filtro conhecido**, ele vira conversão: `{{nome | maiusculas}}` pergunta "nome" e preenche em maiúsculas.

## 2. Contas
`+ - * / % ^` e parênteses. Números aceitam vírgula (`0,9`) e valores como `R$ 1.234,56`.
- `{{preco * qtd}}` · `{{total * 0,9 | 2}}` (2 casas) · `{{(a + b) / 2}}`
- Comparações: `> < >= <= == !=` · lógica: `e`, `ou`, `nao`
- Separe argumentos de funções com `, ` (com espaço) ou `;`.

### Funções
| Função | Exemplo | Resultado |
|---|---|---|
| `se(cond, sim, não)` | `{{se(total > 1000, "Alto", "Baixo")}}` | Alto |
| `arred(x, casas)` / `piso` / `teto` / `inteiro` / `abs` / `raiz` | `{{arred(10 / 3, 2)}}` | 3,33 |
| `min`, `max`, `soma`, `media` | `{{media(n1, n2, n3)}}` | |
| `pct(valor, %)` | `{{pct(salario, 8)}}` | 8% do salário |
| `aleatorio(min, max)` | `{{aleatorio(1, 6)}}` | |
| `vazio(x)` | `{{se(vazio(obs), "-", obs)}}` | |
| `juntar(a, " ", b)` | `{{juntar(nome, " - ", cpf)}}` | |
| `tamanho(texto)` | `{{tamanho(cpf)}}` | 11 |

## 3. Datas
Datas `dd/mm/aaaa` ou `aaaa-mm-dd` são reconhecidas sozinhas.
- `{{hoje + 30}}` → daqui a 30 dias · `{{vencimento - 5}}`
- `{{fim - inicio}}` → nº de dias entre datas
- `{{dias_uteis(hoje, 5)}}` (pula sábado/domingo) · `{{meses(hoje, 1)}}` · `{{anos(admissao, 1)}}`
- `{{idade(nascimento)}}` · `{{fim_mes(hoje)}}` · `{{dias_entre(a, b)}}` · `{{data(25, 12, 2026)}}`
- Automáticas novas: `{{data_extenso}}`, `{{mes_extenso}}`, `{{inicio_mes}}`, `{{fim_mes}}`, `{{proximo_dia_util}}`, `{{hora_seg}}`, `{{timestamp}}`.

## 4. Horas (só com filtro de hora)
- `{{fim - inicio | h}}` → HH:MM (aceita 8h, 8:32, 8h32)
- `{{fim - inicio | min}}` → minutos (570) · `{{fim - inicio | horas_dec}}` → 9,50
- `{{(fim - inicio) * 2 | h}}` · `{{horas(1,5) + inicio | h}}`

## 5. Filtros de conversão
**Horas:** `h` (HH:MM), `min` (total de minutos), `horas_dec` (decimal), `duracao` (unidade automática: `46 min`, `1h 30 min`, `2h`). `duracao_extenso` (por extenso: `30 min`, `1 hora e 30 min`, `10 horas e 30 min`).

**Números:** `2` (casas), `moeda` (R$ 1.234,56), `usd`, `eur`, `milhar`, `pct`, `ponto` (10.5), `inteiro`, `arred:1`, `zeros:6`, `extenso`, `extenso_reais`.
**Datas:** `data` (dd/mm/aaaa), `iso` (aaaa-mm-dd), `data_extenso`, `dia_semana`, `mes_extenso`, `dia`, `mes`, `ano`, `idade`.
**Textos:** `maiusculas`, `minusculas`, `titulo`, `capitalizar`, `aparar`, `sem_acentos`, `slug`, `primeiro_nome`, `ultimo_nome`, `sobrenome`, `iniciais`, `esquerda:3`, `direita:4`, `limite:50`, `trocar:de:para`, `prefixo:texto`, `sufixo:texto`, `padrao:texto` (usa o texto se vazio).
**Documentos:** `numeros` (só dígitos), `cpf`, `cnpj`, `cep`, `telefone`, `mascara:###.###`.

## Cenários prontos
- Valor por extenso em contrato: `{{valor | moeda}} ({{valor | extenso_reais}})`
- Parcela: `{{total / parcelas | moeda}}`
- Desconto condicional: `{{se(total >= 500, total * 0,95, total) | moeda}}`
- Vencimento em 10 dias úteis: `{{dias_uteis(hoje, 10)}}`
- Converter data para sistemas que pedem ISO: `{{nascimento | iso}}`
- Maioridade: `{{se(idade(nascimento) >= 18, "Sim", "Não")}}`
- Horas extras: `{{fim - inicio - 8:00 | h}}` · em decimal: `{{fim - inicio | horas_dec}}`
- Nome em crachá: `{{nome | primeiro_nome | maiusculas}}` · Iniciais: `{{nome | iniciais}}`
- CPF só números para o sistema: `{{cpf | numeros}}`; formatado: `{{cpf | cpf}}`
- Campo opcional: `{{complemento | padrao:S/N}}`
- Código com zeros: `{{matricula | zeros:8}}`

## Novidades da v32
**Qualquer filtro também funciona como função**, dentro de contas: `{{se(contem(nome, "silva"), maiusculas(nome), nome)}}`, `{{esquerda(cpf, 3)}}`, `{{moeda(total)}}`.

| Novo | Exemplo |
|---|---|
| `dia_util(data)` — se cair em sáb/dom, vai para segunda | `{{dia_util(hoje + 30)}}` |
| `dias_uteis_entre(a, b)` | `{{dias_uteis_entre(inicio, fim)}}` |
| `inicio_mes(d)` · `ultimo_dia(d)` · `proximo_dia_util(d)` | `{{inicio_mes(hoje)}}` |
| `contem(texto, trecho)` · `comeca(texto, trecho)` (ignoram acentos/maiúsculas) | `{{se(contem(nome, "silva"), "S", "N")}}` |
| `seerro(conta, alternativa)` | `{{seerro(a / b, 0)}}` |
| `escolher(n, a, b, c)` | `{{escolher(2, "um", "dois", "três")}}` → dois |
| `cpf_valido(x)` · `cnpj_valido(x)` (1 ou 0) | `{{se(cpf_valido(cpf), "ok", "inválido")}}` |
| `mod(a, b)` · `potencia(a, b)` · `numero(x)` · `texto(x)` · `repetir(x, n)` | |
| Filtros: `valor` (1.234,56 sem R$), `data_curta` (dd/mm/aa), `mes_ano` (mm/aaaa), `rg`, `cartao`, `sem_espacos`, `inverter`, `contar`, `sim_nao`, `repetir:n` | `{{total | valor}}` |
| Apelidos: `maiuscula`, `minuscula`, `trim`, `so_numeros`, `valor_extenso`… | `{{nome | maiuscula}}` |

**Números digitados.** `1.500` agora vale **1500** (padrão brasileiro: ponto + exatamente 3 dígitos). `0.500` e `1.5` continuam decimais; `1,234,567` (inglês) vale 1234567. Dentro de uma conta, um número escrito direto continua com ponto decimal (`{{x * 1.5}}`).

**Correções.** `vazio(x)` agora é verdadeiro também para variável sem valor (`{{se(vazio(obs), "-", obs)}}` funciona). Valor literal como `{{1234,56 | extenso_reais}}` não é mais perguntado.

**Valor padrão que já aparece preenchido.** `{{cidade | padrao:São Paulo}}` pergunta "cidade" já com "São Paulo" na caixa.

## Listas com repetição (v32.2)
`{{ repetição('-') }}` cria uma **lista dinâmica**: ao preencher, a janela de perguntas mostra a lista com o botão **＋ Adicionar item**, e você coloca quantos itens quiser. Cada item sai **numa linha**, com o prefixo na frente (o espaço depois do prefixo é automático).

Modelo: `Participantes:` + quebra de linha + `{{ repetição('*') }}` — e, ao preencher, os itens `Mateus`, `Teste` e `Teste` resultam em:

```
Participantes:
* Mateus
* Teste
* Teste
```

- **Prefixo:** qualquer texto entre aspas — `'-'`, `'*'`, `'•'`, `'→'`, `'(  )'`. Com `''` os itens saem sem prefixo (só uma linha cada). `repetição()` sem nada usa `-`.
- **Título (opcional):** `{{ repetição('-', 'Participantes') }}` dá nome à lista na janela de perguntas. Duas repetições **iguais** (mesmo prefixo e título) compartilham os mesmos itens; para ter **listas independentes**, dê títulos diferentes.
- **Filtros por item:** `{{ repetição('-') | maiusculas }}`, `| titulo`, `| cpf`… valem para cada item.
- **Sem acento também funciona:** `repeticao('-')`. Aspas simples, duplas e "curvas" são aceitas.
- **Teclado:** Enter num item preenchido adiciona outro logo abaixo · Backspace num item vazio o remove · Enter num item vazio vai para o próximo campo (ou preenche, se for o último) · itens vazios são ignorados.
- A lista fica **sem itens** → o `{{ }}` some (resultado vazio). Os últimos itens usados ficam lembrados, como as demais variáveis (🧹 Esquecer valores lembrados limpa).
- O campo da página precisa aceitar várias linhas (`<textarea>`) para os itens ficarem um embaixo do outro. Num campo de **uma linha só** (`<input>`), o preenchimento troca as quebras por espaço: `- Mateus - Teste - Teste`.
- Limitação: o prefixo não pode conter `|`, `{` nem `}`.

## Lista de editor (v33)
`{{ lista('-') }}` funciona **igual à repetição** — a janela de perguntas mostra a lista com **＋ Adicionar item** e você coloca quantos itens quiser — mas o resultado é colado **como uma lista de editor**:

- **Campo de editor de texto** (`contenteditable`: Zeev, TinyMCE, CKEditor, Outlook/Gmail na web, etc.): vira uma **lista de verdade** (`<ul><li>…</li></ul>`), igual a clicar no botão de marcadores. O texto em volta (por exemplo `Participantes:`) fica como parágrafo, antes/depois da lista.
- **Campo de texto simples** (`<textarea>` / `<input>`): vira linhas `- item` (num `<input>` de uma linha só, `- a - b - c`).
- Se o editor **não aceitar** lista, o preenchimento cai para linhas de texto com o marcador e o relatório avisa: *“lista como texto — o editor não aceitou lista”*.

Modelo: `Participantes:` + quebra de linha + `{{ lista('-') }}` — com os itens `Mateus`, `Teste` e `Teste`:

```
Participantes:
• Mateus
• Teste
• Teste
```
(num editor, os `•` são os marcadores reais da lista; em campo simples saem como `-`.)

- **Marcador:** `lista()`, `lista('-')`, `lista('*')`, `lista('•')` → lista de **marcadores** (o marcador vale só para o texto simples; o editor usa o dele). `lista('1.')` ou `lista('1)')` → lista **numerada** (`<ol>`; em texto simples sai `1. a`, `2. b`…).
- **Título (opcional):** `{{ lista('-', 'Participantes') }}` dá nome à lista. Listas iguais (mesmo marcador e título) compartilham os itens; use títulos diferentes para listas independentes.
- **Filtros por item:** `{{ lista('-') | maiusculas }}`, `| titulo`, `| cpf`…
- Mesmo teclado da repetição (Enter adiciona item, Backspace num item vazio remove, itens vazios ignorados). Sem itens → o `{{ }}` some.
- `lista` e `repetição` **não compartilham itens** entre si (mesmo com o mesmo prefixo). Use `repetição` quando quiser sempre texto puro com prefixo; use `lista` quando o campo é um editor e a lista deve ser de verdade.
- Prévias e a janela de perguntas mostram a lista como `- item`; a lista de verdade só acontece ao preencher o editor.
- Limitação: o marcador não pode conter `|`, `{` nem `}`. Em editores muito customizados a colagem de lista pode não pegar — nesse caso cai para texto (veja acima).

### Na interface
- **Editor de valor:** cada `{{ }}` mostra, ao vivo, o resultado (com os últimos valores usados), o que será perguntado e avisos como *"maiusculs" não é um filtro conhecido — quis dizer | maiusculas?*, função inexistente ou parêntese aberto. Ao salvar com erro, pede confirmação. Há busca nos atalhos.
- **Janela de perguntas:** mostra o tipo esperado (📅 data, 🔢 número, 🕒 hora, 🪪 CPF/CNPJ), avisa se o valor não bate (sem bloquear), tem atalhos com os últimos valores usados e "hoje", e uma prévia de como cada campo vai ficar. **Enter** vai para a próxima, **Shift+Enter** quebra linha, **Ctrl+Enter** preenche. "🧹 Esquecer valores lembrados" apaga o que foi guardado.

Testes automáticos: `node tests/variaveis.test.js` e `node tests/backup.test.js`.

## Dia útil: fim de semana e feriado
Feriados nacionais (01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12) e a Sexta-feira Santa já contam como não úteis. Carnaval e Corpus Christi são ponto facultativo e **não** entram. Feriados estaduais/municipais: campo **Feriados extras** no painel de variáveis (`dd/mm` vale todo ano, `dd/mm/aaaa` só naquele ano).

- **Automático (segue a conta):** `{{data + 30 | dia_util}}` avança para o próximo dia útil · `{{data - 30 | dia_util}}` volta para o anterior (sáb → sex; sex feriado → qui…). Forma de função: `{{dia_util_auto(data + 30)}}`, `{{dia_util_auto(meses(data, -1))}}`.
- **Forçar o sentido:** `{{dia_util_depois(data)}}` · `{{dia_util_antes(data)}}` · `{{data | dia_util:antes}}`. Se a data já é dia útil, não muda.
- **Contar:** `{{dias_uteis(data, 5)}}` · `{{dias_uteis(data, -5)}}` · `{{dias_uteis_entre(inicio, fim)}}` (agora também pulam feriados).
- **Mês:** `{{primeiro_dia_util(data)}}` · `{{ultimo_dia_util(data)}}`.
- **Consultar:** `{{eh_dia_util(data)}}` e `{{eh_feriado(data)}}` devolvem 1 ou 0.
- Sem conta (`{{data | dia_util}}`) o padrão é avançar. O sentido vem do último `+`/`-` ou do sinal em `meses`/`anos`.

