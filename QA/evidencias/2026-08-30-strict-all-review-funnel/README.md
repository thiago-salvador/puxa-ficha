# Funil humano strict-all

Este pacote transforma o universo canônico da revisão independente em uma fila humana, sem inferir ausência e sem tocar produção.

## Universo provado

- 459 ocorrências em 169 fichas.
- R1: 76 ocorrências.
- R2: 128 ocorrências.
- R3: 91 ocorrências, sendo 42 na fonte `transparencia-sanctions` e 49 na fonte `processos-curadoria`.
- R5: 164 ocorrências.
- P0: 10 fichas em uma única página.
- P1: coorte original de 41 fichas nas quatro categorias, com 4 promovidas a P0 e 37 restantes na fila P1.
- P2: 122 fichas.
- Lotes humanos permitidos: 30 fichas `R5:votos-only` e 7 fichas `R2-only`.
- R3 nunca é decidido em lote.

O snapshot read-only contém 209 fichas públicas e foi consultado em `2026-08-30T18:38:54Z`. Os hashes dos dois insumos e da fila estão em `input-receipt.json`.

## Revisão humana

Execute:

```bash
npm run audit:strict-all:serve
```

Abra `http://127.0.0.1:8799/index.html`. O servidor grava uma linha por envio em `~/.disposable-html/strict-all-decisions.jsonl`, com `fsync`, e não acessa o banco.

Nenhuma opção vem selecionada. Registros incompletos ou sem URL HTTPS, horário com fuso e SHA-256, quando exigidos, são recusados. A decisão `coletar` gera trabalho read-only. A decisão `publicar_com_evidencia` permanece bloqueada até existir um payload factual específico.

## Coletas R3

`jobs.json` contém comandos por perfil e seis comandos de lote, todos com no máximo 20 slugs. Os dois coletores são scoped, fail-closed e não escrevem no Supabase. Resposta vazia de fonte não vira automaticamente recibo de não aplicabilidade.

## Aplicação separada

O aplicador apenas prepara um plano e arquivos SQL:

```bash
npm run audit:strict-all:apply -- \
  --queue=QA/evidencias/2026-08-30-strict-all-review-funnel/queue.json \
  --decisions="$HOME/.disposable-html/strict-all-decisions.jsonl" \
  --out=/tmp/strict-all-lote \
  --version=YYYYMMDDHHMMSS \
  --batch=identificador-do-lote
```

Ele não aplica a proposta. Pendências continuam pendentes, conflitos interrompem a execução, R1 despublicado supersede itens posteriores da ficha e R5 não gera recibo enquanto a dependência R3 estiver pendente.

## Provas locais

```bash
npm run test:strict-all-review-funnel
npm run prove:strict-all:pg17
```

A prova PostgreSQL 17 usa dados fictícios e container descartável. Ela cobre três ações, despublicação, receipts, ledger, readback anterior recusado, rollback adulterado recusado e linha-controle preservada.

Nenhuma migration de ficha real foi criada, pois ainda não há decisões humanas registradas para um lote autorizado.
