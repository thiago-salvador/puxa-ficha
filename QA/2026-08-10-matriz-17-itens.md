# Matriz canônica dos 17 itens da nota PF Ajustes

Atualizada em 11/08/2026 pela Sessão Raiz após remedição e integração local das
quatro frentes residuais. O item 18, layout de email, está formalmente adiado e
fora deste escopo.

Esta é a única matriz canônica. Nomes citados na nota são casos de regressão,
nunca o limite da correção. `PRONTO LOCAL` não significa verde: cada linha só
fica verde depois do ato autorizado, deploy do mesmo SHA e readback público.

## Estado integrado no RC remoto

- RC final: `84b8a47c76d456d3cc5fb4cca71851c02ddfc59c`, com as PRs #160, #163,
  #164, #165, #166 e #167 mergeadas em `rc-lancamento`.
- As PRs #157, #158, #159 e #161 foram fechadas como superadas, sem merge;
  seus deltas estão incorporados e evoluídos no RC.
- A PR #156 continua aberta contra `main`. `main` e produção permanecem no SHA
  `7e3e4165b0536aee50a68647488e93dd6127446c`.
- Replay local medido no RC mais a correção residual: 295 aplicadas, 100 falhas
  deliberadas e congeladas, 395 migrations no conjunto.
- Suíte local: 3.003/3.003 testes. Replay de schema: 72 migrations puras,
  323 puladas, zero falha e hash `9ac9fdbdb4d29d52783ce53653048a5aa19df068233b32c7c97fd78c5641f121`.
- O release autorizado aplicou nove migrations e voltou a parar no primeiro
  readback divergente. Ledger: 380 versões, topo `20260810120500`. O readback da
  `120500` passou; o da `120000` recusou seis grants `EXECUTE` diretos e
  redundantes nas duas trigger functions. Tabela/view novas seguem vazias e
  financiamento preserva 651 linhas. A correção residual `20260810120600` está
  integrada ao RC pela PR #167, mas não foi aplicada. Nenhuma coleta
  com escrita, merge em `main`, deploy ou ativação de cron foi executada.

## Medições residuais que substituem as referências anteriores

### Judicial, item 2

- Universo público: 194 fichas, 194 com desfecho e zero sem desfecho.
- Antes da evidência aprovada: 9 positivas, 16 ausências confirmadas, zero
  erros e 169 bloqueios editoriais.
- Depois da carga simulada da evidência aprovada: 30 positivas, 16 ausências,
  zero erros e 148 bloqueios editoriais.
- As 28 buscas antes marcadas como bloqueadas foram executadas de fato: 28 com
  URL, 32.379 resultados retornados, 1.388 ocorrências exatas, zero erro de
  rede e 28 bloqueios editoriais reais.
- Há dois manifestos complementares e disjuntos. O lote de 05/08 contém 69
  CNJs em 21 fichas, com payload publicável completo, e foi aprovado
  editorialmente em 11/08/2026 como carga adicional. A curadoria de 10/08 contém
  66 CNJs em 25 fichas confirmadas e 7 fichas indeterminadas. As 66 consultas
  oficiais preservam classe, tribunal, polo, órgão, tipo e data, com status
  procedural neutro e sem inferir mérito, gravidade ou intervalo. O cruzamento deu
  zero CNJs e zero fichas em comum, com união potencial de 135 processos em 46
  fichas. Nenhum conjunto substitui o outro.
- A auditoria de `url_fonte` mediu 55 linhas do Comunica PJe: antes, 45
  apontavam ao próprio CNJ e 10 ao processo representativo de outro registro.
  O gerador foi corrigido globalmente, as 10 fontes foram reconsultadas com
  10/10 HTTP 200 e CNJ no payload, e o manifesto terminou em 55/55 corretas e
  zero cruzadas. As 14 fontes documentais foram preservadas. A alegação externa
  de 16 divergências não foi reproduzida sem lista nominal dos seis restantes.

### Destaques, itens 4 e 14

