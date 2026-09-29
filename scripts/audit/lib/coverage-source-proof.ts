import { createHash } from "node:crypto"

import type { CoverageFamily, CoverageProfile } from "../audit-cobertura-fichas"

export type CoverageSourceRevision = {
  url: string
  sha256: string
  year?: number
}

export type CoverageSourceProof = {
  family: CoverageFamily
  method: "official-source-to-public-readback"
  source_revisions: CoverageSourceRevision[]
  public_payload_sha256: string
  source_rows: number
  public_rows: number
  matched_rows: number
  unmatched_rows: number
  scope_complete: boolean
  scope?: "tse-candidacies" | "display-series"
  identity: {
    slug: string
    candidate_id: string
    source_id: string
    house?: "camara" | "senado"
    roster_url?: string
    roster_sha256?: string
  }
}

/** A party-history cell needs both parliamentary tenure and TSE candidacy scope. */
export type PartyHistoryComponent = {
  component: "parlamentar" | "candidatura"
  candidate_slug: string
  scope_complete: true
  identity: "official-parliamentary-id-or-verified-absence" | "tse-sq-candidato"
  source_revisions: CoverageSourceRevision[]
}

const PROFILE_FIELDS = [
  "partido_sigla", "situacao_candidatura", "foto_url", "biografia",
  "naturalidade", "data_nascimento", "formacao", "profissao_declarada",
  "genero", "estado_civil", "cor_raca",
] as const

const FAMILY_FIELD: Partial<Record<CoverageFamily, string>> = {
  historico_politico: "historico",
  mudancas_partido: "mudancas_partido",
  patrimonio: "patrimonio_eleicoes",
  financiamento: "financiamento_eleicoes",
  projetos_lei: "projetos_lei",
  votos_candidato: "votos",
  gastos_parlamentares: "gastos_parlamentares",
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function publicFamilyPayload(profile: CoverageProfile, family: CoverageFamily): unknown {
  if (family === "perfil_atual") {
    return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, profile[field] ?? null]))
  }
  if (family === "patrimonio") {
    return { patrimonio_eleicoes: profile.patrimonio_eleicoes ?? null, patrimonio: profile.patrimonio ?? null }
  }
  if (family === "financiamento") {
    return { financiamento_eleicoes: profile.financiamento_eleicoes ?? null, financiamento: profile.financiamento ?? null }
  }
  if (family === "projetos_lei") {
    return {
      projetos_lei: profile.projetos_lei ?? null,
      projetos_lei_total: profile.projetos_lei_total ?? null,
      projetos_lei_camara_total: profile.projetos_lei_camara_total ?? null,
      projetos_lei_senado_total: profile.projetos_lei_senado_total ?? null,
    }
  }
  const field = FAMILY_FIELD[family]
  return field ? profile[field] ?? null : null
}

export function publicFamilyRowCount(profile: CoverageProfile, family: CoverageFamily): number {
  if (family === "perfil_atual") {
    return PROFILE_FIELDS.filter((field) => typeof profile[field] === "string" && (profile[field] as string).trim()).length
  }
  const key = family === "patrimonio" ? "patrimonio_eleicoes" : family === "financiamento" ? "financiamento_eleicoes" : FAMILY_FIELD[family]
  return key && Array.isArray(profile[key]) ? profile[key].length : -1
}

const PARLIAMENTARY_PARTITION_FAMILIES = new Set<CoverageFamily>(["projetos_lei", "votos_candidato", "gastos_parlamentares"])

