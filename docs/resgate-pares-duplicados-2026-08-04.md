# Resgate dos pares duplicados e higiene do elenco (2026-08-04)

Quando um candidato trocou de corrida, criou-se registro NOVO e o antigo ficou
fora do ar COM acervo. Os achados do registro morto ficavam invisíveis à fila de
revisão, que só enxerga publicáveis. Este lote resgata os 3 pares identificados,
arquiva os registros mortos, corrige o cargo de Adriana Accorsi, filtra os
ingests por publicável e relata o acervo dos inativos.

Ferramentas: `scripts/audit-resgate-pares-duplicados.ts` (inspeção), `scripts/apply-resgate-pares-duplicados.ts`
(dry-run + apply, idempotente por marcador `resgate_2026_08_04` em
`dados_relacionados`), `scripts/audit-acervo-nao-publicados.ts` (coleta paginada).
Nenhuma migration nova foi criada (a numeração em `supabase/migrations/` está
sendo usada por trabalho paralelo; tudo foi feito por script com service role).

## Regra de segurança aplicada

Todo achado migrado entrou com `verificado=false` e `visivel=false`, MESMO quando
a origem era verificada: a verificação original valeu para outra corrida. Tudo cai
na fila de revisão humana; nada foi ao ar. Proveniência anotada em
`dados_relacionados.resgate_2026_08_04 = { migrado_de_slug, origem_id }` e, nas
posições, em sufixo na `descricao`. Nenhum DELETE foi executado.

## Tarefa 1 — par a par

### tarcisio (morto, removido) → tarcisio-gov-sp (ativo, Governador SP)

| Tabela | Morto | Ativo | Decisão |
|---|---|---|---|
| pontos_atencao | 6 (todos verificados no morto) | 3 (ia, sem revisão, invisíveis) | 5 migrados; 1 consolidado (abaixo) |
| posicoes_declaradas | 3 (curadoria, sem revisão) | 0 | 3 migradas com verificado=false |
| processos | 0 | 1 | nada a migrar |
| patrimonio | 1 (2022, R$ 4,68 mi, 12 bens) | 1 (2022, R$ 2,34 mi, 6 bens) | NÃO migrado: mesmo ano com valores conflitantes; a linha 2022 correta é a do ativo (corrida de 2022 foi a de governador). Discrepância relatada |
| financiamento | 1 (2022, R$ 77,2 mi) | 1 (2022, R$ 38,6 mi) | NÃO migrado: mesmo conflito; total de 77 mi não fecha com teto de governo estadual |
| historico_politico | 3 | 4 | nada único (Ministro da Infraestrutura e Governador já estão no ativo; linhas "Governador ?-atual" do morto são lixo duplicado) |
| noticias_candidato | 101 (86 com URL única) | 399 | NÃO migradas (ver "Notícias" abaixo) |
| mudancas_partido | 1 | 1 | idênticas (SEMPARTIDO→REPUBLICANOS 2022) |
| legislacao_mandato_executivo | 885 (ALESP, governo SP) | 886 | nada a migrar: o ativo JÁ contém todos os 885 identificadores do morto (conferido por `identificador_fonte`; sobra 1 ato só no ativo, lei 18.447/2026). A contagem antiga de "398 x 0" era truncamento de 1000 linhas do PostgREST na inspeção |
| gastos/votos/sancoes | 0 | 0 | nada |

Pontos migrados (todos para a fila, verificado=false, visivel=false):
1. "Recorde de concessões rodoviarias como ministro" (feito_positivo, media)
2. "Aprovação acima de 50% como governador de SP" (feito_positivo, baixa — fonte é domínio nu, mas gravidade baixa passa no gate de escrita)
3. "Mudou domicilio eleitoral para SP sem residência previa" (contradição, media)
4. "Defensor consistente de privatizações" (contradição, baixa)
5. "Tiro durante comicio em Paraisopolis (2022)" (escândalo, alta, com fonte g1)

**Duplicata de história consolidada:** "Operação policial com 56 mortes em Baixada
Santista" (morto, crítica, verificada, fonte g1 com caminho) e "Violência policial
recorde" (ativo, crítica, sem revisão, SEM fonte) são o mesmo evento (Operação
Escudo). Consolidado na linha ativa `a5a31164`: descrição recebeu os dois textos
originais concatenados (zero reescrita), fontes receberam a URL verificada do
morto, proveniência anotada. A linha segue visivel=false/verificado=false.

