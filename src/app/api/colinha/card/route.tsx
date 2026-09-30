// cspell:words noarchive supabase
import type { NextRequest } from "next/server"
import {
  formatColinhaText,
  parseColinhaState,
  resolveColinhaChoices,
  SLOT_ORDER,
  type ColinhaCandidate,
  type ColinhaState,
} from "@/lib/colinha"
import type { ColinhaRoundInfo } from "@/lib/colinha"
import {
  buildColinhaCard,
  type ColinhaCardFormat,
  isColinhaCandidateAllowed,
} from "@/lib/colinha-card"
import {
  createDistributedIpRateLimiter,
  rateLimitExceededResponse,
  type DistributedRequestRateLimiter,
} from "@/lib/request-rate-limit"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const RELATION = process.env.PF_DEPUTADOS_ROSTER_PUBLIC_RELATION?.trim() || "candidatos_roster_2026_publico"
const COLUMNS = "ano,sq_candidato,uf,cargo,nome_urna,numero_urna,partido_sigla,situacao_registro,foto_path"
const VALID_FORMATS = new Set<ColinhaCardFormat | "text">(["feed", "story", "text"])
const cardRateLimiter = createDistributedIpRateLimiter({ namespace: "colinha-card", max: 30, windowMs: 60_000 })

export type CardRouteDeps = {
  rateLimiter: DistributedRequestRateLimiter
  queryCandidates: (ids: string[]) => Promise<ColinhaCandidate[]>
  buildCard: typeof buildColinhaCard
  now?: () => Date
  loadRound?: (uf: string) => Promise<ColinhaRoundInfo>
}

function responseHeaders(contentType?: string): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
  })
  if (contentType) headers.set("Content-Type", contentType)
  return headers
}

function badRequest(message = "Parâmetros inválidos") {
  return new Response(JSON.stringify({ error: message }), { status: 400, headers: responseHeaders("application/json") })
}

function parseFormat(value: string | null): ColinhaCardFormat | "text" | null {
  const format = value || "feed"
  return VALID_FORMATS.has(format as ColinhaCardFormat | "text") ? format as ColinhaCardFormat | "text" : null
}

function validateParams(searchParams: URLSearchParams, format: string | null): boolean {
  const allowed = new Set(["format", "turno", "uf", ...SLOT_ORDER])
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) return false
    if (key !== "format" && searchParams.getAll(key).length !== 1) return false
  }
  if (format && format.length > 10) return false
  const uf = searchParams.get("uf")
  if (uf && !/^[A-Z]{2}$/.test(uf)) return false
  if (!uf) return false
  const turno = searchParams.get("turno")
  if (turno && turno !== "2") return false
  const s1 = searchParams.get("s1")
  const s2 = searchParams.get("s2")
  if (s1 && s2 && s1 === s2) return false
  for (const slot of SLOT_ORDER) {
    const value = searchParams.get(slot)
    if (value && !/^\d{1,20}$/.test(value)) return false
  }
  return true
}

function buildShareUrl(request: NextRequest, state: ColinhaState): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || request.nextUrl.origin
  const url = new URL("/colinha", origin)
  if (state.uf) url.searchParams.set("uf", state.uf)
  if (state.turno === 2) url.searchParams.set("turno", "2")
  for (const slot of SLOT_ORDER) {
    const value = state[slot]
    if (value) url.searchParams.set(slot, value)
  }
  return url.toString()
}

