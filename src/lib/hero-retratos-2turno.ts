import dados from "@/data/hero-retratos-2turno.json"

export interface RetratoHero {
  url: string
  largura: number
  altura: number
  /** Fração da largura onde fica o centro do rosto. */
  rosto_x: number
  /** Altura da foto em relação à área do hero (1 = mesma altura). */
  escala: number
  /** Fração da largura da foto ocupada pelo rosto. */
  rosto_largura: number
  credito: string
  licenca: string
  pagina: string
}

const RETRATOS = (dados as { retratos: Record<string, RetratoHero> }).retratos

function valido(r: RetratoHero | undefined): r is RetratoHero {
  return Boolean(
    r && /^https:\/\/upload\.wikimedia\.org\//.test(r.url) && r.largura > 0 && r.altura > 0 &&
      r.rosto_x > 0 && r.rosto_x < 1 && r.escala >= 1 && r.escala <= 2 && r.rosto_largura > 0 && r.rosto_largura < 1 && r.credito.trim() && /^https:\/\//.test(r.pagina),
  )
}

/** Retrato largo do hero para o slug, ou null (o hero cai na foto da ficha). */
export function retratoHero(slug: string | null | undefined): RetratoHero | null {
  if (!slug) return null
  const r = RETRATOS[slug]
  return valido(r) ? r : null
}
