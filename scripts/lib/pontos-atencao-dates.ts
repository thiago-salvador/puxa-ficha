/** Resolve data_referencia a partir de pontos_atencao.fontes (JSON). */

function isSupportedYear(year: number): boolean {
  return year >= 1990 && year <= 2035
}

function formatYearMonthDay(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

function parseIsoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function parseBrazilianDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  return match ? formatYearMonthDay(match[3], match[2], match[1]) : null
}

function parseYearOnly(value: string): string | null {
  const match = /^(\d{4})$/.exec(value)
  if (!match) return null
  return isSupportedYear(Number(match[1])) ? `${match[1]}-01-01` : null
}

export function parseFonteData(s: string | undefined | null): string | null {
  if (!s || typeof s !== "string") return null
  const t = s.trim()
  return parseIsoDate(t) ?? parseBrazilianDate(t) ?? parseYearOnly(t)
}

/** /.../2024/08/17/... ou /2024/1/22/ em path de URL. */
function dateFromUrl(url: string): string | null {
  const m = String(url).match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//)
  if (!m) return null
  const y = Number(m[1])
  if (!isSupportedYear(y)) return null
  return formatYearMonthDay(m[1], m[2], m[3])
}

/**
 * Menor data (cronologica) entre todas as evidencias: por fonte, usa `data` e/ou data no path da URL.
 * Heuristica: pressupoe que as fontes descrevem o mesmo fio temporal; se forem fatos distintos, ajustar
 * `data_referencia` na mao ou corrigir a lista de fontes na curadoria.
 */
export function resolveDataReferenciaFromFontes(fontes: unknown): string | null {
  if (!Array.isArray(fontes)) return null
  const found = new Set<string>()
  for (const f of fontes) {
    if (!f || typeof f !== "object") continue
    const o = f as { data?: string; url?: string }
    if ("data" in o && o.data != null) {
      const d = parseFonteData(String(o.data))
      if (d) found.add(d)
    }
    if (typeof o.url === "string") {
      const d = dateFromUrl(o.url)
      if (d) found.add(d)
    }
  }
  if (found.size === 0) return null
  return [...found].sort()[0]
}
