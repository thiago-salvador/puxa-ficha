import { createHash, randomBytes } from "node:crypto"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { sanitizeQuizResultQueryString } from "@/lib/quiz-short-link-sanitize"
import { createServiceRoleSupabaseClient } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_PER_HOUR = 24

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const qsRaw = typeof (body as { queryString?: unknown })?.queryString === "string"
    ? (body as { queryString: string }).queryString
    : ""
  const sanitized = sanitizeQuizResultQueryString(qsRaw)
  if (!sanitized) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const salt = process.env.PF_QUIZ_SHORT_LINK_SALT?.trim() || "dev-quiz-short-link-salt"
  const ip = clientIp(req)
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 48)

  let supabase
  try {
    supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  } catch {
    return NextResponse.json({ error: "Short links unavailable" }, { status: 503 })
  }

  const since = new Date(Date.now() - 3_600_000).toISOString()
  const { count, error: countErr } = await supabase
    .from("quiz_result_short_links")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since)

  if (countErr) {
    return NextResponse.json({ error: "Rate check failed" }, { status: 503 })
  }
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const token = randomBytes(9).toString("base64url").replace(/=+$/, "").slice(0, 14)
    const { error: insErr } = await supabase.from("quiz_result_short_links").insert({
      token,
      query_string: sanitized,
      ip_hash: ipHash,
    })
    if (!insErr) {
      const path = `/quiz/r/${token}`
      const url = new URL(path, req.nextUrl.origin).toString()
      return NextResponse.json({ path, url })
    }
  }

  return NextResponse.json({ error: "Could not allocate token" }, { status: 503 })
}