- Universo: 194 fichas, 162 com conteúdo publicável e 32 sem cards.
- Trajetória mantém 88 fontes em `nunca_verificado`; votações mantém 159.
- A reauditoria nominal das 32 fichas contra cinco fontes encontrou três
  patrimônios publicáveis, sete vazios de sanções confirmados e nenhum voto
  federal atribuível. Trajetória terminou com 8 `sem_achado_no_escopo` no TSE e
  24 `nao_coletado`; votações, com 32 `nao_coletado` por falta de identidade e
  aplicabilidade. Depois das cargas patrimoniais, a projeção é 29 fichas sem card.
- As 32 fichas continuam vazias por falta de verificação, e zero satisfazem o
  contrato completo de vazio honesto com evidência externa. A autoauditoria que
  promoveria esses estados foi retirada do caminho aplicável e preservada apenas
  como experimento em QA.
- DOM: 194 de 194 fichas sem divergência. Há 423 cards de mandato e zero sem
  proveniência efetiva.

### Financiamento, itens 6, 9 e 16

- Universo disputado: 722 pleitos. A remedição encontrou 235 pleitos ainda não
  coletados em 107 fichas, e não os 153 em 80 fichas da referência anterior.
- O recorte histórico de 2002 a 2008 contém 121 lacunas em 67 fichas, e não 93.
- Simulação global dos 235: 141 dados publicados, 57 ausências oficiais
  confirmadas, 37 erros explícitos, zero `nao_coletado` e zero novo
  `zero_declarado`.
- Dos 37 erros, 19 são do layout oficial de receitas de 2004, que não traz SQ
  suficiente para comprovar a identidade, e 18 são identidades não provadas.
- Identidade financeira exige `SQ_CANDIDATO + ano + UF` em todos os anos. Sem a
  tupla completa, o ingest recusa e persiste erro, nunca ausência.
- Regressões obrigatórias: Daciolo 2006, SQ 12132/RJ, R$ 1.259,44; Daciolo
  2008, SQ 14144/RJ, R$ 720,00; Flávio 2002, SQ 851/RJ, R$ 5.988,00; Rui 2006,
  SQ 27/BR, R$ 11.000,00. O manifesto também inclui amostras adversariais fora
  desses nomes.

## Matriz dos 17 itens

