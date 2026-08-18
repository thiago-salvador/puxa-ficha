# Branches remotas apagadas na consolidação de 08/08/2026

Todas verificadas como superadas ou absorvidas pela main: nenhuma tinha
arquivo ou mudança que a main já não tivesse em versão igual ou mais nova.
Para restaurar qualquer uma: `git push origin <sha>:refs/heads/<nome>`.

| Branch | SHA |
|---|---|
| `codex/cobertura-por-fonte` | `0aecfb4` |
| `codex/contradicoes-curadoria-20260805` | `bf47995` |
| `codex/curadoria-processos-integrada-20260806` | `d328527` |
| `codex/curadoria-proveniencia` | `022d3ed` |
| `codex/curadoria-proveniencia-ledger-20260806` | `af16603` |
| `codex/decisoes-editoriais-integradas-20260806` | `a6cce06` |
| `codex/editorial-decisions-20260805` | `e8c42f2` |
| `codex/fechar-lacunas-publicaveis-saneado-20260806` | `9904a60` |
| `codex/guard-cpf-homonimos-20260805` | `70b6678` |
| `codex/ingests-historicos-20260805` | `0853e32` |
| `codex/ingests-historicos-integrados-20260806` | `9245044` |
| `codex/jarbas-investigacao-20260805` | `eb78d21` |
| `codex/jarbas-investigacao-integrada-20260806` | `0384b38` |
| `codex/processos-curadoria-20260805` | `2906b18` |
| `codex/processos-revisao-final-20260805` | `6ba1435` |
| `codex/reconcile-supabase-migrations` | `22892ea` |
| `codex/revisao-final-processos-integrada-20260806` | `3825a14` |

## Segunda rodada, no fechamento das 5 PRs e 2 issues

Mesma verificação, feita arquivo por arquivo contra a `main` do momento.

| Branch | SHA | Por que era seguro apagar |
|---|---|---|
| `codex/profiles-complete-2026` | `76d2144` | zero commit próprio, contida na `main` |
| `data/presidenciaveis-lacunas` | `13d2d5b` | zero commit próprio, contida na `main` |
| `data/governadores-al-lacunas` | `bfc2ea2` | 1 commit próprio, **não** mergeado, mas superado por conteúdo: os 4 arquivos que ele traz existem na `main` em versão mais nova (`check-report.ts` 204+/63-, `editorial-exceptions.json` 22+/0-, a migration `20260803080000` 38+/10- e o snapshot), e a migration já está no ledger |

Preservadas de propósito, porque são o material das PRs #114 e #72, fechadas sem
merge com a justificativa no próprio PR:

| Branch | SHA | PR |
|---|---|---|
| `codex/reconciliacao-cobertura-zero` | `7e35ac4` | #114, guarda o `reconcile-coverage.ts` |
| `perf/ficha-em-cache` | `64b4361` | #72 |
