import type { NextRequest } from "next/server"
import { BRAZIL_STATES } from "@/data/brazil-states"
import { getCandidatosComparaveisResource } from "@/lib/api"
import {
  comparadorEixoLabels,
  comparadorEixoOgSubtitle,
  normalizeComparadorEixo,
  type ComparadorEixo,
} from "@/lib/comparador-axis"
import {
  comparadorOgMetricLabel,
  formatComparadorMetricForOg,
} from "@/lib/comparador-og-format"
import { buildComparadorPairOg, buildEditorialOg, dynamicOgImageCacheHeaders } from "@/lib/og"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UF_SET = new Set<string>(BRAZIL_STATES.map((s) => s.sigla))
const comparadorOgRateLimiter = createFixedWindowIpRateLimiter({
  namespace: "comparador-og",
  max: 90,
  windowMs: 60_000,
})

export async function GET(request: NextRequest) {
  try {
    const decision = comparadorOgRateLimiter.check(request.headers)
    if (!decision.allowed) return rateLimitExceededResponse(decision)
  } catch (error) {
    console.warn("comparador OG rate limit failed open", error)
  }

  const url = request.nextUrl
  const c1 = url.searchParams.get("c1")?.trim()
  const c2 = url.searchParams.get("c2")?.trim()
  const eixo: ComparadorEixo = normalizeComparadorEixo(url.searchParams.get("eixo"))

  if (!c1 || !c2) {
    return buildEditorialOg({
      eyebrow: "Comparador",
      title: "Lado a lado",
      subtitle: "Selecione dois candidatos no Puxa Ficha para comparar e compartilhar.",
      headers: dynamicOgImageCacheHeaders,
    })
  }

  const cargoParam = url.searchParams.get("cargo")?.trim().toLowerCase()
  const ufParam = url.searchParams.get("uf")?.trim().toUpperCase() ?? ""
  const resource =
    cargoParam === "governador" && UF_SET.has(ufParam)
      ? await getCandidatosComparaveisResource("Governador", ufParam)
      : await getCandidatosComparaveisResource()
  const list = resource.data
  const a = list.find((c) => c.slug === c1)
  const b = list.find((c) => c.slug === c2)

  if (!a || !b) {
    return buildEditorialOg({
      eyebrow: "Comparador",
      title: "Candidatos não encontrados",
      subtitle: "Confira os slugs ou abra o comparador a partir do site.",
      headers: dynamicOgImageCacheHeaders,
    })
  }

  const metricLabel = comparadorOgMetricLabel(eixo)

  return buildComparadorPairOg({
    eyebrow: `Comparador · ${comparadorEixoLabels[eixo]}`,
    subtitle: comparadorEixoOgSubtitle[eixo],
    left: {
      nome: a.nome_urna,
      partido: formatPartyPublicLabel(a.partido_sigla),
      metricLabel,
      metricValue: formatComparadorMetricForOg(eixo, a),
    },
    right: {
      nome: b.nome_urna,
      partido: formatPartyPublicLabel(b.partido_sigla),
      metricLabel,
      metricValue: formatComparadorMetricForOg(eixo, b),
    },
    meta: "Lado a lado",
    headers: dynamicOgImageCacheHeaders,
  })
}
