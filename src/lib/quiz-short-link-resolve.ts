import "server-only"

import { createServiceRoleSupabaseClient } from "@/lib/supabase"

const TOKEN_RE = /^[a-zA-Z0-9_-]{8,16}$/

export async function resolveQuizShortToken(token: string): Promise<string | null> {
  const t = token.trim()
  if (!TOKEN_RE.test(t)) return null
  try {
    const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
    const { data, error } = await supabase
      .from("quiz_result_short_links")
      .select("query_string")
      .eq("token", t)
      .maybeSingle()
    if (error || !data || typeof data.query_string !== "string") return null
    return data.query_string
  } catch {
    return null
  }
}
