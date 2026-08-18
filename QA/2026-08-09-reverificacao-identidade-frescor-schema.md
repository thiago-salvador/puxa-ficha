# QA: identidade da etapa 2, contrato de frescor por campo e schema puro (#136, PR #146)

Data: 2026-08-09

## Escopo

Fechar localmente as etapas 2 a 8 da execução `pf-reverificacao-20260809`: tirar
a decisão de identidade de `output/` e transformá-la em gate de CI, dar contrato
a `verificacao_campos` no leitor e no escritor, e separar em migration pura o
schema que estava preso dentro de uma migration mista e retida.

Merge autorizado por ato nomeado. Migration NÃO aplicada, nenhuma escrita em
banco, nenhuma invalidação manual de cache.

## Defeitos encontrados, e o que provou cada um

| # | Defeito | Como foi medido |
|---|---|---|
| 1 | A decisão de identidade da etapa 2 nunca chegava ao CI: vivia em `output/`, ignorado por `.gitignore:15` | O teste existente só rodava na máquina com os 3,3 MB de ZIPs |
| 2 | Esse teste tinha quatro furos | Laço de contenção de chave em forma vacuous-pass; nunca afirmava que `match_fresco` TEM chave; nenhuma contagem afirmada; hashes conferidos contra o arquivo que o próprio script acabara de reescrever |
| 3 | O leitor promovia o perfil inteiro com verificação PARCIAL | `buildSectionFreshness` ordenava 4 chaves e pegava a mais recente |
| 4 | O escritor não tinha contrato nenhum | Emitia `source_verification_dates.proposed_value` verbatim: o que estivesse no ledger virava coluna |
| 5 | `cleber-rabelo` e `gilberto-vasconcelos` gravados com `social_networks: null` | O ledger registra `no_row_for_safe_sq` com `count: 0`, que `Settings/OBJECTIVE.md` define como `vazio_confirmado`, estado que merece data |
| 6 | Chave com `null` apagaria data boa anterior | Em jsonb, `'{"a":"2026-06-01"}'::jsonb \|\| '{"a":null}'::jsonb` resulta em `{"a": null}`; o merge do escritor é `COALESCE(...) \|\| patch` |
| 7 | Data no ledger não significa campo confirmado | 448 propostas com `query_result: no_safe_match` carregam `verified_at` E `source_date`; o ledger de frescor traz `verified_at` nos 194 × 3 campos |
| 8 | `CREATE OR REPLACE VIEW` não remove coluna | Postgres 17: `ERROR: cannot drop columns from view` |
| 9 | Sonda de prontidão do replay aprovava cedo demais | A sonda de socket aprova com **1** linha `ready to accept connections` no log (servidor temporário do `initdb`, derrubado 131 ms depois); a de TCP só aprova com **2** |
| 10 | `platformFor` classificava rede por substring do host | CodeQL, 7 alertas altos `js/incomplete-url-substring-sanitization`; `instagram.com.dominio-de-terceiro.net` e `naoinstagram.com` casavam |

Correção de uma afirmação minha anterior: eu havia dito que `20260807052000`
recriava a view **sem** o filtro `interno:%`. É falso. As duas definições trazem
o filtro; a diferença real é espaçamento, a qualificação `public.` e a coluna
nova. Derivar da definição de registro seguiu valendo por razão procedimental,
e virou teste em vez de leitura humana.

## Implementação

### Identidade da etapa 2

- Núcleo puro em `scripts/lib/identidade-etapa2-classificador.ts`.
- Registro `data/identidade-etapa2-2026.json` com as **71 entradas verbatim**,
  o que torna os dois hashes recomputáveis em CI sem artefato gitignorado.
- Parser fail-closed em `scripts/lib/identidade-etapa2.ts`.
- Porta de materialização `exigirMaterializacaoTse2026()`, ligada ao escritor
  real, com validade que morde **na porta, não em `npm test`**.
- Consumidor real em `scripts/validate-seed.ts`, que roda em todo PR.
- Aquisição oficial versionada em `scripts/audit/fetch-tse-fontes-2026.ts`.

### Contrato de frescor

- `src/lib/verificacao-campos.ts` é o único ponto de decisão.
- Só `publicado` e `vazio_confirmado` carimbam data; o resto produz **chave
  ausente**, nunca `null`.
- Agregado só avança com as três frentes TSE resolvidas, pela data **mais
  antiga**, comparada por instante.
- Data exige ISO estrito, calendário real e **fuso obrigatório** quando há hora.
- Tradução do ledger por par `(campo, query_result)`, fail-closed, com
  `candidate_complement` agregando `profession` + `education`.

### Schema puro