| # | Item e causa | Correção global | Universo medido | Prova local | Ato externo identificado | Readback público exigido | Estado |
|---:|---|---|---|---|---|---|---|
| 1 | Re-run de patrimônio e 16/08. Treze ausências de 2026 não eram revisitadas, dois SQs ficaram fora do manifesto e duas ausências foram inferidas de zero linhas. | Runner compara o pacote atual do TSE; migration cobre o delta; zero linha sem `ST_DECLARAR_BENS = N` permanece `nao_coletado`; cron continua desligado. | 32 células de 2026: 10 publicações, 1 retificação, 19 sem mudança e 2 ausências sem evidência corrigidas. | Dry-run e hashes oficiais versionados; readback exato das 13 fichas alteradas; harness PG17 com 9 ramos e 21 operações. | Aplicar a migration de patrimônio e, em ciclo separado e autorizado, ativar o cron. | Conferir as 32 células na ficha pública e a execução agendada após 16/08. | PRONTO LOCAL, NÃO VERDE |
| 2 | Judicial. Bloqueio editorial escondia buscas não executadas, duas curadorias independentes não estavam reconciliadas, o gerador podia cruzar URLs e seis linhas legadas eram públicas sem número nem fonte nominal. | Retry fail-closed, resultado obrigatório por ficha, busca real das 28, dois manifestos complementares, contrato procedural neutro e fonte nominal por processo. As seis linhas legadas terminam em cinco registros oficiais corrigidos e um claim de Andorra despublicado com bloqueio `indeterminado`, nunca ausência. | 194/194 com desfecho; 28/28 buscas executadas; 69/21 mais 66/25, zero sobreposição, união potencial 135/46; 66/66 consultas oficiais completas; 55/55 URLs do Comunica PJe no próprio CNJ; seis linhas legadas reconciliadas. | Harnesses PG17 dos lotes 69/21 e 66/25; 10/10 URLs corrigidas reabertas; migration legada com 7 cenários e 19 asserções, readback de dez métricas exatas; testes de identidade, fonte, privacidade, neutralidade, despublicação e rollback. | Autorizar `20260810122000`, `20260810123000` e `20260811101200`, cada uma com transação, ledger e readback imediato. | Conferir banco, API, DTO e DOM das 194 fichas, incluindo os dois lotes, as 28 buscas e as seis linhas legadas. | PRONTO LOCAL, NÃO VERDE |
| 3 | Sanções CEIS, CNEP e CEAF. Estados silenciosos e CPFs ausentes podiam virar falsa ausência. | Coletor dry-run fail-closed, CPF com zeros à esquerda e erro explícito de fonte ou identidade. | 194 fichas, 164 consultáveis e 30 sem CPF. | 17/17 testes de zero escrita e remedição ficha a ficha. | Autorizar e executar a coleta com escrita auditada. | Conferir sanções e proveniência nas 194 fichas, sem ausência derivada de erro ou falta de CPF. | PRONTO LOCAL, NÃO VERDE |
| 4 | Destaques vazios. A superfície não distinguia vazio honesto de fonte nunca verificada. | Contrato de proveniência por fonte em banco, API, DTO e DOM; TSE-8 limitado; migration residual troca toda lacuna por `sem_achado_no_escopo` ou `indeterminado` nominal, sem transformar bloqueio em ausência. Cinco trajetórias ganham fonte oficial e uma data ABDI incorreta é corrigida. | 194 fichas e 970 células. Após todas as dependências: 292 estados residuais, sendo 80 de trajetória, 32 de patrimônio e 180 de votações; 241 indeterminados e 51 limitados; zero `nunca_verificado` e zero `nao_coletado`. Permanecem 29 fichas sem card por bloqueio factual honesto. | Manifesto 194x5 com payload e endpoint nominal nas 970 células; zero conteúdo sem fonte; readback e DOM 194/194 sem divergência; PG17 residual com 7 cenários e 12 asserções; PG17 de Cadu/Cappelli com 7 cenários e 17 asserções; zero `vazio_confirmado` novo. | Autorizar `20260810124000`, `20260811101000` e `20260811101100`, cada uma com ledger e readback. Identidade ou fonte futura para os resíduos é trabalho factual contínuo. | Conferir banco, DTO, API e DOM das 194, inclusive as 29 vazias, os 51 resultados limitados e os 241 indeterminados. | PRONTO LOCAL COM RESÍDUO FACTUAL HONESTO, NÃO VERDE |
| 5 | Daciolo aparecia como Não Eleito apesar de `ELEITO POR QP`. | Resultado vem do registro eleitoral, não da forma visual da linha. | 280 fichas e 1.454 linhas. | Invariante eleitoral correspondente em zero e teste de regressão. | Integrar e publicar o mesmo SHA. | Conferir a linha eleitoral do Daciolo e o invariante global. | PRONTO LOCAL, NÃO VERDE |
| 6 | Dados financeiros não coletados. O ingest começava em 2010 e confundia lacuna, zero e ausência. | Layouts 2002 a 2008, estados persistidos distintos e identidade por SQ, ano e UF. | 235 lacunas em 107 fichas; 121 entre 2002 e 2008 em 67 fichas. | Manifesto reproduzível; 12 hashes oficiais; harness PG17 e regressões nomeadas mais adversariais. | Carga e correção `20260812123000` da ACL aplicadas; integrar o readback portátil, revalidar cache e repetir a Fase 4. | Conferir os 235 pleitos em banco, API, DTO e DOM, com zero `nao_coletado` e sem `sourceStatus = degraded`. | BLOQUEADO NO READBACK OPERACIONAL, NÃO VERDE |
| 7 | Votações-chave usavam casamento frouxo e o Senado promovia proposição, duplicata, sessão secreta ou rótulo `Votou` como voto publicável. | Câmara usa chave exata e dataset v2. Senado elimina o matcher por proposição, exige `CodigoSessaoVotacao`, persiste apenas polaridade oficial e retira o que não é rastreável. | Câmara: 723 votações na 55ª e 1.006 na 57ª. Senado: 13 linhas e 81 pares antes; 6 eventos oficiais e 75 pares depois; 7 linhas retiradas fail-closed; 28/28 IDs auditados. | Harnesses PG17 de Câmara e Senado; no Senado, aplicação, rollback e estado adversarial sem mutação parcial; 15/15 testes focais. | Confirmar backup e autorizar `20260810090000/090100/090200`, depois `20260811100000/111001`, com ledger e readback por migration. | Conferir distribuição, fonte, polaridade e conteúdo das votações em todas as fichas afetadas. | PRONTO LOCAL, NÃO VERDE |
| 8 | Autoria repetia reapresentações e não destacava PLs relevantes. | Dedupe por reapresentação e promoção somente quando o tipo publicável é provado. | 194 fichas; Daciolo 204 para 178 proposições distintas; repetidas 5 para zero. | Readback integrado e testes de autoria. | Integrar e publicar o mesmo SHA. | Conferir cards e listas de autoria nas 194 fichas. | PRONTO LOCAL, NÃO VERDE |
| 9 | Flávio e outras fichas omitiam financiamento de pleitos disputados. | Mesma reconciliação global do item 6, sem limitar a correção ao exemplo. | 235 lacunas em 107 fichas; Flávio 2002 confirmado em R$ 5.988,00. | Manifesto completo, prova de API e DOM e teste do caso Flávio. | Mesmo ato de readback portátil, cache e Fase 4 do item 6. | Conferir todas as fichas afetadas e o card visível de Flávio 2002. | BLOQUEADO NO READBACK OPERACIONAL, NÃO VERDE |
| 10 | Datas e estados eleitorais contraditórios geravam mandatos sobrepostos ou rótulos falsos. A remedição global também revelou cinco timelines partidárias incompletas, com João Rodrigues e Renan Filho contaminados por homônimos de outra UF e Orleans Brandão misturando duas pessoas. | Regra de precedência e classificação explícita dos conflitos; validação fail-closed de SQ por identidade, UF e cargo; quarentena reversível de linhas contaminadas; separação do perfil de Orleans; três âncoras TSE 2026 sem promover `#NULO` a candidatura registrada ou deferida. Orleans permanece público somente por declaração rastreável de pré-candidatura, com `cargo_atual` nulo e fontes oficiais distintas para exercício e exoneração do cargo anterior. | 194 fichas públicas, 271 candidatos no seed e 639/639 SQs pré-carregados auditados na fonte oficial; 6 SQs sem identidade suficiente removidos, 7 UFs históricas explicitadas, zero timeline homônima e zero dinheiro contaminado projetados. | Invariantes globais em zero; manifesto integral 12/6/4/4; harness PG17 com `numeric(15,2)` real em transação única, view pública canônica, 17 FKs, logs, FK futura, `pg_dump` e ledger; adversariais 195 recusados; 3.027/3.027 testes integrados; casos nominais, fontes e hashes pós-sequência versionados. | `20260811102000` aplicada; integrar a correção do manifesto e autorizar `20260811102100` com transação, ledger e readback, depois publicar o mesmo SHA. | Conferir as cinco fichas, a quarentena e o invariante global de identidade e timeline nas 194 fichas. | PRONTO LOCAL, NÃO VERDE |
| 11 | Card de dinheiro do Hertz tinha tipografia e espaço fora do padrão, e gastos não declaravam ordenação global. | Componentes de patrimônio, financiamento e gastos compartilham hierarquia visual; gastos têm ordem anual descendente; auditor compara o conteúdo visível integral ao DTO. | 194 fichas em desktop e 194 em mobile; por viewport, 1.454 cards detalhados, 329 resumos, 10.148 valores, 9.164 linhas, 126 fontes, 440 segmentos e 3.036 doadores. | Igualdade integral DTO/DOM 194/194; zero overflow, sobreposição ou espaço anômalo; mutação Hertz de R$ 100 mil para R$ 999.999.999 rejeitada com diff exato; 24 testes focais. | Integrar e publicar o mesmo SHA. | Repetir a auditoria 194x2 no site publicado, com Hertz e amostra adversarial. | PRONTO LOCAL, NÃO VERDE |
| 12 | Lula 2018 indeferido aparecia como Não Eleito. | Estado próprio de registro indeferido e correção auditada. | 280 fichas. | Harness PG17 com 7 ramos e teste nomeado. | Aplicar a migration do Lula. | Conferir Lula 2018 e o invariante global. | PRONTO LOCAL, NÃO VERDE |
| 13 | Cargo partidário de Renan era tratado como pleito. | Regra positiva fail-closed sobre cargo canônico. | 1.022 linhas públicas; 521 promovidas; zero sem proveniência efetiva. | Auditoria nome a nome e teste de regressão. | Integrar e publicar o mesmo SHA. | Conferir timeline de Renan e todas as categorias de cargo. | PRONTO LOCAL, NÃO VERDE |
| 14 | Renan tinha destaque insuficiente e o vazio global era ambíguo. | Mesma correção global do item 4: estados por fonte em banco, API, DTO e DOM, sem fabricar card nem converter erro, falta de identidade ou fonte incompleta em ausência. | 194 fichas, 970 células e 423 cards de mandato sem fonte ausente; trajetória 106 com conteúdo, 31 limitadas e 57 indeterminadas; patrimônio 161 com conteúdo, 1 ausência externa e 32 indeterminadas; votações finais 14 com conteúdo, 28 limitadas e 152 indeterminadas. | Manifesto nominal 194x5 com payload e endpoint externo, readback e DOM 194/194, zero divergência, zero `nunca_verificado`, zero conteúdo sem fonte e zero `vazio_confirmado` fabricado; casos zero, uma e três fontes. | Mesmos atos `20260810124000`, `20260811101000` e `20260811101100` do item 4; futuras fontes só podem reduzir o resíduo com identidade comprovada. | Conferir Renan e o universo completo de destaques, inclusive os estados limitados e indeterminados. | PRONTO LOCAL COM RESÍDUO FACTUAL HONESTO, NÃO VERDE |
| 15 | Zema 2023 era apresentado como eleição. | Calendário eleitoral validado por ano e tipo de pleito. | 280 fichas. | Invariante global correspondente em zero e teste nomeado. | Integrar e publicar o mesmo SHA. | Conferir Zema e todos os anos ímpares do universo. | PRONTO LOCAL, NÃO VERDE |
| 16 | Rui e outras fichas tinham financiamento incompleto entre candidaturas. | Mesma reconciliação global do item 6, com estados distintos e fail-closed. | 235 lacunas em 107 fichas; Rui 2006 preservado em R$ 11.000,00. | Manifesto completo, payload exato, composição, doadores e DOM visível. | Mesmo ato de readback portátil, cache e Fase 4 do item 6. | Conferir todos os 235 pleitos e a sequência eleitoral de Rui. | BLOQUEADO NO READBACK OPERACIONAL, NÃO VERDE |
| 17 | Samara tinha patrimônio faltando e layout fora do padrão; a reauditoria também encontrou Samara Mineiro 2026 fora do manifesto. | Ausência oficial com fonte e data, re-run global de 32 células e card padronizado. | 194 fichas; Samara Martins 2020 e Samara Mineiro 2026, com 2 bens e R$ 69.196,63, medidos na fonte oficial. | Pacotes e hashes oficiais, readback exato, harness PG17 e screenshots. | Aplicar o re-run do item 1 e publicar o mesmo SHA. | Conferir Samara Martins 2020, Samara Mineiro 2026 e o padrão global dos cards. | PRONTO LOCAL, NÃO VERDE |

