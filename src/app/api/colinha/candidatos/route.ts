import { parseColinhaState, SLOT_ORDER, type SlotId } from "@/lib/colinha"
import { loadColinhaCandidatesForSelection, searchColinhaCandidates } from "@/lib/colinha-data"
import { createDistributedIpRateLimiter, rateLimitExceededResponse } from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const limiter = createDistributedIpRateLimiter({ namespace: "colinha-search", max: 120, windowMs: 60_000 })
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
}

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS })
}

export async function POST(request: Request): Promise<Response> {
  const decision = await limiter.check(request.headers)
  if (!decision.allowed) return rateLimitExceededResponse(decision)
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "invalid_request" }, 400)
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return json({ error: "invalid_request" }, 400)

  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 1024) return json({ error: "invalid_request" }, 400)
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_request" }, 400)
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: "invalid_request" }, 400)
  }

  if (body.action === "selection") {
    const input = body.state
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "invalid_request" }, 400)
    const raw = input as Record<string, unknown>
    const params: Record<string, string | undefined> = {}
    for (const key of ["uf", ...SLOT_ORDER]) {
      const value = raw[key]
      if (value !== undefined && value !== null && typeof value !== "string") return json({ error: "invalid_request" }, 400)
      params[key] = value ?? undefined
    }
    const state = parseColinhaState(params)
    if (!state.uf) return json({ error: "invalid_request" }, 400)
    return json(await loadColinhaCandidatesForSelection(state))
  }

  if (body.action === "search") {
    const uf = typeof body.uf === "string" ? parseColinhaState({ uf: body.uf }).uf : null
    const slot = body.slot
    if (!uf || typeof slot !== "string" || !SLOT_ORDER.includes(slot as SlotId)
      || typeof body.query !== "string" || body.query.length > 80) {
      return json({ error: "invalid_request" }, 400)
    }
    return json(await searchColinhaCandidates(uf, slot as SlotId, body.query))
  }

  return json({ error: "invalid_request" }, 400)
}
