import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  alertBodyStringField,
  buildAlertManageUrl,
  createAlertsServiceRoleClient,
  findSubscriberByManageToken,
  findSubscriberByVerifyAndManageToken,
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

  const verifyToken = normalizeOpaqueToken(alertBodyStringField(body, "token"))
  const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
  if (!verifyToken || !manageToken) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const subscriber = await findSubscriberByVerifyAndManageToken(verifyToken, manageToken)
  if (!subscriber) {
    const alreadyVerified = await findSubscriberByManageToken(manageToken)
    if (alreadyVerified?.verified) {
      return NextResponse.json({
        ok: true,
        alreadyVerified: true,
        manageToken,
        manageUrl: buildAlertManageUrl(manageToken),
      })
    }

    return NextResponse.json({ error: "Verification link not found" }, { status: 404 })
  }

  if (subscriber.verify_token_expires_at) {
    const expiresAt = new Date(subscriber.verify_token_expires_at)
    if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Verification link expired" }, { status: 410 })
    }
  }

  const supabase = createAlertsServiceRoleClient()
  const { error } = await supabase
    .from("alert_subscribers")
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verify_token_hash: null,
      verify_token_expires_at: null,
    })
    .eq("id", subscriber.id)

  if (error) {
    return NextResponse.json({ error: "Could not verify subscriber" }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    verified: true,
    manageToken,
    manageUrl: buildAlertManageUrl(manageToken),
  })
}
