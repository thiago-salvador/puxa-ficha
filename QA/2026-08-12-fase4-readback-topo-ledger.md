# Fase 4: readback da 20260812123000 cravava o topo do ledger

Data: 12/08/2026

## Resultado

O ato autorizado foi executado por inteiro e a produção está correta. A PR #180
foi mergeada em `main` e publicada no SHA
`37c1c01f941af93dd1277e19cfa2355d70594298`, a migration `20260812124000` foi
aplicada em transação com a linha do ledger, o readback imediato passou e as dez
tags de cache foram revalidadas no mesmo SHA.

A Fase 4, run `31628201963`, parou na primeira divergência, como exigido. A causa
não é dado nem permissão: é um contrato de prova que envelheceu.

## Causa

O readback da `20260812123000` exigia ser ele próprio o topo do ledger:

```sql
OR (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20260812123000'
```

Enquanto a `123000` foi a última migration aplicada, a asserção descrevia o
estado real. Ao aplicar a `20260812124000`, autorizada no mesmo ato, o topo
passou a ser `20260812124000` e a prova passou a reprovar um estado legítimo.

Este é o único readback do release com pin de topo. A varredura dos 23 arquivos
canônicos procurando `max(version)`, `order by version desc` e `ledger_top`
retorna só ele, então a classe está fechada por medição, não por amostra.

## Correção

O topo aceito passa a ser condicionado à presença da própria `20260812124000` no
ledger, exatamente o padrão já usado nas correções `20260810120000` e
`20260810121000`:

```sql
OR (SELECT max(version) FROM supabase_migrations.schema_migrations) <> (
     CASE WHEN EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260812124000'
     ) THEN '20260812124000' ELSE '20260812123000' END
   )
```

São dois estados nomeados, e só dois. O readback continua abortando em qualquer
outro topo, o que preserva a função original do contrato: detectar migration não
prevista aplicada por fora. O replay linear também continua válido, porque no
replay a `124000` ainda não existe quando a `123000` é verificada.

O harness PostgreSQL 17 ganhou três cenários adversariais para o ledger, além dos
que já existiam para ACL: aceita o topo legítimo pós-`124000`, recusa um topo
estranho (`29990101000000`) e volta a aceitar o pré-estado depois da limpeza.

## Provas

- readback corrigido executado read-only contra produção: PASS;
- versão de `origin/main` executada contra a mesma produção: reprova com
  `readback 20260812123000: ledger/topo divergente`, ou seja o vermelho foi
  reproduzido antes do verde;
- **os 23 readbacks canônicos da Fase 4 executados por inteiro contra produção,
  em `begin`/`rollback`: 23/23 PASS**, o que cobre a lista completa do
  `release_versions` e não só o arquivo alterado;
- harness PostgreSQL 17 focal: exit 0, com `PASS: readback aceita os dois topos
  nomeados e recusa topo estranho`;
- suíte completa: 3.037/3.037, em 478 suítes, zero falhas;
- testes focais de readback e artefatos operacionais: 34/34, e os testes de
  Settings reexecutados depois da edição do snapshot: 8/8;
- replay linear `--gate`: 297 aplicadas + 102 falhas congeladas = 399, com o
  conjunto de falhas batendo com o manifesto;
- replay `--schema-gate`: 74 aplicadas + 325 puladas = 399, zero falhas, hash
  `addae113fedbada30d9974a3032d276e012f5b6892495a0a4f1b2bcac60c6a40`;
- typecheck, lint sem warnings, `check:scripts`, `check:dead-code`, allowlist de
  cobertura, `bash -n` e `git diff --check`: verdes;
- ledger de produção auditado: 394 versões, topo `20260812124000`, zero linhas
  degradadas, e `md5(statements[1])` da `124000` igual ao arquivo do merge
  (`680e9a031d058e25eb3c4b8b439b260f`).

Nota de método, porque custou uma investigação: `npm run audit:migrations:replay`
**sem flag** reprova com exit 1, parando em 178 aplicadas na
`20260511112000_promote_projetos_lei_acm_eduardo_camara_completo.sql`. Isso é
pré-existente e independente desta mudança, o que foi provado rodando o mesmo
comando num worktree limpo de `origin/main` com resultado idêntico. O gate que o
CI cobra é `--gate` e `--schema-gate`, ambos verdes acima. É o inverso da regra
da allowlist de cobertura, onde o modo sem flag é que é o gate.

## Estado

Produção está íntegra e não precisa de nova migration nem de rollback. O que
falta é integrar esta correção de prova e repetir a Fase 4. Nenhuma coleta,
cron, backfill ou escrita de dado foi executada nesta apuração.
