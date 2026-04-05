# Indice: logs do pipeline de ingestao

Formato padrao das mensagens: [Formato comum do logger](./camara-ingest-logs.md#formato-comum-do-logger) em `camara-ingest-logs.md` (`scripts/lib/logger.ts`: `HH:MM:SS [fonte] mensagem`, `warn` com `⚠`, `error` com `✗`).

## Documentos por area

| Documento | Cobertura |
|-----------|-----------|
| [camara-ingest-logs.md](./camara-ingest-logs.md) | `ingest-camara.ts`, flag `--skip-camara-validated`, smoke `smoke-camara-incremental-db.ts` |
| [senado-ingest-logs.md](./senado-ingest-logs.md) | `ingest-senado.ts`, `ingest-ceaps-senado.ts` |
| [tse-ingest-logs.md](./tse-ingest-logs.md) | `ingest-tse.ts`, `ingest-tse-situacao.ts`, `ingest-filiacao.ts` |
| [ingest-outras-fontes-logs.md](./ingest-outras-fontes-logs.md) | Transparencia, TCU, sancoes, Wikipedia, Wikidata, Instagram, Jarbas, indicadores (SICONFI, CAPAG, Atlas, IBGE, IDEB, IPEA), Google News |

## Orquestrador (`scripts/ingest-all.ts`)

Sempre que uma fonte esta na lista de execucao:

| Ordem tipica | Log `pipeline` (separador) | Erro encapsulado (`<Fonte> falhou: ...`) |
|--------------|----------------------------|----------------------------------------|
| 1 | `--- TSE Situacao da Candidatura + CPF ---` | `TSE Situacao falhou` |
| 2 | `--- Camara dos Deputados ---` | `Camara falhou` |
| 3 | `--- Senado Federal ---` | `Senado falhou` |
| 4 | `--- TSE (CSV) ---` | `TSE falhou` |
| 5 | `--- Portal da Transparencia ---` | `Transparencia falhou` |
| 6 | `--- Wikipedia (bio, foto, redes) ---` | `Wikipedia falhou` |
| 7 | `--- Wikipedia Historico (categorias) ---` | `Wiki Historico falhou` |
| 8 | `--- TCU (Inabilitados + CADIRREG) ---` | `TCU falhou` |
| 9 | `--- Portal da Transparencia (CEIS/CNEP/CEAF/CEPIM) ---` | `Sancoes falhou` |
| 10 | `--- TSE Filiacao Partidaria ---` | `Filiacao falhou` |
| 11 | `--- CEAPS Senado ---` | `CEAPS Senado falhou` |
| 12 | `--- Wikidata ---` | `Wikidata falhou` |
| 13 | `--- Wikidata Politico (partidos + cargos) ---` | `Wikidata Politico falhou` |
| 14 | `--- Instagram (seguidores) ---` | `Instagram falhou` |
| 15 | `--- Jarbas / Serenata de Amor ---` | `Jarbas falhou` |
| 16 | `--- SICONFI (gestao fiscal) ---` | `SICONFI falhou` |
| 17 | `--- CAPAG (rating fiscal) ---` | `CAPAG falhou` |
| 18 | `--- Atlas da Violencia (IPEA) ---` | `Atlas Violencia falhou` |
| 19 | `--- IBGE SIDRA ---` | `IBGE falhou` |
| 20 | `--- INEP/IDEB ---` | `IDEB falhou` |
| 21 | `--- IPEA Data ---` | `IPEA falhou` |
| 22 | `--- Google News RSS ---` | `Google News falhou` |

Camara com flag incremental: entre o separador e a chamada, pode aparecer  
`Flag --skip-camara-validated: modo incremental (...)` (detalhe em [camara-ingest-logs.md](./camara-ingest-logs.md)).

### Resumo final e exit

| Nivel | Mensagem |
|-------|----------|
| log | linha em branco |
| log | `=== Resumo ===` |
| log | `Tempo: <s>s` |
| log | `Rows upserted: <n>` |
| log | `Errors: <n>` |
| log | `Erros por candidato:` (se erros > 0) |
| error | `  <source>/<candidato>: <erros>` |

`Fonte desconhecida: ...` vai para stderr com exit 1 (argumento invalido).

Se `totalErrors > 0` apos o resumo, **exit 1**.

### Observacao: `wiki-historico`

A etapa `wiki-historico` chama `enrichWikiHistorico()` sem acumular `IngestResult[]` no mesmo array do restante; erros aparecem via `Wiki Historico falhou` e logs com fonte `wiki-historico`.

## Variaveis de ambiente (stderr / skip)

Varias fontes avisam ou pulam sem `logger` quando falta chave: o detalhe esta nos modulos (ex.: `TRANSPARENCIA_API_KEY`, `INSTAGRAM_APP_ID`). Ver [ingest-outras-fontes-logs.md](./ingest-outras-fontes-logs.md).

## Manutencao

Ao adicionar uma fonte nova em `ingest-all.ts`, atualizar a tabela deste indice e o doc correspondente em `docs/ingest-*-logs.md`.
