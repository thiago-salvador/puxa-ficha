import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { secretsMatch } from "@/lib/crypto-utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

interface RuntimeSmokeDeps {
  fetchImpl: typeof fetch
  expectedSecret: string | undefined
  origin: string
  deleteQuizShortLink: (token: string) => Promise<void>
}

interface RuntimeCheck {
  name: string
  path: string
  status: number
  marker?: string
}

// Cinco checagens publicas. O handler concatena quiz-short-link, totalizando
// seis resultados. O contrato externo valida nomes e total para não confundir
// uma lista parcial com um smoke completo.
export const RUNTIME_SMOKE_PUBLIC_CHECK_NAMES = [
  "home",
  "candidate",
  "profile-api",
  "deployment-info",
  "real-404",
] as const

const CHECKS: RuntimeCheck[] = [
  { name: "home", path: "/", status: 200, marker: "Puxa Ficha" },
  { name: "candidate", path: "/candidato/lula", status: 200, marker: "Lula" },
  { name: "profile-api", path: "/api/candidato-profile/lula", status: 200, marker: '"slug":"lula"' },
  { name: "deployment-info", path: "/api/deployment-info", status: 200 },
  { name: "real-404", path: "/candidato/pf-runtime-smoke-inexistente", status: 404 },
]

const QUIZ_SHORT_LINK_QUERY = "r=runtime-smoke&v=1"

async function deleteQuizShortLink(token: string): Promise<void> {
  const { createServiceRoleSupabaseClient } = await import("@/lib/supabase")
  const supabase = createServiceRoleSupabaseClient({ cacheMode: "no-store" })
  const { error, count } = await supabase
    .from("quiz_result_short_links")
    .delete({ count: "exact" })
    .eq("token", token)

  if (error) throw error
  if (count !== 1) throw new Error(`runtime smoke cleanup removed ${count ?? 0} rows`)
}

async function checkQuizShortLink(deps: RuntimeSmokeDeps, origin: string) {
  let token: string | null = null
  let result: Record<string, unknown> = {
    name: "quiz-short-link",
    ok: false,
    status: null,
    error: "not_started",
  }
  try {
    const created = await deps.fetchImpl(`${origin}/api/quiz/short-link`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "user-agent": "puxaficha-runtime-smoke/1.0",
      },
      body: JSON.stringify({ queryString: QUIZ_SHORT_LINK_QUERY }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = await created.json().catch(() => null) as { path?: unknown } | null
    const path = typeof body?.path === "string" ? body.path : ""
    const match = path.match(/^\/quiz\/r\/([A-Za-z0-9_-]{8,16})$/)
    if (created.status !== 200 || !match) {
      result = { name: "quiz-short-link", ok: false, status: created.status, error: "create_failed" }
      return result
    }

    token = match[1] ?? null
    const resolved = await deps.fetchImpl(`${origin}${path}`, {
      cache: "no-store",
      redirect: "manual",
      headers: { "user-agent": "puxaficha-runtime-smoke/1.0" },
      signal: AbortSignal.timeout(10_000),
    })
    const location = resolved.headers.get("location")
    const expectedLocation = `${origin}/quiz/resultado?${QUIZ_SHORT_LINK_QUERY}`
    const ok = resolved.status === 307 && location === expectedLocation
    result = {
      name: "quiz-short-link",
      ok,
      status: resolved.status,
      error: ok ? undefined : "resolve_failed",
    }
  } catch (error) {
    result = {
      name: "quiz-short-link",
      ok: false,
      status: null,
      error: error instanceof Error ? error.name : "fetch_failed",
    }
  } finally {
    if (token) {
      try {
        await deps.deleteQuizShortLink(token)
      } catch {
        result = {
          name: "quiz-short-link",
          ok: false,
          status: result?.status ?? null,
          error: "cleanup_failed",
        }
      }
    }
  }

  return result
}

function bearer(req: NextRequest): string | null {
  const value = req.headers.get("authorization")?.trim()
  return value?.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : null
}

export function createRuntimeSmokeHandler(deps: RuntimeSmokeDeps) {
  return async function runtimeSmoke(req: NextRequest) {
    // `secretsMatch` compara em tempo constante. Era a unica das cinco rotas de
    // segredo que usava `!==`, e comparacao de string sai no primeiro byte
    // diferente. Falha fechada dos dois lados: segredo ausente no env ou no
    // header devolve false.
    if (!secretsMatch(bearer(req), deps.expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const origin = deps.origin.replace(/\/$/, "")
    const publicResultsPromise = Promise.all(
      CHECKS.map(async (check) => {
        try {
          const response = await deps.fetchImpl(`${origin}${check.path}`, {
            cache: "no-store",
            headers: { "user-agent": "puxaficha-runtime-smoke/1.0" },
            signal: AbortSignal.timeout(10_000),
          })
          const body = check.marker ? await response.text() : ""
          const ok = response.status === check.status && (!check.marker || body.includes(check.marker))
          return { name: check.name, ok, status: response.status }
        } catch (error) {
          return {
            name: check.name,
            ok: false,
            status: null,
            error: error instanceof Error ? error.name : "fetch_failed",
          }
        }
      }),
    )
    const [publicResults, quizShortLinkResult] = await Promise.all([
      publicResultsPromise,
      checkQuizShortLink(deps, origin),
    ])
    const results = [...publicResults, quizShortLinkResult]

    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      console.error(`[runtime-smoke] failed ${JSON.stringify({ failed })}`)
      return NextResponse.json({ ok: false, failed, total: results.length }, { status: 500 })
    }

    console.log(`[runtime-smoke] ok ${JSON.stringify({ total: results.length })}`)
    return NextResponse.json(
      { ok: true, total: results.length, results },
      { status: 200, headers: { "cache-control": "no-store" } },
    )
  }
}

export const GET = createRuntimeSmokeHandler({
  fetchImpl: fetch,
  expectedSecret: process.env.CRON_SECRET,
  origin: process.env.PF_RUNTIME_SMOKE_ORIGIN?.trim() || "https://puxaficha.com.br",
  deleteQuizShortLink,
})
