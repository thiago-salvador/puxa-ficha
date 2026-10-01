# Issue #646: validação local

Execuções em 01/10/2026 com Node 24 (`/opt/homebrew/opt/node@24/bin`). Nenhuma escrita em produção.

| Verificação | Exit | Trecho final observado |
|---|---:|---|
| Testes focados | 0 | `ℹ tests 101`; `ℹ pass 101`; `ℹ fail 0`; `ℹ skipped 0` |
| `npm run typecheck` | 0 | `> tsc --noEmit -p tsconfig.json` |
| `npm run check:scripts` | 0 | `> tsc --project tsconfig.scripts.json` |
| ESLint direcionado | 0 | `> eslint --max-warnings=0` para os arquivos alterados no escopo da issue |

CLI replay: `total=3`, `ready=2`, `unchanged=0`, `blocked=0`, `review_required=1`, `persisted=0`. A suíte comprova que Ricardo mantém a situação escalar anterior sob revisão, e Major Paulo Roberto e Toinho Dufrango são reconciliados para `indeferido`. O teste de caminho de saída igual ao snapshot publicado confirmou que os bytes de entrada permanecem intactos.
