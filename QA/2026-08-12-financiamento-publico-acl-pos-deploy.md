# Financiamento público: regressão de ACL após o deploy

Data: 12/08/2026

## Resultado

O release autorizado chegou ao `main` e à produção no SHA
`c075780cb92681a1f8c4563e98dca875ede2587f`. A revalidação de cache terminou
com sucesso no run `31593363805`, cobrindo as dez tags públicas do workflow.

O readback público da Fase 4 não passou. Ele parou em `acm-neto` porque a API
da ficha respondeu com `sourceStatus = degraded`. A mesma degradação apareceu
em Cabo Daciolo e Orleans Brandão. A investigação preservou o fail-closed: o
site não recebeu certificado verde e nenhuma coleta, cron ou escrita corretiva
ad hoc foi executada.

## Causa global

A migration `20260811102000` recriou `public.financiamento_publico` com
`security_invoker = true` e passou a filtrar
`financiamento.despublicado_em IS NULL`. Os grants de coluna herdados da
compatibilidade pública anterior permitiam somente as onze colunas originais e
não incluíam `despublicado_em`. Por isso o PostgREST falhava com SQLSTATE
`42501`, `permission denied for table financiamento`, ao carregar a ficha.

A leitura pública direta confirmou o limite exato: as colunas públicas antigas
continuavam legíveis, `despublicado_em` era negada e as colunas sensíveis
continuavam sem acesso. Produção não perdeu dados; o defeito é de permissão da
view `security_invoker` sobre a tabela-base.

## Correção preparada

A migration `20260812123000_financiamento_publico_acl_despublicado.sql`:

- exige as migrations `20260811102000` e `20260811102100` no ledger e recusa
  ordem ou pré-estado divergente;
- preserva a view como `security_invoker` e mantém a tabela bruta sem `SELECT`
  de relação;
- concede a `anon` e `authenticated` somente as colunas necessárias ao SQL da
  view: `despublicado_em` e, quando a coluna existe no schema, também
  `categorias_origem`;
- mantém CPF, CNPJ e doadores brutos fora da superfície pública;
- traz readback e rollback com ACL exata, ledger e mutações adversariais.

O harness PostgreSQL 17 cobre schemas com e sem `categorias_origem`, recusa
grant excedente, grant obrigatório ausente, drift, dependência ausente e
rollback fora do estado esperado. O agregador fecha 16 provas para as 19
migrations operacionais.

## Provas locais

- suíte completa: 3.029/3.029;
- teste focal da migration: 2/2;
- PostgreSQL 17: harness focal e agregador com 16/16 provas;
- replay linear: 297 aplicadas + 101 falhas congeladas = 398;
- schema replay: 74 aplicadas + 324 puladas = 398, zero falha, hash
  `addae113fedbada30d9974a3032d276e012f5b6892495a0a4f1b2bcac60c6a40`;
- typecheck, lint sem warnings, `check:scripts`, Settings 7/7, allowlist,
  `bash -n` e `git diff --check`: verdes;
- build Turbopack local: não executável neste worktree porque `node_modules` é
  symlink externo; o build canônico fica obrigatório no CI da PR.

## Aplicação e parada no readback

A PR #175 foi mergeada em `main` no commit
`5a6179efca1cc837cb675514f86acb5e85251691`, com árvore idêntica ao head
aprovado, e o deployment publicou o mesmo SHA. O harness PostgreSQL 17 foi
reexecutado nesse commit antes da aplicação. A migration `20260812123000` foi
aplicada em transação junto do ledger e deixou produção com 393 versões e topo
`20260812123000`.

O readback imediato abortou antes da revalidação de cache e da Fase 4. A causa
não foi a ACL aplicada: o SQL do readback chamava `has_column_privilege` para
`financiamento.cpf_hash`, mas essa coluna não existe no schema real. O harness
criava `cpf_hash` e `cnpj_doador` nas duas variantes e, por isso, não reproduzia
o catálogo de produção.

A leitura direta posterior confirmou o efeito autorizado: a view permanece
`security_invoker`, filtra `despublicado_em IS NULL`, `anon` e `authenticated`
acessam 561 linhas públicas, a tabela bruta continua sem `SELECT` e os grants de
coluna são exatamente os esperados. O readback corrigido usa
`information_schema.column_privileges`, funciona tanto com colunas sensíveis
presentes quanto ausentes e passou read-only contra produção. Isso é diagnóstico
e prova da correção local, não retomada do ato interrompido.

## Estado e próximo ato externo

O banco está corrigido, mas o encerramento continua bloqueado até integrar o
readback portátil e repetir formalmente o readback `20260812123000`, a
revalidação de cache e a Fase 4. Não fazer rollback nem reaplicar a migration.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
