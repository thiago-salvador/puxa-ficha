# Logs: demais fontes do pipeline

Formato de timestamp e niveis: ver [Formato comum do logger](./camara-ingest-logs.md#formato-comum-do-logger).

Indice geral (separadores `pipeline` e falhas): [ingest-logs-index.md](./ingest-logs-index.md).

---

## Portal da Transparencia (`ingest-transparencia.ts`, fonte `transparencia`)

| Nivel | Padrao |
|-------|--------|
| warn | `TRANSPARENCIA_API_KEY nao definida, pulando` |
| warn | `STUB: este modulo consulta a API mas NAO persiste dados. Contribuicao com insert/upsert bem-vinda.` |
| log | `Processando <slug>` |
| log | `  <slug>: <n> registro(s) encontrado(s) (nao persistido)` |

Separador: `--- Portal da Transparencia ---`. Erro: `Transparencia falhou`.

---

## Wikipedia (`enrich-wikipedia.ts`, fonte `wikipedia`)

| Nivel | Padrao |
|-------|--------|
| warn | `  fetchWikiPage failed for <title>` |
| warn | `  Wikitext parse error for <title>: <msg>` |
| warn | `  Wikidata SPARQL HTTP <status>` |
| warn | `  Wikidata SPARQL error: <msg>` |
| log | `  <slug>: fallback - nada para atualizar (campos ja preenchidos)` |
| error | `  <slug>: fallback erro: <message>` |
| log | `  <slug>: fallback OK (<campos>)` |
| error | `  <slug>: nao encontrado no banco` |
| log | `Processando <slug> → <wikiTitle>` |
| log | `  <slug>: foto OK` |
| warn | `  <slug>: sem foto na Wikipedia` |
| log | `  <slug>: buscando Wikidata <wikidataId>` |
| log | `  <slug>: data_nascimento = ...` / `naturalidade = ...` / `formacao = ...` (varias linhas) |
| log | `  <slug>: biografia OK (<n> chars)` |
| log | `  <slug>: redes sociais (<lista chaves>)` |
| error | `  <slug>: erro ao atualizar: <message>` |
| log | `  <slug>: nada para atualizar` |
| log | `<slug>: sem Wikipedia, usando fallback` |
| warn | `<slug>: sem Wikipedia e sem fallback configurado` |
| warn | `  <slug>: sem foto em nenhuma fonte, usando placeholder (<iniciais>)` |

Separador: `--- Wikipedia (bio, foto, redes) ---`. Erro: `Wikipedia falhou`.

---

## Wikipedia Historico (`enrich-wiki-historico.ts`, fonte `wiki-historico`)

| Nivel | Padrao |
|-------|--------|
| log | `Titulos Wikipedia carregados: <n>` |
| log | `<slug>: <n> cargos encontrados via categorias` |
| error | `  <slug>: erro inserindo <cargo>: <message>` |
| log | `  <slug>: + <cargo> (<estado>)` |

Separador: `--- Wikipedia Historico (categorias) ---`. Erro: `Wiki Historico falhou`.  
Nota: esta etapa nao empilha `IngestResult` no array principal do `ingest-all.ts` como as outras.

---

## TCU (`ingest-tcu.ts`, fonte `tcu`)

| Nivel | Padrao |
|-------|--------|
| log | `Processando <slug>` |
| warn | `  <slug>: sem CPF no banco, pulando` |
| log | `  <slug>: INABILITADO (<n> registro(s))` |
| log | `  <slug>: CONTAS IRREGULARES (<n> registro(s))` |
| log | `  <slug>: sem irregularidades no TCU` |

Separador: `--- TCU (Inabilitados + CADIRREG) ---`. Erro: `TCU falhou`.

---

## Sancoes Transparencia (`ingest-transparencia-sanctions.ts`, fonte `transparencia-sanctions`)

| Nivel | Padrao |
|-------|--------|
| warn | `TRANSPARENCIA_API_KEY nao definida, pulando` |
| log | `Processando <slug>` |
| warn | `  <slug>: sem CPF no banco, pulando` |
| log | `  <slug>: sem sancoes nos cadastros` |

Separador: `--- Portal da Transparencia (CEIS/CNEP/CEAF/CEPIM) ---`. Erro: `Sancoes falhou`.

---

## Wikidata (`ingest-wikidata.ts`, fonte `wikidata`)

| Nivel | Padrao |
|-------|--------|
| log | `Processando <slug> (busca: "<nome_urna>")` |
| warn | `  <slug>: nao encontrado no banco` |
| log | `  <slug>: query por ID (<wikidata_id>)` |
| warn | `  <slug>: nao encontrado no Wikidata` |
| warn | `  <slug>: erro ao atualizar: <message>` |
| log | `  <slug>: atualizado (wikidata_id: <id>, campos: <lista>)` |
| log | `  <slug>: sem alteracoes necessarias` |
| warn | `  <slug>: <mensagem de erro>` |

Separador: `--- Wikidata ---`. Erro: `Wikidata falhou`.

---

## Wikidata Politico (`ingest-wikidata-politico.ts`, fonte `wikidata-politico`)

| Nivel | Padrao |
|-------|--------|
| warn | `  <slug>: erro filiacao inicial <message>` |
| warn | `  <slug>: erro mudanca partido <message>` |
| log | `  <slug>: partido atual do perfil (<sigla>) diverge da ultima filiacao Wikidata (<sigla>)` |
| warn | `  <slug>: erro atualizando historico <message>` |
| warn | `  <slug>: erro inserindo historico <message>` |
| log | `  <slug>: sem wikidata_id, pulando` |
| log | `  <slug>: +<n> mudancas_partido, +<m> historico_politico` |
| warn | `  <slug>: <mensagem de erro>` |

Separador: `--- Wikidata Politico (partidos + cargos) ---`. Erro: `Wikidata Politico falhou`.

---

## Instagram (`enrich-instagram.ts`, fonte `instagram`)

| Nivel | Padrao |
|-------|--------|
| warn | `  Endpoint principal retornou <status> para @<username>` |
| warn | `INSTAGRAM_APP_ID ausente. Pulando endpoint principal e usando apenas fallback publico.` |
| warn | `  Nao foi possivel obter followers de @<username> (ambos endpoints falharam)` |
| warn | `  <slug>: nao encontrado no banco` |
| log | `  <slug>: sem username do Instagram, pulando` |
| log | `  <slug>: username vazio, pulando` |
| log | `  <slug>: buscando followers de @<username>` |
| warn | `  <slug>: erro ao salvar: <message>` |
| log | `  <slug>: @<username> — <n> seguidores` |
| log | `  <slug>: @<username> — followers nao disponivel, username salvo` |
| warn | `  <slug>: <mensagem>` |

Separador: `--- Instagram (seguidores) ---`. Erro: `Instagram falhou`.

---

## Jarbas (`ingest-jarbas.ts`, fonte `jarbas`)

| Nivel | Padrao |
|-------|--------|
| log | `Processando <slug> (ID Camara: <id>)` |
| warn | `  <slug>: nao encontrado no banco` |
| log | `  <slug>: sem dados na API (404)` |
| warn | `  <slug>: API indisponivel: <msg>` |
| log | `  <slug>: nenhum gasto suspeito encontrado` |
| log | `  <slug>: <n> gasto(s) suspeito(s) encontrado(s)` |
| log | `  <slug>: ponto_atencao atualizado (gravidade: <g>)` |
| log | `  <slug>: ponto_atencao criado (gravidade: <g>)` |
| log | `  <slug>: gastos_destaque atualizado para <ano>` |
| warn | `  <slug>: <mensagem>` |

Separador: `--- Jarbas / Serenata de Amor ---`. Erro: `Jarbas falhou`.

---

## SICONFI (`ingest-siconfi.ts`, fonte `siconfi`)

| Nivel | Padrao |
|-------|--------|
| log | `  RGF <estado> <ano>` |
| warn | `  RGF <estado> <ano>: <rgfErr>` |
| log | `  RREO <estado> <ano>` |
| warn | `  RREO <estado> <ano>: <rreoErr>` |
| error | `  <estado> <ano>: <msg>` |
| log | `<estado>: <rows_upserted> indicadores, <errors.length> erros` |

Separador: `--- SICONFI (gestao fiscal) ---`. Erro: `SICONFI falhou`.

---

## CAPAG (`ingest-capag.ts`, fonte `capag`)

| Nivel | Padrao |
|-------|--------|
| log | `  Tentando: <url>` |
| warn | `  HTTP <status> para <url>` |
| log | `  CSV baixado: <n> caracteres` |
| warn | `  Falha: <err>` |
| warn | `CSV indisponivel em todas as URLs (CKAN pode estar restrito). Pulando.` |
| log | `  <n> linhas no CSV` |
| log | `Total: <n> indicadores upsertados` |
| error | `<msg>` |

Separador: `--- CAPAG (rating fiscal) ---`. Erro: `CAPAG falhou`.

---

## Atlas da Violencia (`ingest-atlas-violencia.ts`, tag `atlas_violencia`)

| Nivel | Padrao |
|-------|--------|
| log | `  Buscando serie <serieId> (<indicador>)` |
| warn | `  Resposta inesperada para serie <serieId>` |
| log | `  <n> registros para serie <serieId>` |
| log | `  Serie <serieId>: <n> registros upsertados` |
| error | `Serie <serieId>: <msg>` |

Separador: `--- Atlas da Violencia (IPEA) ---`. Erro: `Atlas Violencia falhou`.

---

## IBGE SIDRA (`ingest-ibge.ts`, fonte `ibge`)

| Nivel | Padrao |
|-------|--------|
| log | `  Agregado <agregado> (<indicador>)` |
| warn | `  Resposta inesperada para agregado <agregado>` |
| log | `  Agregado <agregado>: <n> registros` |
| error | `Agregado <agregado>: <msg>` |

Separador: `--- IBGE SIDRA ---`. Erro: `IBGE falhou`.

---

## IDEB (`ingest-ideb.ts`, fonte `ideb`)

| Nivel | Padrao |
|-------|--------|
| log | `  Tentando: <url>` |
| warn | `  <url>: <msg>` |
| log | `Buscando IDEB Ensino Medio <ano>` |
| warn | `  Nenhum dado retornado para <ano> (API pode estar fora do ar, pulando)` |
| log | `  <n> registros para <ano>` |
| log | `  <ano>: <n> estados processados` |
| error | `<ano>: <msg>` |

Separador: `--- INEP/IDEB ---`. Erro: `IDEB falhou`.

---

## IPEA Data (`ingest-ipea.ts`, fonte `ipea`)

| Nivel | Padrao |
|-------|--------|
| log | `  Serie <codigo> (<indicador>)` |
| warn | `  Resposta inesperada para <codigo>` |
| log | `  <n> registros para <codigo>` |
| log | `  <codigo>: <n> registros upsertados` |
| error | `<codigo>: <msg>` |

Separador: `--- IPEA Data ---`. Erro: `IPEA falhou`.

---

## Google News (`ingest-google-news.ts`, fonte `google-news`)

| Nivel | Padrao |
|-------|--------|
| log | `Processando <slug>` |
| warn | `  <slug>: HTTP <status>` |
| warn | `  <slug>: <n> URL(s) descartada(s) por esquema invalido` |
| log | `  <slug>: nenhuma noticia` |
| log | `  <slug>: <n> noticias` |
| warn | `  <slug>: timeout` |

CLI direto (`import.meta` main): `console.log` com `\nGoogle News: <total> noticias, <errors> erros`.

Separador: `--- Google News RSS ---`. Erro: `Google News falhou`.

---

## Manutencao

Cada bloco acima deve permanecer alinhado ao arquivo `scripts/lib/` correspondente. Novas fontes no `ingest-all.ts` entram aqui e no [ingest-logs-index.md](./ingest-logs-index.md).
