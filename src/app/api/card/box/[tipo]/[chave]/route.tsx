import type { ImageResponse } from "next/og"
import * as Sentry from "@sentry/nextjs"
import { BRAZIL_STATES } from "@/data/brazil-states"
import { getCandidatoBySlugResource, getCandidatosComparaveisResource } from "@/lib/api"
import { resolveComparadorCohort } from "@/lib/comparador-cohort"
import { buildBoxCard } from "@/lib/box-card"
import { toPublicCandidatoProfileDto } from "@/lib/public-profile-dto"
import {
  BOX_CARD_KINDS,
  buildCandidateBoxCard,
  buildComparatorBoxCard,
  type BoxCardKind,
  type BoxCardModel,
} from "@/lib/box-card-model"
import type { CandidatoComparavel, DataResource, FichaCandidato } from "@/lib/types"
import { createDistributedIpRateLimiter, rateLimitExceededResponse, type DistributedRequestRateLimiter } from "@/lib/request-rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_KINDS = new Set<string>(BOX_CARD_KINDS)
const VALID_FORMATS = new Set(["feed", "story"])
const VALID_AXES = new Set(["patrimonio", "gastos"])
const VALID_CARGOS = new Set(["Presidente", "Governador", "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital"])
const VALID_UFS = new Set<string>(BRAZIL_STATES.map((state) => state.sigla))
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600"

const rateLimiter = createDistributedIpRateLimiter({ namespace: "box-card", max: 60, windowMs: 60_000 })

type CandidateResource = Awaited<ReturnType<typeof getCandidatoBySlugResource>>
type ComparatorResource = Awaited<ReturnType<typeof getCandidatosComparaveisResource>>

export interface BoxCardRouteDeps {
  getCandidatoBySlugResource: typeof getCandidatoBySlugResource
  getCandidatosComparaveisResource: typeof getCandidatosComparaveisResource
  buildCandidateBoxCard: typeof buildCandidateBoxCard
  buildComparatorBoxCard: typeof buildComparatorBoxCard
  buildBoxCard: typeof buildBoxCard
  rateLimiter: DistributedRequestRateLimiter
  startSpan: typeof Sentry.startSpan
}

const defaultDeps: BoxCardRouteDeps = {
  getCandidatoBySlugResource,
  getCandidatosComparaveisResource,
  buildCandidateBoxCard,
  buildComparatorBoxCard,
  buildBoxCard,
  rateLimiter,
  startSpan: Sentry.startSpan,
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  })
}

function isLive<T>(resource: DataResource<T>): boolean {
  return resource.sourceStatus === "live"
}

function parseKind(raw: string): BoxCardKind | null {
  return VALID_KINDS.has(raw) ? raw as BoxCardKind : null
}

function parseSlugs(key: string): string[] | null {
  const slugs = key.split("~")
  if (slugs.length < 2 || slugs.length > 4 || slugs.some((slug) => !SLUG_RE.test(slug))) return null
  if (new Set(slugs).size !== slugs.length) return null
  return slugs
}

function parseStrictScope(url: URL): { format: "feed" | "story"; revision: string | null; axis: "patrimonio" | "gastos" | null; uf: string | null; cargo: string | null } | null {
  const allowed = new Set(["format", "v", "eixo", "uf", "cargo", "retry"])
  for (const [key] of url.searchParams) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return null
  }
  const formatRaw = url.searchParams.get("format")
  if (formatRaw !== null && !VALID_FORMATS.has(formatRaw)) return null
  const revision = url.searchParams.get("v")
  if (revision === null || !/^[a-zA-Z0-9._-]{1,128}$/.test(revision)) return null
  const retry = url.searchParams.get("retry")
  if (retry !== null && (!/^\d{1,7}$/.test(retry) || Number(retry) > 1_000_000)) return null
  const axisRaw = url.searchParams.get("eixo")
  if (axisRaw !== null && !VALID_AXES.has(axisRaw)) return null
  const ufRaw = url.searchParams.get("uf")
  const uf = ufRaw?.toUpperCase() ?? null
  if (ufRaw !== null && !ufRaw) return null
  if (uf && (!/^[A-Z]{2}$/.test(uf) || !VALID_UFS.has(uf))) return null
  const cargo = url.searchParams.get("cargo")
  if (cargo !== null && !VALID_CARGOS.has(cargo)) return null
  return { format: (formatRaw ?? "feed") as "feed" | "story", revision, axis: (axisRaw ?? null) as "patrimonio" | "gastos" | null, uf, cargo }
}

