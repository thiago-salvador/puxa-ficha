import "server-only"
import { createServerSupabaseClient } from "@/lib/supabase"
import { SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS, withSupabaseRetry } from "@/lib/supabase-retry"
import type { Chapa2026 } from "@/lib/types"

type RunningMateRow = Pick<Chapa2026, "titular_slug" | "vice_nome_urna" | "identidade_status" | "vinculo_titular_status" | "cargo_titular" | "uf" | "eleicao_data">
type Office = Chapa2026["cargo_titular"]

export function selectProgramRunningMates(rows: RunningMateRow[], slugs: string[], office: Office, uf: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const slug of new Set(slugs)) {
    const matches = rows.filter(row => row.titular_slug === slug && row.cargo_titular === office &&
      row.eleicao_data.startsWith("2026-") && (row.uf ?? "BR").toUpperCase() === uf.toUpperCase())
    if (matches.length !== 1) continue
    const row = matches[0]
    if (row.identidade_status !== "confirmada" || row.vinculo_titular_status !== "confirmado") continue
    const name = row.vice_nome_urna.trim()
    if (name) result[slug] = name
  }
  return result
}

export async function loadProgramRunningMates(slugs: string[], office: Office, uf: string): Promise<Record<string, string>> {
  if (slugs.length === 0) return {}
  try {
    const client = createServerSupabaseClient()
    const { data, error } = await withSupabaseRetry("program-running-mates", async signal => client
      .from("chapas_2026_publico")
      .select("titular_slug,vice_nome_urna,identidade_status,vinculo_titular_status,cargo_titular,uf,eleicao_data")
      .in("titular_slug", [...new Set(slugs)])
      .eq("cargo_titular", office)
      .gte("eleicao_data", "2026-01-01")
      .lt("eleicao_data", "2027-01-01")
      .abortSignal(signal), { attemptTimeoutMs: SUPABASE_FIRST_FOLD_ATTEMPT_TIMEOUT_MS })
    if (error) throw error
    return selectProgramRunningMates((data ?? []) as RunningMateRow[], slugs, office, uf)
  } catch {
    console.error("Program running mates could not be loaded")
    return {}
  }
}
