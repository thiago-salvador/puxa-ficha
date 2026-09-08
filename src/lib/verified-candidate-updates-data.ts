import "server-only"
import { createServerSupabaseClient } from "@/lib/supabase"
import { isVerifiedCandidateUpdate, type VerifiedUpdatesResource } from "@/lib/verified-candidate-updates"

export async function getVerifiedCandidateUpdates(): Promise<VerifiedUpdatesResource> {
  try {
    const { data, error } = await createServerSupabaseClient({ revalidate: 300 })
      .from("verified_candidate_updates_public")
      .select("id,candidate_slug,candidate_name,field,year,before_value,after_value,source_url,detected_at")
      .order("detected_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(6)
      .abortSignal(AbortSignal.timeout(5000))
    if (error || !data || !data.every(isVerifiedCandidateUpdate)) {
      return { status: "unavailable", updates: [] }
    }
    return { status: "available", updates: data }
  } catch {
    return { status: "unavailable", updates: [] }
  }
}
