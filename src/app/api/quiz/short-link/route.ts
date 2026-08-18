import { createHash, randomBytes } from "node:crypto"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { sanitizeQuizResultQueryString } from "@/lib/quiz-short-link-sanitize"
import { quizShortLinkMisconfiguredResponse } from "@/lib/quiz-short-link-env"
import {
  QUIZ_SHORT_LINK_TTL_MS,
  createQuizShortLinkStore,
} from "@/lib/quiz-short-link-store"
import { extractTrustedClientIp } from "@/lib/client-ip"
import { rejectCrossSitePublicWrite } from "@/lib/public-write-origin-guard"
import {
  isRequestBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_PER_HOUR = 24

export async function POST(req: NextRequest) {
  const blocked = rejectCrossSitePublicWrite(req)
  if (blocked) return blocked

  let body: unknown
  try {
    body = await readJsonBodyWithLimit(req)
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const qsRaw = typeof (body as { queryString?: unknown })?.queryString === "string"
    ? (body as { queryString: string }).queryString
    : ""
  const sanitized = sanitizeQuizResultQueryString(qsRaw)
  if (!sanitized) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const misconfigured = quizShortLinkMisconfiguredResponse()
  if (misconfigured) return misconfigured

  const salt = process.env.PF_QUIZ_SHORT_LINK_SALT?.trim() || "dev-quiz-short-link-salt"
  const ip = extractTrustedClientIp(req.headers)
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 48)

  let store: ReturnType<typeof createQuizShortLinkStore>
  try {
    store = createQuizShortLinkStore()
  } catch {
    return NextResponse.json({ error: "Short links unavailable" }, { status: 503 })
  }

  const now = Date.now()
  const since = new Date(now - 3_600_000).toISOString()
  let count: number
  try {
    count = await store.countRecentByIpHash(ipHash, since)
  } catch {
    return NextResponse.json({ error: "Rate check failed" }, { status: 503 })
  }
  if (count >= MAX_PER_HOUR) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const token = randomBytes(9).toString("base64url").replace(/=+$/, "").slice(0, 14)
    const createdAt = new Date(now).toISOString()
    const expiresAt = new Date(now + QUIZ_SHORT_LINK_TTL_MS).toISOString()
    try {
      const result = await store.insertLink({
        token,
        query_string: sanitized,
        ip_hash: ipHash,
        created_at: createdAt,
        expires_at: expiresAt,
      })
      if (result === "inserted") {
        const path = `/quiz/r/${token}`
        const url = new URL(path, req.nextUrl.origin).toString()
        return NextResponse.json({ path, url })
      }
    } catch {
      return NextResponse.json({ error: "Could not allocate token" }, { status: 503 })
    }

  }

  return NextResponse.json({ error: "Could not allocate token" }, { status: 503 })
}
