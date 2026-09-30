import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"
import { getFasesEleitorais2026 } from "@/lib/api"
import {
  deriveColinhaRoundInfo,
  listStartLetter,
  type ColinhaCandidate,
  type ColinhaRoundInfo,
  type ColinhaState,
  type SlotId,
} from "@/lib/colinha"
import type { FaseEleitoralPublica } from "@/lib/fase-eleitoral-publica"

const RELATION = "candidatos_roster_2026_publico"
const COLUMNS = "ano,sq_candidato,uf,cargo,nome_urna,numero_urna,partido_sigla,situacao_registro,foto_path,snapshot_em"

interface RosterRow extends ColinhaCandidate {
  snapshot_em: string | null
}

export interface ColinhaCandidatesResult {
  candidates: ColinhaCandidate[]
  unavailable: boolean
  snapshot: string | null
  /** Letra por onde a lista sem filtro começa agora (ordem neutra rotativa). */
  listStart?: string | null
  round?: ColinhaRoundInfo
}

const SEARCH_LIMIT = 20

function empty(unavailable = false): ColinhaCandidatesResult {
  return { candidates: [], unavailable, snapshot: null }
}

async function enrichPublished(rows: RosterRow[], phases: FaseEleitoralPublica[] = []): Promise<ColinhaCandidate[]> {
  if (rows.length === 0) return []
  const client = createServerSupabaseClient({ cacheMode: "no-store" })
  const sqs = rows.map((row) => row.sq_candidato)
  // A coluna SQ tem grant público somente para fichas publicadas; RLS filtra
  // as demais. Nunca usamos nome parecido para criar link de ficha.
  const { data: identities, error } = await client
    .from("candidatos")
    .select("id,sq_candidato_2026,slug")
    .in("sq_candidato_2026", sqs)
    .abortSignal(supabaseQueryTimeoutSignal())
  if (error || !identities?.length) return rows

  const slugBySq = new Map(identities.map((row) => [String(row.sq_candidato_2026), String(row.slug)]))
  const candidateIdBySlug = new Map(identities.map((row) => [String(row.slug), String(row.id)]))
  const slugs = [...new Set(slugBySq.values())]
  const { data: published, error: publishedError } = await client
    .from("candidatos_publico")
    .select("id,slug,foto_url")
    .in("slug", slugs)
    .abortSignal(supabaseQueryTimeoutSignal())
  if (publishedError || !published?.length) return rows
  const photoBySlug = new Map(published.map((row) => [String(row.slug), row.foto_url as string | null]))
  const idBySlug = new Map(published.map((row) => [String(row.slug), String(row.id)]))
  const phaseBySlug = new Map(phases.map((phase) => [phase.slug, phase]))
  const { data: summaries, error: summaryError } = await client
    .from("v_comparador")
    .select("id,patrimonio_declarado,total_processos,pontos_atencao")
    .in("id", [...idBySlug.values()])
    .abortSignal(supabaseQueryTimeoutSignal())
  const summaryById = summaryError ? new Map<string, {
    patrimonio: number | null; processos: number | null; pontos_atencao: number | null
  }>() : new Map((summaries ?? []).map((row) => [String(row.id), {
    patrimonio: typeof row.patrimonio_declarado === "number" ? row.patrimonio_declarado : null,
    processos: typeof row.total_processos === "number" ? row.total_processos : null,
    pontos_atencao: Array.isArray(row.pontos_atencao) ? row.pontos_atencao.length : null,
  }]))

  return rows.map((row) => {
    const slug = slugBySq.get(row.sq_candidato)
    if (!slug || !photoBySlug.has(slug)) return row
    const phase = slug && candidateIdBySlug.get(slug) === phaseBySlug.get(slug)?.candidato_id ? phaseBySlug.get(slug) : undefined
    return {
      ...row,
      slug,
      foto_path: row.foto_path || photoBySlug.get(slug) || null,
      resumo: summaryById.get(idBySlug.get(slug) ?? "") ?? null,
      ...(phase ? { fase_eleitoral_2026: {
        fase_eleitoral: phase.fase_eleitoral,
        fase_turno: phase.fase_turno,
        atualizacao_encerrada_em: phase.atualizacao_encerrada_em,
      } } : {}),
    }
  })
}

function result(rows: RosterRow[], candidates: ColinhaCandidate[]): ColinhaCandidatesResult {
  const snapshot = rows.reduce<string | null>((latest, row) =>
    row.snapshot_em && (!latest || row.snapshot_em > latest) ? row.snapshot_em : latest, null)
  return { candidates, unavailable: false, snapshot }
}

type PhaseIdentity = Pick<ColinhaCandidate, "sq_candidato" | "slug" | "uf" | "cargo" | "nome_urna"> & { candidato_id?: string }

