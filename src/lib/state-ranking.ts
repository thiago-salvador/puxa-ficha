import type { IndicadorEstadualRanking } from "@/lib/types"
import {
  STATE_INDICATOR_ORDER,
  getStateIndicatorLowerIsBetter,
  ordinalMasculino,
} from "@/lib/state-indicator-metadata"

export interface StateIndicatorRank {
  indicador: string
  valor: number
  ano: number
  posicao: number
  total: number
  acimaDaMedia: boolean
  mediaNacional: number
  label: string
  qualidade: "bom" | "ruim" | "neutro"
  /** Origem do valor usado no ranking (último ano por UF). */
  fonte: string | null
}

export interface StateRankingResult {
  estado: string
  rankings: StateIndicatorRank[]
}

/** Ultimo valor numerico por UF para um indicador (ano mais recente com valor). */
function latestValorPorEstado(
  rows: IndicadorEstadualRanking[],
  indicador: string
): Map<string, { valor: number; ano: number; fonte: string | null }> {
  const byEstado = new Map<string, IndicadorEstadualRanking[]>()
  for (const r of rows) {
    if (r.indicador !== indicador) continue
    const k = r.estado.trim().toUpperCase()
    const list = byEstado.get(k) ?? []
    list.push(r)
    byEstado.set(k, list)
  }
  const out = new Map<string, { valor: number; ano: number; fonte: string | null }>()
  for (const [estado, list] of byEstado) {
    const sorted = [...list].sort((a, b) => {
      if (b.ano !== a.ano) return b.ano - a.ano
      return (a.fonte ?? "").localeCompare(b.fonte ?? "")
    })
    const pick = sorted.find((x) => x.valor != null)
    if (pick?.valor != null) {
      out.set(estado, {
        valor: pick.valor,
        ano: pick.ano,
        fonte: pick.fonte?.trim() ? pick.fonte : null,
      })
    }
  }
  return out
}

/** Dense rank: empates na mesma posicao; proximo valor incrementa 1. */
function denseRankByValor(
  entries: { estado: string; valor: number }[],
  lowerIsBetter: boolean
): Map<string, number> {
  const sorted = [...entries].sort((a, b) =>
    lowerIsBetter ? a.valor - b.valor : b.valor - a.valor
  )
  const rankMap = new Map<string, number>()
  let rank = 1
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i].valor !== sorted[i - 1].valor) {
      rank += 1
    }
    rankMap.set(sorted[i].estado, rank)
  }
  return rankMap
}

/**
 * Ranking nacional por indicador (somente chaves em STATE_INDICATOR_ORDER).
 * UFs com valor nulo na serie mais recente ficam fora do conjunto; `total` e a contagem de UFs com valor valido.
 * Empates usam rank denso (mesma posicao; proximo valor distinto incrementa 1).
 */
export function computeStateRanking(
  allIndicadores: IndicadorEstadualRanking[],
  targetUf: string
): StateRankingResult {
  const uf = targetUf.trim().toUpperCase()
  const rankings: StateIndicatorRank[] = []

  for (const indicador of STATE_INDICATOR_ORDER) {
    const latestMap = latestValorPorEstado(allIndicadores, indicador)
    const entries = [...latestMap.entries()].map(([estado, v]) => ({
      estado,
      valor: v.valor,
    }))
    if (entries.length === 0) continue

    const targetRow = latestMap.get(uf)
    if (!targetRow) continue

    const lowerIsBetter = getStateIndicatorLowerIsBetter(indicador)
    const rankMap = denseRankByValor(entries, lowerIsBetter)
    const posicao = rankMap.get(uf)
    if (posicao == null) continue

    const valores = entries.map((e) => e.valor)
    const mediaNacional = valores.reduce((a, b) => a + b, 0) / valores.length
    const total = entries.length
    const { valor, ano, fonte } = targetRow
    const epsilon = 1e-9
    const acimaDaMedia = valor > mediaNacional + epsilon
    const abaixoDaMedia = valor < mediaNacional - epsilon

    let qualidade: "bom" | "ruim" | "neutro"
    if (lowerIsBetter) {
      if (abaixoDaMedia) qualidade = "bom"
      else if (acimaDaMedia) qualidade = "ruim"
      else qualidade = "neutro"
    } else {
      if (acimaDaMedia) qualidade = "bom"
      else if (abaixoDaMedia) qualidade = "ruim"
      else qualidade = "neutro"
    }

    rankings.push({
      indicador,
      valor,
      ano,
      posicao,
      total,
      acimaDaMedia,
      mediaNacional,
      label: `${ordinalMasculino(posicao)} de ${total}`,
      qualidade,
      fonte,
    })
  }

  return { estado: uf, rankings }
}
