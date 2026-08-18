# Autorizações para publicar PF Ajustes, itens 1 a 17

Data: 11/08/2026
Escopo: itens 1 a 17. O item 18 permanece adiado.

## O que já está decidido

- O lote judicial 69/21 está aprovado como carga adicional.
- O lote procedural 66/25 está aprovado como carga adicional independente.
- O TSE-8 está aprovado como `sem_achado_no_escopo`, sem inferir ausência de
  carreira.
- As PRs #160, #163 e #164 foram mergeadas em `rc-lancamento`; o RC remoto
  final está em `7bd30e38411198825b8f8ac1ef1ca04373a1145c`.
- As PRs #157, #158, #159 e #161 foram fechadas como superadas, sem merge.
- No SHA final, CI, replay, schema, CodeQL, rotas e Vercel estão verdes; a
  suíte local reproduzida terminou em 2.997/2.997.
- Não resta decisão editorial local. Restam atos operacionais que mudam banco,
  `main`, produção, coleta ou cron e, por isso, exigem autorização nomeada.

## Ordem segura a partir do RC integrado

1. confirmar o backup fresco;
2. aplicar as migrations, com ledger e readback individual;
3. mergear a PR #156 em `main`, fazer deploy do mesmo SHA e confirmar
   `/api/deployment-info`;
4. executar o backfill de CPF no mesmo código já publicado;
5. disparar `ingest.yml` somente para `sancoes`, já no `main` que suporta esse
   input;
6. ativar o cron patrimonial em PR própria;
7. executar o readback público final.

Coleta antes do merge e deploy não é segura: o `origin/main` anterior ao RC não
suporta o input `sancoes` de `ingest.yml`.

## Execução interrompida corretamente em 11/08/2026

A autorização das 17 migrations foi executada até a primeira divergência, como
exigido. Dois backups frescos passaram antes dos blocos de escrita:

- run `31521051342`, artefato cifrado de 19.779.869 bytes, digest
  `b6bea994f787ffe61d93878fb7fee1ea73b0a94eaea8c8cba8915a1afddf152f`;
- run `31521500098`, imediatamente antes da despublicação, artefato cifrado de
  19.781.378 bytes, digest
  `3a09a27eb283bc2a1708cf6ec5a40bde18b07f36cf232f81e13ca5ea43f4b247`.

As migrations `20260809070000` até `20260810120000`, na ordem abaixo, foram
aplicadas com transação, ledger e readback. O ledger foi de 371 para 379 versões.
A `20260810120000` entrou atomicamente, mas seu readback recusou 14 privilégios
automáticos excedentes do Supabase. A execução parou antes da `20260810121000`.
A tabela e a view novas permanecem com zero linhas, e `financiamento` permanece
com 651 linhas.

A remediação `20260810120500` foi aplicada em transação própria e seu readback
passou. O readback reaplicado da `120000` então recusou uma segunda divergência:
as duas trigger functions carregam grants `EXECUTE` explícitos e redundantes
para `anon`, `authenticated` e `service_role`, além do grant default de
`PUBLIC`. A execução voltou a parar antes da `121000`, como exigido. O ledger
tem 380 versões, topo `20260810120500`, e a tabela/view continuam vazias.

A segunda remediação é `20260810120600`. Ela não reescreve migrations aplicadas,
aceita somente o ACL automático medido das duas funções, remove os seis grants
diretos e preserva o default semântico `PUBLIC + owner`. O readback `120000`
passou a assinar a definição da função separadamente do ACL semântico, sem
aceitar grants novos. Aplicá-la, continuar o bloco ou reverter a `120000` exige
nova autorização nomeada.

## 1. Backup confirmado antes das despublicações