## Provas das quatro frentes residuais

| Frente | Provas concluídas localmente |
|---|---|
| Judicial | 66/66 consultas DJEN oficiais, UI/API/DTO/DOM neutros, privacidade e fonte provadas; 194/194 fichas classificadas; 69/21 e 66/25 aprovados e aplicáveis localmente; harnesses PG17 fail-closed; 55/55 URLs do Comunica PJe ligadas ao CNJ correto. |
| Destaques | Contrato de banco, DTO, API e DOM provado; matriz nominal 194x5 com 970 payloads e zero conteúdo sem endpoint; TSE-8 aplicável; carga residual 80/32/180; cinco trajetórias com fonte oficial e ABDI corrigida; 29 vazias permanecem bloqueios factuais honestos. |
| Votações | Câmara preserva a reconciliação anterior. Senado fecha 13 linhas/81 pares em 6 eventos/75 pares, retira 7 linhas inseguras, audita 28/28 IDs e prova migration, rollback e estado adversarial em PG17. |
| UI dinheiro | Playwright prova 194 fichas em desktop e 194 em mobile, 1.454 cards financeiros/patrimoniais por viewport mais 65 gastos, zero overflow, sobreposição, espaço anômalo ou divergência DTO/DOM. |
| Financiamento | 2.882/2.882 testes, typecheck, check:scripts, lint, settings, allowlist, manifesto, 12/12 hashes oficiais, harness PG17 e replay isolado 293 + 92 = 385. O Webpack compilou e parou no export inválido preexistente `createDeleteDataHandler` da rota de alertas. |
| Patrimônio | 32 células, 21 operações, readback exato das 13 fichas alteradas, 28/28 testes focais e harness PG17 com 9 ramos. |
| Integração | 2.997/2.997 testes; replay real 293 + 100 = 393; replay de schema 70 + 323 = 393, zero falha e hash canônico preservado. Typecheck, check de scripts, lint sem warnings, Settings, 26 recortes/46 migrations anotadas, 13/13 provas PG17, build Turbopack e CodeQL passaram no RC `7bd30e3`. |

