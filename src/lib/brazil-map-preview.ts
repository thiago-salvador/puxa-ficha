import { getEstadoUFs } from "@/lib/api"
import { STATE_INDICATOR_CONFIG } from "@/lib/state-indicator-metadata"
import type { IndicadorEstadualRanking } from "@/lib/types"

export type BrazilMapIndicadoresPreview = {
  populacao?: string
  pib?: string
  homicidios?: string
}

function latestValor(
  rows: IndicadorEstadualRanking[],
  ufUpper: string,
  indicador: string
): number | null {
  let best: IndicadorEstadualRanking | null = null
  for (const r of rows) {
    if (r.estado.trim().toUpperCase() !== ufUpper || r.indicador !== indicador) continue
    if (r.valor == null) continue
    if (!best || r.ano > best.ano) best = r
  }
  return best?.valor ?? null
}

/** Snapshot por UF (chave = sigla maiuscula) para o hover do mapa. */
export function buildIndicadoresPorEstadoForMap(
  rows: IndicadorEstadualRanking[]
): Record<string, BrazilMapIndicadoresPreview> {
  const out: Record<string, BrazilMapIndicadoresPreview> = {}
  for (const uf of getEstadoUFs()) {
    const upper = uf.toUpperCase()
    const populacao = latestValor(rows, upper, "populacao_estimada")
    const pib = latestValor(rows, upper, "pib_total")
    const hom = latestValor(rows, upper, "homicidios_100k")
    const cell: BrazilMapIndicadoresPreview = {}
    if (populacao != null) {
      cell.populacao = STATE_INDICATOR_CONFIG.populacao_estimada.format(populacao)
    }
    if (pib != null) {
      cell.pib = STATE_INDICATOR_CONFIG.pib_total.format(pib)
    }
    if (hom != null) {
      cell.homicidios = STATE_INDICATOR_CONFIG.homicidios_100k.format(hom)
    }
    if (Object.keys(cell).length > 0) {
      out[upper] = cell
    }
  }
  return out
}

export function buildGovernadorCountByUf(
  candidatos: { estado: string | null }[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const c of candidatos) {
    if (!c.estado) continue
    const k = c.estado.trim().toUpperCase()
    counts[k] = (counts[k] ?? 0) + 1
  }
  return counts
}
