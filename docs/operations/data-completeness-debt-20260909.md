# Recuperação de completude: oito frentes

## Escopo e critério

Correções técnicas autorizadas em 9 de setembro de 2026, incluindo publicação e coletas em produção. Falha de fonte, identidade ambígua, supressão estatística e falta de evidência editorial não podem virar zero, ausência confirmada ou revisão concluída. Este documento descreve o contrato do código; merge, execução e banco exigem seus próprios recibos.

## Correções e limites

| Frente | Correção | Limite que continua explícito |
|---|---|---|
| Atlas da Violência | Valida série, UF, ano, tipo numérico e cobertura; consulta as séries estaduais de jovens e armas de fogo; percorre o catálogo completo. | Endpoints 25 e 35 responderam `[]`; isso não significa taxa zero. O catálogo não oferece série intitulada feminicídios, que não pode ser substituída por homicídios de mulheres. |
| IDEB | Descobre a edição mais nova na página oficial, valida o ZIP estadual vinculado e os cabeçalhos, rede estadual/ensino médio e 27 UFs. Preserva supressão e meta ausente. | A edição 2025 cobre resultados 2019, 2021, 2023 e 2025. Não aceita a edição antiga como atual nem inventa metas ausentes. |
| SICONFI | Corrige campos, anexos, códigos, colunas, paginação e limite de pessoal do próprio ente. Consulta de 2022 ao último exercício encerrado, incluindo 2025 nesta recuperação. | Primário 2022 e 2023 em diante têm definições diferentes, preservadas em metadata. Consulta parcial permanece indeterminada. |
| Portal da Transparência | Remove a busca nominal de servidores que não persistia nada e retorna erro explícito de implementação. | Não existe ainda contrato de gastos federais com conjunto de dados, identidade e tabela de destino. Esta correção não implementa esse produto. |
| Sanções | Falha de SELECT/INSERT não vira ausência de sanções; não anuncia tabela que não foi gravada; erros não expõem documento consultado. | CPF ausente não é substituído por nome. Retorno mascarado exige as demais verificações de identidade já existentes. |
| Filiação | Valida o esquema antes da primeira linha e rejeita arquivo sem registros. | O recurso público encontrado é agregado, com `QT_FILIADO`, sem os campos individuais exigidos. Não serve para atribuir filiação a uma pessoa. |
| Enriquecimento | Wikipedia e Wikidata recusam QID divergente; Instagram exige identidade e contagem válidas, preserva metadata e seguidores anteriores quando indisponível. | Bloqueio do Instagram não confirma existência, ausência ou zero seguidores. URLs de publicações e perfis ambíguos não geram consulta nem gravação. |
| Curadoria | Auditoria passa a contabilizar o estoque vigente por alvo, sem apagar pendências com um run parcial recente. | Publicação de processo, contradição, patrimônio ou trajetória exige fonte, identidade e período compatíveis. Recibo histórico ou linha existente não substitui essa prova. |

## Evidência primária consultada

