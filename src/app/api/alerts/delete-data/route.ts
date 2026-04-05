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
    logAlertsApiExit("delete-data", 400, "invalid_json")
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
  if (!manageToken) {
    logAlertsApiExit("delete-data", 400, "invalid_payload")
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const subscriber = await findSubscriberByManageToken(manageToken)
  if (!subscriber) {
    logAlertsApiExit("delete-data", 403, "subscriber_not_found")
    return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
  }

  const supabase = createAlertsServiceRoleClient()
  const { error } = await supabase.from("alert_subscribers").delete().eq("id", subscriber.id)
  if (error) {
    logAlertsApiExit("delete-data", 503, "db_delete_failed")
    return NextResponse.json({ error: "Could not delete subscriber data" }, { status: 503 })
  }

  logAlertsApiExit("delete-data", 200, "subscriber_deleted")
  return NextResponse.json({ ok: true })
}
