# Dados para imprensa

A Sala de imprensa em `/imprensa` apresenta o projeto, números calculados a partir do export, fontes e caminhos de apuração. A rota é indexável e está no sitemap. A Mesa em `/imprensa/mesa` oferece busca, filtros de cargo e UF, proveniência e links para as fichas; ela e os exports usam `noindex`. URLs antigas de `/imprensa` com `cargo` ou `uf` redirecionam com status 308 para a Mesa, preservando os filtros.

A cobertura inclui candidaturas a Presidente e Governador. Senador aparece quando `SENADO_ENABLED` está habilitado. A ausência de informação não equivale a zero. Processo publicado não equivale a condenação.

## Contrato do export principal

`/api/imprensa/export?format=json&cargo=...&uf=...` retorna um objeto com estas chaves de topo:

- `version`, `generatedAt`, `aviso`, `filters`, `rows`.
- `filters`: `cargo` e `uf`, com `null` quando não há filtro.
- Cada item de `rows`: `slug`, `nome` (mesma grafia da ficha), `nomeOriginal` (grafia do TSE), `cargo`, `uf`, `partido`, `fichaUrl`, `sites`, `chapa` e `processos`.
- `sites`: `estado`, `quantidade`, `fonteUrl`, `fonteSha256` e `coletadoEm`.
- `chapa`: `estado`, `suplentesEstado`, `viceNome` (mesma grafia da ficha), `viceNomeOriginal` (grafia do TSE), `suplentes`, `fonteUrl`, `fonteSha256` e `snapshotEm`.
- `processos`: `estado`, `buscaEstado`, `quantidade`, `quantidadeOmitida` e `quantidadeEmConfirmacao`.

O CSV equivalente preserva as colunas `version`, `generated_at`, `cargo_filtro`, `uf_filtro`, `slug`, `nome_urna`, `cargo_disputado`, `uf`, `partido_sigla`, `ficha_url`, `sites_estado`, `sites_quantidade`, `sites_fonte_url`, `sites_fonte_sha256`, `sites_coletado_em`, `chapa_estado`, `chapa_vice_nome`, `chapa_fonte_url`, `chapa_fonte_sha256`, `chapa_snapshot_em`, `processos_estado`, `processos_busca_estado`, `processos_quantidade` e `processos_quantidade_omitida`. As colunas `chapa_suplentes_estado`, `chapa_suplentes`, `chapa_vice_nome_original`, `processos_quantidade_em_confirmacao`, `nome_urna_original`, `chapa_vice_situacao`, `chapa_vice_situacao_fonte_url` e `aviso` vêm ao final. `nome_urna` e `chapa_vice_nome` usam a mesma grafia da ficha. `chapa_vice_situacao` repete a situação oficial que a ficha mostra ao lado do vice (hoje só "Inapto no TSE", com o link da consulta do TSE). A versão do dataset é `2` desde que nome e vice passaram a usar a grafia da ficha. O aviso também é enviado no header HTTP `X-Aviso-Dados` em percent-encoding. O cabeçalho sempre ocupa a primeira linha. Os CSVs mantêm BOM UTF-8, escape de células e neutralização de fórmulas.

Os exports longos estão em `/api/imprensa/export/sites` e `/api/imprensa/export/processos`. O JSON de cada rota contém `version`, `generatedAt`, `aviso`, `filters`, `family` e `rows`. O CSV contém metadados (`version`, `generated_at`, `cargo_filtro`, `uf_filtro`) seguidos pelas colunas da respectiva família. O arquivo longo de processos traz `fonte_nivel` em cada linha: `oficial` (fonte judicial específica) ou `em_confirmacao` (a ficha mostra a linha com o selo "Fonte oficial em confirmação"). As duas rotas aceitam `format=csv|json` e mantêm os mesmos filtros. Os exports incluem `X-Robots-Tag: noindex, nofollow`.

## Estados e contagens

