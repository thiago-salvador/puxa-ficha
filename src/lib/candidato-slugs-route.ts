import { NextResponse } from "next/server"
import { getCandidatoSlugStaticParams } from "@/lib/api"

type LoadCandidatoSlugs = () => Promise<{ slug: string }[]>

const CANDIDATO_SLUGS_CDN_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600"

export function createCandidatoSlugsGetHandler(
  loadSlugs: LoadCandidatoSlugs = getCandidatoSlugStaticParams,
) {
  return async function GET() {
    let slugs: string[]
    try {
      const rows = await loadSlugs()
      slugs = rows.map((row) => row.slug)
    } catch (error) {
      console.error(
        "candidato-slugs route failed:",
        error instanceof Error ? error.message : error,
      )
      return NextResponse.json(
        { slugs: null, error: "unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } },
      )
    }

    const cacheControl = slugs.length === 0 ? "no-store" : CANDIDATO_SLUGS_CDN_CACHE_CONTROL

    return NextResponse.json({ slugs }, { headers: { "cache-control": cacheControl } })
  }
}
