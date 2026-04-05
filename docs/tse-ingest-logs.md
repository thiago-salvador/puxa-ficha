# Logs: TSE (situacao, CSV patrimonio/financiamento, filiacao)

Formato de timestamp e niveis: ver [Formato comum do logger](./camara-ingest-logs.md#formato-comum-do-logger) em `camara-ingest-logs.md`.

Indice geral: [ingest-logs-index.md](./ingest-logs-index.md).

Este documento cobre tres modulos acoplados ao TSE no orquestrador: **situacao + CPF**, **CSV bulk**, **filiacao partidaria**.

---

## Orquestrador

| Etapa | Separador `pipeline` | Erro |
|-------|----------------------|------|
| Situacao | `--- TSE Situacao da Candidatura + CPF ---` | `TSE Situacao falhou` |
| CSV | `--- TSE (CSV) ---` | `TSE falhou` |
| Filiacao | `--- TSE Filiacao Partidaria ---` | `Filiacao falhou` |

---

## `ingest-tse-situacao.ts` (fonte `tse-situacao`)

### Download / cache / limpeza (padrao semelhante ao TSE CSV)

| Nivel | Padrao |
|-------|--------|
| log | `  Cache hit: <dest>` |
| log | `  Baixando: <url>` |
| warn | `  HTTP <status> para <url>` |
| warn | `  Falha no download: <err>` |
| log | `  Cleanup: <dir>` |
| warn | `  Nao conseguiu limpar: <dir>` |
| log | `  Cleanup: <filePath>` |
| warn | `  Nao conseguiu limpar: <filePath>` |

### Processamento por ano

| Nivel | Padrao |
|-------|--------|
| log | `=== Tentando ano <ano> ===` |
| error | `Falha ao extrair ZIP <ano>: <err>` |
| warn | `Nenhum CSV encontrado no ZIP <ano>` |
| log | `  Parseando <n> arquivo(s) CSV do ano <ano>` |
| warn | `  Ambiguos <ano>: <lista slugs>` |
| log | `Todos os candidatos com CPF, pulando ano <ano>` |
| log | `<n> candidatos ainda sem CPF, buscando no ano <ano>` |
| log | `Total encontrado: <n> candidatos` |
| warn | `  <slug>: nao encontrado em nenhum CSV TSE` |
| warn | `  <slug>: persistencia bloqueada (<razoes>)` |

### Auditoria

| Nivel | Padrao |
|-------|--------|
| log | `Auditoria salva em <caminho>` |

---

## `ingest-tse.ts` (fonte `tse`)

### Validacao / download

| Nivel | Padrao |
|-------|--------|
| warn | `  Valor monetario invalido em <context>: "<value>"` |
| log | `  Cache hit: <dest>` |
| log | `  Baixando: <url>` |
| warn | `  HTTP <status> para <url>` |
| warn | `  Falha no download: <err>` |
| log | `  Cleanup: <dir>` |
| warn | `  Nao conseguiu limpar: <dir>` |
| log | `  Cleanup: <filePath>` |
| warn | `  Nao conseguiu limpar: <filePath>` |
| log | `  Cache preservado: <filePath>` |

### Mapeamento SQ / parse

| Nivel | Padrao |
|-------|--------|
| log | `  SQ map <ano>: <n> candidatos mapeados (<preloaded> preloaded, <resolved> via resolver)` |
| warn | `  Ambiguos SQ map <ano>: <lista>` |
| warn | `  CSV de bens nao encontrado para <ano>` |
| log | `  Parseando patrimonio <ano>: <n> arquivos CSV (BR...)` |
| log | `  <slug>: patrimonio <ano> — R$ <total> (<m> bens)` |
| warn | `  CSV de receitas nao encontrado para <ano>` |
| log | `  Parseando financiamento <ano>: <n> arquivos CSV (BR...)` |
| log | `  <slug>: financiamento <ano> — R$ <total> (<m> receitas)` |
| log | `  Ambiguos <ano>: <lista slugs>` |

### Rodada por eleicao

| Nivel | Padrao |
|-------|--------|
| log | `Cache de downloads TSE ativo (PF_KEEP_TSE_DOWNLOADS=1)` |
| log | `=== Processando eleicao <ano> ===` |
| error | `  Erro patrimonio <ano>: <err>` |
| error | `  Erro financiamento <ano>: <err>` |

---

## `ingest-filiacao.ts` (fonte `filiacao`)

### Download / cache / limpeza

| Nivel | Padrao |
|-------|--------|
| log | `  Cache hit: <dest>` |
| log | `  Baixando: <url>` |
| warn | `  HTTP <status> para <url>` |
| warn | `  Falha no download: <err>` |
| log | `  Cleanup: <dir>` |
| warn | `  Nao conseguiu limpar: <dir>` |
| log | `  Cleanup: <filePath>` |
| warn | `  Nao conseguiu limpar: <filePath>` |

### Zip e CSVs

| Nivel | Padrao |
|-------|--------|
| error | `Falha ao baixar arquivo de filiados` |
| log | `Extraindo zip de filiados...` |
| error | `Erro ao extrair zip: <err>` |
| log | `Encontrados <n> CSVs para processar` |
| warn | `Nenhum CSV encontrado no zip de filiados` |
| log | `  Parseando: <csvFile>` |
| warn | `  Erro ao parsear <csvFile>: <err>` |
| log | `Candidatos encontrados no CSV: <n>` |

### Por candidato

| Nivel | Padrao |
|-------|--------|
| log | `  <slug>: sem dados de filiacao encontrados` |
| log | `  <slug>: <n> registros de filiacao` |

---

## Leitura rapida

- **`PF_KEEP_TSE_DOWNLOADS=1`**: ZIPs/CSVs ficam em disco; mais logs de `Cache preservado`.
- **`Ambiguos`**: mesmo nome/URNa no TSE para mais de um slug; revisar `data/candidatos.json` / resolver.
- **504 / Falha no download**: rede ou indisponibilidade do site do TSE.

---

## Manutencao

Alteracoes em `ingest-tse.ts`, `ingest-tse-situacao.ts` ou `ingest-filiacao.ts` que mudem mensagens exigem atualizar este arquivo.