async function loadOfficialRound(uf: string): Promise<{ round: ColinhaRoundInfo; phases: FaseEleitoralPublica[] }> {
  const phases = await getFasesEleitorais2026("no-store")
  if (phases.length === 0) return { round: deriveColinhaRoundInfo([], [], uf), phases }
  const slugs = [...new Set(phases.filter((phase) => phase.cargo_disputado === "Presidente" || phase.cargo_disputado === "Governador").map((phase) => phase.slug))]
  if (slugs.length === 0) return { round: deriveColinhaRoundInfo(phases, [], uf), phases }
  const client = createServerSupabaseClient({ cacheMode: "no-store" })
  const { data, error } = await client.from("candidatos")
    .select("id,sq_candidato_2026,slug,estado,cargo_disputado,nome_urna")
    .in("slug", slugs)
    .abortSignal(supabaseQueryTimeoutSignal())
  if (error) return { round: deriveColinhaRoundInfo(phases, [], uf), phases }
  const published = await client.from("candidatos_publico").select("slug").in("slug", slugs)
  if (published.error) return { round: deriveColinhaRoundInfo(phases, [], uf), phases }
  const publishedSlugs = new Set((published.data ?? []).map((row) => String(row.slug)))
  const identities: PhaseIdentity[] = (data ?? []).map((row) => {
    const cargo = String(row.cargo_disputado ?? "").toLowerCase()
    return {
      sq_candidato: String(row.sq_candidato_2026 ?? ""),
      candidato_id: String(row.id ?? ""),
      slug: String(row.slug ?? ""),
      uf: String(row.estado ?? (cargo === "presidente" ? "BR" : "")),
      cargo,
      nome_urna: String(row.nome_urna ?? row.slug ?? ""),
    }
  }).filter((row) => row.sq_candidato && row.slug && publishedSlugs.has(row.slug) && row.uf)
  return { round: deriveColinhaRoundInfo(phases, identities, uf), phases }
}

export async function loadColinhaRound(uf: string): Promise<ColinhaRoundInfo> {
  try {
    return (await loadOfficialRound(uf)).round
  } catch {
    return deriveColinhaRoundInfo([], [], uf)
  }
}

export async function loadColinhaCandidatesForSelection(state: ColinhaState): Promise<ColinhaCandidatesResult> {
  if (!state.uf) return empty()
  const sqs = [...new Set([state.df, state.de, state.s1, state.s2, state.g, state.p].filter((value): value is string => Boolean(value)))]
  if (sqs.length === 0) return empty()
  try {
    const official = state.turno === 2 ? await loadOfficialRound(state.uf) : null
    if (official && official.round.availableSlots.length === 0) return { ...empty(), round: official.round }
    const client = createServerSupabaseClient({ cacheMode: "no-store" })
    const { data, error } = await client.from(RELATION).select(COLUMNS)
      .eq("ano", 2026).in("uf", [state.uf, "BR"]).in("sq_candidato", sqs)
      .abortSignal(supabaseQueryTimeoutSignal())
    if (error) return empty(true)
    const rows = (data ?? []) as unknown as RosterRow[]
    const candidates = await enrichPublished(rows, official?.phases ?? [])
    return { ...result(rows, candidates), ...(official ? { round: official.round } : {}) }
  } catch {
    return empty(true)
  }
}

function cargoFor(slot: SlotId, uf: string): string {
  if (slot === "df") return "deputado_federal"
  if (slot === "de") return uf === "DF" ? "deputado_distrital" : "deputado_estadual"
  if (slot === "s1" || slot === "s2") return "senador"
  if (slot === "g") return "governador"
  return "presidente"
}

export async function searchColinhaCandidates(
  uf: string,
  slot: SlotId,
  query: string,
  now: Date = new Date(),
  turno: 1 | 2 = 1,
): Promise<ColinhaCandidatesResult> {
  try {
    const official = turno === 2 ? await loadOfficialRound(uf) : null
    if (official && !official.round.availableSlots.includes(slot)) return { ...empty(), round: official.round }
    const client = createServerSupabaseClient({ cacheMode: "no-store" })
    const cargo = cargoFor(slot, uf)
    const base = () => client.from(RELATION).select(COLUMNS)
      .eq("ano", 2026).eq("cargo", cargo).eq("uf", slot === "p" ? "BR" : uf)
    const scoped = (queryBuilder: ReturnType<typeof base>) => official
      ? queryBuilder.in("sq_candidato", slot === "p" ? official.round.presidentFinalistSqs : official.round.governorFinalistSqs)
      : queryBuilder
    const safe = query.normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 70)
    if (safe) {
      // Com filtro, a ordem alfabética simples: quem digita já escolheu o recorte.
      const { data, error } = await scoped(base())
        .or(`nome_urna.ilike.%${safe}%,nome_completo.ilike.%${safe}%,numero_urna.ilike.%${safe}%,partido_sigla.ilike.%${safe}%`)
        .order("nome_urna").limit(SEARCH_LIMIT)
        .abortSignal(supabaseQueryTimeoutSignal())
      if (error) return empty(true)
      const rows = (data ?? []) as unknown as RosterRow[]
      return { ...result(rows, await enrichPublished(rows, official?.phases ?? [])), ...(official ? { round: official.round } : {}) }
    }
    // Sem filtro, a lista começa na letra do momento e dá a volta no alfabeto.
    const start = listStartLetter(now)
    const head = await scoped(base()).gte("nome_urna", start).order("nome_urna").limit(SEARCH_LIMIT)
      .abortSignal(supabaseQueryTimeoutSignal())
    if (head.error) return empty(true)
    let rows = (head.data ?? []) as unknown as RosterRow[]
    if (rows.length < SEARCH_LIMIT) {
      const tail = await scoped(base()).lt("nome_urna", start).order("nome_urna").limit(SEARCH_LIMIT - rows.length)
        .abortSignal(supabaseQueryTimeoutSignal())
      if (tail.error) return empty(true)
      rows = [...rows, ...((tail.data ?? []) as unknown as RosterRow[])]
    }
    return { ...result(rows, await enrichPublished(rows, official?.phases ?? [])), listStart: start, ...(official ? { round: official.round } : {}) }
  } catch {
    return empty(true)
  }
}
