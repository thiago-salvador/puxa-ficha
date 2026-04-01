import { supabase } from "./supabase"
import { normalizeForMatch } from "./helpers"
import type { CandidatoConfig } from "./types"

export type ResolveMethod = "sq-preloaded" | "cpf" | "name-unique" | "name-uf"

export interface ResolveResult {
  slug: string
  method: ResolveMethod
}

export interface ResolverStats {
  sqPreloaded: number
  cpf: number
  nameUnique: number
  nameUf: number
  ambiguous: number
  noMatch: number
}

export interface TSEResolver {
  resolveRow(row: Record<string, string>): ResolveResult | null
  stats: ResolverStats
  ambiguousSlugs: string[]
}

interface CandidatoDBRow {
  slug: string
  cpf: string | null
}

export function getResolveMethodPriority(method: ResolveMethod): number {
  switch (method) {
    case "sq-preloaded":
      return 4
    case "cpf":
      return 3
    case "name-unique":
      return 2
    case "name-uf":
      return 1
  }
}

export function isWeakNameMatch(method: ResolveMethod): boolean {
  return method === "name-unique" || method === "name-uf"
}

export function shouldSkipWeakMatchForAno(ano: number, method: ResolveMethod): boolean {
  return ano === 2024 && isWeakNameMatch(method)
}

function normalizeCPF(value: string): string {
  const normalized = value.replace(/\D/g, "")
  return normalized.length === 11 ? normalized : ""
}

function addNameMatch(
  map: Map<string, CandidatoConfig[]>,
  name: string,
  candidato: CandidatoConfig
) {
  const normalized = normalizeForMatch(name)
  if (!normalized) return

  const existing = map.get(normalized) ?? []
  if (existing.some((item) => item.slug === candidato.slug)) {
    return
  }

  existing.push(candidato)
  map.set(normalized, existing)
}

function buildNameMap(candidatos: CandidatoConfig[]): Map<string, CandidatoConfig[]> {
  const map = new Map<string, CandidatoConfig[]>()

  for (const candidato of candidatos) {
    addNameMatch(map, candidato.nome_completo, candidato)
    addNameMatch(map, candidato.nome_urna, candidato)
  }

  return map
}

function getCandidateMatches(
  row: Record<string, string>,
  nameMap: Map<string, CandidatoConfig[]>
): CandidatoConfig[] {
  const fullName = normalizeForMatch(row.NM_CANDIDATO || "")
  const urnaName = normalizeForMatch(row.NM_URNA_CANDIDATO || "")
  const rowUf = (row.SG_UF || "").trim().toUpperCase()

  if (fullName) {
    const fullMatches = (nameMap.get(fullName) ?? []).filter(
      (candidato) => normalizeForMatch(candidato.nome_completo) === fullName
    )

    if (fullMatches.length > 0) {
      return [...new Map(fullMatches.map((candidato) => [candidato.slug, candidato])).values()]
    }
  }

  if (!urnaName) {
    return []
  }

  const urnaMatches = (nameMap.get(urnaName) ?? []).filter(
    (candidato) => normalizeForMatch(candidato.nome_urna) === urnaName
  )

  if (!rowUf) {
    return []
  }

  return urnaMatches.filter(
    (candidato) => (candidato.estado || "").trim().toUpperCase() === rowUf
  )
}

export async function createTSEResolver(
  candidatos: CandidatoConfig[],
  ano: number
): Promise<TSEResolver> {
  const sqToSlug = new Map<string, string>()
  for (const candidato of candidatos) {
    const sq = candidato.ids.tse_sq_candidato?.[String(ano)]?.trim()
    if (sq) {
      sqToSlug.set(sq, candidato.slug)
    }
  }

  const { data, error } = await supabase
    .from("candidatos")
    .select("slug, cpf")
    .in("slug", candidatos.map((candidato) => candidato.slug))

  if (error) {
    throw new Error(`Falha ao carregar CPF do Supabase: ${error.message}`)
  }

  const cpfToSlug = new Map<string, string>()
  for (const row of (data ?? []) as CandidatoDBRow[]) {
    const cpf = normalizeCPF(row.cpf || "")
    if (cpf) {
      cpfToSlug.set(cpf, row.slug)
    }
  }

  const nameMap = buildNameMap(candidatos)
  const stats: ResolverStats = {
    sqPreloaded: 0,
    cpf: 0,
    nameUnique: 0,
    nameUf: 0,
    ambiguous: 0,
    noMatch: 0,
  }
  const ambiguousSlugs = new Set<string>()

  return {
    resolveRow(row) {
      const sq = (row.SQ_CANDIDATO || "").trim()
      if (sq) {
        const slug = sqToSlug.get(sq)
        if (slug) {
          stats.sqPreloaded++
          return { slug, method: "sq-preloaded" }
        }
      }

      const cpf = normalizeCPF(row.NR_CPF_CANDIDATO || "")
      if (cpf) {
        const slug = cpfToSlug.get(cpf)
        if (slug) {
          stats.cpf++
          return { slug, method: "cpf" }
        }
      }

      const matches = getCandidateMatches(row, nameMap)
      if (matches.length === 0) {
        stats.noMatch++
        return null
      }

      if (matches.length === 1) {
        stats.nameUnique++
        return { slug: matches[0].slug, method: "name-unique" }
      }

      const rowUf = (row.SG_UF || "").trim().toUpperCase()
      if (rowUf) {
        const ufMatches = matches.filter(
          (candidato) => (candidato.estado || "").trim().toUpperCase() === rowUf
        )

        if (ufMatches.length === 1) {
          stats.nameUf++
          return { slug: ufMatches[0].slug, method: "name-uf" }
        }

        if (ufMatches.length > 1) {
          for (const candidato of ufMatches) {
            ambiguousSlugs.add(candidato.slug)
          }
          stats.ambiguous++
          return null
        }
      }

      for (const candidato of matches) {
        ambiguousSlugs.add(candidato.slug)
      }
      stats.ambiguous++
      return null
    },
    stats,
    get ambiguousSlugs() {
      return [...ambiguousSlugs]
    },
  }
}
