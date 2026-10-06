import "server-only"
import { createServerSupabaseClient } from "@/lib/supabase"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"
import { filtrarAtualizacoesPorSlugs, isVerifiedCandidateUpdate, type VerifiedUpdatesResource } from "@/lib/verified-candidate-updates"

/**
 * Últimas mudanças verificadas. Com `slugs`, o filtro vai na consulta (antes do
 * limite), para seis itens daquele recorte e não seis da base inteira filtrados
 * depois. Lista vazia é um recorte vazio: nada a consultar.
 */
export async function getVerifiedCandidateUpdates({ slugs }: { slugs?: readonly string[] } = {}): Promise<VerifiedUpdatesResource> {
  if (slugs && slugs.length === 0) return { status: "available", updates: [] }
  try {
    let query = createServerSupabaseClient({ revalidate: 300 })
      .from("verified_candidate_updates_public")
      .select("id,candidate_slug,candidate_name,field,year,before_value,after_value,source_url,detected_at")
      .abortSignal(supabaseQueryTimeoutSignal())
    if (slugs) query = query.in("candidate_slug", [...slugs])
    const { data, error } = await query
      .order("detected_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(6)
    if (error || !data || !data.every(isVerifiedCandidateUpdate)) {
      return { status: "unavailable", updates: [] }
    }
    // Defesa em profundidade: nada fora do recorte pedido chega à tela.
    return { status: "available", updates: filtrarAtualizacoesPorSlugs(data, slugs) }
  } catch {
    return { status: "unavailable", updates: [] }
  }
}
