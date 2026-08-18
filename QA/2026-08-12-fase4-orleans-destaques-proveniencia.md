# Fase 4: proveniência do perfil Orleans após o split

## Resultado público observado

No SHA `b96cec8b0c338c824fdab6f2351d8ef4e8f9def7`, o workflow manual
`31621678781` comprovou `194/194` fichas e `970/970` células, mas recusou o
estado final porque encontrou cinco células `nunca_verificado`, todas em
`orleans-brandao`.

## Causa

`20260811101000` persistiu os estados residuais do universo anterior. Depois,
`20260811102100` separou Carlos Orleans Braide Brandão do governador homônimo e
criou uma nova identidade pública. O split não podia herdar estados ou dados do
governador, mas também não materializou os cinco desfechos da nova identidade.

## Correção preparada

`20260812124000_orleans_destaques_proveniencia.sql` exige UUID, slug, nome,
nascimento e ledger do split. Ela grava exatamente cinco resultados:

- sanções, judicial, patrimônio e votações: `indeterminado`;
- trajetória: `sem_achado_no_escopo`, limitada ao pacote TSE 2026 já auditado.

Nenhum resultado vira `vazio_confirmado` ou `nao_aplicavel`. Nenhum dado do
governador homônimo é copiado.

## Provas

- harness PostgreSQL 17 com aplicação, readback, mutação adversarial e rollback;
- agregador do release com 17 provas;
- 3.037/3.037 testes;
- replay 297 aplicadas + 102 falhas deliberadas = 399;
- schema 74 aplicadas + 325 puladas = 399;
- build, typecheck, lint, Settings, scripts e allowlist verdes.

## Estado externo

A migration não foi aplicada e o workflow não foi repetido. A matriz continua
não verde até integração, aplicação autorizada com ledger/readback, revalidação
do cache e nova Fase 4 integral.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