export function isHousePartitionFamily(family: CoverageFamily): boolean {
  return PARLIAMENTARY_PARTITION_FAMILIES.has(family)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function publicRowHouse(family: CoverageFamily, value: unknown): "camara" | "senado" | null {
  const row = object(value)
  if (!row) return null
  const house = family === "votos_candidato" ? object(row.votacao)?.casa : row.casa
  return house === "camara" || house === "senado" ? house : null
}

/** Returns null when any published row lacks one unambiguous house attribution. */
export function publicFamilyHouseRows(
  profile: CoverageProfile,
  family: CoverageFamily,
): Partial<Record<"camara" | "senado", unknown[]>> | null {
  if (!isHousePartitionFamily(family)) return null
  const rows = family === "projetos_lei" ? profile.projetos_lei : publicFamilyPayload(profile, family)
  if (!Array.isArray(rows)) return null
  const partition: Partial<Record<"camara" | "senado", unknown[]>> = { camara: [], senado: [] }
  for (const row of rows) {
    const house = publicRowHouse(family, row)
    if (!house) return null
    partition[house]!.push(row)
  }
  return partition
}

export function publicHouseSubsetSha256(rows: readonly unknown[]): string {
  return createHash("sha256").update(canonicalJson(rows)).digest("hex")
}

export function publicFamilyPayloadSha256(profile: CoverageProfile, family: CoverageFamily): string {
  return createHash("sha256").update(JSON.stringify(publicFamilyPayload(profile, family))).digest("hex")
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function officialHost(family: CoverageFamily, url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    // Histórico: mandato de senador tem como fonte o exercício datado no Senado
    // (senador/{id}/mandatos.json); candidatura e eleição seguem no TSE.
    if (family === "historico_politico") {
      return ["dadosabertos.tse.jus.br", "cdn.tse.jus.br", "www.tse.jus.br", "legis.senado.leg.br"].includes(parsed.hostname)
    }
    if (["perfil_atual", "patrimonio", "financiamento"].includes(family)) {
      return ["dadosabertos.tse.jus.br", "cdn.tse.jus.br", "www.tse.jus.br"].includes(parsed.hostname)
    }
    if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
      return ["dadosabertos.camara.leg.br", "legis.senado.leg.br", "adm.senado.gov.br", "www.senado.leg.br", "www.camara.leg.br"].includes(parsed.hostname)
    }
    if (family === "mudancas_partido") {
      return ["dadosabertos.camara.leg.br", "legis.senado.leg.br", "dadosabertos.tse.jus.br", "cdn.tse.jus.br", "www.tse.jus.br"].includes(parsed.hostname)
    }
    return false
  } catch {
    return false
  }
}