### ciro-gomes (morto, agora removido) → ciro-gomes-gov-ce (ativo, Governador CE)

| Tabela | Morto | Ativo | Decisão |
|---|---|---|---|
| pontos_atencao | 4 (verificados) | 2 | 4 migrados; nenhuma sobreposição com os 2 do ativo |
| processos | 1 (criminal, agressão a jornalista, sem fonte) | 1 (VPG, 1ª instância) | NÃO migrado: tabela não tem flag de revisão, entraria direto no ar; o fato já vai coberto pelo ponto "Agressao a jornalista durante campanha" agora na fila |
| patrimonio | 2 (2018 e 2022) | 1 (2022) | 2018 migrado (ano ausente, dado TSE); 2022 NÃO migrado (conflito de valores: 6,08 mi x 3,04 mi) |
| financiamento | 2 (2018 e 2022) | 1 (2022) | 2018 migrado; 2022 NÃO migrado (mesmo total de 36,0 mi nos dois, mas a linha do ativo tem 10 doadores contra 3 do morto — ativo é mais completo) |
| historico_politico | 9 | 9 | nada único (mesmos fatos; convenções de período diferem: morto "2006-2010" = ativo "2007-2011" do mandato eleito em 2006) |
| projetos_lei | 95 | 95 | 100% sobrepostos por `proposicao_id_api` |
| noticias_candidato | 171 (98 com URL única) | 283 | NÃO migradas (ver abaixo) |
| mudancas_partido | 8 | 6 | 2 linhas só no morto NÃO migradas: "PPS→PSB 2006" duplica a de 2005 e "PSB→PDT 2018" contradiz a linha PROS→PDT 2015; ambas são ruído de leitura TSE entre eleições |
| legislacao_mandato_executivo | 108 | 103 | 5 migradas: leis estaduais do governo CE 1991-1994 (11.889/1991, 12.010/1992, 12.207/1993, 12.215/1993, 12.269/1994, fonte CE-BELT), com `historico_politico_id` reapontado para a linha de governador do ativo. As 103 restantes (prefeitura de Fortaleza) já existem no ativo |

Pontos migrados: "Governador do Ceará com investimento em educação" (media),
"Nao apoiou Lula no 2o turno de 2018 e 2022" (alta), "7 partidos em 30 anos de
carreira política" (media), "Agressao a jornalista durante campanha" (alta).
Todos com fonte com caminho — passaram no gate de escrita da migration
20260725160000 mesmo em gravidade alta.

### fernando-haddad (morto, removido) → haddad-gov-sp (ativo, Governador SP)

| Tabela | Morto | Ativo | Decisão |
|---|---|---|---|
| pontos_atencao | 2 | 1 | 2 migrados |
| demais tabelas | 0 | (patrimonio 4, financiamento 4, historico 8, noticias 247, processos 2, legislacao 602, mudancas 1) | morto não tinha mais nada |

Pontos migrados: "Condenado em 2a instancia por caixa 2" (alta, verificada na
origem, fonte g1 — a descrição registra que o TSE anulou a condenação em 2022) e
"Ministro da Fazenda com déficit fiscal crescente" (media, já era não verificada
na origem). Sobre a atuação como ministro e como prefeito de SP, válidas para a
disputa estadual.

### Notícias — decisão de NÃO migrar (184 únicas no total)

Mortos de tarcisio e ciro-gomes guardam 86 e 98 notícias com URL ausente no ativo.
Não foram migradas por dois motivos:
1. INSERT em `noticias_candidato` dispara o trigger `log_candidate_change`, que
   grava uma linha por notícia em `candidate_changes`; o digest de alertas
   (`src/app/api/alerts/send-digest/route.ts`) anuncia essas linhas aos
   assinantes (janela por envio, teto de 40). Migrar inundaria os assinantes dos
   dois governadores com notícia velha.
2. Notícia não é achado editorial: é re-coletável pelo ingest google-news quando
   o registro está publicável, e não passa por fila de revisão.

Se o Thiago quiser o acervo no ativo, o caminho é migrar com o trigger de
candidate_changes desabilitado na sessão (ou aceitar o digest). Decisão dele.

## Fila de revisão

Antes: **47** (6 posições sem revisão + 36 pontos pendentes + 5 pontos de IA no
ar sem revisão). Depois: **61** — 11 pontos migrados + 3 posições migradas.
A consolidação do Escudo não somou item novo (a linha ativa já estava na fila).

