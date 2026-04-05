# Logs: ingest Senado (API + CEAPS)

Formato de timestamp e niveis (`log` / `warn` / `error`): ver [Formato comum do logger](./camara-ingest-logs.md#formato-comum-do-logger) em `camara-ingest-logs.md`.

Indice geral: [ingest-logs-index.md](./ingest-logs-index.md).

---

## Orquestrador

Separador: `--- Senado Federal ---`. Falha: `Senado falhou: <err>`.

CEAPS (mesmo pipeline, fonte distinta): `--- CEAPS Senado ---`. Falha: `CEAPS Senado falhou: <err>`.

---

## `ingest-senado.ts` (fonte `senado`)

### Por candidato

| Nivel | Padrao |
|-------|--------|
| log | `Processando <slug> (ID Senado: <id>)` |
| error | `  <slug>: nao encontrado no banco` |

### Perfil

| Nivel | Padrao |
|-------|--------|
| warn | `  <slug>: perfil vazio` |
| log | `  <slug>: perfil atualizado` |

### Historico (mandatos)

| Nivel | Padrao |
|-------|--------|
| log | `  <slug>: sem mandatos` |
| log | `  <slug>: <n> mandatos` |

### Votacoes

| Nivel | Padrao |
|-------|--------|
| log | `  <slug>: votacoes_chave vazia, pulando votos` |
| log | `  <slug>: <n> votacoes, <m> matched com chave` |

### Autorias (projetos)

| Nivel | Padrao |
|-------|--------|
| log | `  <slug>: <n> autorias` |

### Encerramento do candidato

| Nivel | Padrao |
|-------|--------|
| error | `  <slug>: <mensagem>` |
| log | `  <slug>: <rows_upserted> rows, <errors.length> errors, <duration_ms>ms` |

---

## `ingest-ceaps-senado.ts` (fonte `ceaps-senado`)

### Globais

| Nivel | Padrao |
|-------|--------|
| log | `<n> senadores para processar` |
| warn | `  HTTP erro para id=<senadoId> ano=<ano>: <err>` |

### Por candidato / ano

| Nivel | Padrao |
|-------|--------|
| log | `Processando <slug> (senado id: <id>)` |
| log | `  <slug> <ano>: sem dados` |
| error | `  <slug> <ano>: <msg>` |

---

## Leitura rapida

- **`nao encontrado no banco`**: slug sem linha em `candidatos` no Supabase.
- **`votacoes_chave vazia`**: nenhuma votacao chave cadastrada para casa Senado (ou filtro equivalente no codigo); etapa de votos nao roda.
- **CEAPS `HTTP erro`**: falha de rede/API ao buscar despesas por senador/ano.

---

## Manutencao

Alteracoes em `ingest-senado.ts` ou `ingest-ceaps-senado.ts` que mudem mensagens exigem atualizar este arquivo.
