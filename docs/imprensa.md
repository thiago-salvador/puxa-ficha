# Dados para imprensa

A Mesa em `/imprensa` reúne as fichas da coorte pública. Os filtros de cargo e UF são combináveis e permanecem na URL. A lista de slugs da ficha define a coorte; `candidatos_publico` fornece a identificação, e a exposição do Senado segue `SENADO_ENABLED`. Falha de uma fonte obrigatória produz erro de consulta, não uma lista vazia. A página é pública por link e usa `noindex`.

## Contrato de dados

O export principal contém apenas `version`, `generated_at`, `cargo_filtro`, `uf_filtro`, `slug`, `nome_urna`, `cargo_disputado`, `uf`, `partido_sigla`, `ficha_url`, `sites_estado`, `sites_quantidade`, `sites_fonte_url`, `sites_fonte_sha256`, `sites_coletado_em`, `chapa_estado`, `chapa_vice_nome`, `chapa_fonte_url`, `chapa_fonte_sha256`, `chapa_snapshot_em`, `processos_estado` e `processos_quantidade`. Os exports longos de sites e processos contêm as ocorrências vinculadas a cada slug. CSV e JSON usam a mesma consulta e os mesmos filtros. O CSV tem BOM UTF-8, escape de células e neutralização de fórmulas. O tamanho máximo da resposta é 4 MiB; o cache do export usa `s-maxage=300` e `stale-while-revalidate=60`.

Os estados têm significado por família:

- `publicado`: valor vinculado à identidade pública e acompanhado da prova exigida para a família.
- `vazio_confirmado`: nos sites, ausência documentada em `verified_empty_profiles` do snapshot oficial.
- `cobertura_parcial`: nos processos, há ocorrências publicadas sem URL judicial específica; o arquivo longo conserva apenas as ocorrências com fonte válida, e a quantidade principal fica nula.
- `sem_dado`: não há prova suficiente para afirmar um valor ou uma ausência. Consulta de processos sem linhas também recebe esse estado.

`0` é uma contagem confirmada dentro do escopo definido, como em `vazio_confirmado`. `null` significa quantidade não comprovada; não deve ser convertido em zero. Processo publicado não equivale a condenação, e o acervo da ficha não representa todos os processos de uma pessoa.

## Fontes e datas

- Sites declarados: recurso oficial [rede_social_candidato_2026.zip](https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip), vinculado por `SQ_CANDIDATO`. O snapshot versionado em `src/data/candidate-sites-tse-2026.json` registra coleta em 26/08/2026 às 22:12:16 UTC, geração indicada pelo TSE em 26/08/2026 às 16:30:24 e SHA-256 `24dd2bd5500ec8bb97078c00967e5035f5c8ef76e5934d7e6499dcb5a852353b`. Uma URL só entra quando a identidade é vinculável; a contagem não afirma reunir todos os sites da pessoa.
- Composição de chapa: `chapas_2026_publico` expõe o pacote oficial [consulta_cand_2026.zip](https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip), com `fonte_url`, `fonte_sha256` e `snapshot_em` por registro. O snapshot de 27/08/2026 em `data/chapas-2026-tse-20260827.json` registra geração indicada pelo TSE em 27/08/2026 às 12:30:35 e SHA-256 `eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27`; atualizações posteriores podem ter outra data e outro hash. O vice só é publicado para vínculo único e identidade confirmada.
- Processos: registros publicados na ficha, com URL específica de domínio judicial `*.jus.br` para cada ocorrência exportada. Datas do registro não são datas de verificação. Registros sem essa URL não recebem crédito de fonte judicial por inferência.

Os dados do TSE exigem crédito à fonte e observação da licença indicada no catálogo. A licença do código não altera a licença dos dados.

## Rotas e verificação

- `/imprensa`: tabela, filtros, proveniência e links para as fichas.
- `/api/imprensa/export?format=csv|json&cargo=...&uf=...`: export principal; `/api/imprensa/export/sites` e `/api/imprensa/export/processos`: ocorrências longas. As respostas de export usam `X-Robots-Tag: noindex`.

Em ambiente local configurado, executar `npm run typecheck`, `npm run lint`, `npm run build` e os testes `tests/imprensa-*.test.ts` com Node 24 e `--conditions=react-server`. Para conferir a amostra contra a rota, iniciar o servidor e executar `node scripts/verify-imprensa-sample.mjs <url-base>`. A suíte visual da Mesa está em `tests/visual/imprensa.spec.ts`.