## Tarefa 2 — arquivamento e auditoria status x publicavel

Feito: `ciro-gomes` de `pre-candidato` para `removido` (estava no balde errado,
"aguardando publicação"). `tarcisio` e `fernando-haddad` já eram `removido`;
os três já eram publicavel=false. O mecanismo existente é esse: flag + status.

Auditoria dos 86 fora do ar (só listagem, sem correção em massa):

| status | quantidade | leitura |
|---|---|---|
| pre-candidato | 55 | a maioria é legítima: Senado/Câmara (fora do escopo do site) ou governadores aguardando convenção |
| desistente | 19 | consistente (todos com cargo_disputado='Nenhum' ou corrida encerrada) |
| removido | 11 | consistente (inclui os 3 pares deste lote e presidenciais arquivados) |
| ativo | 1 | **inconsistente** |

Casos em que a classificação mente, para o Thiago decidir:

1. **marcio-franca** — status `ativo`, que nem existe no domínio de
   `src/lib/types.ts` (pre-candidato/candidato/indeferido/desistente/removido),
   com publicavel=false. Se fora da corrida, o valor correto é desistente/removido.
2. **ciro-gomes** — corrigido neste lote (era pre-candidato).
3. **maria-da-consolacao** — pre-candidato a Deputado Federal/MG, mas a
   varredura de 30/07 registra que ela retirou a pré-candidatura (o PSOL-MG
   reprovou candidatura própria). Cargo e status merecem re-checagem.
4. **aldo-rebelo** — pre-candidato/Presidente fora do ar. Já foi publicado
   (migration 20260524034000) e depois despublicado; se desistiu, o status
   deveria refletir.
5. **ratinho-junior** — pre-candidato/Presidente fora do ar, sem gêmeo ativo.
   Igual ao anterior: se a pré-candidatura presidencial não está de pé, o
   rótulo mente.

Nenhum outro caso encontrado. Os `pre-candidato` restantes ou disputam cargo que
o site não cobre (Senado/Câmara — 24 casos) ou são governadores com convenção
pendente/registro por vir — classificação correta para quem está fora do ar
aguardando ato verificado.

## Tarefa 3 — Adriana Accorsi

`adriana-accorsi`: `cargo_disputado` de `Governador` para `Deputado Federal`.
Ela disputa reeleição à Câmara (convenção de 01/08, ver
`docs/varredura-governadores-2026-08-03.md`); era o sétimo caso de "mudou de
cargo" daquela varredura que tinha passado. Segue publicavel=false (o site não
cobre Deputado Federal).

## Tarefa 4 — filtro de publicável nos ingests

Causa raiz: os 17 ingests/enriches montam a lista de candidatos pelo seed
`data/candidatos.json` via `loadCandidatos()` — e o seed tem 271 registros,
incluindo não publicáveis (ciro-gomes, adriana-accorsi, marcio-franca,
aldo-rebelo...). Nenhuma leitura da tabela crua era a origem da lista; os
`from("candidatos")` internos são lookups pontuais por slug/id/CPF que herdam o
escopo da lista.

Correção: helper novo `loadCandidatosPublicos()` em `scripts/lib/helpers-db.ts`
— cruza o seed com os slugs da view `candidatos_publico` (publicavel=true) em
uma query só. Os 17 arquivos trocaram `loadCandidatos()` por
`await loadCandidatosPublicos()`:

| Arquivo | Nota |
|---|---|
| ingest-tse.ts | roster filtrado; allowlists de patrimonio/financiamento herdam o filtro |
| ingest-tse-situacao.ts | deixa de atualizar situacao_candidatura dos 86 fora do ar; quem voltar coleta na republicação |
| ingest-tse-historico.ts | idem |
| ingest-filiacao.ts | idem |
| ingest-camara.ts / ingest-senado.ts | filtro também vale com `targetSlugs`/`--slug` explícito |
| ingest-tcu.ts / ingest-transparencia-sanctions.ts | match por CPF deixa de alcançar não publicados |
| ingest-transparencia.ts | STUB (não persiste); filtro mesmo assim pela economia de API |
| ingest-wikidata.ts / ingest-wikidata-politico.ts | idem filtro com `--slug` |
| ingest-jarbas.ts / ingest-ceaps-senado.ts / ingest-google-news.ts | |
| enrich-wikipedia.ts | sem o filtro, chegava a gravar foto placeholder em não publicado |
| enrich-instagram.ts / enrich-wiki-historico.ts | |

