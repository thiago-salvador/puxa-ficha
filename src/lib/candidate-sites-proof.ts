import type { CandidatoSitesCollection } from "@/lib/types"

export interface CitableCandidateSites {
  resultado: "publicado" | "vazio_confirmado"
  fonteUrl: string
  fonteSha256: string
  coletadoEm: string
  sites: Array<{ ordem: number; url: string }>
}

function publicUrl(raw: unknown, source: boolean): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== "https:" && (source || url.protocol !== "http:")) return null
    return url.toString()
  } catch {
    return null
  }
}

/** A Mesa e a ficha só citam o recorte quando a prova do snapshot está completa. */
export function getCitableCandidateSites(value: CandidatoSitesCollection | null | undefined): CitableCandidateSites | null {
  if (!value || !Array.isArray(value.sites)) return null
  const fonteUrl = publicUrl(value.fonte_url, true)
  const fonteSha256 = typeof value.fonte_sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.fonte_sha256)
    ? value.fonte_sha256
    : null
  const coletadoEm = typeof value.coletado_em === "string" && !Number.isNaN(Date.parse(value.coletado_em))
    ? value.coletado_em
    : null
  const sites = value.sites.map((site) => ({ ordem: site.ordem, url: publicUrl(site.url, false) }))
  if (!fonteUrl || !fonteSha256 || !coletadoEm || sites.some((site) => !site.url)) return null
  if (value.resultado === "publicado" && !sites.length) return null
  if (value.resultado === "vazio_confirmado" && sites.length) return null
  if (value.resultado !== "publicado" && value.resultado !== "vazio_confirmado") return null
  return {
    resultado: value.resultado,
    fonteUrl,
    fonteSha256,
    coletadoEm,
    sites: sites as CitableCandidateSites["sites"],
  }
}