- `publicado`: valor ligado à identidade pública e acompanhado da prova exigida para a família.
- `vazio_confirmado`: nos sites, ausência documentada em `verified_empty_profiles` do snapshot oficial; não é usado para suplentes.
- `cobertura_parcial`: nos processos, parte das linhas não tem fonte publicável e fica fora da ficha e do export; a quantidade principal conta só as linhas exibidas na ficha (nula quando nenhuma é exibida), e `quantidadeOmitida` conta as de fora. Linhas com o selo "Fonte oficial em confirmação" são exibidas na ficha e contadas em `quantidade` e em `quantidadeEmConfirmacao`, com a mesma regra de `nivelFonteProcesso`.
- `sem_dado`: não há prova suficiente para afirmar um valor ou uma ausência.
- `null`: quantidade não comprovada. Não deve ser convertido em zero.
- `indisponivel`: a consulta ou a fonte não permitiu obter o dado naquele momento.
- `nao_aplicavel`: em `suplentesEstado`, indica que suplentes não se aplicam a candidaturas fora do Senado. Para senadores, `chapa.estado` e `suplentesEstado` usam o mesmo estado dos suplentes.
- `indeferidos_comprovados`: comprovante do TSE registra dois suplentes indeferidos; isso não significa que suplentes não se aplicam ao Senado. A fonte HTTPS, o hash e o snapshot ISO acompanham o estado.
- `indeterminado`: não há prova suficiente sobre os suplentes.

Os enums podem ganhar valores novos. Consumidores devem tratar qualquer valor desconhecido como **exige conferência**, sem convertê-lo em ausência, zero ou publicação.

Valores atuais por campo:

- `chapa.estado`: `publicado`, `sem_dado`, `indisponivel`, `indeferidos_comprovados`, `indeterminado`. O vice é publicado quando a identidade está confirmada e o vínculo do titular é oficial (`confirmado` ou `novo_perfil_oficial`), a mesma condição em que a ficha mostra o vice.
- `chapa.suplentesEstado`: `publicado`, `indeferidos_comprovados`, `indeterminado`, `indisponivel`, `nao_aplicavel`.
- `sites.estado`: `publicado`, `vazio_confirmado`, `sem_dado`.
- `processos.estado`: `publicado`, `cobertura_parcial`, `vazio_confirmado`, `indeterminado`, `nao_buscado`, `erro`, `desatualizado`, `sem_dado`.
- `processos.buscaEstado`: `encontrado`, `vazio_confirmado`, `indeterminado`, `nao_buscado`, `erro`, `desatualizado`, `contraditorio`.

As contagens de destaque são recalculadas do JSON do export e devem ser lidas junto de `generatedAt`, que identifica a geração usada. Uma contagem zero só é válida dentro do escopo e estado declarados. A Sala não fixa números de métricas no código.

## Fontes e datas

- Sites declarados: recurso oficial [rede_social_candidato_2026.zip](https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip), vinculado por `SQ_CANDIDATO`. O snapshot versionado em `src/data/candidate-sites-tse-2026.json` registra coleta em 23/09/2026 às 22:04:43 UTC, geração indicada pelo TSE em 23/09/2026 às 16:30:46 e SHA-256 `70947e26a7ee6c1acae42aab0258d11870f52afd32954da2369b712623805cd9`. A contagem não afirma reunir todos os sites da pessoa.
- Composição de chapa: `chapas_2026_publico` expõe o pacote oficial [consulta_cand_2026.zip](https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip), com `fonte_url`, `fonte_sha256` e `snapshot_em` por registro. O snapshot é exportado em ISO 8601. Para o Senado, `senado_suplencias_publico` fornece os suplentes verificados; comprovante de dois indeferimentos usa `indeferidos_comprovados`. O estado do Senado descreve suplentes e não usa `nao_aplicavel` para essa situação.
- Processos: registros publicados na ficha, com URL específica de domínio judicial `*.jus.br` para cada ocorrência exportada. Datas do registro não são datas de verificação. Registros sem essa URL não recebem crédito de fonte judicial por inferência.

Dados do TSE exigem crédito à fonte e observação da licença indicada no catálogo. A licença do código não altera a licença dos dados. O código do projeto usa Apache-2.0.

## Rotas e verificação

- `/imprensa`: Sala indexável com números e links atualizados.
- `/imprensa/mesa`: Mesa de apuração, `noindex`.
- `/api/imprensa/export?format=csv|json&cargo=...&uf=...`: export principal.
- `/api/imprensa/export/sites?format=csv|json` e `/api/imprensa/export/processos?format=csv|json`: ocorrências longas.
- O aviso `Confira os dados na fonte original antes de publicar.` deve aparecer nas superfícies de imprensa e nos exports.

Os filtros de cargo e UF são combináveis. A rota de Mesa preserva os filtros na URL. Contagens e registros refletem o conjunto exportado no momento indicado por `generatedAt`.
