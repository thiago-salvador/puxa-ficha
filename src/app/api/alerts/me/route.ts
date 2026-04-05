import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  createAlertsServiceRoleClient,
  findSubscriberByManageToken,
  maskAlertEmail,
  normalizeOpaqueToken,
} from "@/lib/alerts"
import { logAlertsApiExit } from "@/lib/alerts-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const manageToken = normalizeOpaqueToken(req.nextUrl.searchParams.get("token") ?? "")
  if (!manageToken) {
    logAlertsApiExit("me", 400, "missing_manage_token")
    return NextResponse.json({ error: "Invalid manage token" }, { status: 400 })
  }

  const subscriber = await findSubscriberByManageToken(manageToken)
  if (!subscriber) {
    logAlertsApiExit("me", 403, "subscriber_not_found")
    return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
  }

  const supabase = createAlertsServiceRoleClient()
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("alert_subscriptions")
    .select("candidato_id")
    .eq("subscriber_id", subscriber.id)

  if (subscriptionsError) {
    logAlertsApiExit("me", 503, "db_load_subscriptions_failed")
    return NextResponse.json({ error: "Could not load subscriptions" }, { status: 503 })
  }

  const candidateIds = (subscriptions ?? []).map((row) => row.candidato_id).filter(Boolean)
  let candidates: Array<{
    id: string
    slug: string
    nome_urna: string
    partido_sigla: string
    cargo_disputado: string
  }> = []

  if (candidateIds.length > 0) {
    const { data: rows, error: candidatesError } = await supabase
      .from("candidatos_publico")
      .select("id, slug, nome_urna, partido_sigla, cargo_disputado")
      .in("id", candidateIds)

    if (candidatesError) {
      logAlertsApiExit("me", 503, "db_load_candidates_failed")
      return NextResponse.json({ error: "Could not load candidate details" }, { status: 503 })
    }

    candidates = (rows ?? []).sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
  }

  logAlertsApiExit("me", 200, "ok", { subscriptionCount: candidates.length })
  return NextResponse.json({
    ok: true,
    subscriber: {
      verified: subscriber.verified,
      canalEmail: subscriber.canal_email,
      emailMasked: maskAlertEmail(subscriber.email),
      lastDigestSentAt: subscriber.last_digest_sent_at,
    },
    subscriptions: candidates,
  })
}
