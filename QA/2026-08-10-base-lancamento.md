# Base do lançamento: receipt

Branch `base-lancamento`, montada pela Sessão Raiz em 09/08/2026, em worktree
isolado. O checkout compartilhado
(`/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha`) não foi tocado: nem
arquivo criado, nem `git add`, nem commit, nem `stash`. Ele segue em `main`
`0b08a3b` com os mesmos 27 paths sujos de antes.

## A pilha, de baixo para cima

| SHA | O que entra |
|---|---|
| `0b08a3b` | `main`, ponto de partida |
| `b5978c1` | Gate de allowlist, recortes e baseline de dívida congelada |
| `94f35a9` | Head final da PR #149: fecha o fail-open do parser e nomeia as violações do mapa |
| `1b46254` | Pacote da migration B2 `20260809070000`, cherry-pick de `499d625` |
| `b5947c3` | **SHA_BASE**: os cinco Markdown do contrato do lançamento |
| `d1749e2` | **TIP antes deste receipt**: reprova janela vazia no modo recorte |

O ponto de partida publicado para as trilhas é o **tip do branch
`base-lancamento`**, que inclui este receipt.

### Como conferir a consistência

```bash
git log --oneline -7 base-lancamento
git merge-base --is-ancestor 94f35a9 base-lancamento && echo "head da PR #149 dentro"
git diff --stat 499d625 1b46254   # vazio: o cherry-pick preservou a B2 byte a byte
```

Divergência do plano original, registrada de propósito: o prompt previa o
receipt como segundo commit, com `SHA_BASE` sendo o pai do tip. Entre os dois
entrou `d1749e2`, a correção do parser que você pediu antes de liberar qualquer
trilha. Então o pai do tip é `d1749e2`, não `b5947c3`, e a verificação correta é
o `git log` acima, não a comparação de pai único.

## O que entrou na base, e o que ficou de fora

**Entrou por ancestralidade** (20 paths, zero cópia): todo o gate de allowlist
de `b5978c1` mais `94f35a9`, e os 14 paths da B2 de `1b46254`, incluindo
migration, rollback, allowlist própria, `provar-migration-b2.sh`, os testes e a
infra de CI que faz o script rodar.

**Entrou por cópia** (5 Markdown, zero código):

| Path | Por quê |
|---|---|
| `QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md` | Os 18 itens, agrupados em 7 problemas e ordenados por gravidade |
| `QA/2026-08-09-avaliacao-auditoria-codex.md` | Os 4 P0 que bloquearam a v1 dos prompts |
| `QA/2026-08-09-prompts-sessoes-lancamento-v2.md` | Contrato vigente das 5 sessões |
| `QA/2026-08-09-prompts-sessoes-lancamento.md` | A v1, referenciada por caminho pelos dois acima |
| `QA/2026-08-09-chave-independente-e-frescor-por-ultima-verificacao.md` | Evidência do R1 do gate de 20 linhas |

**Ficou de fora**, e continua intocado no checkout compartilhado para a sessão
dona: `QA/2026-08-09-ativacao-alertas-email-producao.md` e
`QA/evidencias/2026-08-09-ativacao-alertas/` (8 arquivos). É a frente de
ativação dos alertas por email, com PR #150 própria e bloqueada. Não é nenhum
dos 18 itens nem das 2 regressões.

Uma cópia velha não entrou, e vale saber por quê: o
`QA/2026-08-09-verificacao-campos-b2-cleber-gilberto.md` solto no checkout
compartilhado é anterior ao commit e ainda traz um `curl` de revalidação sem
stdin e sem o header `x-pf-revalidate-secret`, que não revalidaria nada e daria
a impressão de ter revalidado. A base usa a versão de `1b46254`, que já aponta
para o workflow `revalidate-cache.yml`.

## Atenção ao gate de allowlist

O comando do gate é `npm run audit:cobertura:allowlist`, **sem flag nenhuma**.
Ele lê `scripts/audit/recortes.json` e confere cada recorte na própria janela.

Para conferir um recorte antes de registrá-lo, as três flags vão juntas e
**sempre na forma com `=`**:

