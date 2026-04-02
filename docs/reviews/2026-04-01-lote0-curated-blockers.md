# Lote 0 — Curated Bloqueados

Gerado em: 2026-04-01T18:54:19-03:00

## Resumo

- Curated no arquivo de assertions: `42`
- Curated auditados: `0`
- Curated reprovados: `42`
- Candidatos públicos no site: `0`

## Principais bloqueadores

- `crosscheck_partido_timeline`: `35`
- `mudancas_partido`: `34`
- `historico_politico`: `24`
- `crosscheck_cargo_historico`: `17`
- `crosscheck_financiamento_recencia`: `7`
- `projetos_lei`: `6`
- `crosscheck_patrimonio_recencia`: `6`
- `gastos_parlamentares`: `4`
- `crosscheck_freshness_curadoria`: `4`

## Casos prioritarios

- `ciro-gomes`: `crosscheck_freshness_curadoria`
- `ronaldo-caiado`: `crosscheck_cargo_historico`, `crosscheck_partido_timeline`, `crosscheck_freshness_curadoria`
- `aldo-rebelo`: `historico_politico`, `crosscheck_freshness_curadoria`
- `lula`: `historico_politico`, `mudancas_partido`, `crosscheck_cargo_historico`, `crosscheck_partido_timeline`
- `tarcisio`: `historico_politico`, `mudancas_partido`, `crosscheck_cargo_historico`, `crosscheck_partido_timeline`
- `flavio-bolsonaro`: `gastos_parlamentares`
- `romeu-zema`: `historico_politico`, `mudancas_partido`, `crosscheck_cargo_historico`, `crosscheck_partido_timeline`
- `sergio-moro-gov-pr`: `historico_politico`, `mudancas_partido`, `projetos_lei`, `votos_candidato`, `gastos_parlamentares`, `crosscheck_cargo_historico`, `crosscheck_partido_timeline`

## Ordem de ataque

1. Preencher `mudancas_partido` até o partido atual publicado.
2. Preencher `historico_politico` com último cargo compatível com `cargo_atual`.
3. Revalidar assertions curadas vencidas (`verifiedAt > 30 dias`).
4. Corrigir recência de `patrimonio` e `financiamento` para a eleição mais recente disputada.
5. Fechar lacunas legislativas aplicáveis: `projetos_lei`, `votos_candidato`, `gastos_parlamentares`.

## Observacao

Enquanto esses bloqueios existirem, `publicavel` deve permanecer `false`.
