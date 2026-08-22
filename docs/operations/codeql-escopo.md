# Escopo do CodeQL

Data: 2026-08-22. Escopo: triagem dos 57 alertas abertos de code scanning e
troca do default setup por configuração versionada.

## Veredito

**Nenhum dos 57 alertas tocava código servido ao usuário.** 34 estavam em
`scripts/`, 23 em `tests/`, zero em `src/`, `middleware.ts` ou nos configs da
raiz. 54 dos 57 vinham de queries com `precision: medium`, que só entram no
scan porque o default setup estava configurado com a suite `security-extended`.

Duas correções reais saíram da triagem (escape de regex incompleto em dois
testes). O restante foi resolvido reduzindo o escopo para o que é defensável,
com o motivo registrado aqui e nos comentários do próprio config.

## De onde vieram

O code scanning foi habilitado em 21/08/2026 pelo *default setup* da interface
do GitHub, com `query_suite: extended`, `threat_model: remote` e cadência
semanal. O default setup não aceita filtro de path nem escolha de suite, então
varria `tests/` e `scripts/` com o mesmo peso de `src/`.

A diferença entre as duas suites está nos seletores do próprio CodeQL
(`misc/suite-helpers/`): `code-scanning` inclui apenas `precision: high` e
`very-high`; `security-extended` acrescenta `precision: medium`.

## Triagem por regra

| Regra | Precision | N | Onde | Destino |
|---|---|---|---|---|
| `js/regex/missing-regexp-anchor` | medium | 18 | `tests/` | Sai da suite |
| `js/http-to-file-access` | medium | 15 | `scripts/` | Sai da suite |
| `js/file-access-to-http` | medium | 13 | `scripts/` | Sai da suite |
| `js/file-system-race` | medium | 4 | `scripts/`, `tests/` | Sai da suite |
| `js/insecure-temporary-file` | medium | 3 | `scripts/` | Sai da suite |
| `js/log-injection` | medium | 1 | `tests/` | Sai da suite |
| `js/incomplete-sanitization` | **high** | 2 | `tests/` | **Corrigido** |
| `js/incomplete-url-substring-sanitization` | **high** | 1 | `tests/` | Sai por path |

### Por que as de `precision: medium` não procedem aqui

- `http-to-file-access` e `file-access-to-http` marcam scripts de ingestão que
  baixam dado público de origem fixa (TSE, DataJud, DivulgaCand) e gravam em
  disco. É literalmente o trabalho desses scripts, e a origem não é controlada
  por terceiro.
- `file-system-race` marca o par `existsSync` + `writeFileSync` em
  `scripts/ingest-fotos-oficiais.ts:323` e `scripts/gerar-chapas-2026-pos-registro.ts:145`.
  Nos dois casos o `existsSync` é guarda de integridade deliberada, e o
  conteúdo é conferido por `sha256` logo depois, que é a mitigação correta.
- `insecure-temporary-file` marca `scripts/audit/patrimonio-eleicao-matrix.ts`,
  auditoria somente leitura com diretório de saída fixo em `/tmp`, rodada à mão.
- `missing-regexp-anchor` marca `assert.match()` de teste, onde casar substring
  é exatamente a intenção da asserção.

### As duas correções reais

`js/incomplete-sanitization` estava certo. O repositório já usa o escape
completo `/[.*+?^${}()|[\]\\]/g` em oito lugares, incluindo
`src/lib/ptbr-text.ts:204`. Os dois alertas apontavam justamente os dois pontos
que tinham desviado dessa convenção e escapavam um subconjunto:

- `tests/renan-processos-absolvido.test.ts:19` escapava só `.` e `-`.
- `tests/formacao-hibrida-migration.test.ts:47` escapava só parênteses.

Com os dados atuais das fixtures os dois funcionavam por sorte. Bastava alguém
acrescentar uma instituição com ponto no nome para o `.` virar coringa e a
asserção passar por engano. Os dois foram alinhados ao escape completo do
repositório. Testes: 7/7 PASS.

O terceiro de precisão alta,
`tests/visual/main-routes.spec.ts:16`, é um `includes()` de domínio dentro de um
filtro de ruído de console do Playwright. O input é mensagem livre de console,
não URL, então não há o que endurecer: sai junto com `tests/`.

## O que passou a valer

- `.github/workflows/codeql.yml`, versionado, com actions pinadas por SHA como
  o resto dos workflows do repositório.
- `.github/codeql/codeql-config.yml` com `paths-ignore: tests/**`.
- Suite default (`code-scanning`), sem `queries:` explícito.
- Default setup da interface desligado, senão os dois modos conflitam.

`scripts/` **continua no scan**. Esses scripts rodam em Actions com segredos de
ingestão, então são código privilegiado; o que os tirava do vermelho era a
precisão da query, não a relevância do diretório.

## Como reverter

Religar a suite mais agressiva é trocar uma linha:

```yaml
      - name: Initialize CodeQL
        uses: github/codeql-action/init@...
        with:
          queries: security-extended
```

Isso traz de volta as 54 de `precision: medium`. Antes de fazer isso, vale
decidir o que muda no julgamento acima, porque a triagem foi feita alerta a
alerta e não por amostragem.