O backup agendado #31464234087 terminou com sucesso em 11/08/2026, no SHA de
produção `7e3e416`. O job usou PostgreSQL 17.10, gerou
`backups/puxa-ficha-20260811T061238Z.dump`, validou o catálogo com
`pg_restore --list` e publicou somente o artefato cifrado
`backup-db-31464234087`, com 19.495.288 bytes e digest
`b55110642be19e93847da99f081a3aba33143a9f825181dbb97bd2686c3be18c`.

Isso satisfaz a pré-condição aprovada de backup fresco e íntegro para a
despublicação. Não houve download, decifragem ou restauração completa, porque
esses atos não foram autorizados. Portanto o recibo prova catálogo legível,
artefato cifrado e digest, não uma restauração integral.

Se esse artefato expirar ou deixar de estar disponível antes da aplicação,
disparar `backup-db.yml` volta a ser um ato remoto separado.

## 2. Aplicar as migrations em produção

Pré-condições duras: CI verde no mesmo SHA do RC, replay e schema gates verdes,
backup acima ainda disponível, SHA e lista abaixo sem divergência. Cada arquivo
deve rodar em transação própria, gravar o ledger e ter readback imediato antes
do próximo.

Ordem:

1. `20260809070000`, verificações TSE de Cleber Rabelo e Gilberto Vasconcelos.
2. `20260810085000`, Lula 2018.
3. `20260810090000`, `20260810090100`, `20260810090200`, votações Câmara.
4. `20260810093000`, re-run de patrimônio 2026.
5. `20260810094000`, Daciolo 2006 e 2008.
6. `20260810120000`, contrato de financiamento.
7. `20260810120500`, remediação exata dos grants automáticos do Supabase.
8. `20260810120600`, normalização dos grants automáticos das trigger functions.
9. `20260810121000`, carga de financiamento global.
10. `20260810122000`, judicial 69/21.
11. `20260810123000`, judicial 66/25.
12. `20260810124000`, TSE-8.
13. `20260811100000`, `20260811100100`, reconciliação e contrato do Senado.
14. `20260811101000`, estados residuais de destaques nas 194 fichas.
15. `20260811101100`, fontes oficiais de trajetória para Cadu Xavier e Ricardo
    Cappelli.
16. `20260811101200`, seis processos legados sem número e URL.
17. `20260811102000`, schema de quarentena de identidade.
18. `20260811102100`, correção das cinco identidades e timelines.
19. `20260812123000`, compatibilidade de ACL da view financeira pública.

### Readback operacional, 22 de 22

| Migration | Readback canônico |
|---|---|
| `20260809070000` | `supabase/readback/20260809070000_verificacao_campos_b2_cleber_gilberto.readback.sql` |
| `20260810085000` | `supabase/readback/20260810085000_lula_2018_registro_indeferido_eleito_por.readback.sql` |
| `20260810090000` | `supabase/readback/20260810090000_votacoes_chave_chave_por_votacao.readback.sql` |
| `20260810090100` | `supabase/readback/20260810090100_despublicar_votacoes_chave_defeituosas.readback.sql` |
| `20260810090200` | `supabase/readback/20260810090200_votacoes_chave_dataset_v2.readback.sql` |
| `20260810093000` | `supabase/readback/20260810093000_rerun_patrimonio_2026_tse_publicou.readback.sql`, incluindo o payload completo na mesma conexão SQL |
| `20260810094000` | `supabase/readback/20260810094000_daciolo_patrimonio_2006_2008.readback.sql` |
| `20260810120000` | `supabase/readback/20260810120000_financiamento_verificacoes_por_pleito.readback.sql` |
| `20260810120500` | `supabase/readback/20260810120500_financiamento_verificacoes_acl_exato.readback.sql` |
| `20260810120600` | `supabase/readback/20260810120600_financiamento_funcoes_acl_exato.readback.sql` |
| `20260810121000` | `supabase/readback/20260810121000_financiamento_reconciliado_universo.readback.sql` |
| `20260810122000` | `supabase/readback/20260810122000_processos_curadoria_djen.readback.sql` |
| `20260810123000` | `supabase/readback/20260810123000_processos_curadoria_djen_66.readback.sql` |
| `20260810124000` | `supabase/readback/20260810124000_destaques_trajetoria_tse_8.readback.sql` |
| `20260811100000` | `supabase/readback/20260811100000_votacoes_senado_chave_exata.readback.sql` |
| `20260811100100` | `supabase/readback/20260811100100_votacoes_senado_contrato_exato.readback.sql` |
| `20260811101000` | `supabase/readback/20260811101000_destaques_estados_residuais_194.readback.sql` |
| `20260811101100` | `supabase/readback/20260811101100_historico_fontes_oficiais_cadu_cappelli.readback.sql` |
| `20260811101200` | `supabase/readback/20260811101200_processos_legados_fontes_oficiais.readback.sql` |
| `20260811102000` | `supabase/readback/20260811102000_quarentena_identidade_timeline_schema.readback.sql` |
| `20260811102100` | `supabase/readback/20260811102100_integridade_identidade_timeline_5.readback.sql` |
| `20260812123000` | `supabase/readback/20260812123000_financiamento_publico_acl_despublicado.readback.sql` |

