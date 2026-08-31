import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { secretsMatch } from "@/lib/crypto-utils"
import { REVALIDATE_ALLOWED_TAGS } from "@/lib/revalidate-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonNoStore(body: Record<string, unknown>, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init)
  response.headers.set(
    "cache-control",
    "no-store",
  )
  return response
}

function bearer(req: NextRequest): string | null {
  const value = req.headers.get("authorization")?.trim()
  return value?.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : null
}

/**
 * GET /api/internal/revalidate-public-cache
 *
 * Cron da Vercel (a cada 15 min) que marca as tags publicas do Data Cache como
 * stale. Cobre escrita que nao passa pelo ingest.yml: migration, SQL no painel,
 * MCP. Sem isso a ficha publica pode ficar ate 1h velha.
 *
 * `"max"` e nao `{ expire: 0 }`, e a diferenca importa aqui:
 *
 *   revalidateTag(tag, "max")         -> stale-while-revalidate. A proxima
 *     requisicao ainda e servida do cache, e a revalidacao acontece atras dela.
 *   revalidateTag(tag, { expire: 0 }) -> expira de imediato. A proxima
 *     requisicao de CADA tag vira miss bloqueante.
 *
 * Com `{ expire: 0 }` num cron de 15 minutos, todas as tags publicas expiravam
 * juntas 96 vezes por dia, e quem chegasse logo depois pagava um miss
 * bloqueante em cima de um cache que acabara de ser esvaziado. O aquecimento
 * nunca durava um ciclo inteiro. Este cron e uma rede contra escrita fora do
 * pipeline, nao uma correcao urgente: um ciclo de stale-while-revalidate e o
 * comportamento certo para ele.
 *
 * O purge duro continua existindo, e continua sendo o caminho certo para
 * correcao de erro factual: POST /api/revalidate, autenticado por
 * PF_REVALIDATE_SECRET, mantem `{ expire: 0 }` com a justificativa registrada
 * naquele arquivo.
 *
 * Auth: Vercel Cron injeta `Authorization: Bearer <CRON_SECRET>`. Fail-closed.
 * Nao aceita PF_REVALIDATE_SECRET: essa superficie continua em POST /api/revalidate.
 */
export function createRevalidatePublicCacheHandler(deps: {
  expectedSecret: string | undefined
  revalidateFn: (tag: string) => void
}) {
  return async function revalidatePublicCache(req: NextRequest) {
    if (!secretsMatch(bearer(req), deps.expectedSecret)) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 })
    }

    const revalidated = [...REVALIDATE_ALLOWED_TAGS]
    for (const tag of revalidated) {
      deps.revalidateFn(tag)
    }

    return jsonNoStore({ ok: true, revalidated })
  }
}

export const GET = createRevalidatePublicCacheHandler({
  expectedSecret: process.env.CRON_SECRET,
  revalidateFn: (tag) => revalidateTag(tag, "max"),
})

export async function POST() {
  return jsonNoStore(
    { ok: false, error: "method_not_allowed", method: "POST" },
    { status: 405 },
  )
}
