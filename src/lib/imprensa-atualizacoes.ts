import "server-only"

import { getCandidatoSlugStaticParams } from "@/lib/api"
import { createServerSupabaseClient } from "@/lib/supabase"
import {
  isVerifiedCandidateUpdate,
  type VerifiedCandidateUpdate,
} from "@/lib/verified-candidate-updates"

/**
 * Teto de linhas lidas de uma vez. A página filtra por UF, cargo e tipo em
 * memória, sobre a lista que já veio do cache de dados (revalidate 300), para
 * não abrir uma consulta por combinação de filtros.
 */
const IMPRENSA_ATUALIZACOES_MAX_ROWS = 1000

export interface ImprensaAtualizacoes {
  status: "available" | "unavailable"
  updates: VerifiedCandidateUpdate[]
  /** Total no banco; maior que `updates.length` quando o teto cortou a lista. */
  total: number | null
}

type UpdatesQueryResult = {
  data: unknown[] | null
  error: { message: string } | null
  count: number | null
}

type UpdatesQuery = (limit: number, slugs: string[]) => Promise<UpdatesQueryResult>
type LoadSlugs = typeof getCandidatoSlugStaticParams

const UNAVAILABLE: ImprensaAtualizacoes = { status: "unavailable", updates: [], total: null }

async function queryUpdates(limit: number, slugs: string[]): Promise<UpdatesQueryResult> {
  const result = await createServerSupabaseClient({ revalidate: 300 })
    .from("verified_candidate_updates_public")
    .select("id,candidate_slug,candidate_name,field,year,before_value,after_value,source_url,detected_at", { count: "exact" })
    .in("candidate_slug", slugs)
    .order("detected_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, limit - 1)
    .abortSignal(AbortSignal.timeout(5000))
  return { data: result.data as unknown[] | null, error: result.error, count: result.count }
}

export function createImprensaAtualizacoesLoader(
  query: UpdatesQuery = queryUpdates,
  loadSlugs: LoadSlugs = getCandidatoSlugStaticParams,
) {
  return async function load(): Promise<ImprensaAtualizacoes> {
    try {
      const slugs = [...new Set((await loadSlugs()).map((row) => row.slug).filter(Boolean))]
      if (slugs.length === 0) return UNAVAILABLE
      const result = await query(IMPRENSA_ATUALIZACOES_MAX_ROWS, slugs)
      if (result.error || !Array.isArray(result.data) || !result.data.every(isVerifiedCandidateUpdate)) {
        return UNAVAILABLE
      }
      return {
        status: "available",
        updates: result.data,
        total: typeof result.count === "number" ? result.count : null,
      }
    } catch {
      return UNAVAILABLE
    }
  }
}

export const getImprensaAtualizacoes = createImprensaAtualizacoesLoader()
