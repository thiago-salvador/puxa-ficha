import { NextResponse } from "next/server"
import { getCandidatoSlugStaticParams, getGlobalSearchIndexResource } from "@/lib/api"
import { filterGlobalSearchIndexToPublicSlugs } from "@/lib/global-search"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const [resource, publicSlugRows] = await Promise.all([
    getGlobalSearchIndexResource(),
    getCandidatoSlugStaticParams(),
  ])
  const data = filterGlobalSearchIndexToPublicSlugs(
    resource.data,
    publicSlugRows.map((row) => row.slug),
  )
  // O filtro canônico precisa ser reavaliado após mudanças na coorte pública.
  // Em degradação, reporta ok:false e cache ainda mais curto para a recuperação
  // propagar rápido (review 2026-06-09).
  const degraded = resource.sourceStatus === "degraded"
  return NextResponse.json(
    { ok: !degraded, data },
    {
      headers: {
        "cache-control": degraded
          ? "public, max-age=0, s-maxage=30, stale-while-revalidate=300"
          : "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    }
  )
}
