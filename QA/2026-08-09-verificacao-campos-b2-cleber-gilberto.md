# QA: materialização TSE de `verificacao_campos` em `cleber-rabelo` e `gilberto-vasconcelos`

Data: 2026-08-09. Pedido do dono: corrigir no banco os dois slugs cujo
`social_networks` estaria em `null` apesar de `no_row_for_safe_sq`, para que as
três frentes TSE fiquem resolvidas.

**Estado: migration criada, provada e NÃO aplicada. Nada commitado, nada
mergeado.** Aplicar, commitar e mergear dependem de autorização que nomeie o ato.

## Revisão independente reprovou a primeira versão, e os dois bloqueios procediam

Ambos reproduzidos em Postgres 17 antes de corrigir, e ambos invisíveis para os
nove testes estáticos, que continuavam verdes.

1. **Presença parcial virava no-op bem-sucedido.** O guard usava
   `HAVING count(*) = 2`, então uma ficha presente também devolvia `NULL` e a
   migration retornava sem erro. A transação externa gravaria a linha do ledger e
   a ficha existente ficaria sem correção para sempre. Agora zero fichas é no-op
   e uma ficha **aborta**, com a contagem na mensagem.
2. **`jsonb ||` não é monotônico.**
   `'{"social_networks":"2026-09-01"}'::jsonb || '{"social_networks":"2026-08-06"}'::jsonb`
   devolve `2026-08-06`: o lado direito vence sempre. A migration **rebaixaria**
   verificação mais nova, que é exatamente o que o contrato de
   `src/lib/verificacao-campos.ts` existe para impedir. Agora uma pré-condição
   aborta diante de frente TSE já datada com valor diferente de `2026-08-06`.
   Valor igual não diverge, então reaplicar continua sendo no-op idempotente.

Escolhi **abortar** em vez de merge monotônico pelo máximo: curadoria de dois
slugs é ato único, e chave TSE com outro valor significa que alguém escreveu ali
depois do ledger da B2. Isso é decisão humana, não caso a resolver em silêncio.

## O diagnóstico mudou na medição

A premissa do pedido não se sustenta contra o banco. Três leituras de produção
(`wskpzsobvqwhnbsdsmok`, somente leitura):

| Pergunta | Medido em 09/08/2026 |
|---|---|
| Linhas com `verificacao_campos -> 'social_networks' = 'null'::jsonb` | **0**, em 280 linhas |
| `verificacao_campos` dos dois slugs | **`{}`** nos dois |
| `20260807052000` no ledger | **ausente** (retida, nunca aplicada) |

O `null` que o gerador antigo emitia nunca chegou ao banco: a migration que o
carregava está retida. O defeito de escrita foi corrigido na origem **antes** de
a saída defeituosa ser aplicada, e o relato em `Settings/STATUS.md` descrevia
como estado do banco algo que só existia no arquivo.

Sobra um buraco real, e ele é o oposto de um `null` a trocar: as duas fichas não
têm verificação de campo nenhuma. Elas ficaram de fora da etapa 9
(`scripts/materializar-etapa9-tse-12.ts`) porque aquele universo sai de
`data/identidade-etapa2-2026.json`, o recorte dos **71 perfis sem casamento
seguro**, e estes dois nunca estiveram lá: a identidade deles já era segura pelo
SQ do próprio ledger da B2.

Consequência para o escopo: a correção escreve as **três** chaves TSE, não uma.
Com só `social_networks`, `resolverFrescorTsePerfil` devolve `parcial`, que não
produz data nenhuma. Seria uma aplicação em produção para não mudar nada.

## Fonte de cada valor

Ledger `output/pf-completeness-20260807T022551Z/research-b2/proposals.jsonl`,
SHA-256 `78dec9789bdd4952cbf781f5bd4952a75f919b4a82903e6869a42468cc168fc0`, o
mesmo congelado em `LEDGER_B2_SHA256`. Traduzido por
`scripts/lib/verificacao-campos-ledger-b2.ts`, com a data saindo de `source_date`
(data da fonte, não da execução do script):

