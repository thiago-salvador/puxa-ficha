import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { extractTrustedClientIp } from "@/lib/client-ip"

type HeadersLike = Pick<Headers, "get">

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface RequestRateLimiter {
  check(headers: HeadersLike, now?: number): RateLimitDecision
  reset(): void
}

interface FixedWindowIpRateLimiterOptions {
  namespace: string
  max: number
  windowMs: number
}

/**
 * Teto de buckets vivos antes de valer a pena varrer o Map.
 *
 * A varredura rodava dentro de `check()` em TODA chamada, o que faz o custo por
 * request crescer com o numero de IPs distintos na janela: sob pico, o limiter
 * que existe para proteger o processo vira o gargalo. O contrato observavel nao
 * depende da varredura: um bucket expirado ja e ignorado pela comparacao
 * `existing.resetAt > now` logo abaixo. A varredura serve so para o Map nao
 * crescer sem limite, entao basta rodar quando ele de fato cresceu.
 */
const PRUNE_ACIMA_DE = 10_000

interface Bucket {
  count: number
  resetAt: number
}

function hashClientBucket(namespace: string, ip: string): string {
  return createHash("sha256").update(`${namespace}:${ip}`).digest("hex").slice(0, 48)
}

export function createFixedWindowIpRateLimiter({
  namespace,
  max,
  windowMs,
}: FixedWindowIpRateLimiterOptions): RequestRateLimiter {
  const buckets = new Map<string, Bucket>()

  return {
    check(headers, now = Date.now()) {
      if (!Number.isFinite(max) || max < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
        throw new Error("Invalid rate limit configuration")
      }

      if (buckets.size > PRUNE_ACIMA_DE) {
        for (const [key, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(key)
        }
      }

      const ip = extractTrustedClientIp(headers)
      const key = hashClientBucket(namespace, ip)
      const existing = buckets.get(key)
      const bucket =
        existing && existing.resetAt > now
          ? existing
          : { count: 0, resetAt: now + windowMs }

      if (bucket.count >= max) {
        buckets.set(key, bucket)
        return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
      }

      bucket.count += 1
      buckets.set(key, bucket)
      return { allowed: true, remaining: Math.max(0, max - bucket.count), resetAt: bucket.resetAt }
    },
    reset() {
      buckets.clear()
    },
  }
}

export function rateLimitExceededResponse(
  decision: RateLimitDecision,
  now = Date.now(),
): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((decision.resetAt - now) / 1000))
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfterSeconds),
        "cache-control": "no-store",
      },
    },
  )
}