- `20260809060000_verificacao_campos_schema_publico.sql`: coluna, `GRANT SELECT`
  de coluna e recriação de `candidatos_publico` a partir da definição de registro
  (`20260803142851`), com a coluna nova no fim. Zero DML, zero `@write`, sem
  fronteira de transação própria.
- Rollback versionado em `supabase/rollback/`, harness em
  `scripts/audit/provar-rollback.sh` (`npm run audit:rollback:provar`).
- As cinco retidas passaram a ser congeladas por hash em
  `scripts/audit/migrations-retidas.json`.

## Evidência

| Prova | Resultado |
|---|---|
| Porte do classificador | Reproduz **byte a byte** os hashes originais: diagnóstico `fc3e2235348bf85e74072487a67cdf1056026724e0d145a55b5895e23f8d1cf7`, slugs `c05993541835f5ee06879ae084b96450fd78f44e97feffac86987431e22bcff9` |
| Classificação dos 71 | 12 `match_fresco`, 12 `revisao_identidade`, 1 `conflito_cargo_uf`, 1 `registro_encontrado_outro_cargo`, 2 `proxima_possivel_urna`, 43 `nao_localizado_pelos_matchers` |
| Contenção de chave | `chave` e `frentes_tse` em exatamente os 12; 59 bloqueadas, das quais 16 trazem SQ em `hits[]` como evidência |
| Regeneração do gerador | Diff cirúrgico: 0 colunas não-jsonb alteradas, 0 valores preexistentes alterados, **837 nulls → 0**, e só `cleber-rabelo` e `gilberto-vasconcelos` mudam de conjunto de chaves datadas |
| Correção de URL | Regenerar após a correção dá arquivo **byte-idêntico**: nenhuma rede real reclassificada |
| Renovação em checkout limpo | Os três artefatos gitignorados escondidos, e a renovação reproduziu os mesmos hashes; `--do-zero` falha, como deve |
| Congelamento das retidas | Provado por mutação: linha acrescentada a uma retida derruba o gate com `mudou de conteudo` |
| Rollback, ramo 1 | Com verificação gravada, **aborta** com `rollback abortado: 1 linha(s)`, e a coluna continua existindo |
| Rollback, ramo 2 | Com coluna vazia, remove coluna, privilégio e versão do ledger, e o `pg_dump --schema-only` fica **idêntico** ao de um container sem a migration |
| Gate do rollback | Provado por mutação: sem o `DROP COLUMN`, sai 1 com `REPROVADO: coluna removida? deveria ser 0, medido 1` |
| Determinismo de fuso | `2026-08-06T23:30:00Z` dá `1786059000000` em UTC e em `America/Sao_Paulo`; sem fuso, recusado |
| `classificar` | 376 total, 51 schema, 325 curadoria, 25 mistas |
| `replay -- --gate` | 290 aplicadas, 86 falhas, conjunto igual ao manifesto, RC 0 |
| `replay -- --schema-gate` | 67 aplicadas, 309 puladas, 0 falhas, SHA-256 `e95b2aa27e24a269cf66b2589fc6a98f2aa69ce1e0e6ebc2b2d8bc7191c1a3e9`, RC 0 |
| `replay -- --comparar` | 165 CREATEs, conhecidos=2, inesperados=0, faltantes=0, EQUIVALENTE, RC 0 |
| Suíte completa | 2464 pass, 0 fail |
| Gates locais | lint, typecheck, check:scripts, check:dead-code, build, settings:check (7/7), eval self-test (30/30), validate:seed (271), audit:seed-sq-identity (645 pares), audit:ids-cohort, todos RC 0 |
| `audit:cobertura:allowlist` | **FAIL, 550 violações**, 376 na janela. Baseline histórico conhecido, deliberadamente não tocado |
| CI do PR | 9 pass, 1 skipping (acessibilidade só roda em produção), zero alerta de code scanning aberto |
| CI do main pós-merge | CI, CodeQL, Replay real de migrations e Ledger vs repositório, todos success em `a1ffde9` |

## Baselines remedidas

Valores **medidos**, não estimados:

| Baseline | Antes | Agora |
|---|---|---|
| `MEDICAO_REPLAY.schemaReplayTamanho` | 66 | 67 |
| `MEDICAO_REPLAY.ddlSetTamanho` | 73 | 74 |
| `MEDICAO_REPLAY.compararCreatesComparados` | 159 | 165 (a defasagem antecede esta mudança) |
| `falhas-replay-linear.json.aplicadas_esperadas` | 289 | 290 |
| `schema_replay_substituicoes.schema_dump_sha256` | `f267becc…5a96378a` | `e95b2aa2…91c1a3e9` |
| `Settings/WORKFLOWS.md`, replay linear | 289/86 | 290/86 |

