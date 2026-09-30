import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"
import { listStartLetter, type ColinhaCandidate, type ColinhaState, type SlotId } from "@/lib/colinha"

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
}

/** Teto de linhas por resposta do PostgREST (max_rows); a lista completa pagina. */
const PAGE_SIZE = 1000
/** SP tem mais de mil candidaturas a deputado estadual; dez páginas dão folga. */
const MAX_PAGES = 10
/** Lote do enriquecimento: mantém o filtro `in` curto o bastante para a URL. */
const ENRICH_CHUNK = 200

function empty(unavailable = false): ColinhaCandidatesResult {
  return { candidates: [], unavailable, snapshot: null }
}

type PageQuery = {
  range: (from: number, to: number) => {
    abortSignal: (signal: AbortSignal) => PromiseLike<{ data: unknown[] | null; error: unknown }>
  }
}

async function fetchAllRows(build: () => PageQuery): Promise<RosterRow[] | null> {
  const rows: RosterRow[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1).abortSignal(supabaseQueryTimeoutSignal())
    if (error) return null
    const batch = (data ?? []) as unknown as RosterRow[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}

async function enrichPublished(rows: RosterRow[]): Promise<ColinhaCandidate[]> {
  const chunks: RosterRow[][] = []
  for (let index = 0; index < rows.length; index += ENRICH_CHUNK) chunks.push(rows.slice(index, index + ENRICH_CHUNK))
  return (await Promise.all(chunks.map(enrichChunk))).flat()
}

async function enrichChunk(rows: RosterRow[]): Promise<ColinhaCandidate[]> {
  if (rows.length === 0) return []
  const client = createServerSupabaseClient({ cacheMode: "no-store" })
  const sqs = rows.map((row) => row.sq_candidato)
  // A coluna SQ tem grant público somente para fichas publicadas; RLS filtra
  // as demais. Nunca usamos nome parecido para criar link de ficha.
  const { data: identities, error } = await client
    .from("candidatos")
    .select("sq_candidato_2026,slug")
    .in("sq_candidato_2026", sqs)
    .abortSignal(supabaseQueryTimeoutSignal())
  if (error || !identities?.length) return rows

  const slugBySq = new Map(identities.map((row) => [String(row.sq_candidato_2026), String(row.slug)]))
  const slugs = [...new Set(slugBySq.values())]
  const { data: published, error: publishedError } = await client
    .from("candidatos_publico")
    .select("id,slug,foto_url")
    .in("slug", slugs)
    .abortSignal(supabaseQueryTimeoutSignal())
  if (publishedError || !published?.length) return rows
  const photoBySlug = new Map(published.map((row) => [String(row.slug), row.foto_url as string | null]))
  const idBySlug = new Map(published.map((row) => [String(row.slug), String(row.id)]))
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
    return {
      ...row,
      slug,
      foto_path: row.foto_path || photoBySlug.get(slug) || null,
      resumo: summaryById.get(idBySlug.get(slug) ?? "") ?? null,
    }
  })
}

function result(rows: RosterRow[], candidates: ColinhaCandidate[]): ColinhaCandidatesResult {
  const snapshot = rows.reduce<string | null>((latest, row) =>
    row.snapshot_em && (!latest || row.snapshot_em > latest) ? row.snapshot_em : latest, null)
  return { candidates, unavailable: false, snapshot }
}

export async function loadColinhaCandidatesForSelection(state: ColinhaState): Promise<ColinhaCandidatesResult> {
  if (!state.uf) return empty()
  const sqs = [...new Set([state.df, state.de, state.s1, state.s2, state.g, state.p].filter((value): value is string => Boolean(value)))]
  if (sqs.length === 0) return empty()
  try {
    const client = createServerSupabaseClient({ cacheMode: "no-store" })
    const { data, error } = await client.from(RELATION).select(COLUMNS)
      .eq("ano", 2026).in("uf", [state.uf, "BR"]).in("sq_candidato", sqs)
      .abortSignal(supabaseQueryTimeoutSignal())
    if (error) return empty(true)
    const rows = (data ?? []) as unknown as RosterRow[]
    return result(rows, await enrichPublished(rows))
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
): Promise<ColinhaCandidatesResult> {
  try {
    const client = createServerSupabaseClient({ cacheMode: "no-store" })
    const cargo = cargoFor(slot, uf)
    const base = () => client.from(RELATION).select(COLUMNS)
      .eq("ano", 2026).eq("cargo", cargo).eq("uf", slot === "p" ? "BR" : uf)
    const safe = query.normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 70)
    if (safe) {
      // Com filtro, a ordem alfabética simples: quem digita já escolheu o recorte.
      const rows = await fetchAllRows(() => base()
        .or(`nome_urna.ilike.%${safe}%,nome_completo.ilike.%${safe}%,numero_urna.ilike.%${safe}%,partido_sigla.ilike.%${safe}%`)
        .order("nome_urna").order("sq_candidato"))
      if (!rows) return empty(true)
      return result(rows, await enrichPublished(rows))
    }
    // Sem filtro, a lista completa começa na letra do momento e dá a volta no alfabeto.
    const start = listStartLetter(now)
    const [head, tail] = await Promise.all([
      fetchAllRows(() => base().gte("nome_urna", start).order("nome_urna").order("sq_candidato")),
      fetchAllRows(() => base().lt("nome_urna", start).order("nome_urna").order("sq_candidato")),
    ])
    if (!head || !tail) return empty(true)
    const rows = [...head, ...tail]
    return { ...result(rows, await enrichPublished(rows)), listStart: start }
  } catch {
    return empty(true)
  }
}