Sem alteração (justificativa):
- `scripts/lib/tse-resolver.ts` — recebe a lista por parâmetro e limita o lookup
  de CPF a ela; herda o filtro do chamador.
- `scripts/lib/helpers.ts` (`loadCandidatos`) — mantido integral: seed continua
  sendo a fonte do roster completo para validate-seed, persist-sq e para a
  hipótese de republicação.
- ingests de indicadores estaduais (ibge, ideb, ipea, siconfi, capag,
  atlas-violencia) — não percorrem candidatos.
- `scripts/ingest-all.ts` — orquestrador puro.

Resultado medido: o roster processado cai de 271 para 194. Exceções legítimas a
não publicados: nenhuma identificada — a política é "coleta na republicação".

## Tarefa 5 — inativos com acervo (relato, sem ação)

Coleta paginada (a primeira passada truncava em 1000 linhas por query e
subcontou tudo). Maiores acervos entre os 86 fora do ar; a lista completa está
na saída de `scripts/audit-acervo-nao-publicados.ts`. Os nomes citados no pedido
fecham: Aécio Neves (76 notícias, mais 3.807 atos e 135 projetos), Pedro Cunha
Lima (133 projetos, 87 notícias), José Carlos Aleluia (146 projetos), Eduardo
Leite (89 notícias, 4 pontos de atenção).

| Slug | Total | Destaques |
|---|---|---|
| aecio-neves | 4046 | legislacao=3807, projetos=135, noticias=76, 1 ponto |
| eduardo-leite | 1195 | legislacao=1082, noticias=89, 4 pontos, 1 processo |
| tarcisio | 1001 | pontos=6 (5 já resgatados neste lote), legislacao=885 (já no ativo), noticias=101 |
| ricardo-nunes | 810 | legislacao=718 (prefeitura SP), noticias=67, 3 pontos, 3 processos |
| ratinho-junior | 577 | projetos=473, noticias=65, 2 pontos |
| ciro-gomes | 400 | resgatado neste lote; noticias=171 e processo criminal ficam no morto |
| decio-lima | 382 | projetos=320 |
| eduardo-braga | 373 | projetos=189, noticias=149 |
| alexandre-curi / erika-hilton | 305 cada | projetos=181 / projetos=242 |
| guilherme-derrite | 293 | projetos=173, noticias=99, 3 pontos, 2 processos |
| gilberto-kassab | 289 | projetos=156, noticias=110 |
| aldo-rebelo | 276 | projetos=136, noticias=111, 4 pontos |
| confucio-moura / dr-fernando-maximo / rodrigo-pacheco / soldado-sampaio | 269 cada | projetos 148-195 |
| tarcisio-motta | 265 | projetos=203 |
| anderson-ferreira | 264 | projetos=110, noticias=134, 2 pontos |
| geraldo-alckmin | 259 | projetos=109, legislacao=55, 2 processos |
| pedro-cunha-lima | 235 | projetos=133, noticias=87 |
| jose-carlos-aleluia | 230 | projetos=146, noticias=63 |
| adriana-accorsi | 214 | projetos=150 (cargo corrigido na T3; segue fora do ar) |
| marcio-franca | 204 | projetos=100, noticias=80, 2 processos (e status 'ativo' inválido) |

Demais destaques com pontos de atenção pendentes de destino: jair-bolsonaro
(5 pontos, 100 projetos), pablo-marcal (4 pontos), aldo-rebelo (4),
guilherme-boulos (2), marina-silva (2), michelle-bolsonaro (2), simone-tebet (2).

A decisão sobre o destino de cada acervo (arquivar de vez, republicar, ou minerar
para a ficha nova) é do Thiago. Nada foi tocado.

## Conformidade com as proibições

- Nenhum DELETE em qualquer tabela (arquivamento foi flag+status).
- Nenhum dos 27 slugs de 03/08 foi tocado.
- Nenhuma publicação/despublicação fora dos 3 mortos deste lote
  (ciro-gomes só mudou status; publicavel não mudou em ninguém).
- Todo achado migrado está verificado=false e visivel=false (conferido por query
  pós-apply: zero migrados com qualquer flag ligada).
- Nenhum dado inventado: migração copiou texto/fonte das linhas de origem, e a
  consolidação concatenou os dois textos originais sem reescrita.
