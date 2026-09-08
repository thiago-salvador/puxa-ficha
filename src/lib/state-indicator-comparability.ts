import type { IndicadorEstadualRanking } from "@/lib/types"

export type ComparableIndicator = IndicadorEstadualRanking & {
  unidade?: string | null
  metadata?: Record<string, unknown> | null
}

export function metadataText(row: ComparableIndicator, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row.metadata?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

export function indicatorPeriod(row: ComparableIndicator): { label: string; key: string | null } {
  const period = metadataText(row, "periodo", "period", "periodo_referencia")
  const quarter = metadataText(row, "trimestre", "quarter")
  if (quarter && /^[1-4]$/.test(quarter)) return { label: `${quarter}º trimestre de ${row.ano}`, key: `${row.ano}-Q${quarter}` }
  if (period && period !== String(row.ano)) {
    const quarterly = period.match(/^(\d{4})[- ]?Q([1-4])$/i)
    if (quarterly && Number(quarterly[1]) === row.ano) return { label: `${quarterly[2]}º trimestre de ${row.ano}`, key: `${row.ano}-Q${quarterly[2]}` }
    return { label: `${period} · período não validado`, key: null }
  }
  if (row.indicador === "taxa_desemprego") return { label: `${row.ano} · trimestre não informado`, key: null }
  return Number.isInteger(row.ano) && row.ano > 1900 && row.ano < 2200
    ? { label: String(row.ano), key: String(row.ano) }
    : { label: "Período não informado", key: null }
}

function indicatorDefinition(row: ComparableIndicator): string | null {
  const explicit = metadataText(row, "definicao", "definition", "serie_codigo", "serie", "series_code", "SERCODIGO")
  if (explicit) return explicit
  // These annual series have a fixed definition in the IBGE collector.
  if (row.fonte === "ibge_sidra" && row.indicador === "populacao_estimada" && row.unidade === "habitantes") return "ibge:6579:9324"
  if (row.fonte === "ibge_sidra" && row.indicador === "pib_total" && row.unidade === "mil_reais") return "ibge:5938:37"
  if (row.fonte === "ipeadata" && row.indicador === "gini" && row.unidade === "indice") return "PNADCA_GINIUF"
  if (row.fonte === "ipeadata" && row.indicador === "taxa_pobreza" && row.unidade === "percentual") return "PNADCA_TXPNUF"
  if (row.fonte === "ipeadata" && row.indicador === "taxa_desemprego" && row.unidade === "percentual") return "PNADCT_TXDSCUPUF"
  if (row.fonte === "atlas_violencia" && row.indicador === "homicidios_100k" && row.unidade === "por_100k_hab") return "atlas:20:estadual"
  return null
}

export function comparisonIssue(a: ComparableIndicator | undefined, b: ComparableIndicator | undefined, trend = false): string | null {
  if (!a || !b || a.valor == null || b.valor == null || !Number.isFinite(a.valor) || !Number.isFinite(b.valor)) return "Dados não disponíveis para as duas UFs."
  if (a.indicador !== b.indicador) return "Indicadores diferentes."
  if (!a.fonte?.trim() || !b.fonte?.trim()) return "Fonte não informada."
  if (a.fonte.trim() !== b.fonte.trim()) return "Fontes diferentes."
  if (!a.unidade?.trim() || !b.unidade?.trim()) return "Unidade não informada."
  if (a.unidade.trim() !== b.unidade.trim()) return "Unidades diferentes."
  const pa = indicatorPeriod(a), pb = indicatorPeriod(b)
  if (!pa.key || !pb.key) return "Período completo não informado."
  if (!trend && pa.key !== pb.key) return "Períodos diferentes."
  if (trend && (a.ano <= b.ano || !/^\d{4}$/.test(pa.key) || !/^\d{4}$/.test(pb.key))) return "Intervalo de variação não confirmado."
  const da = indicatorDefinition(a), db = indicatorDefinition(b)
  if (!da || !db) return "Definição da série não informada."
  if (da !== db) return "Definições diferentes."
  return null
}

export function latestIndicator(rows: ComparableIndicator[], uf: string, key: string) {
  return rows.filter(r => r.estado.toUpperCase() === uf.toUpperCase() && r.indicador === key && r.valor != null && Number.isFinite(r.valor))
    .sort((a, b) => b.ano - a.ano || (indicatorPeriod(b).key ?? "").localeCompare(indicatorPeriod(a).key ?? "") || a.id.localeCompare(b.id))[0]
}
