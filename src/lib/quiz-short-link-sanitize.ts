/**
 * Sanitiza query string do resultado do quiz antes de persistir em link curto.
 */

const MAX_TOTAL_LEN = 6144
const MAX_R_LEN = 5500

export function sanitizeQuizResultQueryString(raw: string): string | null {
  const trimmed = raw.trim()
  const q = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed
  if (!q) return null
  let params: URLSearchParams
  try {
    params = new URLSearchParams(q)
  } catch {
    return null
  }

  const r = params.get("r")?.trim()
  const v = params.get("v")?.trim()
  if (!r || !v) return null
  if (r.length > MAX_R_LEN) return null
  if (!/^[123]$/.test(v)) return null

  const cargoP = params.get("cargo")?.trim()
  const ufP = params.get("uf")?.trim()

  const out = new URLSearchParams()
  out.set("r", r)
  out.set("v", v)

  if (cargoP) {
    if (cargoP !== "Presidente" && cargoP !== "Governador") return null
    out.set("cargo", cargoP)
  }
  if (ufP) {
    if (!/^[a-z]{2}$/i.test(ufP)) return null
    out.set("uf", ufP.toUpperCase())
  }

  const s = out.toString()
  if (s.length > MAX_TOTAL_LEN) return null
  return s
}
