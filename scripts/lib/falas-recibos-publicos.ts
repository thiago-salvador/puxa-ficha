import type { AuditoriaRodadaFalas } from "./falas-rodada"

/**
 * Recibo público da busca de falas, versionado no repositório.
 *
 * Os recibos brutos da rodada ficam em `reports/`, fora do git, então o site
 * não tinha como dizer "busca feita, nada encontrado". Este arquivo guarda só
 * o necessário para isso: identidade, instante da busca válida e se a ficha
 * tem aspa publicada na janela. Busca bloqueada, planejada ou ausente não
 * entra: o site nunca afirma ausência sem busca válida.
 */
export const SCHEMA_RECIBOS_FALAS = "falas-recibos-v1" as const

export interface ReciboFalasPublico {
  candidate_id: string
  candidate_slug: string
  searched_at: string
  window_from: string
  window_to: string
  /** `com_fala`: há aspa publicada na janela. `sem_fala`: busca válida sem aspa publicada. */
  result: "com_fala" | "sem_fala"
}

export interface CatalogoRecibosFalas {
  schema_version: typeof SCHEMA_RECIBOS_FALAS
  updated_at: string
  receipts: ReciboFalasPublico[]
}

export function consolidarRecibosFalas(
  anterior: CatalogoRecibosFalas | null,
  auditoria: AuditoriaRodadaFalas,
  now: Date,
): CatalogoRecibosFalas {
  const porChave = new Map<string, ReciboFalasPublico>()
  for (const recibo of anterior?.receipts ?? []) porChave.set(`${recibo.candidate_id}\u0000${recibo.candidate_slug}`, recibo)
  const windowTo = auditoria.round_start.slice(0, 10)
  for (const candidato of auditoria.candidates) {
    if (!candidato.searched || !candidato.searched_at) continue
    const chave = `${candidato.candidate_id}\u0000${candidato.candidate_slug}`
    const atual = porChave.get(chave)
    if (atual && atual.searched_at > candidato.searched_at) continue
    porChave.set(chave, {
      candidate_id: candidato.candidate_id,
      candidate_slug: candidato.candidate_slug,
      searched_at: candidato.searched_at,
      window_from: auditoria.quote_window_from,
      window_to: windowTo,
      result: candidato.has_window_quote ? "com_fala" : "sem_fala",
    })
  }
  return {
    schema_version: SCHEMA_RECIBOS_FALAS,
    updated_at: now.toISOString(),
    receipts: [...porChave.values()].sort((a, b) => a.candidate_slug.localeCompare(b.candidate_slug) || a.candidate_id.localeCompare(b.candidate_id)),
  }
}
