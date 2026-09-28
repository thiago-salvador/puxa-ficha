import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase"
import { isVerifiedCandidateUpdate, type VerifiedCandidateUpdate } from "@/lib/verified-candidate-updates"

export interface ImprensaUfUpdates {
  status: "available" | "unavailable"
  updates: VerifiedCandidateUpdate[]
  total: number | null
}

export async function getImprensaUfUpdates(slugs: string[]): Promise<ImprensaUfUpdates> {
  if (!slugs.length) return { status: "available", updates: [], total: 0 }
  try {
    const result = await createServerSupabaseClient({ revalidate: 300 })
      .from("verified_candidate_updates_public")
      .select("id,candidate_slug,candidate_name,field,year,before_value,after_value,source_url,detected_at", { count: "exact" })
      .in("candidate_slug", slugs)
      .order("detected_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 19)
      .abortSignal(AbortSignal.timeout(5000))
    if (result.error || !Array.isArray(result.data) || !result.data.every(isVerifiedCandidateUpdate)) {
      return { status: "unavailable", updates: [], total: null }
    }
    return { status: "available", updates: result.data, total: typeof result.count === "number" ? result.count : null }
  } catch {
    return { status: "unavailable", updates: [], total: null }
  }
}