Os SQL novos são somente leitura e fail-closed: exigem uma única linha no
ledger e abortam por payload, cardinalidade ou contrato divergente. Os wrappers
judiciais usam `\ir` para executar a verdade gerada que vive em `QA/evidencias`,
sem copiar os 69 ou 66 processos.

O executor canônico é `scripts/audit/readback-release-pf-ajustes.sh`. A variável
`PF_DATABASE_URL` deve apontar para o mesmo banco em que a migration acabou de
ser aplicada; o valor é segredo e não entra no log ou neste documento. Rode uma
versão por vez, imediatamente depois do commit transacional da migration e antes
de iniciar a próxima:

```bash
PF_DATABASE_URL="$PF_DATABASE_URL" \
  bash scripts/audit/readback-release-pf-ajustes.sh 20260810093000
```

Substitua apenas a versão pelo passo corrente. O runner ativa transação
read-only, `ON_ERROR_STOP` e falha fechado; qualquer saída não zero interrompe o
bloco autorizado antes da migration seguinte.

Próxima autorização copiável, somente depois do merge da PR residual no RC:

> Autorizo aplicar em produção a migration corretiva `20260810120600`, com
> harness fresco, transação, ledger e readbacks imediatos `20260810120600`,
> `20260810120500` e `20260810120000`, interrompendo na primeira divergência.
> Não autorizo outras migrations, merge em `main`, deploy, coleta ou cron neste
> ato.

## 3. Publicar o mesmo SHA

Pré-condições: as 19 migrations terminaram verdes, ledger e readbacks bateram,
e o `rc-lancamento` não mudou depois dos gates.

Autorização copiável:

> Autorizo o merge da PR #156 em `main` e o deploy de produção do mesmo SHA
> validado, seguido de revalidação de cache e confirmação em
> `/api/deployment-info`. Interrompa se o SHA divergir. Não autorizo coleta ou
> cron.

## 4. Executar as duas coletas auditadas, depois do deploy

O backfill de CPF tenta fechar duas fichas e registra 30 linhas de log. A coleta
de sanções depende do código publicado, de `TRANSPARENCIA_API_KEY` e do input
`sancoes` existir no `main`; erro ou identidade ausente continua erro, nunca
ausência.

Autorizações copiáveis, na ordem:

> Com o mesmo SHA confirmado em produção, autorizo executar
> `scripts/backfill-cpf-tse.ts --apply`, com readback e trilha auditável. Não
> autorizo outra coleta.

> Com o mesmo SHA confirmado e `TRANSPARENCIA_API_KEY` disponível nos secrets,
> autorizo disparar `ingest.yml` somente para a fonte `sancoes`, em modo de
> aplicação, com readback das 194 fichas. Não autorizo outras fontes.

