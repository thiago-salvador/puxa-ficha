# Logs: ingest Camara e pipeline

Indice geral do pipeline: [ingest-logs-index.md](./ingest-logs-index.md).

Referencia das mensagens emitidas pela ingest da Camara dos Deputados, pelo orquestrador `ingest-all.ts` (trechos Camara + resumo) e pelo smoke de banco.

## Formato comum do logger

Saida do `scripts/lib/logger.ts`:

| Funcao  | Saida        | Prefixo no texto |
|---------|--------------|------------------|
| `log`   | `console.log` | `HH:MM:SS [fonte] mensagem` |
| `warn`  | `console.warn` | `HH:MM:SS [fonte] ⚠ mensagem` |
| `error` | `console.error` | `HH:MM:SS [fonte] ✗ mensagem` |

`HH:MM:SS` vem de `new Date().toISOString().slice(11, 19)` (UTC).

---

## Orquestrador (`scripts/ingest-all.ts`)

Lista completa de separadores e falhas: [ingest-logs-index.md](./ingest-logs-index.md). Abaixo so entradas ligadas a Camara e ao fechamento do resumo.

| Fonte      | Nivel | Padrao da mensagem |
|------------|-------|--------------------|
| `pipeline` | log   | `Iniciando ingestao: <fontes>` |
| `pipeline` | log   | `--- Camara dos Deputados ---` |
| `pipeline` | log   | `Flag --skip-camara-validated: modo incremental (pula candidato so se votos+projetos+gastos recentes ok; senao so etapas faltantes)` (so se a flag estiver ativa) |
| `pipeline` | error | `Camara falhou: <err>` |
| `pipeline` | log   | linha em branco |
| `pipeline` | log   | `=== Resumo ===` |
| `pipeline` | log   | `Tempo: <s>s` |
| `pipeline` | log   | `Rows upserted: <n>` |
| `pipeline` | log   | `Errors: <n>` |
| `pipeline` | log   | `Erros por candidato:` (se `totalErrors > 0`) |
| `pipeline` | error | `  <source>/<candidato>: <erros join "; ">` |
| (sem tag)  | stderr | `Fonte desconhecida: <s>. Validas: ...` (exit 1) |

Se houver erros no resumo, o processo termina com **exit code 1**.

---

## Ingest Camara (`scripts/lib/ingest-camara.ts`)

Fonte logica: **`camara`**.

### Modo incremental (`skipValidated` / `--skip-camara-validated`)

| Nivel | Padrao |
|-------|--------|
| log   | `skip-validated (incremental): <n> votacao(oes) chave Camara; projetos>=<cap>; gastos anos <anos>` |
| log   | `Pulando <slug> (Camara ja sincronizado (votos chave + gastos 2023-2025 + projetos>=100))` |
| log   | `Processando <slug> (ID Camara: <id>) incremental: <partes>` |

Onde `<partes>` e uma lista separada por virgula com itens em `{votos ok \| votos}, {gastos ok \| gastos}, {projetos ok \| projetos}` conforme o que ja esta coberto no banco.

### Modo completo (sem incremental)

| Nivel | Padrao |
|-------|--------|
| log   | `Processando <slug> (ID Camara: <id>)` |

### Perfil, gastos, votos, projetos

| Nivel | Padrao |
|-------|--------|
| log   | `  <slug>: perfil atualizado` |
| log   | `  <slug>: gastos <ano> — R$ <total> (<m> registros)` |
| log   | `  <slug>: votacoes_chave vazia, pulando votos` |
| log   | `  <slug>: <n> votacoes, <m> matched com chave` |
| log   | `  <slug>: votacoes por deputado indisponiveis, tentando por proposicao...` |
| log   | `  <slug>: buscando <n> votacoes por proposicao...` |
| log   | `  <slug>: encontrado voto "<tipo>" em <votacaoId>` |
| warn  | `  <slug>: erro buscando proposicao <proposicao_id>: <msg>` |
| log   | `  <slug>: total <n> votos matched` |
| log   | `  <slug>: <n> projetos de lei` |

### Erros, timeout e linha final por candidato

| Nivel | Padrao |
|-------|--------|
| error | `  <slug>: nao encontrado no banco` |
| warn  | `  <slug>: TIMEOUT <minutos>min, pulando...` |
| error | `  <slug>: <mensagem de erro>` |
| log   | `  <slug>: <rows_upserted> rows, <errors.length> errors, <duration_ms>ms` |

Timeout: `<minutos>` = `CANDIDATO_WALL_MS / 60_000` (10 min no codigo atual).

### Saida JSON (CLI direto)

Ao executar `npx tsx scripts/lib/ingest-camara.ts`, ao final imprime **`console.log(JSON.stringify(results, null, 2))`** com o array de `IngestResult` (`source`, `candidato`, `tables_updated`, `rows_upserted`, `errors`, `duration_ms`, opcionalmente `skipped`, `skip_reason`, `incremental_skipped`).

---

## Smoke incremental so banco (`scripts/smoke-camara-incremental-db.ts`)

Nao usa `logger.ts`. Escreve **um unico JSON** em stdout (pretty-print com indent 2), por exemplo:

```json
{
  "ok": true,
  "slug": "lula",
  "candidatoId": "<uuid>",
  "votacoes_chave_camara": 9,
  "skipVotes": false,
  "skipGastos": false,
  "skipProjetos": false,
  "fullSkip": false,
  "projetos_count": 12,
  "projetos_cap": 100,
  "gastos_anos_required": [2023, 2024, 2025]
}
```

Erros de execucao vao para **stderr** e o processo usa **exit code 1** (ex.: candidato inexistente, falha Supabase, `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` ao importar `supabase.ts`).

---

## Leitura operacional rapida

- **Incremental ativo:** aparece `skip-validated (incremental):` no inicio da fonte `camara`.
- **Candidato 100% pulado:** `Pulando <slug> (Camara ja sincronizado ...)`.
- **Candidato parcial:** `Processando ... incremental:` com `votos`, `gastos` ou `projetos` sem sufixo `ok` indica etapa que ainda vai bater na API.
- **API instavel:** `⚠ ... erro buscando proposicao ...` (ex.: HTTP 504).
- **Pipeline ok:** `=== Resumo ===` com `Errors: 0` e exit 0.

---

## Manutencao deste documento

Ao alterar strings em `ingest-camara.ts`, `ingest-all.ts` (bloco Camara e resumo), `logger.ts` ou o schema JSON do smoke, atualizar este arquivo para manter a referencia alinhada ao codigo.
