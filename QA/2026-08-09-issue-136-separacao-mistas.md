# QA: separação aditiva das cinco migrations mistas (#136)

Data: 2026-08-09

## Escopo

Separar a DDL de cinco migrations de curadoria já aplicadas sem reescrever os
arquivos históricos nem alterar o ledger. As duas mistas retidas continuam fora
do schema de produção por decisão anterior.

## Implementação

- `20260809052600_schema_extraido_migrations_mistas.sql` reproduz somente DDL
  idempotente das cinco origens.
- `schema-replay-substituicoes.json` congela origem, SHA-256 e objetos esperados.
- O classificador falha fechado se uma origem mudar, sumir, deixar de ser mista
  ou apontar para substituto que não seja schema puro.
- `--schema-gate` executa o recorte efetivo em Postgres 17 vazio e o workflow de
  PR roda o gate real. A imagem é presa a digest e o `pg_dump` canônico precisa
  bater com o SHA-256 do manifesto.

## Evidência

| Prova | Resultado |
|---|---|
| Classificação | 375 total, 73 DDL bruto, 25 mistas, 66 no replay de schema |
| Replay de schema (`--schema-gate`) | 66 aplicadas, 309 puladas, 0 falhas, SHA-256 `f267beccdead5bd02c63865309fee714a6714e7a83559ba8332abc075a96378a`, RC 0 |
| Replay linear tolerante (`--gate`) | 289 aplicadas, 86 falhas, conjunto igual ao manifesto, RC 0 |
| Comparação estrutural (`--comparar`) | 165 CREATEs, 2 linhas conhecidas, 0 inesperadas, 0 faltantes, RC 0 |
| Hashes das cinco origens | SHA-256 medido em disco igual ao congelado no manifesto, nos cinco arquivos |
| Ledger remoto, antes | 369 versões, topo `20260808120000`, cinco origens aplicadas, cinco retidas ausentes, `20260809052600` ausente |
| Catálogo remoto, leitura | os 9 objetos das cinco origens presentes em produção, o que torna a migration um no-op estrutural |
| Allowlist da janela | `--desde=20260809 --ate=20260809`: 1 migration, 0 escritas declaradas. O gate conta anotações `@write` dentro do arquivo de migration, e a migration é DDL pura; o `INSERT` no ledger é do aplicador, fora desse recorte por definição |
| Teste focado | `tests/migrations-classificacao.test.ts`: 32 pass, 0 fail |
| Suíte completa | 2337 pass, 0 fail |
| Gates locais | typecheck, check:scripts, lint, lint:spell:ui, check:dead-code, settings:check e build limpos |
| Sonda de canal | tabela-sonda criada em `BEGIN`, visível na transação, ausente depois do `ROLLBACK` |
| Dry-run da migration | migration inteira mais a linha do ledger em `BEGIN … ROLLBACK`: `dry-run-ok`, 370 versões e topo `20260809052600` dentro da transação |
| Prova de que o dry-run não persistiu | fora da transação: 369 versões, topo `20260808120000`, `20260809052600` ausente, sonda ausente |
| Aplicação | DDL idempotente mais `INSERT` no ledger na mesma transação, versão do nome do arquivo, `name`/`statements`/`created_by` no formato da precedente `20260808120000` |
| Ledger depois | 370 versões, `20260809052600` uma única vez e como última, zero versões posteriores |
| Retidas depois | as cinco (`20260807050000` a `20260807053000`) continuam ausentes |
| Origens mistas depois | as cinco continuam aplicadas e intactas |
| Catálogo estrutural | 9 objetos comparados por definição e md5: idênticos antes e depois, o que prova o no-op |
| Ledger guard pós-aplicação | 370 no ledger, 375 arquivos, "ledger e repositório contam a mesma história" |
| Gates sobre o `main` mergeado | `--schema-gate` 66/0 com hash `f267becc…5a96378a`; `--comparar` 165 CREATEs, 2 conhecidas, 0 inesperadas, 0 faltantes |
| CI da `main` | CI, CodeQL, Replay real de migrations e Ledger vs repositório verdes |

## Aplicação

PR #144 mergeado em `dc96b91`; a `20260809052600` foi aplicada em seguida, e o
ledger foi de 369 para 370. O caminho foi o canônico da casa, o mesmo da
`20260808120000`: DDL explícito mais a linha do ledger na mesma transação, com
a versão tirada do nome do arquivo. Ficaram de fora, de propósito, o
`apply_migration` do MCP (carimba timestamp próprio, causa do terceiro caso da
issue #131) e o `db push` (arrastaria as cinco retidas).

## Limites

- O resultado prova reconstrução do **schema**, não bootstrap de candidatos nem
  reconstrução da curadoria.
- Nenhum arquivo histórico foi reescrito e nenhuma linha de ledger existente foi
  alterada: a única escrita no ledger foi a inserção da versão nova.
- As cinco migrations retidas da completude continuam fora do banco por decisão
  anterior, e nada nesta rodada mudou esse estado.
