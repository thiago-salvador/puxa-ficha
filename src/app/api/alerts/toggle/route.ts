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

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
  const candidateSlug = normalizeCandidateSlug(alertBodyStringField(body, "candidateSlug"))
  if (!manageToken || !candidateSlug) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const subscriber = await findSubscriberByManageToken(manageToken)
  if (!subscriber) {
    return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
  }
  if (!subscriber.verified) {
    return NextResponse.json({ error: "Email verification required" }, { status: 409 })
  }

  const candidate = await findPublicCandidateBySlug(candidateSlug)
  if (!candidate) {
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
    return NextResponse.json({ error: "Could not load subscription" }, { status: 503 })
  }

  if (existingSubscription?.id) {
    const { error: deleteError } = await supabase
      .from("alert_subscriptions")
      .delete()
      .eq("id", existingSubscription.id)

    if (deleteError) {
      return NextResponse.json({ error: "Could not remove subscription" }, { status: 503 })
    }

    return NextResponse.json({ ok: true, following: false, candidateSlug: candidate.slug })
  }

  const { error: insertError } = await supabase.from("alert_subscriptions").insert({
    subscriber_id: subscriber.id,
    candidato_id: candidate.id,
  })

  if (insertError) {
    return NextResponse.json({ error: "Could not create subscription" }, { status: 503 })
  }

  return NextResponse.json({ ok: true, following: true, candidateSlug: candidate.slug })
}