## 5. Ativar o segundo ciclo patrimonial

Este ato ocorre depois do deploy e das coletas. Exige PR própria que descomente
o schedule de `patrimonio-rerun.yml`, atualize `Settings/` e limite a mudança ao
ciclo de 16/08.

> Autorizo criar, revisar e fazer merge da PR própria que ativa somente o cron
> patrimonial de 16/08, com atualização de `Settings/`. Não autorizo outros
> schedules.

## 6. Readback público e encerramento

Depois do deploy e sem nova autorização, por ser somente leitura:

- executar a Fase 4 em Daciolo, Flávio, Hertz, Lula, Renan, Zema, Rui e Samara;
- percorrer as 194 fichas em destaques, dinheiro, judicial e classificação;
- repetir item 11 em desktop e mobile;
- comparar banco, API, DTO, DOM, cache, SHA e ledger;
- atualizar a matriz para verde ou amarelo por item.

Os resíduos honestos não devem ser apagados do fechamento: financiamento pode
manter 37 erros explícitos de identidade ou layout; destaques podem manter
fichas sem card por falta de identidade ou fonte. Esses estados são parte da
correção fail-closed, não autorização para inventar conteúdo.

Este documento é somente um guia para decisão. Nenhuma frase acima constitui
autorização enquanto não for enviada nominalmente pelo Thiago nesta conversa.
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Incidente fail-closed de 11/08

O lote de onze migrations parou após aplicar `20260811101000`. Ledger: 388,
topo `20260811101000`. As quatro seguintes não foram aplicadas. A carga de 292
linhas é nominalmente exata; a divergência está apenas no hash do readback,
calibrado com collation implícita. A retomada exige, em ato separado, integrar a
ordenação binária no RC, repetir o readback `20260811101000` e só então
autorizar as quatro versões restantes. Não fazer rollback nem reaplicação.

## Incidente fail-closed pós-deploy e readback de 12/08

O merge e o deploy autorizados chegaram primeiro ao SHA `c075780c`, e a Fase 4
reprovou a superfície financeira porque a view `security_invoker` passou a usar
`financiamento.despublicado_em` sem o grant de coluna correspondente. A PR #175
corrigiu a ACL e foi publicada no SHA
`5a6179efca1cc837cb675514f86acb5e85251691`.

A `20260812123000` foi aplicada com transação e ledger, deixando produção em
393 versões. O readback imediato abortou porque a fixture do harness continha
`cpf_hash`, coluna ausente no schema real. Cache e Fase 4 não foram executados
depois da divergência. A ACL aplicada está correta e não deve ser revertida ou
reaplicada.

Próxima autorização copiável, somente depois da PR do readback portátil ficar
verde:

> Autorizo o merge da PR do readback portátil em `main` e, depois de confirmar
> o merge, autorizo repetir o readback `20260812123000`, revalidar as dez tags
> de cache e executar a Fase 4, interrompendo na primeira divergência. Não
> autorizo migration, coleta ou cron neste ato.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Incidente fail-closed da Fase 4 no readback 121000, 12/08

A PR #178 foi publicada no SHA
`eca104f4910a4a1398716ea10f4ac8d3e82d0e1c`. O run manual `31609453915`
parou no readback `20260810121000`, com três divergências. Os dados estão
íntegros: são os pleitos históricos do governador Carlos Brandão, ainda ligados
ao UUID arquivado depois que a `20260811102100` transferiu o slug público ao
pré-candidato Orleans Brandão.

A correção do readback ancora identidade por UUID, nome completo e nome de urna
e exige o ledger da divisão para aceitar o único fallback temporal. Produção
foi verificada read-only em 3/3 alvos e nas coortes 141/94/235. Não corrigir nem
reaplicar dados. Antes de repetir a Fase 4, integrar a correção, publicar o mesmo
SHA e confirmar `/api/deployment-info`.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
