/**
 * Smoke rapido: Supabase + criterios do modo incremental da Camara (sem HTTP da API Camara).
 * Carrega `.env.local` via `scripts/lib/supabase.ts`.
 *
 * Uso: npx tsx scripts/smoke-camara-incremental-db.ts [slug]
 * Smoke completo (com API): npx tsx scripts/lib/ingest-camara.ts --skip-camara-validated --slugs <slug>
 */

import { supabase } from "./lib/supabase"
import { resolveCandidatoId } from "./lib/helpers"
import {
  GASTOS_RECENT_ANOS,
  PROJETOS_LEI_INGEST_CAP,
  hasFullVotacaoIdCoverage,
  hasGastosRecentYearsComplete,
  projetosLeiMeetsIngestCap,
} from "./lib/camara-incremental-guards"

async function loadCamaraChaveVotacaoIds(): Promise<string[]> {
  const { data } = await supabase.from("votacoes_chave").select("id, casa, proposicao_id")
  const rows = data ?? []
  return rows
    .filter(
      (v) =>
        Boolean(v.proposicao_id) && (v.casa === "Câmara" || v.casa === "Camara")
    )
    .map((v) => v.id)
}

async function main() {
  const slug = process.argv[2] ?? "lula"
  const candidatoId = await resolveCandidatoId(slug)
  if (!candidatoId) {
    console.error(`Candidato nao encontrado no banco: ${slug}`)
    process.exit(1)
  }

  const requiredCamaraVotacaoIds = await loadCamaraChaveVotacaoIds()

  let skipVotes: boolean
  if (requiredCamaraVotacaoIds.length === 0) {
    skipVotes = true
  } else {
    const { data: votosRows } = await supabase
      .from("votos_candidato")
      .select("votacao_id")
      .eq("candidato_id", candidatoId)
      .in("votacao_id", requiredCamaraVotacaoIds)
    skipVotes = hasFullVotacaoIdCoverage(
      requiredCamaraVotacaoIds,
      (votosRows ?? []).map((r) => r.votacao_id)
    )
  }

  const { data: gastosRows } = await supabase
    .from("gastos_parlamentares")
    .select("ano")
    .eq("candidato_id", candidatoId)
    .in("ano", [...GASTOS_RECENT_ANOS])

  const skipGastos = hasGastosRecentYearsComplete((gastosRows ?? []).map((r) => Number(r.ano)))

  const { count } = await supabase
    .from("projetos_lei")
    .select("*", { count: "exact", head: true })
    .eq("candidato_id", candidatoId)

  const projetosCount = count ?? 0
  const skipProjetos = projetosLeiMeetsIngestCap(projetosCount)
  const fullSkip = skipVotes && skipGastos && skipProjetos

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug,
        candidatoId,
        votacoes_chave_camara: requiredCamaraVotacaoIds.length,
        skipVotes,
        skipGastos,
        skipProjetos,
        fullSkip,
        projetos_count: projetosCount,
        projetos_cap: PROJETOS_LEI_INGEST_CAP,
        gastos_anos_required: [...GASTOS_RECENT_ANOS],
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
