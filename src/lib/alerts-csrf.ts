import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  getCrossSiteWriteBlockReason,
  type CrossSiteWriteBlockReason,
} from "@/lib/cross-site-write-guard"

type AlertsApiExitLogger = (
  route: string,
  status: number,
  reason: string,
  detail?: Record<string, unknown>,
) => void

export type AlertsCsrfBlockReason = CrossSiteWriteBlockReason

export function rejectCrossSiteAlertsMutation(
  req: NextRequest,
  route: string,
  logAlertsApiExit: AlertsApiExitLogger,
): NextResponse | null {
  // Alertas continuam liberando request sem `Origin`: a superficie inclui link
  // de email e cliente que nao e navegador, e apertar isso aqui nao foi pedido
  // nem medido. A allowlist e a mesma de qualquer escrita publica.
  const reason = getCrossSiteWriteBlockReason(req.headers, req.nextUrl.origin)
  if (!reason) return null

  logAlertsApiExit(route, 403, reason, {
    origin: req.headers.get("origin") ?? null,
    secFetchSite: req.headers.get("sec-fetch-site") ?? null,
  })
  return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
}