## Bloqueios restantes e próximo ato externo

O review independente corrigiu dois claims. O conjunto judicial 66/25 existe e
é adicional ao 69/21, não uma versão concorrente. Também não há 32 vazios
honestos: há 32 fichas vazias por falta de verificação e zero vazios completos
com evidência externa.

Os lotes 69/21 e 66/25 foram aprovados editorialmente e promovidos ao diretório
aplicável, sem aplicação remota. O TSE-8 também foi aprovado e promovido como
`sem_achado_no_escopo`, sem inferir ausência de carreira. Não resta decisão
editorial local. O resíduo de itens 4 e 14 é factual e explícito: identidade ou
fonte aplicável ainda não encontrada, nunca convertido em vazio confirmado.

O RC remoto foi integrado pelas PRs #160, #163 e #164 e está em `7bd30e3`. A auditoria
pós-integração encontrou dívida operacional nos rollbacks e readbacks, sem
alterar o veredito substantivo das 17 linhas: quatro rollbacks não removiam o
próprio ledger, o rollback `20260810090200` excedia em uma chave o conjunto da
forward e nem todas as 17 versões tinham readback fail-closed com ledger. A
correção está preparada em branch isolada, com um readback canônico por versão,
sem aplicação remota. Uma revisão adversarial posterior encontrou falsos verdes
de cardinalidade, payload e DDL nos contratos iniciais. Eles foram endurecidos
localmente para comparar o payload integral e, nas migrations estruturais, só os
objetos que cada forward controla, incluindo ownership, opções de segurança,
ACLs e ausência de extras. Os cinco rollbacks auditados agora exigem ledger
próprio e recusam curadoria ou estrutura posterior. Harnesses PostgreSQL 17
provam o aborto com preservação de dados e ledger. O patch passou em
2.997/2.997 testes, 13/13 provas PostgreSQL 17, replay congelado
293 + 100 = 393 e schema gate 70 + 323 = 393; a revisão independente reproduziu
os gates focais e não encontrou nova superfície material. O workflow remoto
agora executa o mesmo agregado quando readbacks, rollbacks ou harnesses mudam.
O CI remoto, o replay, o schema gate, o CodeQL, as rotas e o Vercel passaram no
novo head. Não resta integração local antes do ato de migrations.