async function queryRosterCandidates(ids: string[]): Promise<ColinhaCandidate[]> {
  if (ids.length === 0) return []
  const { createServerSupabaseClient } = await import("@/lib/supabase")
  const client = createServerSupabaseClient({ cacheMode: "no-store" })
  const result = await client.from(RELATION).select(COLUMNS).eq("ano", 2026).in("sq_candidato", ids).limit(12)
  if (result.error) throw result.error
  const rows = (result.data ?? []) as ColinhaCandidate[]
  if (rows.length === 0) return rows
  const identities = await client.from("candidatos").select("sq_candidato_2026,slug").in("sq_candidato_2026", ids)
    .abortSignal(supabaseQueryTimeoutSignal())
  if (identities.error) throw identities.error
  const published = await client.from("candidatos_publico").select("slug").in("slug", (identities.data ?? []).map((row) => String(row.slug)))
    .abortSignal(supabaseQueryTimeoutSignal())
  if (published.error) throw published.error
  const publicSlugs = new Set((published.data ?? []).map((row) => String(row.slug)))
  const slugBySq = new Map((identities.data ?? []).map((row) => [String(row.sq_candidato_2026), String(row.slug)]))
  return rows.map((row) => {
    const slug = slugBySq.get(row.sq_candidato)
    return slug && publicSlugs.has(slug) ? { ...row, slug } : row
  })
}

async function loadDefaultRound(uf: string): Promise<ColinhaRoundInfo> {
  const { loadColinhaRound } = await import("@/lib/colinha-data")
  return loadColinhaRound(uf)
}

function createDefaultDeps(): CardRouteDeps {
  return { rateLimiter: cardRateLimiter, queryCandidates: queryRosterCandidates, buildCard: buildColinhaCard, loadRound: loadDefaultRound }
}

export function createColinhaCardGetHandler(deps: CardRouteDeps = createDefaultDeps()) {
  return async function GET(request: NextRequest) {
    const decision = await deps.rateLimiter.check(request.headers)
    if (!decision.allowed) return rateLimitExceededResponse(decision)

    const format = parseFormat(request.nextUrl.searchParams.get("format"))
    if (!format || !validateParams(request.nextUrl.searchParams, request.nextUrl.searchParams.get("format"))) return badRequest()

    let state: ColinhaState
    try {
      state = parseColinhaState(request.nextUrl.searchParams)
    } catch {
      return badRequest()
    }
    if (!state.uf || (request.nextUrl.searchParams.get("uf") ?? "") !== state.uf) return badRequest()
    const ids = [...new Set(SLOT_ORDER.map((slot) => state[slot]).filter((value): value is string => Boolean(value)))]

    try {
      const candidates = await deps.queryCandidates(ids)
      const round = state.turno === 2 ? await (deps.loadRound?.(state.uf) ?? Promise.resolve(null)) : null
      if (state.turno === 2 && (!round || round.status !== "ready" || round.availableSlots.length === 0)) return badRequest("2º turno indisponível")
      if (state.turno === 2 && SLOT_ORDER.some((slot) => state[slot] && !round!.availableSlots.includes(slot))) return badRequest("Cargo fora do 2º turno")
      const resolveState = state.turno === 2 ? { ...state, turno: undefined } as ColinhaState : state
      const choices = resolveColinhaChoices(resolveState, candidates)
      for (const slot of SLOT_ORDER) {
        const requested = state[slot]
        if (requested && (!choices[slot] || !isColinhaCandidateAllowed(choices[slot]!))) return badRequest("Escolha indisponível")
        if (state.turno === 2 && requested) {
          const finalists = slot === "p" ? round!.presidentFinalistSlugs : round!.governorFinalistSlugs
          if (!finalists.includes(choices[slot]!.slug ?? "")) return badRequest("Escolha não é finalista oficial")
        }
      }
      const shareUrl = buildShareUrl(request, state)
      if (format === "text") {
        return new Response(formatColinhaText(state, choices, shareUrl, round ? { slots: round.availableSlots, message: round.message ?? undefined } : undefined), { status: 200, headers: responseHeaders("text/plain; charset=utf-8") })
      }
      const image = await deps.buildCard(choices, state.uf, shareUrl, format, deps.now?.() ?? new Date(), round ? { turno: 2, slots: round.availableSlots, message: round.message ?? undefined } : undefined)
      const headers = responseHeaders("image/png")
      for (const [key, value] of image.headers.entries()) headers.set(key, value)
      return new Response(image.body, { status: 200, headers })
    } catch {
      return new Response(JSON.stringify({ error: "Fonte temporariamente indisponível" }), { status: 503, headers: responseHeaders("application/json") })
    }
  }
}

export const GET = createColinhaCardGetHandler()
