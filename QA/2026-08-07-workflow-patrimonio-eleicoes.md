# Sessão de 2026-08-07 — Workflow de patrimônio por eleição e candidaturas na trajetória

## Contexto

Task herdada de uma sessão Codex do início do dia: candidatos com patrimônio
faltante por eleição (exemplo: Rui Costa Pimenta, candidatura 2014 sem bens no
TSE e ano oculto na ficha), candidaturas oficiais fora da trajetória pública e
suspeita de candidaturas faltando. O diagnóstico Codex registrava 181 lacunas de
patrimônio em 70 fichas, 58 ausências confirmadas e 364 candidaturas fora da
trajetória (31 de 2014).

À tarde, o Thiago pediu um `/workflow` com `/eval` para resolver o problema
estruturalmente para todos os 194 candidatos, não só o caso citado. O desenho
do fluxo (etapas, topologia, teto de custo) e o eval (10 critérios, gate 100%
PASS) foram aprovados antes da execução. Execution id:
`pf-patrimonio-20260807T170643Z`.

## Etapa 0 — baseline e organização do trabalho pendente

- Três commits do trabalho validado que estava na árvore (autor Thiago Salvador,
  trailer do agente que produziu o código):
  - `f2fe6d0` fix(profiles): composição dos charts de financiamento;
  - `adc1595` feat(profiles): sanitização de marcadores TSE + neutralização de
    histórico judicial sem mérito (migration já aplicada no remoto em 07/08);
  - `2ce86eb` feat(product): rename Alertas para Destaques na camada pública.
- Baseline congelada: 194 slugs únicos em produção (SHA `0cf39b41`), 366
  migrations locais, divergência de ledger registrada (fantasma remoto
  `20260807144555` + 6 locais não aplicadas).

## Etapa 1 — matriz universal (read-only)

- Script `scripts/audit/patrimonio-eleicao-matrix.ts`: matriz candidatura x
  eleição x patrimônio na visão do seed (ids.tse_sq_candidato).
- Resultado seed view: 117 anos-candidatura fora da trajetória da API (40 são
  2026, exibidos no cabeçalho), 105 lacunas de patrimônio 2006+ em 69 fichas,
  zero divergência banco/API, zero logs TSE de patrimônio.
- Os números do Codex (364/181) não se reproduziram por nenhuma fonte do
  projeto; hipótese registrada: universo mais amplo (zips oficiais do TSE),
  confirmada na Etapa 2.

## Etapa 2 — wave paralela de auditoria (agentes 2a e 2b)

### 2a — candidaturas oficiais 2010-2026
- Universo por identidade exata (SQ/CPF, nome proibido): 582 candidaturas
  oficiais casadas, 456 na API, **126 fora** (não 364) e **9 em 2014** (não 31).
- Claim anterior **refutado com evidência**: casamento por nome contava
  homônimos (1.122 linhas TSE com nomes idênticos vs 582 por identidade).
- Causas das 126: 41 esperado_2026_header; **81 filtrada_display**, todas com a
  mesma subcausa (`collapseAdjacentTseMandatePairs` colapsando a eleição com a
  posse em `src/lib/historico-dedupe.ts`); 4 nao_ingerida (cintia-dias 2012;
  jayme-campos, jose-roberto-arruda e mailza-assis 2014).

### 2b — patrimônio por eleição (pacotes bem_candidato)
- 568 células (166 slugs, 2006-2026): 463 publicado, **44 lacuna_com_dados_tse**
  e **61 ausencia_oficial**, zero erro/bloqueio. Os 44+61 fecham exatamente as
  105 lacunas da matriz.
- Ausência só declarada com o pacote oficial lido de ponta a ponta (309 CSVs,
  10,1 milhões de linhas, zero falha).
- Desvios corretos do prompt: não somou arquivos _UF + _BRASIL (a migration
  20260725143000 documenta que isso duplica o valor) e desambiguou SQ
  sequencial pré-2010 por UF (ground truth cicero-lucena 2006 = R$ 914.731,00 /
  10 bens, e não R$ 4,87M de 22 UFs).
- 30 células de 2026 (17 lacunas + 13 ausências) adiadas: snapshot do TSE em
  fluxo. Reconciliação: 105 seed = 44+61; 83 do manifesto A2 = 75 na janela +
  8 pré-2006.

## Etapa 3 — integração serial (integrador único)

- **Correção estrutural do dedupe**: o par eleição+posse continua colapsando,
  mas o placeholder TSE do ano do pleito agora vira candidatura visível naquele
  ano (81 casos), sem duplicar o mandato. Testes existentes atualizados + teste
  de regressão novo.
