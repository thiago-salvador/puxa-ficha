import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { alertBodyStringField, createAlertsServiceRoleClient, findSubscriberByManageToken, normalizeOpaqueToken } from "@/lib/alerts"

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
  if (!manageToken) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const subscriber = await findSubscriberByManageToken(manageToken)
  if (!subscriber) {
    return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
  }

  const supabase = createAlertsServiceRoleClient()
  const { error } = await supabase.from("alert_subscribers").delete().eq("id", subscriber.id)
  if (error) {
    return NextResponse.json({ error: "Could not delete subscriber data" }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
