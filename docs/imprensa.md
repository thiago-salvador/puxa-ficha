# Dados para imprensa

A Sala de imprensa em `/imprensa` apresenta o projeto, números calculados a partir do export, fontes e caminhos de apuração. A rota é indexável e está no sitemap. A Mesa em `/imprensa/mesa` oferece busca, filtros de cargo e UF, proveniência e links para as fichas; ela e os exports usam `noindex`. URLs antigas de `/imprensa` com `cargo` ou `uf` redirecionam com status 308 para a Mesa, preservando os filtros.

A cobertura inclui candidaturas a Presidente e Governador. Senador aparece quando `SENADO_ENABLED` está habilitado. A ausência de informação não equivale a zero. Processo publicado não equivale a condenação.

## Contrato do export principal

`/api/imprensa/export?format=json&cargo=...&uf=...` retorna um objeto com estas chaves de topo:

- `version`, `generatedAt`, `aviso`, `filters`, `rows`.
- `filters`: `cargo` e `uf`, com `null` quando não há filtro.
- Cada item de `rows`: `slug`, `nome`, `cargo`, `uf`, `partido`, `fichaUrl`, `sites`, `chapa` e `processos`.
- `sites`: `estado`, `quantidade`, `fonteUrl`, `fonteSha256` e `coletadoEm`.
- `chapa`: `estado`, `suplentesEstado`, `viceNome`, `suplentes`, `fonteUrl`, `fonteSha256` e `snapshotEm`.
- `processos`: `estado`, `buscaEstado`, `quantidade` e `quantidadeOmitida`.

O CSV equivalente preserva as colunas `version`, `generated_at`, `cargo_filtro`, `uf_filtro`, `slug`, `nome_urna`, `cargo_disputado`, `uf`, `partido_sigla`, `ficha_url`, `sites_estado`, `sites_quantidade`, `sites_fonte_url`, `sites_fonte_sha256`, `sites_coletado_em`, `chapa_estado`, `chapa_vice_nome`, `chapa_fonte_url`, `chapa_fonte_sha256`, `chapa_snapshot_em`, `processos_estado`, `processos_busca_estado`, `processos_quantidade` e `processos_quantidade_omitida`. As colunas novas `chapa_suplentes_estado` e `chapa_suplentes` vêm ao final, sem deslocar as anteriores. O aviso de conferência é a primeira linha comentada. Os CSVs mantêm BOM UTF-8, escape de células e neutralização de fórmulas.

Os exports longos estão em `/api/imprensa/export/sites` e `/api/imprensa/export/processos`. O JSON de cada rota contém `version`, `generatedAt`, `aviso`, `filters`, `family` e `rows`. O CSV contém metadados (`version`, `generated_at`, `cargo_filtro`, `uf_filtro`) seguidos pelas colunas da respectiva família. As duas rotas aceitam `format=csv|json` e mantêm os mesmos filtros. Os exports incluem `X-Robots-Tag: noindex, nofollow`.

## Estados e contagens

- `publicado`: valor ligado à identidade pública e acompanhado da prova exigida para a família.
- `vazio_confirmado`: nos sites, ausência documentada em `verified_empty_profiles` do snapshot oficial.
- `cobertura_parcial`: nos processos, existem ocorrências publicadas sem URL judicial específica; o arquivo longo conserva ocorrências com fonte válida, e a quantidade principal fica nula.
- `sem_dado`: não há prova suficiente para afirmar um valor ou uma ausência.
- `null`: quantidade não comprovada. Não deve ser convertido em zero.
- `indisponivel`: a consulta ou a fonte não permitiu obter o dado naquele momento.
- `nao_aplicavel`: vice não se aplica a uma candidatura ao Senado; o estado dos suplentes fica em `suplentesEstado`.
- `indeterminado`: não há prova suficiente sobre os suplentes.

As contagens de destaque são recalculadas do JSON do export e devem ser lidas junto de `generatedAt`, que identifica a geração usada. Uma contagem zero só é válida dentro do escopo e estado declarados. A Sala não fixa números de métricas no código.

## Fontes e datas

- Sites declarados: recurso oficial [rede_social_candidato_2026.zip](https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip), vinculado por `SQ_CANDIDATO`. O snapshot versionado em `src/data/candidate-sites-tse-2026.json` registra coleta em 23/09/2026 às 22:04:43 UTC, geração indicada pelo TSE em 23/09/2026 às 16:30:46 e SHA-256 `70947e26a7ee6c1acae42aab0258d11870f52afd32954da2369b712623805cd9`. A contagem não afirma reunir todos os sites da pessoa.
- Composição de chapa: `chapas_2026_publico` expõe o pacote oficial [consulta_cand_2026.zip](https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip), com `fonte_url`, `fonte_sha256` e `snapshot_em` por registro. O snapshot de 27/08/2026 registra geração indicada pelo TSE em 27/08/2026 às 12:30:35 e SHA-256 `eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27`; atualizações podem ter outra data e hash. Para o Senado, `senado_suplencias_publico` fornece os suplentes verificados. A ausência de vice é `nao_aplicavel`; o estado dos suplentes continua separado.
- Processos: registros publicados na ficha, com URL específica de domínio judicial `*.jus.br` para cada ocorrência exportada. Datas do registro não são datas de verificação. Registros sem essa URL não recebem crédito de fonte judicial por inferência.

Dados do TSE exigem crédito à fonte e observação da licença indicada no catálogo. A licença do código não altera a licença dos dados. O código do projeto usa Apache-2.0.

## Rotas e verificação

- `/imprensa`: Sala indexável com números e links atualizados.
- `/imprensa/mesa`: Mesa de apuração, `noindex`.
- `/api/imprensa/export?format=csv|json&cargo=...&uf=...`: export principal.
- `/api/imprensa/export/sites?format=csv|json` e `/api/imprensa/export/processos?format=csv|json`: ocorrências longas.
- O aviso `Confira os dados na fonte original antes de publicar.` deve aparecer nas superfícies de imprensa e nos exports.

Os filtros de cargo e UF são combináveis. A rota de Mesa preserva os filtros na URL. Contagens e registros refletem o conjunto exportado no momento indicado por `generatedAt`.
