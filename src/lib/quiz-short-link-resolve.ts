import "server-only"

import { createQuizShortLinkStore } from "@/lib/quiz-short-link-store"

const TOKEN_RE = /^[a-zA-Z0-9_-]{8,16}$/

export async function resolveQuizShortToken(token: string): Promise<string | null> {
  const t = token.trim()
  if (!TOKEN_RE.test(t)) return null
  try {
    const store = createQuizShortLinkStore()
    return await store.resolveToken(t)
  } catch {
    return null
  }
}
