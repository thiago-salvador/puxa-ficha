/**
 * Evolução patrimonial da lista pública: 2026 versus o último ano
 * registrado antes de 2026. Sem o par (2026 + ano anterior) não há
 * porcentagem; a UI mostra N/A. Não inventa variação.
 */
const PATRIMONIO_EVOLUCAO_ANO_ALVO = 2026

export type PatrimonioAnoValor = {
  ano_eleicao: number
  valor_total: number | null
}

export function evolucaoPatrimonialVs2026(
  series: PatrimonioAnoValor[],
): number | null {
  const byYear = new Map<number, number>()
  for (const row of series) {
    if (!Number.isFinite(row.ano_eleicao)) continue
    if (row.valor_total == null || !Number.isFinite(row.valor_total)) continue
    byYear.set(row.ano_eleicao, row.valor_total)
  }

  const valor2026 = byYear.get(PATRIMONIO_EVOLUCAO_ANO_ALVO)
  if (valor2026 == null) return null

  const anosAnteriores = [...byYear.keys()].filter(
    (ano) => ano < PATRIMONIO_EVOLUCAO_ANO_ALVO,
  )
  if (anosAnteriores.length === 0) return null

  const ultimoAno = Math.max(...anosAnteriores)
  const valorAnterior = byYear.get(ultimoAno)
  // Divisão por zero não produz porcentagem real. Preferir N/A a 0% inventado.
  if (valorAnterior == null || valorAnterior === 0) return null

  return ((valor2026 - valorAnterior) / valorAnterior) * 100
}

export function formatEvolucaoPatrimonialPct(pct: number | null): string {
  if (pct == null) return "N/A"
  const rounded = Math.round(pct)
  const abs = Math.abs(rounded).toLocaleString("pt-BR")
  if (rounded > 0) return `+${abs}%`
  if (rounded < 0) return `-${abs}%`
  return "0%"
}
