/** Resolve data_referencia a partir de pontos_atencao.fontes (JSON). */

export function parseFonteData(s: string | undefined | null): string | null {
  if (!s || typeof s !== "string") return null
  const t = s.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (br) {
    const d = br[1].padStart(2, "0")
    const mo = br[2].padStart(2, "0")
    return `${br[3]}-${mo}-${d}`
  }
  const yearOnly = /^(\d{4})$/.exec(t)
  if (yearOnly) {
    const y = Number(yearOnly[1])
    if (y >= 1990 && y <= 2035) return `${yearOnly[1]}-01-01`
  }
  return null
}

/** /.../2024/08/17/... ou /2024/1/22/ em path de URL. */
export function dateFromUrl(url: string): string | null {
  const m = String(url).match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//)
  if (!m) return null
  const y = Number(m[1])
  if (y < 1990 || y > 2035) return null
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
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