O backup fresco foi confirmado pelo job #31464234087, com catálogo legível por
`pg_restore --list`, artefato cifrado e digest conferido. Não houve restauração
completa, e este documento não a alega. A PR #163 tratou os dois alertas
CodeQL, que estão verdes no delta final. Aplicação, merge em `main`, coleta, deploy e
cron continuam atos separados e exigem autorização que os nomeie.

Até haver cargas autorizadas, integração, deploy do mesmo SHA e readback
público, nenhum dos 17 itens é verde.

Estado operacional em 12/08, 07:45 BRT: a correção dos cinco SHA foi integrada
pela PR #171, mas o novo dry-run da `20260811102100` parou corretamente antes de
qualquer escrita porque o cron das 08:00 UTC avançou `ultima_atualizacao` de
João Rodrigues. Nome, nascimento, UF, cargo, partido, status, `created_at` e os
26 payloads permaneceram exatos. A PR #172 retira somente esse
timestamp volátil das tuplas de identidade do forward e do readback; o harness
prova em separado que avanços do cron são aceitos e que os 13 campos estáveis,
manifesto 12/6/4/4, universo 194 e postimages continuam fail-closed. O dry-run
remoto completo passou depois da correção, com ledger temporário, readback e
fidelidade byte a byte, seguido de rollback. Produção continua em 391 versões,
topo `20260811102000`, sem a `102100`. A matriz continua não verde até integrar
a PR #172, aplicar e ler de volta a `102100`, publicar o mesmo SHA e executar
a Fase 4.