## Revisão independente: quatro rodadas, 18 achados, todos procedentes

As três primeiras autorizações foram **bloqueadas**, com razão. Cada achado foi
reproduzido antes de corrigir.

| Rodada | Achados que mais importaram |
|---|---|
| 1 | Migration untracked (aplicar criaria R1 no `ledger-guard`, ou seja a issue #131 de novo); `BEGIN`/`COMMIT` internos encerrariam a transação externa antes da gravação do ledger; rollback não executável; validade da etapa 2 solta do escritor e fail-open em data ilegível; `candidate_complement` carimbando com data de um só constituinte; `2026-02-30` aceita e rolada para 02/03; `PF_B2_SEM_CARDINALIDADE` desligando dois guards por variável de ambiente |
| 2 | Timestamp sem fuso mudava de valor entre máquinas; rollback com `DROP COLUMN` comentado, sem `REVOKE` e sem reconciliar o ledger; o bypass apenas trocou de forma, de env para caminho `tests/fixtures/`; renovação dependia de artefatos que o fetch não reconstrói; retidas sem congelamento por hash; dois testes sobredeclaravam a prova |
| 3 | Renovação regravava datas fixas, então renovar depois de 16/08 nascia vencido; ledger com SHA divergente só avisava; registro com SQ fora do seed era excluído da comparação; teste do leitor sem ordem temporal adversarial; rollback e prova viviam só em `output/`; interface contradizia a frase |
| 4 | Gate do rollback saía 0 mesmo reprovando; SQL gerado ainda com fronteira de transação; data inutilizável em campo que avança virava skip silencioso; orientação de abort do rollback estava errada; dois parses de teste aceitavam `-1`; guarda case-sensitive; consultas do gate sem `table_schema='public'` |

Padrão que vale registrar: **o mesmo defeito voltou três vezes mudando de
forma.** O bypass de cardinalidade nasceu como variável de ambiente, virou
caminho de arquivo, e só morreu quando foi amarrado ao SHA-256 do ledger. Corrigir
a instância não corrigia a classe.

Dois comentários foram retirados pelo próprio revisor depois de conferir o HEAD:
o escopo `table_schema='public'` e a autenticação da sonda TCP, ambos falsos
positivos ancorados em commits anteriores.

## Merge e readback público

Ato nomeado autorizado, com uma ressalva levantada **antes** de executar: a frase
dizia `SEM DEPLOY`, mas todo merge em `main` gera Production deployment
automático no Vercel, medido nos cinco Production anteriores, que batem com os
SHAs de merge. Apresentada a medição, o dono optou por mergear aceitando o
deploy.

- Squash merge em `a1ffde9849850000d0974886b7eff53ff03fe8b1`, exatamente sobre
  `625576c3b8cb443cf24b83db9b8b077e56f7a618` (`--match-head-commit`).
- Autor preservado: Thiago Salvador; committer GitHub, padrão do squash.
- `/api/deployment-info` serve `a1ffde9`, ref `main`, environment `production`.
- `lula`, `ronaldo-caiado` e `felicio-ramuth` em HTTP 200.
- `verificacao_campos` vem `null` no payload: a coluna **segue fora do banco** e
  o leitor caiu no fallback `42703`, como previsto.
- `felicio-ramuth` continua com `Perfil verificado em 14/04/2026 (Perfil factual
  curado)`, status `stale`, idêntico ao de antes do deploy.

O deploy foi neutro na superfície pública. O único efeito era o keyPart novo
invalidar o cache das fichas, causando recarga fria com conteúdo idêntico.

## Pendências abertas

| Pendência | Por que não foi feita aqui |
|---|---|
| Aplicar `20260809060000` | Ato próprio, com frase própria. Rollback já versionado e provado nos dois ramos |
| `cleber-rabelo` e `gilberto-vasconcelos` com `social_networks` null no banco | É curadoria (`UPDATE candidatos`), exige `@write` e entrada de allowlist, e a migration que a carrega está retida. O gerador já emite certo |
| Recheque TSE dos 43 `nao_localizado` | Foram medidos contra o snapshot de 08/08, com a janela de pedidos de registro aberta até 15/08 às 19h. Não pode ser simulado |
| `audit:cobertura:allowlist` em FAIL 550 | Baseline histórico. Corrigir estava fora do escopo e explicitamente vetado |
| Penhasco de frescor | Com o agregado promovendo pela data mais antiga, as 43 fichas com as três frentes em `2026-08-06` cruzam a janela de 75 dias **juntas**, por volta de 20/10/2026 |
| Branch `codex/reverificacao-identidade-frescor-schema` | Continua no remoto. `Settings/README.md` manda apagar após o merge, com o SHA registrado em `docs/arquivo/` |
