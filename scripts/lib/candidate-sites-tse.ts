import { stripAccents } from "../../src/lib/strip-accents"
import {
  canonicalCandidateSiteUrlKey,
  parsePublicCandidateSiteUrl,
} from "../../src/lib/candidate-sites"

export interface PerfilSitesTse {
  slug: string
  nome_completo: string
  cargo_disputado?: string | null
  estado?: string | null
  ids?: { tse_sq_candidato?: Record<string, string> | null } | null
}

export interface LinhaCandidatoTse {
  SQ_CANDIDATO: string
  NM_CANDIDATO: string
  SG_UF: string
  DS_CARGO: string
}

export interface LinhaSiteCandidatoTse {
  DT_GERACAO: string
  HH_GERACAO: string
  SQ_CANDIDATO: string
  NR_ORDEM_REDE_SOCIAL: string
  DS_URL: string
}

export interface ReciboSitesTse {
  fetched_at: string
  catalog_url: string
  catalog_license?: string | null
  resources: Array<{ name: string; url: string; sha256: string }>
}

export interface CandidateSitesTseDataset {
  schema_version: 1
  election_year: 2026
  source: {
    catalog_url: string
    candidate_resource_url: string
    candidate_resource_sha256: string
    resource_url: string
    resource_sha256: string
    license: string | null
    collected_at: string
    generated_at_tse: string | null
  }
  counts: {
    profiles_total: number
    profiles_matched: number
    profiles_with_sites: number
    site_rows: number
    unique_entries: number
    unique_sites: number
    non_linkable_entries: number
    duplicate_rows_removed: number
    ambiguous_profiles: number
  }
  ambiguous_profiles: Array<{ slug: string; sq_candidato: string[] }>
  candidates: Record<
    string,
    {
      sq_candidato: string
      match_method: "sq_candidato" | "nome_completo_exato_unico"
      sites: Array<{ order: number; url: string | null; original_url: string }>
    }
  >
}

const HTTP_SCHEME_RE = /^https?:\/\//i
const BARE_DOMAIN_RE = /^[^\s/?#]+\.[^\s]+$/

function normalizeName(value: string): string {
  return stripAccents(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR")
}

function matchesProfileScope(profile: PerfilSitesTse, candidate: LinhaCandidatoTse): boolean {
  const cargo = normalizeName(profile.cargo_disputado ?? "")
  if (!cargo || cargo === "NENHUM" || normalizeName(candidate.DS_CARGO) !== cargo) return false

  const expectedUf = cargo === "PRESIDENTE" ? "BR" : profile.estado?.trim().toUpperCase()
  return Boolean(expectedUf) && candidate.SG_UF.trim().toUpperCase() === expectedUf
}

function normalizeHttpUrl(value: string): URL | null {
  const raw = value.trim()
  const explicitUrl = raw.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;]+$/, "")
  const bareDomain = raw.match(/(?:^|[\s:])([^\s@:/]+(?:\.[^\s@:/]+)+(?:\/[^\s]*)?)/i)?.[1]
  const candidate = explicitUrl
    ? explicitUrl
    : HTTP_SCHEME_RE.test(raw)
      ? raw
      : BARE_DOMAIN_RE.test(raw)
        ? `https://${raw}`
        : bareDomain
          ? `https://${bareDomain.replace(/[),.;-]+$/, "")}`
          : null
  if (!candidate) return null

  try {
    return parsePublicCandidateSiteUrl(candidate)
  } catch {
    return null
  }
}

function parseOrder(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`ordem de site invalida no TSE: ${JSON.stringify(value)}`)
  }
  return parsed
}

function latestTseGeneration(rows: LinhaSiteCandidatoTse[]): string | null {
  const values = rows
    .map((row) => `${row.DT_GERACAO.trim()} ${row.HH_GERACAO.trim()}`.trim())
    .filter(Boolean)
  return values.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).at(-1) ?? null
}

