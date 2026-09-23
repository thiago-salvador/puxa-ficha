import "server-only"

import { getCandidatoSlugStaticParams } from "@/lib/api"
import { createServerSupabaseClient } from "@/lib/supabase"
import {
  isVerifiedCandidateUpdate,
  type VerifiedCandidateUpdate,
} from "@/lib/verified-candidate-updates"

export const IMPRENSA_ATUALIZACOES_PAGE_SIZE = 20

export interface ImprensaAtualizacoesPage {
  status: "available" | "unavailable"
  updates: VerifiedCandidateUpdate[]
  page: number
  pageSize: number
  total: number | null
  hasNext: boolean
}

type UpdatesQueryResult = {
  data: unknown[] | null
  error: { message: string } | null
  count: number | null
}

type UpdatesQuery = (from: number, to: number, slugs: string[]) => Promise<UpdatesQueryResult>
type LoadSlugs = typeof getCandidatoSlugStaticParams

function normalizePage(page: number): number {
  return Number.isInteger(page) && page > 0 ? page : 1
}

function unavailable(page: number): ImprensaAtualizacoesPage {
  return {
    status: "unavailable",
    updates: [],
    page,
    pageSize: IMPRENSA_ATUALIZACOES_PAGE_SIZE,
    total: null,
    hasNext: false,
  }
}

async function queryUpdates(from: number, to: number, slugs: string[]): Promise<UpdatesQueryResult> {
  const result = await createServerSupabaseClient({ revalidate: 300 })
    .from("verified_candidate_updates_public")
    .select("id,candidate_slug,candidate_name,field,year,before_value,after_value,source_url,detected_at", { count: "exact" })
    .in("candidate_slug", slugs)
    .order("detected_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)
    .abortSignal(AbortSignal.timeout(5000))
  return { data: result.data as unknown[] | null, error: result.error, count: result.count }
}

export function createImprensaAtualizacoesLoader(
  query: UpdatesQuery = queryUpdates,
  loadSlugs: LoadSlugs = getCandidatoSlugStaticParams,
) {
  return async function load(pageInput: number): Promise<ImprensaAtualizacoesPage> {
    const page = normalizePage(pageInput)
    const from = (page - 1) * IMPRENSA_ATUALIZACOES_PAGE_SIZE
    const to = from + IMPRENSA_ATUALIZACOES_PAGE_SIZE - 1
    try {
      const slugs = [...new Set((await loadSlugs()).map((row) => row.slug).filter(Boolean))]
      if (slugs.length === 0) return unavailable(page)
      const result = await query(from, to, slugs)
      if (result.error || !Array.isArray(result.data) || !result.data.every(isVerifiedCandidateUpdate)) {
        return unavailable(page)
      }
      const total = typeof result.count === "number" ? result.count : null
      return {
        status: "available",
        updates: result.data,
        page,
        pageSize: IMPRENSA_ATUALIZACOES_PAGE_SIZE,
        total,
        hasNext: total === null ? result.data.length === IMPRENSA_ATUALIZACOES_PAGE_SIZE : from + result.data.length < total,
      }
    } catch {
      return unavailable(page)
    }
  }
}

export const getImprensaAtualizacoesPage = createImprensaAtualizacoesLoader()