- **Migrations (allowlist fechada, idempotentes, com bloco de verificação)**:
  - `20260807180000` backfill das 4 candidaturas nunca ingeridas (partido e
    situação extraídos dos zips oficiais);
  - `20260807181000` tabela `patrimonio_ausencia_oficial` (candidato, ano, SQ,
    fonte_url, verificado_em, detalhe; nenhum valor monetário) + 48 ausências
    oficiais 2010-2024;
  - `20260807182000` backfill das 27 lacunas de bens 2006-2024 com fonte
    rastreável, dedupe e descrição mascarada; gerador
    `scripts/gerar-backfill-patrimonio-tse.ts` confere totais contra o
    manifesto auditado antes de emitir SQL.
- **Contrato público**: campo `patrimonio_eleicoes` no payload (publicado /
  vazio_confirmado / nao_coletado por eleição >= 2006), derivado de bens,
  ausências oficiais e eleições com proveniência TSE; degrada para lista vazia
  enquanto as migrations não são aplicadas. UI exibe ausência oficial com fonte
  e data ("Sem bens declarados ao TSE em {ano}" + "Fonte oficial" + "Verificado
  em") e coleta pendente dizendo que ausência de dado não é ausência de bem.
- **Régua por eleição** (agente E3-REGUA): `scripts/audit/lib/coverage-model.ts`
  + snapshot + relatório; coluna de patrimônio mede por eleição aplicável
  (publicado > vazio_confirmado > lacuna), degrada sem a tabela;
  `docs/cobertura-de-dados.md` atualizado no mesmo commit.
- Commits: `4340a0e` (dedupe), `4b49cbf` (dados), `7f6e8f9` (contrato + UI),
  `5f0de92` (régua), `e84f5a5` (golden set `evals/patrimonio-eleicoes/`).

## Etapa 4 — verificação independente

- **V1 dados PASS 8/8**: gerador determinístico, allowlist, gate de identidade
  (643 pares), testes estruturais 13/13, contagens idênticas aos manifestos,
  ground truths (cicero-lucena 2006, rui 2014), zero CPF vazado, idempotência.
- **V2 API PASS**: typecheck, testes do contrato, API local ao vivo (rui 2014
  nao_coletado pré-apply, coerente), 194 slugs, produção sem o campo (deploy
  antigo), degradação graciosa comprovada ponta a ponta.
- **V3 produto PASS 6/6**: 51 testes de UI, golden cases por render (ausência
  com fonte/data, coleta pendente, publicados intactos, eleição colapsada vira
  candidatura), zero jargão interno na UI, acessibilidade por texto real, sem
  regressão em embed/comparador.

## G1 — gate de apply autorizado

- Pedido com SHA, migrations exatas, mecanismo (execução SQL direta + repair de
  ledger, sem `db push` que puxaria as migrations da completude), impacto e
  rollback. O Thiago aprovou o caminho com ensaio prévio.
- **Ensaios**: replay local completo bloqueado por gate pré-existente de abril
  (`20260807054000`, pós-condição não reproduzível do zero; issue própria).
  Substituído por dry-runs transacionais (BEGIN/ROLLBACK) das três migrations
  contra os dados reais: todas executaram completas sem persistir nada.
- **Apply ordenado**: repairs do ledger (fantasma `20260807144555` removido;
  `20260807054000` marcada como aplicada), M1/M2/M3 aplicadas com readback
  direto (4 candidaturas, 48 ausências, 27 bens; 29 linhas com a fonte nova =
  27 + 2 pré-existentes de junho, separadas por created_at).
- **Readback ponta a ponta** (cache local limpo): rui-costa-pimenta com 2014
  `vazio_confirmado` + fonte oficial + data; jayme-campos com candidatura 2014
  na trajetória e patrimônio 2006 publicado; mailza-assis com 1º suplente 2014.
- Régua pós-apply: média 87,2, 37 fichas em 100, patrimônio 92 ok / 88 parcial
  na primeira medição; números corrigidos depois que se descobriu que o JSON do
  relatório lido era de uma execução anterior (o comando sem `--json` não gera
  o dump).

## Fechamento das pendências (autorizado: tudo menos merge/deploy)

- **Ciclo 2026**: migration `20260807183000` com 17 bens do pacote oficial
  bem_candidato_2026 e 13 ausências oficiais, todas declarando o snapshot
  2026-08-04 (registros em fluxo). Readback 17/13; ausências totais 61/61.
  Commit `1312378`.
- **Auditoria A2C (agente)**: dos 29 slugs publicados sem SQ no seed:
  jose-estevao e samara-mineiro ganharam SQs 2026 curados no seed (rota CPF);
  jarbas-soares e renan-santos em quarentena; 25 bloqueados por motivo legítimo
  (pré-candidatos sem registro oficial no snapshot). Universo pré-2010
  auditado (pacotes oficiais 2002-2008, casamento SQ+UF): 26 pares verificados,
  todos já cobertos na trajetória; nenhum SQ <= 2000 no seed dos publicados.
- **Correção de dado falso (jarbas-soares)**: os patrimônios 2008/2020
  pertencem a homônimos (documentado pelo próprio projeto em 05/08 no cabeçalho
  de scripts/backfill-cpf-tse.ts), mas seguiam expostos. Migration
  `20260807184000` removeu (readback 0 linhas). Commit `27ca3fd`.
- Régua final do dia: média **87,3**, **39 fichas em 100**, célula de
  patrimônio 94 ok / 67 parcial / 6 faltante / 27 n/a. Commit de STATUS
  `cc9d46c` e `8e6d167`.

## Trilho 1 — prospecção de chaves para os 25 bloqueados

- Varredura completa de `fonte_dados`, `redes_sociais`, `site_campanha`,
  `coleta_log` e migrations: nenhuma chave oficial nova. O próprio projeto já
  tinha confirmado ausência em 2010-2026 para a maioria (logs tse-cpf e
  tse-historico com vazio_confirmado); vários carregam placeholder "aguarda
  registro". São pré-candidatos 2026 sem registro oficial publicado.
- **Reincidência de homônimo encontrada**: as candidaturas 2008/2020 de
  renato-gomes (homônimo Renato da Silveira Gomes, SQ 120000886590) tinham sido
  removidas em 05/08 com decisão documentada, mas uma ingestão posterior
  (tse-historico, 17:48 do mesmo dia) as reinseriu. Migration
  `20260807185000` removeu de novo, registrou a reincidência no coleta_log e
  apontou a causa raiz: a ingestão não respeita bloqueio de identidade
  registrado (correção estrutural do pipeline recomendada). Readback: 0 linhas
  TSE restantes. Commits `8ff7dd8` e `91fdeab` (STATUS).
- cadu-xavier 2020 confirmado corretamente despublicado com motivo desde 05/08.
- Caminhos de destrave documentados no STATUS: re-scan pós-janela de registro
  do TSE (set/2026) ou curadoria fornecendo uma chave oficial por pessoa.

## Verificação consolidada

- Gates: 2.165 testes passando (0 falhas), typecheck, lint (sem erros novos),
  build, settings:check, allowlist da execução OK, gate de identidade
  `audit:seed-sq-identity:gate` sem divergências após todas as curas de seed.
- Todas as escritas no banco passaram por allowlist + dry-run transacional +
  apply + readback direto + repair de ledger. Nenhuma escrita sem autorização.
- CPF nunca apareceu em nenhuma saída (gates anti-vazamento dos agentes com os
  CPFs reais; varredura das migrations confirmou só SQs públicos).
- Cache de produção revalida sozinho (janela de 3600s); o campo novo
  `patrimonio_eleicoes` só aparece após o deploy.

## Artefatos da execução

- Repo: migrations 20260807180000 a 20260807185000,
  `scripts/gerar-backfill-patrimonio-tse.ts`,
  `scripts/gerar-backfill-patrimonio-tse-2026.ts`,
  `scripts/audit/allowlist-pf-patrimonio-20260807.json`,
  `scripts/audit/patrimonio-eleicao-matrix.ts`,
  `evals/patrimonio-eleicoes/cases.jsonl`, `Settings/STATUS.md` (snapshot
  07/08), `docs/cobertura-de-dados.md` (régua por eleição).
- Temporários (`/tmp/pf-patrimonio-20260807T170643Z/`): baseline,
  etapa1-reconciliacao, manifestos a2a/a2b/a2c, dry-runs, logs de apply,
  plano e pacote G1, zips baixados (bem_candidato 2006-2024 e consulta_cand
  2002-2008).
- Commits da sessão (autor Thiago Salvador): `f2fe6d0`, `adc1595`, `2ce86eb`,
  `4340a0e`, `4b49cbf`, `7f6e8f9`, `5f0de92`, `e84f5a5`, `cc9d46c`, `1312378`,
  `27ca3fd`, `8e6d167`, `8ff7dd8`, `91fdeab`.

## Pendências

- Merge/deploy da branch `codex/profiles-complete-2026` — gate de completude
  (excluído desta sessão por decisão do Thiago).
- Migrations da completude ainda não aplicadas (20260807050000 a
  20260807053000) — pertencem ao mesmo gate.
- Revalidação das 30 células de 2026 quando o TSE publicar snapshot atualizado.
- renan-santos: linha 2022 de homônimo em quarentena (decisão editorial).
- jarbas-soares: quarentena de identidade (perfil x homônimos documentado).
- 25 slugs sem rota exata: re-scan pós-registro (set/2026) ou curadoria.
- Correção estrutural do pipeline de ingestão para respeitar bloqueios de
  identidade registrados (evita reincidência do caso renato-gomes).
- Replay local completo das migrations bloqueado por gate pré-existente de
  abril (20260403234500) — vale issue própria.