function success(model: BoxCardModel, image: ImageResponse): Response {
  const headers = new Headers(image.headers)
  headers.set("Cache-Control", CACHE_CONTROL)
  headers.set("X-Robots-Tag", "noindex")
  headers.set("Content-Type", "image/png")
  headers.set("X-Imprensa-Aviso", "Confira os dados na fonte original antes de publicar.")
  headers.set("ETag", `"${model.revision}"`)
  return new Response(image.body, { status: 200, headers })
}

export function createBoxCardGetHandler(deps: BoxCardRouteDeps = defaultDeps) {
  return async function GET(request: Request, { params }: { params: Promise<{ tipo: string; chave: string }> }) {
    try {
      const decision = await deps.rateLimiter.check(request.headers)
      if (!decision.allowed) return rateLimitExceededResponse(decision)

      const { tipo: rawKind, chave } = await params
      const kind = parseKind(rawKind)
      const url = new URL(request.url)
      const scope = parseStrictScope(url)
      if (!kind || !scope) return jsonError(404, "Card não encontrado")

      return await deps.startSpan({
      name: "box_card.generate",
      op: "http.server",
      attributes: { "http.route": "/api/card/box/[tipo]/[chave]", "puxaficha.card_kind": kind, "puxaficha.card_format": scope.format },
    }, async () => {
      let model: BoxCardModel | null = null

      if (kind === "comparador") {
        const slugs = parseSlugs(chave)
        if (!slugs || !scope.axis) return jsonError(404, "Card não encontrado")
        const metaResources: CandidateResource[] = await Promise.all(slugs.map((slug) => deps.getCandidatoBySlugResource(slug)))
        if (metaResources.some((resource) => !isLive(resource))) return jsonError(503, "Fonte temporariamente indisponível")
        const fichas = metaResources.map((resource) => resource.data)
        if (fichas.some((ficha) => ficha === null)) return jsonError(404, "Candidato não encontrado")
        const existingFichas = fichas.filter((ficha): ficha is NonNullable<typeof ficha> => ficha !== null)
        const cargos = new Set(existingFichas.map((ficha) => ficha.cargo_disputado))
        if (cargos.size !== 1) return jsonError(404, "Card não encontrado")
        const cohort = resolveComparadorCohort(existingFichas.map((ficha) => ({ cargo_disputado: ficha.cargo_disputado, estado: ficha.estado })))
        if (!cohort.cargo || (scope.cargo && scope.cargo !== cohort.cargo)) return jsonError(404, "Card não encontrado")
        if (scope.uf && scope.uf !== cohort.estado) return jsonError(404, "Card não encontrado")

        const comparableResource: ComparatorResource = await deps.getCandidatosComparaveisResource(cohort.cargo, cohort.estado)
        if (!isLive(comparableResource)) return jsonError(503, "Fonte temporariamente indisponível")
        const selected = slugs.map((slug) => comparableResource.data.find((candidate) => candidate.slug === slug))
        if (selected.some((candidate) => !candidate)) return jsonError(404, "Card não encontrado")
        const selectedCandidates = selected.filter((candidate): candidate is CandidatoComparavel => candidate !== undefined)
        if (selectedCandidates.some((candidate) => candidate.cargo_disputado !== cohort.cargo)) return jsonError(404, "Card não encontrado")
        if (cohort.estado && selectedCandidates.some((candidate) => candidate.estado?.toUpperCase() !== cohort.estado)) return jsonError(404, "Card não encontrado")
        if (selectedCandidates.some((candidate, index) => {
          const ficha = existingFichas[index]
          return candidate.estado?.toUpperCase() !== ficha.estado?.toUpperCase()
        })) return jsonError(404, "Card não encontrado")

        model = deps.buildComparatorBoxCard(selectedCandidates, {
          axis: scope.axis,
          ...(scope.uf ? { uf: scope.uf } : {}),
          ...(scope.cargo ? { cargo: scope.cargo } : {}),
          slugs,
        })
      } else {
        if (!SLUG_RE.test(chave) || scope.axis || scope.uf || scope.cargo) return jsonError(404, "Card não encontrado")
        const resource: CandidateResource = await deps.getCandidatoBySlugResource(chave)
        if (!isLive(resource)) return jsonError(503, "Fonte temporariamente indisponível")
        if (!resource.data) return jsonError(404, "Candidato não encontrado")
        const publicFicha = toPublicCandidatoProfileDto(resource.data) as unknown as FichaCandidato
        model = deps.buildCandidateBoxCard(kind, publicFicha)
      }

      if (model === null) return jsonError(404, "Card não encontrado")
      if (scope.revision !== model.revision) return jsonError(404, "Card desatualizado")
      const image = await deps.buildBoxCard(model, scope.format)
      return success(model, image)
      })
    } catch {
      return jsonError(500, "Não foi possível gerar o card")
    }
  }
}

export const GET = createBoxCardGetHandler()