export function buildCandidateSitesTseDataset({
  profiles,
  candidates,
  socialRows,
  receipt,
}: {
  profiles: PerfilSitesTse[]
  candidates: LinhaCandidatoTse[]
  socialRows: LinhaSiteCandidatoTse[]
  receipt: ReciboSitesTse
}): CandidateSitesTseDataset {
  const socialResource = receipt.resources.find(
    (resource) => resource.name === "Redes sociais de candidatos",
  )
  if (!socialResource) throw new Error("recibo sem o recurso Redes sociais de candidatos")
  const candidateResource = receipt.resources.find((resource) => resource.name === "Candidatos")
  if (!candidateResource) throw new Error("recibo sem o recurso Candidatos")

  const candidateBySq = new Map<string, LinhaCandidatoTse>()
  const candidatesByName = new Map<string, LinhaCandidatoTse[]>()
  for (const row of candidates) {
    const sq = row.SQ_CANDIDATO.trim()
    if (!sq) continue
    candidateBySq.set(sq, row)
    const normalizedName = normalizeName(row.NM_CANDIDATO)
    const sameName = candidatesByName.get(normalizedName) ?? []
    sameName.push(row)
    candidatesByName.set(normalizedName, sameName)
  }

  const sitesBySq = new Map<string, LinhaSiteCandidatoTse[]>()
  for (const row of socialRows) {
    const sq = row.SQ_CANDIDATO.trim()
    if (!sq) continue
    const rows = sitesBySq.get(sq) ?? []
    rows.push(row)
    sitesBySq.set(sq, rows)
  }

  const output: CandidateSitesTseDataset["candidates"] = {}
  const ambiguousProfiles: CandidateSitesTseDataset["ambiguous_profiles"] = []
  let matchedProfiles = 0
  let sourceSiteRows = 0
  let uniqueEntries = 0
  let uniqueSites = 0
  let nonLinkableEntries = 0

  for (const profile of profiles) {
    const declaredSq = profile.ids?.tse_sq_candidato?.["2026"]?.trim()
    let match: LinhaCandidatoTse | null = null
    let matchMethod: "sq_candidato" | "nome_completo_exato_unico" = "sq_candidato"

    // O SQ 2026 curado é a identidade primária. Nomes podem estar desatualizados;
    // se o SQ não existir no pacote atual, falha fechado sem fallback nominal.
    if (declaredSq) {
      match = candidateBySq.get(declaredSq) ?? null
    } else {
      const exactNameMatches = (candidatesByName.get(normalizeName(profile.nome_completo)) ?? [])
        .filter((candidate) => matchesProfileScope(profile, candidate))
      if (exactNameMatches.length === 1) {
        match = exactNameMatches[0]
        matchMethod = "nome_completo_exato_unico"
      } else if (exactNameMatches.length > 1) {
        ambiguousProfiles.push({
          slug: profile.slug,
          sq_candidato: exactNameMatches.map((row) => row.SQ_CANDIDATO).sort(),
        })
      }
    }

    if (!match) continue
    matchedProfiles += 1

    const sourceRows = [...(sitesBySq.get(match.SQ_CANDIDATO) ?? [])].sort(
      (a, b) => parseOrder(a.NR_ORDEM_REDE_SOCIAL) - parseOrder(b.NR_ORDEM_REDE_SOCIAL),
    )
    if (sourceRows.length === 0) continue
    sourceSiteRows += sourceRows.length

    const seen = new Set<string>()
    const sites: CandidateSitesTseDataset["candidates"][string]["sites"] = []
    for (const row of sourceRows) {
      const parsed = normalizeHttpUrl(row.DS_URL)
      const originalUrl = row.DS_URL.trim()
      const key = parsed
        ? `url:${canonicalCandidateSiteUrlKey(parsed)}`
        : `raw:${normalizeName(originalUrl)}`
      if (seen.has(key)) continue
      seen.add(key)
      uniqueEntries += 1
      if (parsed) uniqueSites += 1
      else nonLinkableEntries += 1
      sites.push({
        order: parseOrder(row.NR_ORDEM_REDE_SOCIAL),
        url: parsed?.toString() ?? null,
        original_url: originalUrl,
      })
    }

    if (sites.length > 0) {
      output[profile.slug] = {
        sq_candidato: match.SQ_CANDIDATO,
        match_method: matchMethod,
        sites,
      }
    }
  }

  return {
    schema_version: 1,
    election_year: 2026,
    source: {
      catalog_url: receipt.catalog_url,
      candidate_resource_url: candidateResource.url,
      candidate_resource_sha256: candidateResource.sha256,
      resource_url: socialResource.url,
      resource_sha256: socialResource.sha256,
      license: receipt.catalog_license ?? null,
      collected_at: receipt.fetched_at,
      generated_at_tse: latestTseGeneration(socialRows),
    },
    counts: {
      profiles_total: profiles.length,
      profiles_matched: matchedProfiles,
      profiles_with_sites: Object.keys(output).length,
      site_rows: sourceSiteRows,
      unique_entries: uniqueEntries,
      unique_sites: uniqueSites,
      non_linkable_entries: nonLinkableEntries,
      duplicate_rows_removed: sourceSiteRows - uniqueEntries,
      ambiguous_profiles: ambiguousProfiles.length,
    },
    ambiguous_profiles: ambiguousProfiles.sort((a, b) => a.slug.localeCompare(b.slug)),
    candidates: Object.fromEntries(
      Object.entries(output).sort(([slugA], [slugB]) => slugA.localeCompare(slugB)),
    ),
  }
}
