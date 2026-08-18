import { NextResponse } from "next/server"
import { getCandidatoSlugStaticParams } from "@/lib/api"

/**
 * Retorna a lista de slugs publicos validos, para que o middleware possa
 * emitir HTTP 404 real em `/candidato/[slug]` inexistente antes do page body
 * commitar status 200 via streaming/Suspense (soft-404 do App Router).
 *
 * Cacheado via `revalidate` (5 min) para nao bater no DB a cada request.
 */
export const revalidate = 300

export async function GET() {
  let slugs: string[]
  try {
    const rows = await getCandidatoSlugStaticParams()
    slugs = rows.map((row) => row.slug)
  } catch (error) {
    // Falha de leitura: responde !ok + no-store para o middleware entrar em
    // fail-open em vez de cachear um 404 universal (review 2026-06-09).
    console.error(
      "candidato-slugs route failed:",
      error instanceof Error ? error.message : error,
    )
    return NextResponse.json(
      { slugs: null, error: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    )
  }

  // Lista vazia nao deve ser fixada por horas no CDN: se foi um vazio transiente,
  // a recuperacao precisa propagar rapido. O middleware ja trata vazio como fail-open.
  const cacheControl =
    slugs.length === 0
      ? "no-store"
      : "public, max-age=60, s-maxage=300, stale-while-revalidate=600"

  return NextResponse.json({ slugs }, { headers: { "cache-control": cacheControl } })
}