| Campo do ledger | `query_result` | Estado | Data |
|---|---|---|---|
| `current_candidacy_status` | `safe_official_registration_found` | `publicado` | `2026-08-06` |
| `profession` + `education` | `found_in_safe_current_registration` | `publicado` | `2026-08-06` |
| `social_networks` | `no_row_for_safe_sq` | `vazio_confirmado` | `2026-08-06` |

Conferido contra o gerador já corrigido: rodando
`scripts/generate-b2-current-profile-migration.ts` sobre esse ledger, as linhas
dos dois slugs saem com exatamente as três chaves em `2026-08-06`, e os `null`
de `campaign_proposals` e `photo` viram chave ausente.

Identidade ancorada no trio que o banco guarda (`candidatos` não tem coluna de
SQ), conferido contra o registro do ledger:

| Slug | SQ 2026 | Banco |
|---|---|---|
| `cleber-rabelo` | 140002538631 | Governador, PA, PSTU |
| `gilberto-vasconcelos` | 40002535267 | Governador, AM, PSTU |

## Efeito medido, que é menor do que a pendência prometia

Simulação de `buildSectionFreshness` com os valores reais de produção
(`verificacao_campos`, `ultima_atualizacao` e as duas linhas de
`coleta_log_ultima`):

| Slug | Selo antes | Selo depois |
|---|---|---|
| `cleber-rabelo` | Curadoria de processos, 05/08/2026 | **inalterado** |
| `gilberto-vasconcelos` | Sanções: CEIS, CNEP e CEAF, 05/08/2026 | **TSE candidaturas 2026, 06/08/2026** |

Duas correções ao efeito esperado no pedido:

- **Nenhum dos dois exibia "Perfil factual curado".** As coletas de sanções e de
  processos já venciam a data curada.
- **O selo de `cleber-rabelo` não muda.** A coleta `processos-curadoria` dele é
  de `2026-08-06T00:47:20Z`, 47 minutos mais recente que a data de calendário do
  TSE ancorada em meia-noite UTC. `resolverUltimaVerificacaoDoPerfil` escolhe a
  candidata **mais recente**: é o contrato funcionando, não defeito. O ganho dele
  é de cobertura, não de selo: as três frentes TSE saem de `ausente` para
  `completa`.

`gilberto-vasconcelos` tem `processos-curadoria` em `indeterminado`, que não
verifica nada e por isso não concorre.