## Estado operacional após a última migration, 12/08/2026

As migrations citadas nas 17 linhas foram aplicadas em produção com transação,
ledger e readback. O ledger tem 392 versões, topo `20260811102100`, e o universo
público permanece em 194 fichas. Isso supersede as pendências de aplicação
descritas na coluna "Ato externo identificado", inclusive a `102100` do item
10. Nenhuma linha é verde ainda: `main` e o deploy continuam em `7e3e416`, as
coletas e o cron não foram executados e falta o readback público final. O item
18 segue formalmente adiado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Estado operacional após a PR #177, 12/08/2026, 11:30 BRT

`main` e produção coincidem em `f0f5b391dc42a37675179b344f6d7fbce59e5a31`.
O ledger está em 393 versões, topo `20260812123000`, e o statement dessa linha
agora coincide byte a byte com a migration, MD5
`ed32564d8f0398e3ba12c6da1fcc0819`.

A Fase 4 manual parou corretamente no primeiro erro, o readback de schema da
`20260810120000` exigia tabela vazia apesar de a carga posterior `121000`
persistir e provar 94 verificações finais. O contrato foi corrigido localmente
para exigir zero antes da `121000` e exatamente 94 depois dela. Harness PG17 e
readback read-only de produção passaram. Os 17 itens continuam sem veredito
verde até integração, deploy do mesmo SHA e repetição integral da Fase 4.
Coletas e cron permanecem fora do ato, e o item 18 segue adiado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Estado operacional após PR #176, 12/08/2026, 11:00 BRT

`main`, produção e `/api/deployment-info` coincidem no SHA
`9c5ae50930c1260b5a1f9b144f63ebc913ec4907`. O readback corrigido da
`20260812123000` passou e as dez tags de cache foram revalidadas com HTTP 200.

A Fase 4 foi interrompida antes do primeiro SELECT de ledger porque o runner
usava `PGDATABASE` para transportar uma URI completa, sem conexão com produção.
A correção está preparada com variáveis libpq próprias, CA oficial e workflow
manual. A matriz permanece sem novo veredito verde até a execução integral da
Fase 4 no SHA publicado. Coletas e cron continuam pendentes e o item 18 segue
adiado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Estado operacional após merge e deploy, 12/08/2026, 09:32 BRT

As PRs #173 e #156 foram mergeadas nos SHAs autorizados. `origin/main`, o
deployment de produção e `/api/deployment-info` coincidem em
`c075780cb92681a1f8c4563e98dca875ede2587f`; o workflow de revalidação de cache
terminou verde. A Fase 4 parou corretamente em vez de promover a matriz: a view
`financiamento_publico` ficou sem grant de coluna para o filtro
`despublicado_em` introduzido pela `20260811102000`, e as fichas afetadas
passaram a responder com `sourceStatus = degraded`.

A correção global e mínima é a `20260812123000`, com migration, rollback,
readback e harness para schemas com e sem `categorias_origem`. O estado
operacional mais recente está registrado abaixo. Os itens 6, 9 e 16 permanecem
bloqueados até readback, cache e Fase 4, e nenhum dos 17 itens recebe veredito
verde. Coletas e cron continuam não executados.