- [IDEB oficial, edição 2025](https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados/2005-2025): parser verificou 108 valores, 27 UFs. SHA-256 do ZIP estadual: `a8ecdb2cef93416149f98ec7c22207f5ff3607e0bb08f29ed8a03651406b0a87`. Download HTTPS validado, sem desativação de TLS. Runtime requer `curl` e `unzip`. O coletor encontra a edição pela página de resultados; não constrói uma URL presumida para uma edição futura.
- [SICONFI RGF](https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rgf) e [RREO](https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo): leitura das 27 UFs, 2022/2023/2024, 324 valores; prova adicional de 2025, 108 valores. Total interpretado: 432, zero erro ou resposta vazia, com writer em memória.
- [Atlas, série 20 estadual](https://www.ipea.gov.br/dados-api/series-values/20/3): 270 taxas de 2015 a 2024. [Série 25](https://www.ipea.gov.br/dados-api/series-values/25/3) e [série 35](https://www.ipea.gov.br/dados-api/series-values/35/3): HTTP 200 com array vazio. [Catálogo](https://www.ipea.gov.br/cms/api/series?pagination%5BpageSize%5D=100): 174 séries em duas páginas.
- [Swagger do Portal](https://api.portaldatransparencia.gov.br/v3/api-docs): confirma `codigoSancionado` em CEIS/CNEP e `cpfSancionado` em CEAF. Leituras nacionais autenticadas confirmaram o formato dos três cadastros, sem atribuição individual.
- [Filiação agregada TSE](https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip): 29 colunas, incluindo `QT_FILIADO`, sem esquema individual compatível.

As leituras acima são provas de interpretação e disponibilidade, não prova de gravação em produção. [confidence: alta, source: HTTPS primário e testes com writers em memória em 2026-09-09] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Estoque e revisão editorial

No snapshot de 9 de setembro, os recibos indeterminados vigentes somavam 121 processos, 33 patrimônios, 57 trajetórias e 12 contradições, incluindo perfis fora do ar. No recorte público: 102, 30, 41 e 10, respectivamente. São estados dos recibos, não contagens de fatos incorretos no site.

O cruzamento de processos não encontrou lote antigo pendente de aplicação: 152/152 planos históricos ainda públicos já tinham recibo equivalente; 33 slugs saíram da coorte. As dez contradições públicas continuavam bloqueadas por fontes no arquivo versionado. Reaplicar tudo apagaria decisões posteriores, inclusive correções de identidade.

A nova consulta por SQ exato conferiu 44 identidades oficiais e fundamentou 35 propostas de recibos: 22 declarações de patrimônio 2026 coincidem com os valores já publicados e passam pela composição canônica; 13 trajetórias permitem somente `sem_achado_no_escopo` dos pleitos explicitamente retornados. Outras 28 trajetórias continuam bloqueadas. A [prova sanitizada](../../QA/evidencias/2026-09-09-completeness/c8-source-readback.json) é somente leitura, não recibo de aplicação. Preserva hashes e projeções públicas, sem documentos pessoais. A aplicação exige reconferência da fonte, da identidade, do recibo anterior e dos dados publicados.

Referências de revisão: `scripts/aplicar-evidencia-processos-curadoria.ts`, `scripts/registrar-revisao-curadoria.ts`, `QA/evidencias/2026-08-10-item2-judicial/proposta-66-25/manifesto-processos-curadoria-66.json`, `QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/manifesto-processos-curadoria-69.json` e `QA/evidencias/2026-08-05-contradicoes-curadoria-decisions.json`.

[confidence: alta, source: SELECT somente leitura em coleta_log/candidatos e cruzamento dos artefatos em 2026-09-09] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Verificação reproduzível

Node 24. Rodar `npm test`, `npm run lint`, `npm run check:scripts` e `npm run build`. Regressões específicas em `tests/ingest-state-indicators-debt.test.ts`, `tests/ingest-identity-sources-debt.test.ts`, `tests/ingest-enrichment-debt.test.ts`, `tests/enrich-instagram-debt.test.ts` e `tests/data-freshness-artifacts.test.ts`.

Depois do merge: executar somente as fontes reparadas pelo pipeline canônico, comparar os recibos com as linhas persistidas, revalidar o cache e rodar a auditoria de atualização em `main`. Não reclassificar recibos antigos em lote. O inventário manual por alvo não altera o contrato das fontes agendadas.

## Limite da superfície pública

A API `/api/candidato-profile/tarcisio-gov-sp` entrega os indicadores estaduais após a coleta e a revalidação. Os cartões atuais de `/uf/sp` não incluem IDEB/SICONFI no conjunto de indicadores exibidos. Esta recuperação de dados não adiciona novos cartões nem ranking fiscal. A API também omite metadata: comparação de definição fiscal exige SQL, não apenas a resposta pública.