```bash
npm run audit:cobertura:allowlist -- --allowlist=<sua>.json --desde=<prefixo> --ate=<prefixo>
```

Três coisas que hoje reprovam e antes passavam:

- Forma com espaço (`--allowlist X`) sai 2. Antes os três valores sumiam, o
  comando caía no modo completo e imprimia `OK` com exit 0.
- Janela que não pega migration nenhuma sai 1. Antes imprimia
  "0 migration(s) na janela" e logo abaixo `OK`, com exit 0. A janela é
  comparação de prefixo de **nome de arquivo**, não data, que é onde o erro de
  digitação cai.
- Allowlist que não conferiu escrita nenhuma sai 1.

## Propriedade de arquivos

Cada trilha só toca o que é dela. Conflito em arquivo compartilhado é o que esta
tabela existe para evitar.

| Trilha | Pode tocar |
|---|---|
| A | Módulo de classificação e timeline em `src/`, testes correspondentes, migrations novas da trilha, allowlist própria em `scripts/audit/allowlist-trilha-a-*.json`, proposta de recorte em `scripts/audit/recortes-trilha-a.proposta.json` |
| B | `scripts/lib/` (coletores e modo dry-run), scripts de backfill, config de agendamento, relatórios de dry-run em `QA/` |
| C | Módulos de destaques, autoria e votações em `src/`, dataset editorial, testes. **Não toca o módulo de timeline**, que é da A |
| D | Componentes de UI dos cards de dinheiro e patrimônio, e template de email |
| **Raiz** | `scripts/audit/recortes.json`, `scripts/audit/baseline-escritas-sem-anotacao.json`, aplicação de migrations, merge, deploy |

Migration de dados nova exige três coisas no mesmo PR: as anotações `-- @write`,
uma allowlist que autorize os pares `(tabela, slug, campos)`, e uma entrada em
`recortes.json` ligando a janela àquela allowlist. A entrada em `recortes.json`
é ato da Raiz: a trilha entrega a proposta em arquivo separado.

## Comando de cada trilha

```bash
git worktree add ../puxa-ficha-trilha-a base-lancamento -b trilha-a
git worktree add ../puxa-ficha-trilha-b base-lancamento -b trilha-b
git worktree add ../puxa-ficha-trilha-c base-lancamento -b trilha-c
git worktree add ../puxa-ficha-trilha-d base-lancamento -b trilha-d
```

Cada worktree precisa do próprio `npm ci`.

## Provas rodadas nesta base

Todas no worktree `../puxa-ficha-base-lancamento`, com `npm ci` próprio.

| Prova | Resultado |
|---|---|
| Prova adversarial do parser, 13 casos | 13/13 como esperado, incluindo o caso 13 que achou a janela vazia |
| `tests/audit-gate-divida-e2e.test.ts` | 13 pass, 0 fail |
| Suíte completa | **2526 pass, 0 fail** |
| `npm run audit:cobertura:allowlist` sem flags | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run check:dead-code` | exit 0, `--max-issues 0` |
| `npm run settings:check` | 7 pass, 0 fail |
| `npm run build` | exit 0 |
| Checks da PR #149 no head `94f35a9` | todos pass ou skipped |

**Flake registrado, não escondido.** Na primeira execução da suíte completa, os
dois testes de `tests/backfill-historico-integration.test.ts` foram mortos por
timeout (`code 143`, aos 21s cada) e o placar saiu 2524 pass, 2 fail. Rodando o
arquivo sozinho, passam em 2,1s; rodando a suíte inteira de novo, 2526 pass, 0
fail. É contenção de subprocesso sob carga paralela, não regressão: o commit
`d1749e2` não toca nada que esse teste exercita. Vale olhar se reaparecer em CI.

## O que NÃO foi feito

Sem push. Sem merge. Sem migration aplicada. Sem coleta disparada. Sem deploy.
A migration `20260809070000` continua criada e provada, não aplicada. Cada um
desses atos exige autorização nomeando o ato, um por vez, na Fase 3.
