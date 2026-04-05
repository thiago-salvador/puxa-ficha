import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  alertBodyStringField,
  createAlertsServiceRoleClient,
  findPublicCandidateBySlug,
  findSubscriberByManageToken,
  normalizeCandidateSlug,
  normalizeOpaqueToken,
} from "@/lib/alerts"
import { logAlertsApiExit } from "@/lib/alerts-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    logAlertsApiExit("toggle", 400, "invalid_json")
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
  const candidateSlug = normalizeCandidateSlug(alertBodyStringField(body, "candidateSlug"))
  if (!manageToken || !candidateSlug) {
    logAlertsApiExit("toggle", 400, "invalid_payload")
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const subscriber = await findSubscriberByManageToken(manageToken)
  if (!subscriber) {
    logAlertsApiExit("toggle", 403, "subscriber_not_found")
    return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
  }
  if (!subscriber.verified) {
    logAlertsApiExit("toggle", 409, "email_not_verified")
    return NextResponse.json({ error: "Email verification required" }, { status: 409 })
  }

  const candidate = await findPublicCandidateBySlug(candidateSlug)
  if (!candidate) {
    logAlertsApiExit("toggle", 404, "candidate_not_found", { candidateSlug })
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  }

  const supabase = createAlertsServiceRoleClient()
  const { data: existingSubscription, error: selectError } = await supabase
    .from("alert_subscriptions")
    .select("id")
    .eq("subscriber_id", subscriber.id)
    .eq("candidato_id", candidate.id)
    .maybeSingle()

  if (selectError) {
    logAlertsApiExit("toggle", 503, "db_select_subscription_failed")
    return NextResponse.json({ error: "Could not load subscription" }, { status: 503 })
  }

  if (existingSubscription?.id) {
    const { error: deleteError } = await supabase
      .from("alert_subscriptions")
      .delete()
      .eq("id", existingSubscription.id)

    if (deleteError) {
      logAlertsApiExit("toggle", 503, "db_delete_subscription_failed")
      return NextResponse.json({ error: "Could not remove subscription" }, { status: 503 })
    }

    logAlertsApiExit("toggle", 200, "unfollow_ok", { candidateSlug: candidate.slug })
    return NextResponse.json({ ok: true, following: false, candidateSlug: candidate.slug })
  }

  const { error: insertError } = await supabase.from("alert_subscriptions").insert({
    subscriber_id: subscriber.id,
    candidato_id: candidate.id,
  })

  if (insertError) {
    logAlertsApiExit("toggle", 503, "db_insert_subscription_failed")
    return NextResponse.json({ error: "Could not create subscription" }, { status: 503 })
  }

  logAlertsApiExit("toggle", 200, "follow_ok", { candidateSlug: candidate.slug })
  return NextResponse.json({ ok: true, following: true, candidateSlug: candidate.slug })
}
