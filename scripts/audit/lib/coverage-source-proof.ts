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
  identity: {
    slug: string
    candidate_id: string
    source_id: string
    house?: "camara" | "senado"
    roster_url?: string
    roster_sha256?: string
  }
}

const PROFILE_FIELDS = [
  "partido_sigla", "situacao_candidatura", "foto_url", "biografia",
  "naturalidade", "data_nascimento", "formacao", "profissao_declarada",
  "genero", "estado_civil", "cor_raca",
] as const

const FAMILY_FIELD: Partial<Record<CoverageFamily, string>> = {
  historico_politico: "historico",
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
    if (["perfil_atual", "historico_politico", "patrimonio", "financiamento"].includes(family)) {
      return ["dadosabertos.tse.jus.br", "cdn.tse.jus.br", "www.tse.jus.br"].includes(parsed.hostname)
    }
    if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
      return ["dadosabertos.camara.leg.br", "legis.senado.leg.br", "adm.senado.gov.br", "www.senado.leg.br", "www.camara.leg.br"].includes(parsed.hostname)
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
  if (!proof || proof.family !== family || proof.method !== "official-source-to-public-readback" || proof.scope_complete !== true) return false
  const identity = object(proof.identity)
  if (!identity || identity.slug !== profile.slug || identity.candidate_id !== (profile.id ?? profile.candidato_id ?? profile.candidate_id)) return false
  if (typeof identity.source_id !== "string" || !identity.source_id.trim()) return false
  if (proof.public_payload_sha256 !== publicFamilyPayloadSha256(profile, family)) return false
  if (!isNonnegativeInteger(proof.source_rows) || !isNonnegativeInteger(proof.public_rows) || !isNonnegativeInteger(proof.matched_rows) || !isNonnegativeInteger(proof.unmatched_rows)) return false
  const actualRows = publicFamilyRowCount(profile, family)
  if (actualRows < 0 || proof.public_rows !== actualRows || proof.matched_rows !== actualRows || proof.unmatched_rows !== 0 || (proof.source_rows as number) < actualRows) return false
  const revisions = proof.source_revisions
  if (!Array.isArray(revisions) || !revisions.length || revisions.some((revision) => {
    const row = object(revision)
    return !row || typeof row.url !== "string" || !officialHost(family, row.url) || !isSha256(row.sha256) ||
      (row.year !== undefined && (!isNonnegativeInteger(row.year) || row.year < 1900 || row.year > 2100))
  })) return false
  if (typeof receipt.url !== "string" || !revisions.some((revision) => object(revision)?.url === receipt.url)) return false
  if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
    if (identity.house !== "camara" && identity.house !== "senado") return false
    if (typeof identity.roster_url !== "string" || !officialHost(family, identity.roster_url) || !isSha256(identity.roster_sha256)) return false
    const ids = object(profile.ids)
    const publicId = ids?.[identity.house]
    if (publicId !== undefined && publicId !== null && String(publicId) !== identity.source_id) return false
  }
  return true
}
