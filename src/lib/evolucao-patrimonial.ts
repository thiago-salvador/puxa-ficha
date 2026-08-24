/**
 * Evolução patrimonial da lista pública: 2026 versus o último ano
 * registrado antes de 2026. Sem o par (2026 + ano anterior) não há
 * porcentagem; a UI mostra N/A. Não inventa variação.
 */
const PATRIMONIO_EVOLUCAO_ANO_ALVO = 2026

export const PATRIMONIO_EVOLUCAO_ALERTA_LIMITE = 1_000_000

export type PatrimonioAnoValor = {
  ano_eleicao: number
  valor_total: number | null
}

export type AlertaEvolucaoPatrimonial = {
  anoAnterior: number
  anoAlvo: number
  valorAnterior: number
  valorAlvo: number
  aumento: number
}

function referenciaEvolucaoPatrimonialVs2026(
  series: PatrimonioAnoValor[],
): Omit<AlertaEvolucaoPatrimonial, "aumento"> | null {
  const byYear = new Map<number, number>()
  for (const row of series) {
    if (!Number.isFinite(row.ano_eleicao)) continue
    if (row.valor_total == null || !Number.isFinite(row.valor_total)) continue
    byYear.set(row.ano_eleicao, row.valor_total)
  }

  const valorAlvo = byYear.get(PATRIMONIO_EVOLUCAO_ANO_ALVO)
  if (valorAlvo == null) return null

  const anosAnteriores = [...byYear.keys()].filter(
    (ano) => ano < PATRIMONIO_EVOLUCAO_ANO_ALVO,
  )
  if (anosAnteriores.length === 0) return null

  const anoAnterior = Math.max(...anosAnteriores)
  const valorAnterior = byYear.get(anoAnterior)
  if (valorAnterior == null) return null

  return {
    anoAnterior,
    anoAlvo: PATRIMONIO_EVOLUCAO_ANO_ALVO,
    valorAnterior,
    valorAlvo,
  }
}

export function evolucaoPatrimonialVs2026(
  series: PatrimonioAnoValor[],
): number | null {
  const referencia = referenciaEvolucaoPatrimonialVs2026(series)
  if (!referencia) return null
  // Divisão por zero não produz porcentagem real. Preferir N/A a 0% inventado.
  if (referencia.valorAnterior === 0) return null

  return (
    ((referencia.valorAlvo - referencia.valorAnterior) / referencia.valorAnterior) * 100
  )
}

/**
 * Sinal factual, sem inferência sobre a origem da variação: compara a
 * declaração de 2026 com a declaração mais recente anterior e só passa quando
 * o aumento absoluto é estritamente maior que R$ 1 milhão.
 */
export function alertaEvolucaoPatrimonialVs2026(
  series: PatrimonioAnoValor[],
): AlertaEvolucaoPatrimonial | null {
  const referencia = referenciaEvolucaoPatrimonialVs2026(series)
  if (!referencia) return null

  const aumento = referencia.valorAlvo - referencia.valorAnterior
  if (aumento <= PATRIMONIO_EVOLUCAO_ALERTA_LIMITE) return null

  return { ...referencia, aumento }
}

export function formatEvolucaoPatrimonialPct(pct: number | null): string {
  if (pct == null) return "N/A"
  const rounded = Math.round(pct)
  const abs = Math.abs(rounded).toLocaleString("pt-BR")
  if (rounded > 0) return `+${abs}%`
  if (rounded < 0) return `-${abs}%`
  return "0%"
}
