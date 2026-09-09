# Recuperação de completude: oito frentes

## Escopo e critério

Correções técnicas autorizadas em 9 de setembro de 2026, incluindo publicação e coletas em produção. Falha de fonte, identidade ambígua, supressão estatística e falta de evidência editorial não podem virar zero, ausência confirmada ou revisão concluída. Este documento descreve o contrato do código; merge, execução e banco exigem seus próprios recibos.

## Correções e limites

| Frente | Correção | Limite que continua explícito |
|---|---|---|
| Atlas da Violência | Valida série, UF, ano, tipo numérico e cobertura; consulta as séries estaduais de jovens e armas de fogo; percorre o catálogo completo. | Endpoints 25 e 35 responderam `[]`; isso não significa taxa zero. O catálogo não oferece série intitulada feminicídios, que não pode ser substituída por homicídios de mulheres. |
| IDEB | Lê o XLSX oficial, rede estadual/ensino médio, com cabeçalhos e 27 UFs validados. Preserva supressão e meta ausente. | O arquivo consultado cobre resultados 2019, 2021 e 2023. Não inventa meta de 2023 nem resultado posterior. |
| SICONFI | Corrige campos, anexos, códigos, colunas, paginação e limite de pessoal do próprio ente. | Primário 2022 e 2023/24 têm definições diferentes, preservadas em metadata. Consulta parcial permanece indeterminada. |
| Portal da Transparência | Remove a busca nominal de servidores que não persistia nada e retorna erro explícito de implementação. | Não existe ainda contrato de gastos federais com conjunto de dados, identidade e tabela de destino. Esta correção não implementa esse produto. |
| Sanções | Falha de SELECT/INSERT não vira ausência de sanções; não anuncia tabela que não foi gravada; erros não expõem documento consultado. | CPF ausente não é substituído por nome. Retorno mascarado exige as demais verificações de identidade já existentes. |
| Filiação | Valida o esquema antes da primeira linha e rejeita arquivo sem registros. | O recurso público encontrado é agregado, com `QT_FILIADO`, sem os campos individuais exigidos. Não serve para atribuir filiação a uma pessoa. |
| Enriquecimento | Wikipedia e Wikidata recusam QID divergente; Instagram exige identidade e contagem válidas, preserva metadata e seguidores anteriores quando indisponível. | Bloqueio do Instagram não confirma existência, ausência ou zero seguidores. URLs de publicações e perfis ambíguos não geram consulta nem gravação. |
| Curadoria | Auditoria passa a contabilizar o estoque vigente por alvo, sem apagar pendências com um run parcial recente. | Publicação de processo, contradição, patrimônio ou trajetória exige fonte, identidade e período compatíveis. Recibo histórico ou linha existente não substitui essa prova. |

## Evidência primária consultada

- [IDEB oficial](https://download.inep.gov.br/ideb/resultados/divulgacao_regioes_ufs_ideb_2023.zip): parser verificou 81 valores, 27 UFs. SHA-256 do ZIP: `8ec8318776126f41ff954270eb6919f922bb58805ca89f3be8ee4a803119809e`. Download HTTPS validado, sem desativação de TLS. Runtime requer `curl` e `unzip`.
- [SICONFI RGF](https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rgf) e [RREO](https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo): leitura das 27 UFs, 2022/2023/2024, 243 consultas, 324 valores interpretados, zero erro ou resposta vazia na prova com writer em memória.
- [Atlas, série 20 estadual](https://www.ipea.gov.br/dados-api/series-values/20/3): 270 taxas de 2015 a 2024. [Série 25](https://www.ipea.gov.br/dados-api/series-values/25/3) e [série 35](https://www.ipea.gov.br/dados-api/series-values/35/3): HTTP 200 com array vazio. [Catálogo](https://www.ipea.gov.br/cms/api/series?pagination%5BpageSize%5D=100): 174 séries em duas páginas.
- [Swagger do Portal](https://api.portaldatransparencia.gov.br/v3/api-docs): confirma `codigoSancionado` em CEIS/CNEP e `cpfSancionado` em CEAF. Leituras nacionais autenticadas confirmaram o formato dos três cadastros, sem atribuição individual.
- [Filiação agregada TSE](https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip): 29 colunas, incluindo `QT_FILIADO`, sem esquema individual compatível.

As leituras acima são provas de interpretação e disponibilidade, não prova de gravação em produção. [confidence: alta, source: HTTPS primário e testes com writers em memória em 2026-09-09] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Estoque e revisão editorial

No snapshot de 9 de setembro, os recibos indeterminados vigentes somavam 121 processos, 33 patrimônios, 57 trajetórias e 12 contradições, incluindo perfis fora do ar. No recorte público: 102, 30, 41 e 10, respectivamente. São estados dos recibos, não contagens de fatos incorretos no site.

O cruzamento de processos não encontrou lote antigo pendente de aplicação: 152/152 planos históricos ainda públicos já tinham recibo equivalente; 33 slugs saíram da coorte. As dez contradições públicas continuavam bloqueadas por fontes no arquivo versionado. Reaplicar tudo apagaria decisões posteriores, inclusive correções de identidade.

Referências de revisão: `scripts/aplicar-evidencia-processos-curadoria.ts`, `scripts/registrar-revisao-curadoria.ts`, `QA/evidencias/2026-08-10-item2-judicial/proposta-66-25/manifesto-processos-curadoria-66.json`, `QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/manifesto-processos-curadoria-69.json` e `QA/evidencias/2026-08-05-contradicoes-curadoria-decisions.json`.

[confidence: alta, source: SELECT somente leitura em coleta_log/candidatos e cruzamento dos artefatos em 2026-09-09] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Verificação reproduzível

Node 24. Rodar `npm test`, `npm run lint`, `npm run check:scripts` e `npm run build`. Regressões específicas em `tests/ingest-state-indicators-debt.test.ts`, `tests/ingest-identity-sources-debt.test.ts`, `tests/ingest-enrichment-debt.test.ts`, `tests/enrich-instagram-debt.test.ts` e `tests/data-freshness-artifacts.test.ts`.

Depois do merge: executar somente as fontes reparadas pelo pipeline canônico, comparar os recibos com as linhas persistidas, revalidar o cache e rodar a auditoria de atualização em `main`. Não reclassificar recibos antigos em lote. O inventário manual por alvo não altera o contrato das fontes agendadas.