## Entregáveis

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260809070000_verificacao_campos_b2_cleber_gilberto.sql` | Curadoria pura, guard de ausência, pré-condição de identidade, pós-condição das três chaves |
| `supabase/rollback/20260809070000_..._rollback.sql` | Remove as três chaves (não grava `null`) e a linha do ledger; aborta se houver data mais nova |
| `scripts/audit/allowlist-verificacao-campos-b2-20260809.json` | Allowlist do recorte, janela fechada |
| `scripts/audit/recortes.json` | **Acrescenta o 14º recorte**, `verificacao-campos-b2-20260809`; sem ele o modo completo do checker reprova a allowlist nova por não ter recorte |
| `scripts/audit/provar-migration-b2.sh` | **Prova executável**: 8 ramos contra Postgres 17, fail-closed (`npm run audit:b2:provar`) |
| `tests/verificacao-campos-b2-cleber-gilberto-migration.test.ts` | Julga o SQL emitido, o efeito no leitor, e trava a existência do harness |
| `.github/workflows/replay-migrations.yml` | Executa o harness em CI, junto do replay |
| `scripts/audit/replay-migrations.sh` | Invariante de conservação no `--gate` |
| `scripts/audit/falhas-replay-linear.json` | 290 aplicadas, 87 falhas, com o motivo da entrada nova |

### Fronteira com o trabalho concorrente do checker de allowlist

O trabalho do checker vive na branch `chore/gate-allowlist-dividas-congeladas`,
cujo tip é `b5978c12` e cujo pai é o `0b08a3b` da `main`. O pacote B2 é preparado
**em cima de `b5978c12`**, não misturado com ele: assim
`check-migrations-allowlist.ts`, `baseline-escritas-sem-anotacao.json`,
`tests/audit-gate-divida-e2e.test.ts`, `tests/audit-migrations-allowlist.test.ts`,
`CLAUDE.md` e o QA do gate ficam na base e **não aparecem no diff do B2**.

**Dois pontos compartilhados, e só dois:**

| Arquivo | Por que é compartilhado | O que o B2 acrescenta |
|---|---|---|
| `Settings/STATUS.md` | Snapshot único do projeto; os dois trabalhos escrevem seções datadas nele | Uma seção nova, "Os dois perfis da B2 que a etapa 9 não alcançou", mais a atualização da pendência antiga |
| `scripts/audit/recortes.json` | Mapa único de recortes, criado pelo trabalho do checker com 13 entradas | O **14º recorte**, `verificacao-campos-b2-20260809`, e nada mais |

Nos dois casos o B2 é **aditivo**: nenhuma linha do trabalho do checker é
alterada ou removida, e o diff abaixo prova isso. Qualquer outro arquivo que
apareça no diff do B2 é erro de preparo, não fronteira legítima.

`ultima_atualizacao` **não** é tocada. Nenhum campo da ficha mudou, só o carimbo
de verificação; e bumpar para `now()` poria "Perfil factual curado" em 09/08 na
frente da data TSE de 06/08, escondendo exatamente o selo que a correção existe
para expor.

## Prova executável em PostgreSQL

O dry-run virou harness versionado: `scripts/audit/provar-migration-b2.sh`,
`npm run audit:b2:provar`, no mesmo padrão de `audit:rollback:provar`. Postgres 17
efêmero, imagem presa pelo mesmo digest do replay, fail-closed: qualquer asserção
divergente sai RC=1.

Ele existe porque os testes estáticos ficavam **verdes com os dois defeitos
dentro do arquivo**. Asserção sobre texto de SQL não pega guard errado; quem pega
é o Postgres.

**Oito ramos, seis forward e dois rollback.** A contagem anterior neste documento
dizia "seis ramos" e a tabela listava sete, cinco forward e dois rollback: era
erro de redação, e os dois ramos novos (F2 e F6) vieram da revisão.

| # | Ramo | Esperado | Resultado |
|---|---|---|---|
| F1 | Nenhuma ficha | no-op, RC 0 | PASS |
| F2 | **Uma ficha só** | **aborta** | PASS, `presenca parcial da coorte (1 de 2 fichas)` |
| F3 | Identidade divergente (UF errada) | aborta | PASS, `identidade divergente do ledger` |
| F4 | Identidade correta | aplica as 2 | PASS, jsonb exato nas duas |
| F5 | Reaplicação | idempotente | PASS, jsonb inalterado |
| F6 | **Verificação mais nova gravada** | **aborta sem rebaixar** | PASS, `2026-09-01` preservado |
| R1 | Rollback com data mais nova | aborta e não destrói nada | PASS, ledger e a outra ficha intactos |
| R2 | Rollback no estado da forward | remove 3 chaves e a linha do ledger | PASS, `{}` nos dois, 0 no ledger |

**O harness foi provado vermelho contra cada defeito**, restaurando um de cada
vez no arquivo e rodando de novo:

| Defeito restaurado | Saída |
|---|---|
| `HAVING count(*) = 2` no guard (presença parcial vira no-op) | `FAIL F2 nao abortou (rc=0)` |
| Guarda de divergência removida | `FAIL F6 data nova preservada: esperado '2026-09-01', observado '2026-08-06'` |

A segunda linha é a reprodução do rebaixamento em Postgres 17: o `jsonb ||` não é
monotônico, e o lado direito vence sempre.

Escopo do harness: a **semântica dos guards**. A fidelidade de schema é provada
por `audit:migrations:replay --gate`, que aplica a fila real.

## Gates

| Gate | Resultado |
|---|---|
| `npm test` | **2515 pass, 0 fail** |
| `npm run lint` | 0 erros, 1 aviso preexistente em `.firecrawl/` |
| `npm run typecheck` | limpo |
| `npm run check:dead-code` | limpo |
| `npm run settings:check` | 7 pass |
| `audit:cobertura:allowlist` (janela do recorte) | 2 writes declarados, 0 violações |
| `audit:b2:provar` | **8 ramos, todas as asserções passaram**; vermelho contra cada defeito restaurado |
| `audit:migrations:classificar` | `curadoria`, `mista: false` |
| `audit:migrations:replay -- --gate` | **290 aplicadas, 87 falhas**, conjunto bate com o manifesto; conservação `290 + 87 = 377` OK |

### A migration falha o replay linear, e isso é o guard funcionando

Medido: as três migrations que inserem `cleber-rabelo` (`20260522160000`,
`20260522183000`, `20260609113000`) **falham** no replay linear, enquanto a que
insere `gilberto-vasconcelos` (`20260803134124`) aplica. O banco do replay fica
com **uma** das duas fichas da coorte, e o guard de presença parcial aborta, como
deve. Mensagem real capturada no `linear --tolerante`:

```text
20260809070000_...sql :: ERROR: verificacao_campos B2: presenca parcial da coorte
(1 de 2 fichas); aplicar aqui gravaria a versao no ledger deixando a outra sem correcao
```

A entrada em `falhas-replay-linear.json` é deliberada e traz o motivo escrito ao
lado. Produção tem as **duas** fichas, medido em 09/08. Registrada também a
divergência entre a previsão estática (`replicavel`, porque enxerga o guard) e o
replay real: previsão estática não executa SQL, e quem responde pelo replay é o
manifesto medido.

### Invariante de conservação no `--gate`

`aplicadas + falhas únicas = total de migrations do diretório`, conferido em
tempo de execução e também no teste. Antes os dois números eram conferidos
separadamente e nenhum enxergava migration **pulada**: um filtro que deixasse
arquivos de fora sairia como "290 aplicadas, 87 falhas" com o diretório em 400 e
o gate aprovaria. Provado nos dois sentidos, alimentando o bloco com valores
fabricados:

| Cenário | Saída |
|---|---|
| Real (290 + 87 = 377) | `GATE: conservacao OK`, rc 0 |
| Migration pulada (total 400) | `GATE: conservacao quebrada: ... = 377, mas o diretorio tem 400`, rc 1 |
| Falha repetida na lista bruta | `GATE: 1 falha(s) repetida(s)`, rc 1 |

Um teste que muda de baseline nesta rodada:
`tests/candidatos-publico-view-contrato.test.ts` exigia que a `20260809060000`
fosse a **última** migration do diretório. O risco que ele cobre é `db push`
aplicar fora de ordem, então a asserção passou a ser "ordena depois de todas as
que a antecedem", com as posteriores ainda não aplicadas declaradas por nome.
Migration com timestamp **menor** continua reprovando, que é o caso perigoso.

## Pacote isolado em worktree, e os gates rodados nele

O pacote foi preparado num worktree **durável, detached em `b5978c12`**, o tip
atual de `chore/gate-allowlist-dividas-congeladas`, com `npm ci` próprio. O
worktree era um diretório irmão do repositório, não um diretório temporário de
sessão, para o pacote sobreviver ao fim desta conversa.

Isso não é cerimônia: a working tree principal ficou mudando durante as revisões,
e gate rodado sobre estado que se move não prova nada sobre o que vai ser
commitado.

Estado do worktree: 14 arquivos, 6 novos e 8 modificados, **zero arquivos do
trabalho concorrente no diff**, conferido por nome.

| Arquivo | Δ |
|---|---|
| `supabase/migrations/20260809070000_verificacao_campos_b2_cleber_gilberto.sql` | novo, 191 |
| `supabase/rollback/20260809070000_verificacao_campos_b2_cleber_gilberto.rollback.sql` | novo, 59 |
| `scripts/audit/allowlist-verificacao-campos-b2-20260809.json` | novo, 25 |
| `scripts/audit/provar-migration-b2.sh` | novo, 184 |
| `tests/verificacao-campos-b2-cleber-gilberto-migration.test.ts` | novo, 215 |
| `QA/2026-08-09-verificacao-campos-b2-cleber-gilberto.md` | novo, este arquivo |
| `scripts/audit/replay-migrations.sh` | +27 −1 |
| `tests/migrations-classificacao.test.ts` | +41 −6 |
| `tests/candidatos-publico-view-contrato.test.ts` | +27 −3 |
| `.github/workflows/replay-migrations.yml` | +10 −0 |
| `scripts/audit/falhas-replay-linear.json` | +4 −2 |
| `scripts/audit/recortes.json` | **+7 −0**, só o 14º recorte |
| `package.json` | +2 −1, só `audit:b2:provar` |
| `Settings/STATUS.md` | +82 −3, só a seção do B2 |

Um detalhe do preparo que vale registrar: `recortes.json` **não** foi copiado da
working tree principal. A cópia de lá era anterior a `b5978c12` e teria revertido
o endurecimento de dívida que o checker acabou de ganhar. O 14º recorte foi
acrescentado ao arquivo **da base**, e o diff de 7 linhas prova isso. (`c837890`
e `b5978c12` têm o mesmo `recortes.json`; o único delta entre os dois commits é o
QA do próprio gate de allowlist, que não pertence a este recorte.)

### Gates no estado isolado

Rodados no worktree durável, base `b5978c12`, com `npm ci` próprio.

| Gate | Resultado |
|---|---|
| `git diff --check` | limpo, nenhum problema de espaço ou conflito |
| `npm run audit:b2:provar` | **8 ramos, todas as asserções passaram** |
| `npm run audit:migrations:replay -- --gate` | **290 aplicadas, 87 falhas**, conjunto bate; conservação `290 + 87 = 377` |
| `npm run audit:cobertura:allowlist` (modo completo) | OK: todo recorte dentro da própria allowlist, todo `@write` coberto |
| `npm run audit:cobertura:allowlist` (recorte B2) | OK, 2 writes declarados, 0 violações |
| `npm test` | **2515 pass, 0 fail** |
| `npm run typecheck` | limpo |
| `npm run check:dead-code` | limpo |
| `npm run lint` | **limpo, 0 avisos** (o aviso preexistente vinha de `.firecrawl/`, que não existe no worktree) |
| `npm run settings:check` | 7 pass |

## Plano de readback público

Nada abaixo roda antes da autorização que nomeie o ato de aplicar. A ordem é
indivisível: um `Ready` sem readback é prova de infraestrutura, não de dado.

### Pré-condições

1. `20260809060000_verificacao_campos_schema_publico` no ledger. **Conferido em
   09/08: presente.**
2. A migration versionada na `main` antes de existir no banco (regra R1 de
   `scripts/audit/lib/ledger-guard.ts`; versão remota sem arquivo na `main` é a
   issue #131 de novo).
3. Dry-run em `BEGIN … ROLLBACK` contra produção, conferindo que o `UPDATE` toca
   exatamente 2 linhas.

### Aplicação

Não usar `apply_migration` do MCP da Management API: ele carimba timestamp
próprio em vez de usar o nome do arquivo, e foi assim que nasceu o terceiro caso
da #131. Não usar `db push`: arrastaria as 5 retidas da completude. O caminho é o
SQL do arquivo mais a linha do ledger na **mesma transação**, com a versão tirada
do nome do arquivo.

### Readback, na ordem

1. **Banco.** As duas linhas com as três chaves em `2026-08-06`, e nenhuma outra
   coluna alterada:

   ```sql
   select slug, verificacao_campos, ultima_atualizacao
     from public.candidatos
    where slug in ('cleber-rabelo','gilberto-vasconcelos');
   ```

   `ultima_atualizacao` tem de continuar `2026-08-05 11:54:11.147893+00` e
   `2026-08-05 13:55:40.454988+00`.

2. **Ausência de regressão no universo.** O contador de `null` continua zero e o
   de fichas com as três frentes sobe de 22 para 24:

   ```sql
   select count(*) filter (where verificacao_campos -> 'social_networks' = 'null'::jsonb) as nulls,
          count(*) filter (where verificacao_campos ?& array['candidate_registration','candidate_complement','social_networks']) as tres_frentes
     from public.candidatos;
   ```

3. **Ledger.** Uma linha nova, `20260809070000`, e nenhuma outra:
   `npm run audit:ledger:gate`.

4. **Revalidar a tag `public-candidato-ficha`, ANTES de ler API ou página.**
   Esta ordem não é preferência: `getCachedCandidatoBySlugResource` em
   `src/lib/api.ts` serve a ficha por `unstable_cache` com TTL de **3600s** e
   essa tag. Ler a API antes de revalidar mede o payload quente do formato
   antigo, e o resultado seria "a correção não pegou" para uma correção que
   pegou, ou pior, um "passou" tardio até uma hora depois. Foi exatamente o
   buraco fechado no PR #147.

   O caminho canônico é o workflow versionado
   [`revalidate-cache.yml`](../.github/workflows/revalidate-cache.yml), disparo
   manual, com o input `tags`:

   ```bash
   gh workflow run revalidate-cache.yml -f tags=public-candidato-ficha
   ```

   Conferir o resultado antes de seguir: o job falha com exit 1 se o HTTP não for
   200, e imprime o status no summary.

   ```bash
   gh run list --workflow=revalidate-cache.yml --limit=1
   ```

   **Não montar o `curl` à mão.** A versão anterior deste plano trazia um
   `curl -H @-` sem stdin e **sem o header `x-pf-revalidate-secret`**: ele não
   revalidaria nada e ainda daria a impressão de ter revalidado. O segredo vive
   em `PF_REVALIDATE_SECRET` nos Actions secrets, que é o motivo de o
   procedimento ser um workflow e não uma linha de terminal.

   Só a tag da ficha: as duas linhas mudam `candidatos.verificacao_campos`, que
   nenhuma outra tag serve. O default do workflow é `all`, e passar `all` aqui
   revalidaria dez tags para um efeito de duas fichas, escondendo qual superfície
   de fato dependia da escrita.

5. **API pública.** `section_freshness.perfil_atual` nas duas fichas, que é a
   superfície que o leitor vê. A rota é `/api/candidato-profile/{slug}`
   (`src/app/api/candidato-profile/[slug]/route.ts`); `/api/candidatos/{slug}`
   não existe e a versão anterior deste plano errava o caminho.
   `/api/candidato-profile/gilberto-vasconcelos` tem de trazer **TSE candidaturas
   2026, 06/08/2026**; `/api/candidato-profile/cleber-rabelo` continua em
   **Curadoria de processos, 05/08/2026**, e isso é passa, não falha.

6. **Página real.** `/candidato/gilberto-vasconcelos` e
   `/candidato/cleber-rabelo`.

7. **Cobertura.** `npm run audit:cobertura` e registro do ganho em
   `Settings/STATUS.md`.

Critério de parada: qualquer passo divergente interrompe a sequência e o
rollback versionado é o caminho de volta.
