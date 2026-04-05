import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { alertBodyStringField, createAlertsServiceRoleClient, findSubscriberByManageToken, normalizeOpaqueToken } from "@/lib/alerts"
import { logAlertsApiExit } from "@/lib/alerts-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    logAlertsApiExit("unsubscribe-all", 400, "invalid_json")
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
  if (!manageToken) {
    logAlertsApiExit("unsubscribe-all", 400, "invalid_payload")
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const subscriber = await findSubscriberByManageToken(manageToken)
  if (!subscriber) {
    logAlertsApiExit("unsubscribe-all", 403, "subscriber_not_found")
    return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
  }

  const supabase = createAlertsServiceRoleClient()
  const { error } = await supabase.from("alert_subscriptions").delete().eq("subscriber_id", subscriber.id)
  if (error) {
    logAlertsApiExit("unsubscribe-all", 503, "db_delete_subscriptions_failed")
    return NextResponse.json({ error: "Could not cancel all subscriptions" }, { status: 503 })
  }

  logAlertsApiExit("unsubscribe-all", 200, "all_unsubscribed")
  return NextResponse.json({ ok: true })
}
