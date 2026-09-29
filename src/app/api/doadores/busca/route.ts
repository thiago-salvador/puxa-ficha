import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { getDoadorReverseSearchResult } from "@/lib/doador-reverse"
import {
  DOADOR_REVERSE_MIN_QUERY_LENGTH,
  type DoadorReverseSearchResult,
} from "@/lib/doador-reverse-shared"
import {
  doadoresSearchRateLimiter,
  retryAfterSeconds,
} from "@/lib/doadores-search-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// G3 (2026-09-29): /doadores rodava como função em todo hit (~22 mil por dia,
// inclusive prefetch de link). A página virou estática e a busca veio para cá,
// com cache de CDN por termo. A tag `doador-reverse` é a mesma do
// `unstable_cache` da busca; o POST /api/revalidate apaga as duas camadas.
const PUBLIC_CACHE = "public, max-age=60, s-maxage=43200, stale-while-revalidate=3600"
const NO_STORE = "private, no-store, no-cache, must-revalidate, max-age=0"
const CDN_CACHE_TAG = "doador-reverse"

export interface DoadoresBuscaResponse {
  result: DoadorReverseSearchResult
  aguardeSegundos: number | null
}

function json(body: DoadoresBuscaResponse, status: number, cacheable: boolean): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: cacheable
      ? { "cache-control": PUBLIC_CACHE, "vercel-cache-tag": CDN_CACHE_TAG }
      : { "cache-control": NO_STORE },
  })
}

export async function GET(request: NextRequest) {
  const rawQ = request.nextUrl.searchParams.get("q") ?? ""

  // Limite por IP só no caminho caro: termo que passaria do piso e chegaria ao
  // banco. Falha do limiter fecha (não busca), no padrão de /api/analytics/event.
  if (rawQ.trim().length >= DOADOR_REVERSE_MIN_QUERY_LENGTH) {
    let aguardeSegundos: number | null = null
    try {
      const decision = await doadoresSearchRateLimiter.check(request.headers)
      if (!decision.allowed) aguardeSegundos = retryAfterSeconds(decision)
    } catch (error) {
      console.error("doadores search rate limit failed closed", error)
      aguardeSegundos = 60
    }
    if (aguardeSegundos !== null) {
      return json(
        {
          result: {
            rows: [],
            displayQuery: rawQ.trim(),
            normalizedQuery: "",
            error: null,
            termoCurtoDemais: false,
            truncado: false,
          },
          aguardeSegundos,
        },
        429,
        false,
      )
    }
  }

  const result = await Sentry.startSpan(
    {
      name: "doadores_busca.search",
      op: "http.server",
      attributes: {
        "http.route": "/api/doadores/busca",
        "puxaficha.has_query": rawQ.trim().length > 0,
      },
    },
    () => getDoadorReverseSearchResult(rawQ),
  )

  // Erro de banco nunca vai para o CDN: a próxima busca tenta de novo.
  return json({ result, aguardeSegundos: null }, 200, result.error === null)
}
