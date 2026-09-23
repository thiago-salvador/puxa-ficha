import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase"

export const DEPUTADOS_ROSTER_PUBLIC_RELATION =
  process.env.PF_DEPUTADOS_ROSTER_PUBLIC_RELATION?.trim() || "candidatos_roster_2026_publico"
export const DEPUTADOS_ROSTER_TABLE_RELATION = "candidatos_roster_2026"
export const DEPUTADOS_PAGE_SIZE = 24

export type DeputadoCargo = "deputado_federal" | "deputado_estadual" | "deputado_distrital"

export type DeputadoRosterRow = {
  ano: number
  sq_candidato: string
  uf: string
  cargo: DeputadoCargo
  nome_urna: string
  nome_completo: string
  numero_urna: string
  partido_sigla: string | null
  situacao_registro: string | null
  fonte_url: string
  sha256_pacote: string
  coletado_em: string
  snapshot_em: string | null
  foto_path: string | null
}

export type DeputadosRosterResult = {
  rows: DeputadoRosterRow[]
  total: number
  snapshot: string | null
  sourceStatus: "live" | "partial"
  sourceMessage: string | null
}

const COLUMNS =
  "ano,sq_candidato,uf,cargo,nome_urna,nome_completo,numero_urna,partido_sigla,situacao_registro,fonte_url,sha256_pacote,coletado_em,snapshot_em,foto_path"

function cleanFilter(value: string): string {
  return value.replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
}

function normalizeCargo(value: string | undefined, uf: string): DeputadoCargo {
  if (value === "deputado_federal") return value
  if (value === "deputado_distrital") return value
  return uf === "DF" ? "deputado_distrital" : "deputado_estadual"
}

async function runRosterQuery(
  relation: string,
  uf: string,
  cargo: DeputadoCargo,
  search: string,
  page: number,
) {
  const client = createServerSupabaseClient({ revalidate: 3600 })
  let query = client
    .from(relation)
    .select(COLUMNS, { count: "exact" })
    .eq("ano", 2026)
    .eq("uf", uf)
    .eq("cargo", cargo)
    .order("nome_urna", { ascending: true })
    .range((page - 1) * DEPUTADOS_PAGE_SIZE, page * DEPUTADOS_PAGE_SIZE - 1)

  if (search) {
    const escaped = cleanFilter(search).replace(/[%_]/g, "")
    if (escaped) query = query.or(`nome_urna.ilike.%${escaped}%,nome_completo.ilike.%${escaped}%,numero_urna.ilike.%${escaped}%,partido_sigla.ilike.%${escaped}%`)
  }
  return query
}

export async function getDeputadosRoster({
  uf,
  cargo,
  search = "",
  page = 1,
}: {
  uf: string
  cargo?: string
  search?: string
  page?: number
}): Promise<DeputadosRosterResult> {
  const safeUf = uf.toUpperCase()
  const safeCargo = normalizeCargo(cargo, safeUf)
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1

  try {
    let result = await runRosterQuery(DEPUTADOS_ROSTER_PUBLIC_RELATION, safeUf, safeCargo, search, safePage)
    // Local development may have the table before the public view migration. The
    // fallback is still column allowlisted and keeps the page explicitly partial.
    if (result.error && DEPUTADOS_ROSTER_PUBLIC_RELATION !== DEPUTADOS_ROSTER_TABLE_RELATION && /relation|view|does not exist/i.test(result.error.message)) {
      result = await runRosterQuery(DEPUTADOS_ROSTER_TABLE_RELATION, safeUf, safeCargo, search, safePage)
    }
    if (result.error) throw result.error
    const rows = (result.data ?? []) as DeputadoRosterRow[]
    const total = result.count ?? rows.length
    // Without a search, an empty UF/cargo means the snapshot was not ingested yet
    // (every UF has candidacies), so it must stay partial instead of "no candidates".
    if (!search && total === 0) throw new Error("roster vazio para UF e cargo")
    const snapshot = rows.reduce<string | null>((latest, row) => row.snapshot_em && (!latest || row.snapshot_em > latest) ? row.snapshot_em : latest, null)
    return { rows, total, snapshot, sourceStatus: "live", sourceMessage: null }
  } catch (error) {
    // Keep database details out of the public page; the server log retains the
    // original error through the Supabase client instrumentation.
    void error
    return {
      rows: [],
      total: 0,
      snapshot: null,
      sourceStatus: "partial",
      sourceMessage: "O snapshot oficial ainda não está disponível para esta UF e cargo.",
    }
  }
}

export function cargoLabel(cargo: DeputadoCargo): string {
  return cargo === "deputado_federal" ? "Deputado federal" : cargo === "deputado_distrital" ? "Deputado distrital" : "Deputado estadual"
}

export function formatRosterDate(value: string | null): string {
  if (!value) return "sem snapshot"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)
}
