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

interface AnalyticsLaunchReadbackDeps {
  readAnalyticsLaunchCounts: typeof readAnalyticsLaunchCounts
}

const defaultAnalyticsLaunchReadbackDeps: AnalyticsLaunchReadbackDeps = {
  readAnalyticsLaunchCounts,
}

/**
 * Prova de uma execução: gerar o id com `openssl rand -hex 16` (32 hex, casa o regex).
 * Navegar as superfícies com `?pf_analytics_proof=<id>`. Conferir
 * `GET /api/internal/analytics-launch-readback?proofId=<mesmo-id>` com
 * `PF_INTERNAL_TOKEN`. `ready` não é gate de lançamento. Não usar `launch-01`. Sem HMAC.
 */
export function createAnalyticsLaunchReadbackGetHandler(
  deps: AnalyticsLaunchReadbackDeps = defaultAnalyticsLaunchReadbackDeps,
) {
  return async function GET(req: Request) {
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

    const proofId = url.searchParams.get("proofId")?.trim() ?? ""
    if (!proofId) {
      return NextResponse.json({ ok: false, reason: "missing_proof_id" }, { status: 400 })
    }
    if (!ANALYTICS_PROOF_ID_RE.test(proofId)) {
      return NextResponse.json({ ok: false, reason: "invalid_proof_id" }, { status: 400 })
    }

    try {
      const readback = await deps.readAnalyticsLaunchCounts({
        sinceIso: since.toISOString(),
        proofId,
      })
      const total = Object.values(readback.counts).reduce((sum, value) => sum + value, 0)
      return NextResponse.json(
        {
          ok: true,
          ready: readback.missing.length === 0,
          since: since.toISOString(),
          proofId,
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
}

export const GET = createAnalyticsLaunchReadbackGetHandler()
