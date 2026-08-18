import { NextResponse } from "next/server"
import {
  ANALYTICS_PROOF_ID_RE,
} from "@/lib/analytics-events"
import { readAnalyticsLaunchCounts } from "@/lib/analytics-launch-store"
import {
  extractRevalidateSecret,
  verifyRevalidateSecret,
} from "@/lib/revalidate-cache"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function defaultSinceIso() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString()
}

export async function GET(req: Request) {
  const auth = verifyRevalidateSecret(
    extractRevalidateSecret(req.headers),
    process.env.PF_INTERNAL_TOKEN
  )
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, reason: auth.reason },
      { status: auth.reason === "env_missing" ? 503 : 401 }
    )
  }

  const url = new URL(req.url)
  const sinceParam = url.searchParams.get("since")
  const since = new Date(sinceParam ?? defaultSinceIso())
  if (!Number.isFinite(since.getTime())) {
    return NextResponse.json({ ok: false, reason: "invalid_since" }, { status: 400 })
  }

  const proofId = url.searchParams.get("proofId")
  if (proofId && !ANALYTICS_PROOF_ID_RE.test(proofId)) {
    return NextResponse.json({ ok: false, reason: "invalid_proof_id" }, { status: 400 })
  }

  try {
    const readback = await readAnalyticsLaunchCounts({
      sinceIso: since.toISOString(),
      proofId,
    })
    const total = Object.values(readback.counts).reduce((sum, value) => sum + value, 0)
    return NextResponse.json(
      {
        ok: true,
        ready: readback.missing.length === 0,
        since: since.toISOString(),
        proofId: proofId ?? null,
        total,
        counts: readback.counts,
        missing: readback.missing,
      },
      { headers: { "cache-control": "no-store" } }
    )
  } catch (error) {
    console.error("analytics readback failed", error)
    return NextResponse.json({ ok: false, reason: "store_failed" }, { status: 503 })
  }
}