## Estado operacional após a ACL, 12/08/2026, 10:14 BRT

A PR #175 foi mergeada e publicada em
`5a6179efca1cc837cb675514f86acb5e85251691`. A `20260812123000` foi aplicada
com ledger, deixando produção em 393 versões. O readback imediato falhou antes
do cache e da Fase 4 porque chamava `has_column_privilege` para `cpf_hash`,
coluna que a fixture possuía, mas o schema real não.

A ACL aplicada foi confirmada read-only como mínima e funcional. O readback e
o harness foram corrigidos para cobrir explicitamente o catálogo real sem
`cpf_hash` e `cnpj_doador`; a prova corrigida passou contra produção, mas o ato
operacional permanece interrompido até integração e autorização para repetir
readback, cache e Fase 4. Não reaplicar nem reverter a migration.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Estado operacional após a PR #178, 12/08/2026, 12:22 BRT

`main`, produção e `/api/deployment-info` coincidem no SHA
`eca104f4910a4a1398716ea10f4ac8d3e82d0e1c`. A Fase 4 manual, run
`31609453915`, passou pelo contrato de schema financeiro corrigido e parou no
readback da carga `20260810121000`, com exatamente três divergências.

Os três alvos são os pleitos de 2006, 2014 e 2018 do governador Carlos Orleans
Brandão Junior. A migration de integridade `20260811102100` arquivou essa
identidade e transferiu o slug `orleans-brandao` ao pré-candidato Carlos Orleans
Braide Brandão; o readback antigo ainda tratava o slug como identidade estável.
Produção conserva os três alvos no UUID correto, e a leitura read-only provou
payload integral e as coortes 141/94/235.

A correção ancora o conjunto por UUID, nome completo e nome de urna, exige o
ledger da divisão para o único fallback temporal e continua recusando qualquer
drift. A matriz permanece sem novo veredito verde até integração, deploy do
mesmo SHA e execução integral da Fase 4. Coletas e cron continuam pendentes, e
o item 18 permanece adiado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Preflight dos readbacks restantes da Fase 4, 12/08/2026, 13:17 BRT

A revisão preventiva depois da correção financeira encontrou dois readbacks
que ainda dependiam do slug mutável de Orleans: os dois processos da
`20260810122000` e a assinatura das 292 linhas da `20260811101000`. Produção
mantém os registros nos UUIDs corretos; o defeito estava somente na prova
temporal.

Os contratos agora aceitam exatamente os estados pré e pós-
`20260811102100`, condicionados ao ledger e à identidade nominal. As provas
PostgreSQL recusam split sem ledger, nome adulterado, payload divergente e
duplicidade. Isso remove dois falsos bloqueios previstos, mas não muda o
veredito da matriz: os 17 itens ainda aguardam merge, deploy e execução
integral do readback público da Fase 4. Coletas e cron permanecem pendentes, e
o item 18 continua adiado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Execução da Fase 4 após a PR #179, 12/08/2026, 14:17 BRT

A PR #179 foi mergeada e publicada no SHA
`b96cec8b0c338c824fdab6f2351d8ef4e8f9def7`. O run manual
`31621678781` mediu `194/194` fichas e `970/970` células, mas interrompeu no
primeiro desvio: as cinco fontes do novo perfil `orleans-brandao` permaneciam
em `nunca_verificado`. Logo, os itens 4 e 14 continuam não verdes e nenhum dos
demais itens recebe promoção por esta execução parcial.

A causa global é temporal. A carga residual cobriu as 194 identidades antes do
split; o split posterior criou uma nova identidade pública. A proposta
`20260812124000` fecha exatamente as cinco células, com quatro estados
`indeterminado` e uma trajetória `sem_achado_no_escopo`, sem transferir dados
do governador homônimo e sem criar ausência. O universo projetado volta a
`194/194`, `970/970` e zero células silenciosas, preservando 29 fichas sem card
por bloqueio factual explícito. A prova local está verde, mas o ato externo continua pendente:
integrar, aplicar a migration com ledger/readback, revalidar cache e repetir a
Fase 4 integral no mesmo SHA publicado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
