/**
 * Soma de `total_gasto` por candidato — mesma semântica do ranking `gastos-parlamentares`
 * e do comparador (múltiplas linhas por candidato somadas).
 */
export function sumTotalGastoByCandidatoId(
  rows: Array<{
    candidato_id: string
    total_gasto: number | string | null | undefined
  }>
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.total_gasto == null) continue
    const v = Number(row.total_gasto)
    if (Number.isNaN(v)) continue
    const id = row.candidato_id
    totals.set(id, (totals.get(id) ?? 0) + v)
  }
  return totals
}