/** A receipt certifies only the exact public payload it compared. */
export function validCoverageSourceProof(
  profile: CoverageProfile,
  family: CoverageFamily,
  receipt: Record<string, unknown>,
): boolean {
  const proof = object(receipt.coverage_proof)
  if (!proof || proof.family !== family || proof.scope_complete !== true) return false
  const identity = object(proof.identity)
  if (!identity || identity.slug !== profile.slug || identity.candidate_id !== (profile.id ?? profile.candidato_id ?? profile.candidate_id)) return false
  if (typeof identity.source_id !== "string" || !identity.source_id.trim()) return false
  if (proof.public_payload_sha256 !== publicFamilyPayloadSha256(profile, family)) return false
  if (proof.method !== "official-source-to-public-readback") return false
  if (!isNonnegativeInteger(proof.source_rows) || !isNonnegativeInteger(proof.public_rows) || !isNonnegativeInteger(proof.matched_rows) || !isNonnegativeInteger(proof.unmatched_rows)) return false
  const actualRows = family === "historico_politico" && proof.scope === "tse-candidacies"
    ? (Array.isArray(profile.historico) ? profile.historico : []).filter((row) => {
        const item = object(row)
        return String(item?.proveniencia ?? "").trim().toUpperCase() === "TSE" && String(item?.tipo_evento ?? "").trim().toUpperCase() === "CANDIDATURA"
      }).length
    : publicFamilyRowCount(profile, family)
  // A série de bens/contas também publica anos sem linha bruta de bem/receita.
  // A igualdade dos campos exibidos já foi conferida antes de emitir o recibo.
  const displaySeries = (family === "patrimonio" || family === "financiamento") && proof.scope === "display-series"
  if (actualRows < 0) return false
  const revisions = proof.source_revisions
  if (!Array.isArray(revisions) || !revisions.length || revisions.some((revision) => {
    const row = object(revision)
    return !row || typeof row.url !== "string" || !officialHost(family, row.url) || !isSha256(row.sha256) ||
      (row.year !== undefined && (!isNonnegativeInteger(row.year) || row.year < 1900 || row.year > 2100))
  })) return false
  if (typeof receipt.url !== "string" || !revisions.some((revision) => object(revision)?.url === receipt.url)) return false
  if (isHousePartitionFamily(family)) {
    const house = identity.house
    const partitions = object(proof.house_partition)
    const publicByHouse = publicFamilyHouseRows(profile, family)
    if ((house !== "camara" && house !== "senado") || !partitions || !publicByHouse) return false
    if (partitions.casa !== house) return false
    const publicRows = publicByHouse[house]!
    if (!isNonnegativeInteger(partitions.public_rows) || partitions.public_rows !== publicRows.length ||
        !isSha256(partitions.public_subset_sha256) || partitions.public_subset_sha256 !== publicHouseSubsetSha256(publicRows) ||
        !isNonnegativeInteger(partitions.public_total_rows) ||
        !isNonnegativeInteger(partitions.source_rows) || !isNonnegativeInteger(partitions.matched_rows) ||
        !isNonnegativeInteger(partitions.unmatched_rows) || partitions.matched_rows !== publicRows.length ||
        partitions.unmatched_rows !== 0 || partitions.source_rows !== partitions.public_total_rows ||
        partitions.public_total_rows < publicRows.length) return false
    if (family === "projetos_lei") {
      const totalField = house === "camara" ? "projetos_lei_camara_total" : "projetos_lei_senado_total"
      if (!isNonnegativeInteger(profile[totalField]) || partitions.public_total_rows !== profile[totalField]) return false
    } else if (partitions.public_total_rows !== publicRows.length) {
      return false
    }
    if (proof.public_rows !== publicRows.length || proof.matched_rows !== publicRows.length ||
        proof.unmatched_rows !== 0 || proof.source_rows !== partitions.source_rows) return false
    const source = typeof receipt.fonte === "string" ? receipt.fonte.toLocaleLowerCase() : ""
    const sourceHouse = source.startsWith("camara") ? "camara" : source.startsWith("senado") || source === "ceaps-senado" ? "senado" : null
    if (sourceHouse !== house) return false
  } else if (proof.public_rows !== actualRows || proof.matched_rows !== actualRows || proof.unmatched_rows !== 0 ||
      (!displaySeries && (proof.source_rows as number) < actualRows)) {
    return false
  }
  if (family === "mudancas_partido") {
    const components = proof.components
    if (!Array.isArray(components) || components.length !== 2) return false
    const expected = new Map([
      ["parlamentar", { identity: "official-parliamentary-id-or-verified-absence", hosts: new Set(["dadosabertos.camara.leg.br", "legis.senado.leg.br"]) }],
      ["candidatura", { identity: "tse-sq-candidato", hosts: new Set(["dadosabertos.tse.jus.br", "cdn.tse.jus.br", "www.tse.jus.br"]) }],
    ])
    for (const componentValue of components) {
      const component = object(componentValue)
      const rule = expected.get(String(component?.component))
      if (!component || !rule || component.candidate_slug !== profile.slug || component.scope_complete !== true || component.identity !== rule.identity) return false
      const componentRevisions = component.source_revisions
      if (!Array.isArray(componentRevisions) || componentRevisions.length === 0 || componentRevisions.some((value) => {
        const revision = object(value)
        if (!revision || typeof revision.url !== "string" || !isSha256(revision.sha256)) return true
        try {
          return !rule.hosts.has(new URL(revision.url).hostname) || !revisions.some((top) => {
            const listed = object(top)
            return listed?.url === revision.url && listed?.sha256 === revision.sha256
          })
        } catch { return true }
      })) return false
      expected.delete(String(component.component))
    }
    if (expected.size !== 0) return false
  }
  if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
    if (identity.house !== "camara" && identity.house !== "senado") return false
    if (typeof identity.roster_url !== "string" || !officialHost(family, identity.roster_url) || !isSha256(identity.roster_sha256)) return false
    const ids = object(profile.ids)
    const publicId = ids?.[identity.house]
    if (publicId !== undefined && publicId !== null && String(publicId) !== identity.source_id) return false
  }
  return true
}
