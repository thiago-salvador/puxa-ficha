"use client"

import { track } from "@vercel/analytics/react"
import {
  ANALYTICS_PROOF_ID_RE,
  type AnalyticsEventName,
  type AnalyticsPayload,
  getAnalyticsProofIdFromPayload,
  sanitizeAnalyticsPayload,
} from "@/lib/analytics-events"

function readProofIdFromUrl(): string | null {
  if (typeof window === "undefined") return null
  // Prova de uma execução: gerar com `openssl rand -hex 16` (32 hex, casa o regex).
  // Navegar as superfícies com `?pf_analytics_proof=<id>`. O cliente anexa
  // `proof_id` no POST. Conferir GET /api/internal/analytics-launch-readback
  // com o mesmo id e `PF_INTERNAL_TOKEN`. `ready` não é gate de lançamento.
  // Não usar `launch-01`. Sem HMAC.
  const value = new URL(window.location.href).searchParams.get("pf_analytics_proof")
  if (!value) return null
  return ANALYTICS_PROOF_ID_RE.test(value) ? value : null
}

function postLaunchEvent(eventName: AnalyticsEventName, payload: AnalyticsPayload) {
  const body = JSON.stringify({ eventName, payload })

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const blob = new Blob([body], { type: "application/json" })
    if (navigator.sendBeacon("/api/analytics/event", blob)) return
  }

  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics must never block the user flow.
  })
}

export function trackLaunchEvent(eventName: AnalyticsEventName, payload?: unknown) {
  const sanitized = sanitizeAnalyticsPayload(payload)
  const proofId = getAnalyticsProofIdFromPayload(sanitized) ?? readProofIdFromUrl()
  if (proofId) sanitized.proof_id = proofId

  track(eventName, sanitized)
  postLaunchEvent(eventName, sanitized)
}
