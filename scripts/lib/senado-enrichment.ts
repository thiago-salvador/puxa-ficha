import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { isDeepStrictEqual } from "node:util"

import { INGEST_TASKS, runIngestTask, type IngestTask } from "../ingest-all"
import { entradaDeResultado, EXECUCAO, registrarColetaDeResultados } from "./coleta-log"
import { withExplicitCohort } from "./cohort-context"
import { supabase } from "./supabase"
import type { CandidatoConfig, IngestResult } from "./types"
import { ingestTSE } from "./ingest-tse"
import { stripAccents } from "../../src/lib/strip-accents"
import { emDryRun } from "./dry-run"

export type SenadoSourceStatus = "available" | "lead_requires_tse_validation" | "absence_observed"
type SenadoHistoricalMatch = { ano: number; sq_candidato: string; uf: string; sg_ue?: string; cargo?: string; cpf_match?: boolean; [key: string]: unknown }

export interface SenadoSourceManifestEntry {
  source_id: string
  url: string
  status: SenadoSourceStatus
  checked_at?: string
  collector_applicability?: string[]
  evidence?: { artifact?: string; sha256?: string; bytes?: number }
  [key: string]: unknown
}

export interface SenadoIdentityOverride {
  source_id?: string
  source_ids?: string[]
  wikipedia_title?: string
  wikidata_id?: string
  tse_sq_candidato?: Record<string, string>
  tse_uf_candidatura?: Record<string, string>
  camara?: number | null
  senado?: number | null
  verified_tse_sources?: Array<{
    ano: number
    url: string
    sha256: string
    sq_candidato: string
    uf: string
    local_path?: string
  }>
  provenance?: {
    artifact?: string
    anchor_2026_sq?: string
    method?: string
    historical_matches?: SenadoHistoricalMatch[]
  }
}

export interface SenadoSourceManifest {
  schema_version: string
  generated_at: string
  identity_key: {
    sq_candidato: string
    ano_eleicao: number
    uf: string
    cargo: string
    nome_completo: string
    nome_urna: string
    partido: string
    [key: string]: unknown
  }
  sources: SenadoSourceManifestEntry[]
  identity_overrides?: Record<string, SenadoIdentityOverride>
  overrides?: Record<string, SenadoIdentityOverride>
  curated_profile?: {
    biography: string
    source_ids: string[]
    checked_at?: string
  }
  curated_media?: SenadoCuratedMediaItem[]
  curated_networks?: SenadoCuratedNetworkItem[]
  curated_network_receipt?: SenadoCuratedNetworksManifest["source_receipt"]
  curated_profile_fields?: SenadoCuratedProfileFieldsManifest["fields"]
  curated_federal_receipts?: SenadoFederalReceipt[]
  [key: string]: unknown
}

export interface SenadoCuratedMediaItem {
  source_id: string
  title: string
  url: string
  source: string
  published_at: string
  author_attribution?: string
  identity_evidence?: string
}

export interface SenadoCuratedMediaManifest {
  schema_version: string
  generated_at?: string
  identity: { sq_candidato: string; uf: string; nome_completo: string }
  selected_media: SenadoCuratedMediaItem[]
}

export interface SenadoCuratedNetworkItem {
  source_id: string
  network: string
  url: string
  checked_at?: string
  identity_evidence?: string
  public_metrics?: {
    followers?: number
    source_id: string
    source_url: string
    checked_at: string
    precision?: string
  }
}

export interface SenadoCuratedNetworksManifest {
  schema_version: string
  generated_at?: string
  identity: { sq_candidato: string; uf: string; nome_completo: string }
  source_receipt: { source_id: string; url: string; checked_at: string; sha256?: string }
  declared_sites: SenadoCuratedNetworkItem[]
}

export interface SenadoCuratedProfileFieldsManifest {
  schema_version: string
  generated_at?: string
  identity: { sq_candidato: string; uf: string; nome_completo: string }
  source_receipts: Array<{ source_id: string; url: string; checked_at: string; identity_evidence?: string }>
  fields: { formacao_instituicao?: { value: string; source_ids: string[]; qualification?: string } }
}

export type SenadoFederalReceiptResult = "sem_achado_no_escopo" | "nao_aplicavel" | "indeterminado"

export interface SenadoFederalReceipt {
  source: "camara" | "senado" | "ceaps-senado" | "jarbas"
  source_ids: string[]
  resultado: SenadoFederalReceiptResult
  checked_at: string
  urls: string[]
  escopo: string
  detalhe: string
  readback: { registry_source_ids: string[]; identity_search_terms: string[]; persisted: boolean }
}

export interface SenadoFederalReceiptManifest {
  schema_version: string
  generated_at: string
  identity: { sq_candidato: string; uf: string; nome_completo: string }
  receipts: SenadoFederalReceipt[]
}

export interface PublishedSenadoCandidate {
  id: string
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: "Senador"
  estado: string
  publicavel: boolean
  sq_candidato_2026: string
  partido_sigla?: string | null
  wikipedia_title?: string | null
  wikidata_id?: string | null
  fonte_dados?: unknown
  biografia?: string | null
  formacao_instituicao?: string | null
  verificacao_campos?: Record<string, unknown> | null
  ids?: Partial<CandidatoConfig["ids"]>
  [key: string]: unknown
}

export interface SenadoEnrichmentConfig {
  candidate: PublishedSenadoCandidate
  config: CandidatoConfig
  manifest: SenadoSourceManifest
  identity_sources: string[]
  identity_receipts: SenadoIdentityOverride["verified_tse_sources"]
}

export type SenadoEnrichmentPlanState = "ready" | "indeterminado" | "nao_aplicavel"

export interface SenadoEnrichmentSourcePlan {
  source: string
  state: SenadoEnrichmentPlanState
  collector: string | null
  source_ids: string[]
  source_statuses: Record<string, SenadoSourceStatus>
  detail: string
}

export interface SenadoEnrichmentRun {
  config: SenadoEnrichmentConfig
  plans: SenadoEnrichmentSourcePlan[]
  results: IngestResult[]
  status: "success" | "partial" | "error"
  exit_code: 0 | 1
}

export interface CuratedProfilePatch {
  biography: string
  verification: Record<string, unknown>
  source_ids: string[]
}

export interface CuratedProfileFieldsPatch {
  formacao_instituicao: string
  verification: Record<string, unknown>
  source_ids: string[]
}

export function buildCuratedProfileFieldsPatch(enrichment: SenadoEnrichmentConfig): CuratedProfileFieldsPatch | null {
  const field = enrichment.manifest.curated_profile_fields?.formacao_instituicao
  if (!field?.value?.trim() || field.source_ids.length === 0) return null
  const sourceMap = manifestSourceMap(enrichment.manifest)
  const sourceIds = [...new Set(field.source_ids.map(clean).filter(Boolean))]
  if (sourceIds.length !== field.source_ids.length) throw new Error("campo curado com source_id vazio ou duplicado")
  const consulted = sourceIds.map((id) => {
    const source = sourceMap.get(id)
    if (!source || source.status !== "available" || !source.checked_at) throw new Error(`campo curado cita fonte não validada: ${id}`)
    return { source_id: id, url: source.url, checked_at: source.checked_at }
  })
  return {
    formacao_instituicao: field.value.trim(),
    source_ids: sourceIds,
    verification: {
      estado: "publicado",
      verificado_em: enrichment.manifest.generated_at,
      fonte: "curadoria",
      qualificacao: field.qualification ?? "descrição declaratória da fonte; não prova diploma conferido",
      fontes_consultadas: consulted,
      escopo: `formação institucional curada para ${enrichment.candidate.slug}; identidade ancorada no SQ ${enrichment.candidate.sq_candidato_2026}`,
    },
  }
}

export function buildCuratedProfilePatch(enrichment: SenadoEnrichmentConfig): CuratedProfilePatch | null {
  const profile = enrichment.manifest.curated_profile
  if (!profile?.biography?.trim() || profile.source_ids.length === 0) return null
  const sourceMap = manifestSourceMap(enrichment.manifest)
  const sourceIds = [...new Set(profile.source_ids.map(clean).filter(Boolean))]
  if (sourceIds.length !== profile.source_ids.length) throw new Error("biografia curada com source_id vazio ou duplicado")
  const consulted = sourceIds.map((id) => {
    const source = sourceMap.get(id)
    if (!source || source.status !== "available" || !source.checked_at) throw new Error(`biografia curada cita fonte não validada: ${id}`)
    return { source_id: id, url: source.url, checked_at: source.checked_at, ...(source.evidence ?? {}) }
  })
  if (profile.biography.trim().length < 20 || profile.biography.trim().length > 4000) throw new Error("biografia curada fora do tamanho permitido")
  const current = enrichment.candidate.verificacao_campos?.biografia
  const frozen = current && typeof current === "object" && ((current as Record<string, unknown>).estado === "congelado" || (current as Record<string, unknown>).freeze === true)
  if (frozen) return null
  return {
    biography: profile.biography.trim(),
    source_ids: sourceIds,
    verification: {
      estado: "publicado",
      verificado_em: profile.checked_at ?? enrichment.manifest.generated_at,
      fonte: "curadoria",
      fontes_consultadas: consulted,
      escopo: `biografia curada para ${enrichment.candidate.slug}; identidade ancorada no SQ ${enrichment.candidate.sq_candidato_2026}`,
    },
  }
}

const TASK_SOURCES = new Set(INGEST_TASKS.map((task) => task.source))
const CURATED_PROFILE_SOURCE = "curated-profile"
const CURATED_MEDIA_SOURCE = "curated-media"
const DEFAULT_SOURCES = [
  "tse-situacao", "tse", "tse-historico", "transparencia", "tcu", "sancoes",
  "filiacao", "wikipedia", "wiki-historico", "wikidata", "wikidata-politico",
  "instagram", "google-news", "curated-profile", "curated-media", "curated-networks", "camara", "senado", "ceaps-senado", "jarbas",
] as const

const clean = (value: unknown): string => String(value ?? "").trim()
const normalized = (value: unknown): string => stripAccents(clean(value)).toLocaleUpperCase()
const normalizedName = (value: unknown): string => normalized(value).replace(/[^A-Z0-9]/g, "")
const validWikidataId = (value: unknown): boolean => /^Q[1-9]\d*$/.test(clean(value))

function assertHttps(url: string, label: string): void {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error(`${label} com URL inválida`) }
  if (parsed.protocol !== "https:") throw new Error(`${label} fora de HTTPS`)
}

function assertOfficialTseArchive(url: string, label: string): void {
  const parsed = new URL(url)
  if (parsed.hostname.toLowerCase() !== "cdn.tse.jus.br" || parsed.search || parsed.hash || !/^\/estatistica\/sead\/odsele\/consulta_cand\/consulta_cand(?:_complementar)?_\d{4}\.zip$/i.test(parsed.pathname)) {
    throw new Error(`${label} fora do artefato oficial de candidaturas`)
  }
}

export function readSenadoSourceManifest(path: string): SenadoSourceManifest {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<SenadoSourceManifest>
  if (!parsed.schema_version || !parsed.identity_key || !Array.isArray(parsed.sources)) {
    throw new Error(`manifesto de fontes Senado inválido: ${target}`)
  }
  const identity = parsed.identity_key
  if (identity.ano_eleicao !== 2026 || !clean(identity.sq_candidato) || !clean(identity.uf) || !clean(identity.nome_completo)) {
    throw new Error(`manifesto de fontes Senado sem identidade 2026 completa: ${target}`)
  }
  const ids = new Set<string>()
  for (const source of parsed.sources) {
    if (!source || !clean(source.source_id) || ids.has(source.source_id) || !clean(source.status) || !["available", "lead_requires_tse_validation", "absence_observed"].includes(source.status)) {
      throw new Error(`manifesto de fontes Senado com source_id ausente ou duplicado: ${target}`)
    }
    assertHttps(source.url, `fonte ${source.source_id}`)
    ids.add(source.source_id)
  }
  return parsed as SenadoSourceManifest
}

export function readSenadoBiographyArtifact(path: string, expected?: Pick<SenadoSourceManifest["identity_key"], "sq_candidato" | "uf">): NonNullable<SenadoSourceManifest["curated_profile"]> {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>
  const identity = parsed.identity as Record<string, unknown> | undefined
  const sourceIds = Array.isArray(parsed.source_ids) ? parsed.source_ids.filter((id): id is string => typeof id === "string") : []
  const biography = clean(parsed.biografia)
  if (!identity || !biography || sourceIds.length === 0) throw new Error(`artefato de biografia curada inválido: ${target}`)
  const identitySq = identity.sq_candidato ?? identity.sq_candidato_2026
  if (expected && (identitySq !== expected.sq_candidato || identity.uf !== expected.uf)) throw new Error("artefato de biografia diverge da identidade Senado")
  return { biography, source_ids: sourceIds }
}

export function readSenadoMediaManifest(path: string): SenadoCuratedMediaManifest {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<SenadoCuratedMediaManifest>
  if (!parsed.identity || !Array.isArray(parsed.selected_media)) throw new Error(`manifesto de mídia Senado inválido: ${target}`)
  for (const item of parsed.selected_media) {
    if (!item.source_id || !item.title || !item.source || !item.published_at) throw new Error(`mídia curada sem campos obrigatórios: ${target}`)
    assertHttps(item.url, `mídia ${item.source_id}`)
    if (!Number.isFinite(Date.parse(item.published_at))) throw new Error(`mídia curada sem data válida: ${item.source_id}`)
  }
  return parsed as SenadoCuratedMediaManifest
}

export function readSenadoNetworksManifest(path: string, expected?: Pick<SenadoSourceManifest["identity_key"], "sq_candidato" | "uf">): SenadoCuratedNetworksManifest {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<SenadoCuratedNetworksManifest>
  const identity = parsed.identity
  const receipt = parsed.source_receipt
  if (!identity || !receipt || !Array.isArray(parsed.declared_sites)) throw new Error(`manifesto de redes Senado inválido: ${target}`)
  if (expected && (identity.sq_candidato !== expected.sq_candidato || identity.uf !== expected.uf)) throw new Error("manifesto de redes diverge da identidade Senado")
  if (!clean(receipt.source_id) || !clean(receipt.checked_at) || !Number.isFinite(Date.parse(receipt.checked_at))) throw new Error(`recibo TSE de redes inválido: ${target}`)
  assertHttps(receipt.url, `recibo TSE de redes ${receipt.source_id}`)
  if (new URL(receipt.url).hostname.toLowerCase() !== "divulgacandcontas.tse.jus.br") throw new Error(`recibo de redes fora da UI oficial TSE: ${target}`)
  const ids = new Set<string>()
  for (const item of parsed.declared_sites) {
    if (!item || !clean(item.source_id) || ids.has(item.source_id) || !clean(item.network) || !clean(item.identity_evidence)) throw new Error(`manifesto de redes sem identidade/proveniência: ${target}`)
    assertHttps(item.url, `rede ${item.source_id}`)
    const hostname = new URL(item.url).hostname.toLowerCase().replace(/^www\./, "")
    if (hostname !== "instagram.com" && hostname !== "facebook.com") throw new Error(`rede fora dos domínios suportados: ${item.source_id}`)
    if (!item.checked_at || !Number.isFinite(Date.parse(item.checked_at))) throw new Error(`rede sem data de verificação: ${item.source_id}`)
    if (item.public_metrics) {
      if (typeof item.public_metrics.followers !== "number" || !Number.isSafeInteger(item.public_metrics.followers) || item.public_metrics.followers < 0 || !clean(item.public_metrics.source_id) || !clean(item.public_metrics.source_url) || !item.public_metrics.checked_at || !Number.isFinite(Date.parse(item.public_metrics.checked_at))) throw new Error(`métrica de rede inválida: ${item.source_id}`)
      assertHttps(item.public_metrics.source_url, `fonte da métrica ${item.source_id}`)
    }
    ids.add(item.source_id)
  }
  return parsed as SenadoCuratedNetworksManifest
}

export function readSenadoProfileFieldsManifest(path: string, expected?: Pick<SenadoSourceManifest["identity_key"], "sq_candidato" | "uf">): SenadoCuratedProfileFieldsManifest {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<SenadoCuratedProfileFieldsManifest>
  if (!parsed.identity || !Array.isArray(parsed.source_receipts) || !parsed.fields) throw new Error(`manifesto de campos curados Senado inválido: ${target}`)
  if (expected && (parsed.identity.sq_candidato !== expected.sq_candidato || parsed.identity.uf !== expected.uf)) throw new Error("manifesto de campos curados diverge da identidade Senado")
  const sourceIds = new Set<string>()
  for (const receipt of parsed.source_receipts) {
    if (!receipt || !clean(receipt.source_id) || sourceIds.has(receipt.source_id) || !clean(receipt.url) || !receipt.checked_at || !Number.isFinite(Date.parse(receipt.checked_at))) throw new Error(`recibo de campo curado inválido: ${target}`)
    assertHttps(receipt.url, `recibo de campo ${receipt.source_id}`)
    sourceIds.add(receipt.source_id)
  }
  const field = parsed.fields.formacao_instituicao
  if (field && (!clean(field.value) || !Array.isArray(field.source_ids) || field.source_ids.length === 0 || field.source_ids.some((id) => !sourceIds.has(id)))) throw new Error(`formação institucional sem fonte vinculada: ${target}`)
  return parsed as SenadoCuratedProfileFieldsManifest
}

export function readSenadoFederalReceiptManifest(path: string, expected?: Pick<SenadoSourceManifest["identity_key"], "sq_candidato" | "uf">): SenadoFederalReceiptManifest {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Partial<SenadoFederalReceiptManifest>
  const identity = parsed.identity
  if (!identity || !Array.isArray(parsed.receipts) || !clean(parsed.schema_version) || !clean(parsed.generated_at)) throw new Error(`manifesto de recibos federais Senado inválido: ${target}`)
  if (!clean(identity.sq_candidato) || !clean(identity.uf) || !clean(identity.nome_completo)) throw new Error(`manifesto de recibos federais Senado sem identidade completa: ${target}`)
  if (expected && (identity.sq_candidato !== expected.sq_candidato || identity.uf !== expected.uf)) throw new Error("manifesto de recibos federais diverge da identidade Senado")
  const sources = new Set<string>()
  for (const receipt of parsed.receipts) {
    if (!receipt || sources.has(receipt.source) || !["camara", "senado", "ceaps-senado", "jarbas"].includes(receipt.source) || !["sem_achado_no_escopo", "nao_aplicavel", "indeterminado"].includes(receipt.resultado) || !receipt.checked_at || !Number.isFinite(Date.parse(receipt.checked_at)) || !Array.isArray(receipt.source_ids) || receipt.source_ids.length === 0 || new Set(receipt.source_ids).size !== receipt.source_ids.length || !Array.isArray(receipt.urls) || receipt.urls.length !== receipt.source_ids.length || !clean(receipt.escopo) || !clean(receipt.detalhe) || !receipt.readback || !Array.isArray(receipt.readback.registry_source_ids) || !Array.isArray(receipt.readback.identity_search_terms) || receipt.readback.registry_source_ids.some((id) => !receipt.source_ids.includes(id))) throw new Error(`recibo federal inválido no manifesto: ${target}`)
    for (const url of receipt.urls) assertHttps(url, `recibo federal ${receipt.source}`)
    sources.add(receipt.source)
  }
  return parsed as SenadoFederalReceiptManifest
}

export function attachSenadoCuratedArtifacts(
  manifest: SenadoSourceManifest,
  biography?: NonNullable<SenadoSourceManifest["curated_profile"]>,
  media?: SenadoCuratedMediaManifest,
  networks?: SenadoCuratedNetworksManifest,
  profileFields?: SenadoCuratedProfileFieldsManifest,
  federalReceipts?: SenadoFederalReceiptManifest,
): SenadoSourceManifest {
  if (media && (media.identity.sq_candidato !== manifest.identity_key.sq_candidato || media.identity.uf !== manifest.identity_key.uf)) throw new Error("manifesto de mídia diverge da identidade Senado")
  if (networks && (networks.identity.sq_candidato !== manifest.identity_key.sq_candidato || networks.identity.uf !== manifest.identity_key.uf)) throw new Error("manifesto de redes diverge da identidade Senado")
  if (profileFields && (profileFields.identity.sq_candidato !== manifest.identity_key.sq_candidato || profileFields.identity.uf !== manifest.identity_key.uf)) throw new Error("manifesto de campos curados diverge da identidade Senado")
  if (federalReceipts && (federalReceipts.identity.sq_candidato !== manifest.identity_key.sq_candidato || federalReceipts.identity.uf !== manifest.identity_key.uf)) throw new Error("manifesto de recibos federais diverge da identidade Senado")
  const mediaItems = media?.selected_media ?? []
  const networkItems = networks?.declared_sites ?? []
  const existing = new Set(manifest.sources.map((source) => source.source_id))
  const mediaSources = mediaItems.filter((item) => !existing.has(item.source_id)).map((item) => ({ source_id: item.source_id, url: item.url, status: "available" as const, checked_at: media?.generated_at ?? new Date().toISOString(), collector_applicability: ["google-news", "manual-provenance-review"] }))
  const networkReceipt = networks?.source_receipt
  const receiptSource = networkReceipt && !existing.has(networkReceipt.source_id) ? [{ source_id: networkReceipt.source_id, url: networkReceipt.url, status: "available" as const, checked_at: networkReceipt.checked_at, collector_applicability: ["curated-networks"] }] : []
  const networkSources = networkItems.filter((item) => !existing.has(item.source_id) && item.source_id !== networkReceipt?.source_id).map((item) => ({ source_id: item.source_id, url: item.url, status: "available" as const, checked_at: item.checked_at ?? networks?.generated_at ?? new Date().toISOString(), collector_applicability: ["curated-networks"] }))
  const fieldSources = (profileFields?.source_receipts ?? []).filter((receipt) => !existing.has(receipt.source_id)).map((receipt) => ({ source_id: receipt.source_id, url: receipt.url, status: "available" as const, checked_at: receipt.checked_at, collector_applicability: ["curated-profile"] }))
  const federalSources = (federalReceipts?.receipts ?? []).flatMap((receipt) => receipt.source_ids.map((sourceId, index) => existing.has(sourceId) ? null : ({ source_id: sourceId, url: receipt.urls[index] ?? receipt.urls[0]!, status: "absence_observed" as const, checked_at: receipt.checked_at, collector_applicability: [receipt.source] }))).filter((source): source is NonNullable<typeof source> => Boolean(source))
  return { ...manifest, sources: [...manifest.sources, ...mediaSources, ...receiptSource, ...networkSources, ...fieldSources, ...federalSources], ...(biography ? { curated_profile: biography } : {}), ...(mediaItems.length ? { curated_media: mediaItems } : {}), ...(networkItems.length ? { curated_networks: networkItems } : {}), ...(networkReceipt ? { curated_network_receipt: networkReceipt } : {}), ...(profileFields ? { curated_profile_fields: profileFields.fields } : {}), ...(federalReceipts ? { curated_federal_receipts: federalReceipts.receipts } : {}) }
}

/** Lê o patch de identidade sem aceitar campos históricos sem recibo. */
export function readSenadoIdentityOverride(path: string): SenadoIdentityOverride {
  const target = resolve(path)
  const parsed = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>
  const ids = parsed.ids && typeof parsed.ids === "object" ? parsed.ids as Record<string, unknown> : {}
  const artifactName = typeof parsed.source_artifact === "string" ? parsed.source_artifact : undefined
  const artifact = artifactName ? JSON.parse(readFileSync(resolve(dirname(target), artifactName), "utf8")) as Record<string, unknown> : undefined
  const sq = ids.tse_sq_candidato && typeof ids.tse_sq_candidato === "object" ? ids.tse_sq_candidato as Record<string, string> : undefined
  const uf = ids.tse_uf_candidatura && typeof ids.tse_uf_candidatura === "object" ? ids.tse_uf_candidatura as Record<string, string> : undefined
  if (!sq || !uf) throw new Error(`patch de identidade Senado sem IDs TSE: ${target}`)
  const rawSources = Array.isArray(parsed.sources) ? parsed.sources : artifact?.sources
  const sources = Array.isArray(rawSources)
    ? rawSources.map((source) => source && typeof source === "object" ? source as Record<string, unknown> : null).filter((source): source is Record<string, unknown> => Boolean(source))
    : []
  const artifactCandidate = artifact?.candidato_2026 && typeof artifact.candidato_2026 === "object" ? artifact.candidato_2026 as Record<string, unknown> : undefined
  const historicalMatches = Array.isArray(artifact?.historical_matches)
    ? artifact.historical_matches
      .filter((match): match is Record<string, unknown> => Boolean(match && typeof match === "object"))
      .filter((match): match is SenadoHistoricalMatch => Number.isSafeInteger(match.ano) && typeof match.sq_candidato === "string" && typeof match.uf === "string")
    : []
  if (artifact && (!artifactCandidate || clean(artifactCandidate.sq_candidato) !== clean(sq?.["2026"]) || clean(artifactCandidate.uf).toUpperCase() !== clean(uf?.["2026"]).toUpperCase() || artifact.identity_method !== "cpf_equal_in_memory_between_2026_anchor_and_historical_rows")) {
    throw new Error(`artefato TSE histórico sem âncora CPF/2026 compatível: ${target}`)
  }
  const verified_tse_sources = sources.filter((source) => Boolean(sq?.[String(source.ano)])).map((source) => {
    const ano = Number(source.ano)
    const match = ano === 2026 ? artifactCandidate : historicalMatches.find((candidate) => Number(candidate.ano) === ano)
    if (artifact && (!match || clean(match.sq_candidato) !== clean(sq?.[String(ano)]) || clean(match.uf).toUpperCase() !== clean(uf?.[String(ano)]).toUpperCase())) {
      throw new Error(`recibo TSE ${ano} não confere com o match histórico ancorado: ${target}`)
    }
    return {
    ano,
    url: clean(source.url),
    sha256: clean(source.sha256),
    sq_candidato: clean(match?.sq_candidato ?? sq?.[String(ano)]),
    uf: clean(match?.uf ?? uf?.[String(ano)]).toUpperCase(),
    ...(source.local_path ? { local_path: clean(source.local_path) } : {}),
    }
  })
  return {
    tse_sq_candidato: sq,
    tse_uf_candidatura: uf,
    ...(ids.camara !== undefined ? { camara: ids.camara as number | null } : {}),
    ...(ids.senado !== undefined ? { senado: ids.senado as number | null } : {}),
    ...(typeof parsed.wikidata_id === "string" ? { wikidata_id: parsed.wikidata_id } : {}),
    ...(artifact ? { provenance: { artifact: artifactName, method: clean(artifact.identity_method), anchor_2026_sq: clean(artifactCandidate?.sq_candidato), historical_matches: historicalMatches } } : {}),
    verified_tse_sources,
  }
}

function manifestSourceMap(manifest: SenadoSourceManifest): Map<string, SenadoSourceManifestEntry> {
  return new Map(manifest.sources.map((source) => [source.source_id, source]))
}

function verifiedSourceIds(manifest: SenadoSourceManifest, override: SenadoIdentityOverride | undefined): string[] {
  const sourceIds = [...new Set([
    ...(override?.source_id ? [override.source_id] : []),
    ...(override?.source_ids ?? []),
  ].map(clean).filter(Boolean))]
  const sources = manifestSourceMap(manifest)
  for (const id of sourceIds) {
    const source = sources.get(id)
    if (!source) throw new Error(`override de identidade cita fonte ausente no manifesto: ${id}`)
    if (source.status !== "available") throw new Error(`override de identidade cita fonte não validada: ${id}`)
  }
  return sourceIds
}

function requireOverrideAnchor(manifest: SenadoSourceManifest, sourceIds: string[], tags: string[], label: string): void {
  const anchored = sourceIds.some((id) => {
    const source = manifest.sources.find((entry) => entry.source_id === id)
    return source?.status === "available" && (source.collector_applicability ?? []).some((tag) => tags.includes(tag))
  })
  if (!anchored) throw new Error(`${label} exige fonte do manifesto com âncora ${tags.join("/")}`)
}

function assertIdentity(candidate: PublishedSenadoCandidate, manifest: SenadoSourceManifest): void {
  const identity = manifest.identity_key
  if (candidate.cargo_disputado !== "Senador" || candidate.estado !== identity.uf) {
    throw new Error(`candidato publicado não confere com cargo/UF do manifesto: ${candidate.slug}`)
  }
  if (candidate.sq_candidato_2026 !== identity.sq_candidato) {
    throw new Error(`SQ publicado diverge do manifesto para ${candidate.slug}`)
  }
  if (normalizedName(candidate.nome_completo) !== normalizedName(identity.nome_completo) || normalizedName(candidate.nome_urna) !== normalizedName(identity.nome_urna)) {
    throw new Error(`nome completo publicado diverge do manifesto para ${candidate.slug}`)
  }
  if (candidate.partido_sigla && normalized(candidate.partido_sigla) !== normalized(identity.partido)) {
    throw new Error(`partido publicado diverge do manifesto para ${candidate.slug}`)
  }
}

/** Materializa a configuração de execução sem alterar seed nem a ficha. */
export function materializeSenadoEnrichmentConfig(
  candidate: PublishedSenadoCandidate,
  manifest: SenadoSourceManifest,
  override: SenadoIdentityOverride = {},
): SenadoEnrichmentConfig {
  if (candidate.publicavel !== true || !clean(candidate.id) || !clean(candidate.slug)) {
    throw new Error(`enriquecimento Senado exige candidato publicado com id/slug estáveis`)
  }
  assertIdentity(candidate, manifest)
  const manifestOverride = manifest.identity_overrides?.[candidate.slug] ?? manifest.overrides?.[candidate.slug] ?? {}
  override = {
    ...manifestOverride,
    ...override,
    tse_sq_candidato: { ...(manifestOverride.tse_sq_candidato ?? {}), ...(override.tse_sq_candidato ?? {}) },
    tse_uf_candidatura: { ...(manifestOverride.tse_uf_candidatura ?? {}), ...(override.tse_uf_candidatura ?? {}) },
    verified_tse_sources: [...(manifestOverride.verified_tse_sources ?? []), ...(override.verified_tse_sources ?? [])],
    provenance: override.provenance ?? manifestOverride.provenance,
  }
  const overrideSources = verifiedSourceIds(manifest, override)
  if (override.wikidata_id) throw new Error("wikidata_id override não é consumido pelo schema de execução; use título Wikipedia validado ou mantenha QID no banco")
  if (override.camara !== undefined && override.camara !== null) requireOverrideAnchor(manifest, overrideSources, ["camara-id", "parliament-id"], "override de ID Câmara")
  if (override.senado !== undefined && override.senado !== null) requireOverrideAnchor(manifest, overrideSources, ["senado-id", "parliament-id"], "override de ID Senado")
  const currentIdentitySources = manifest.sources
    .filter((source) => source.status === "available" && (source.collector_applicability ?? []).some((tag) => ["tse-registration", "candidate-profile"].includes(tag)))
    .map((source) => source.source_id)
  const receipts = override.verified_tse_sources ?? []
  const candidateIds = candidate.ids ?? {}
  const tseSq: Record<string, string> = {
    ...(candidateIds.tse_sq_candidato ?? {}),
    "2026": manifest.identity_key.sq_candidato,
    ...(override.tse_sq_candidato ?? {}),
  }
  const tseUf: Record<string, string> = {
    ...(candidateIds.tse_uf_candidatura ?? {}),
    "2026": manifest.identity_key.uf,
    ...(override.tse_uf_candidatura ?? {}),
  }
  const receiptYears = new Set<number>()
  for (const receipt of receipts) {
    if (!Number.isSafeInteger(receipt.ano) || receipt.ano < 2000 || receipt.ano > 2026 || receiptYears.has(receipt.ano) || !/^[a-f0-9]{64}$/i.test(receipt.sha256) || !/^\d+$/.test(receipt.sq_candidato) || !/^[A-Z]{2}$/.test(receipt.uf) || receipt.sq_candidato !== tseSq[String(receipt.ano)] || receipt.uf !== tseUf[String(receipt.ano)]?.toUpperCase()) {
      throw new Error(`recibo TSE histórico inválido para ${candidate.slug}`)
    }
    assertHttps(receipt.url, `recibo TSE ${receipt.ano}`)
    assertOfficialTseArchive(receipt.url, `recibo TSE ${receipt.ano}`)
    receiptYears.add(receipt.ano)
  }
  for (const year of Object.keys(tseSq)) {
    if (year !== "2026" && !receiptYears.has(Number(year))) {
      throw new Error(`SQ TSE ${year} sem recibo verificável para ${candidate.slug}`)
    }
  }
  const historicalYears = Object.keys(tseSq).filter((year) => year !== "2026")
  if (historicalYears.length > 0) {
    const provenance = override.provenance
    if (!provenance?.artifact || provenance.method !== "cpf_equal_in_memory_between_2026_anchor_and_historical_rows" || provenance.anchor_2026_sq !== manifest.identity_key.sq_candidato) {
      throw new Error(`SQ TSE histórico sem artefato de identidade CPF ancorado para ${candidate.slug}`)
    }
    for (const year of historicalYears) {
      const match = provenance.historical_matches?.find((entry) => entry.ano === Number(year))
      if (!match || match.sq_candidato !== tseSq[year] || match.uf.toUpperCase() !== tseUf[year]?.toUpperCase()) {
        throw new Error(`SQ TSE ${year} não confere com match histórico ancorado para ${candidate.slug}`)
      }
      // A verified CPF reconciliation may legitimately carry a historical civil
      // name (for example COSTA) and a shortened urna name. Require both source
      // labels for pre-2010 rows, without pretending they must equal the current
      // published name.
      const namesMatch = Boolean(clean(match.nome) && clean(match.nome_urna))
      if (Number(year) < 2010 && !clean(match.sg_ue) && match.cpf_match !== true) {
        throw new Error(`SQ TSE ${year} ambíguo sem SG_UE ou prova CPF por linha para ${candidate.slug}`)
      }
      if (Number(year) < 2010 && !namesMatch && match.cpf_match !== true) {
        throw new Error(`SQ TSE ${year} não confere com nome da linha histórica para ${candidate.slug}`)
      }
    }
  }
  if (tseSq["2026"] !== manifest.identity_key.sq_candidato || tseUf["2026"]?.toUpperCase() !== manifest.identity_key.uf.toUpperCase()) {
    throw new Error(`override TSE 2026 diverge da identidade do manifesto para ${candidate.slug}`)
  }
  const historicalIdentityByYear = Object.fromEntries(
    (override.provenance?.historical_matches ?? [])
      .filter((match) => match.ano !== 2026 && match.sq_candidato === tseSq[String(match.ano)] && match.uf.toUpperCase() === tseUf[String(match.ano)]?.toUpperCase())
      .map((match) => [String(match.ano), {
        sq_candidato: match.sq_candidato,
        uf: match.uf.toUpperCase(),
        ...(clean(match.sg_ue) ? { sg_ue: clean(match.sg_ue) } : {}),
        ...(clean(match.cargo_codigo) ? { cargo_codigo: clean(match.cargo_codigo) } : {}),
        ...(clean(match.cargo) ? { cargo: clean(match.cargo) } : {}),
        ...(clean(match.numero) ? { numero: clean(match.numero) } : {}),
        ...(clean(match.nome) ? { nome: clean(match.nome) } : {}),
        ...(clean(match.nome_urna) ? { nome_urna: clean(match.nome_urna) } : {}),
        ...(match.cpf_match === true ? { cpf_match: true } : {}),
      }]),
  )
  const config: CandidatoConfig = {
    slug: candidate.slug,
    nome_completo: candidate.nome_completo,
    nome_urna: candidate.nome_urna,
    cargo_disputado: "Senador",
    estado: candidate.estado,
    ids: {
      camara: candidateIds.camara ?? null,
      senado: candidateIds.senado ?? null,
      ...(override.camara !== undefined ? { camara: override.camara } : {}),
      ...(override.senado !== undefined ? { senado: override.senado } : {}),
      tse_sq_candidato: tseSq,
      tse_uf_candidatura: tseUf,
    },
    ...(Object.keys(historicalIdentityByYear).length > 0 ? { historical_identity_by_year: historicalIdentityByYear } : {}),
  }
  if (override.wikipedia_title) {
    if (overrideSources.length === 0) throw new Error("wikipedia_title exige override ancorado em fonte do manifesto")
    config.wikipedia_title = override.wikipedia_title
  }
  return { candidate, config, manifest, identity_sources: [...new Set([...currentIdentitySources, ...overrideSources])], identity_receipts: receipts }
}

interface PublishedReadSingle {
  eq(column: string, value: unknown): PublishedReadSingle
  maybeSingle(): PromiseLike<{ data: unknown; error?: { message?: string } | null }>
}

interface PublishedReadQuery {
  eq(column: string, value: unknown): PublishedReadSingle
}

interface PublishedReadTable {
  select(columns?: string): PublishedReadQuery
  update?(values: Record<string, unknown>): PublishedMutation
  upsert?(values: Record<string, unknown> | Record<string, unknown>[], options?: Record<string, unknown>): PromiseLike<{ error?: { message?: string } | null }>
}

interface PublishedMutation {
  eq(column: string, value: unknown): PublishedMutation
  then<TResult1 = { error?: { message?: string } | null }, TResult2 = never>(onfulfilled?: ((value: { error?: { message?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2>
}

interface PublishedReadClient {
  from(table: string): PublishedReadTable
}

export async function loadPublishedSenadoCandidate(
  slug: string,
  database: PublishedReadClient = supabase as unknown as PublishedReadClient,
): Promise<PublishedSenadoCandidate> {
  const requested = clean(slug)
  if (!requested) throw new Error("slug obrigatório")
  // wikipedia_title permanece no manifesto; wikidata_id é lido do cadastro
  // local para permitir Wikidata mesmo quando não há artigo Wikipedia.
  const candidateQuery = database.from("candidatos").select("id,slug,nome_completo,nome_urna,cargo_disputado,estado,publicavel,sq_candidato_2026,partido_sigla,wikidata_id,fonte_dados,biografia,formacao_instituicao,verificacao_campos").eq("slug", requested).maybeSingle()
  const candidateResult = await candidateQuery
  if (candidateResult.error || !candidateResult.data) throw new Error(`candidato publicado não encontrado: ${candidateResult.error?.message ?? requested}`)
  const row = candidateResult.data as PublishedSenadoCandidate
  const publicResult = await database.from("candidatos_publico").select("slug").eq("slug", requested).maybeSingle()
  if (publicResult.error || !publicResult.data) throw new Error(`slug não está na coorte pública: ${requested}`)
  if (row.publicavel !== true || row.cargo_disputado !== "Senador" || !clean(row.id) || row.slug !== requested) {
    throw new Error(`candidato não é um registro Senado publicável estável: ${requested}`)
  }
  return row
}

function sourceIdsFor(manifest: SenadoSourceManifest, tags: string[], statuses: SenadoSourceStatus[] = ["available"]): string[] {
  return manifest.sources.filter((source) => statuses.includes(source.status) && (source.collector_applicability ?? []).some((tag) => tags.includes(tag))).map((source) => source.source_id)
}

function sourceStatuses(manifest: SenadoSourceManifest, sourceIds: string[]): Record<string, SenadoSourceStatus> {
  return Object.fromEntries(sourceIds.flatMap((id) => {
    const status = manifest.sources.find((source) => source.source_id === id)?.status
    return status ? [[id, status]] : []
  })) as Record<string, SenadoSourceStatus>
}

function blockedPlan(source: string, detail: string, sourceIds: string[] = [], manifest?: SenadoSourceManifest): SenadoEnrichmentSourcePlan {
  return { source, state: "indeterminado", collector: null, source_ids: sourceIds, source_statuses: manifest ? sourceStatuses(manifest, sourceIds) : {}, detail }
}

/** Expõe cada fonte e o motivo do bloqueio antes de qualquer coleta. */
export function planSenadoEnrichmentSources(
  enrichment: SenadoEnrichmentConfig,
  requestedSources: readonly string[] = DEFAULT_SOURCES,
): SenadoEnrichmentSourcePlan[] {
  const { config, manifest } = enrichment
  const plans: SenadoEnrichmentSourcePlan[] = []
  for (const source of [...new Set(requestedSources)]) {
    if (source === CURATED_PROFILE_SOURCE) {
      const curated = manifest.curated_profile
      const field = manifest.curated_profile_fields?.formacao_instituicao
      const sourceIds = [...new Set([...(curated?.source_ids ?? []), ...(field?.source_ids ?? [])])]
      const statuses = sourceStatuses(manifest, sourceIds)
      if ((!curated?.biography?.trim() && !field?.value?.trim()) || sourceIds.length === 0) {
        plans.push({ source, state: "indeterminado", collector: null, source_ids: sourceIds, source_statuses: statuses, detail: "manifesto sem texto biográfico curado e fontes vinculadas" })
      } else if (sourceIds.some((id) => statuses[id] !== "available")) {
        plans.push({ source, state: "indeterminado", collector: null, source_ids: sourceIds, source_statuses: statuses, detail: "biografia curada cita fonte não validada ou ausente no manifesto" })
      } else {
        plans.push({ source, state: "ready", collector: CURATED_PROFILE_SOURCE, source_ids: sourceIds, source_statuses: statuses, detail: "perfil e campos curados com fontes disponíveis; aplicação depende do freeze/readback" })
      }
      continue
    }
    if (source === CURATED_MEDIA_SOURCE) {
      const items = manifest.curated_media ?? []
      const sourceIds = [...new Set(items.map((item) => item.source_id))]
      const statuses = sourceStatuses(manifest, sourceIds)
      if (items.length === 0) plans.push({ source, state: "indeterminado", collector: null, source_ids: [], source_statuses: {}, detail: "manifesto sem mídia nominal selecionada" })
      else if (sourceIds.length !== items.length || new Set(items.map((item) => item.url)).size !== items.length || sourceIds.some((id) => statuses[id] !== "available")) plans.push({ source, state: "indeterminado", collector: null, source_ids: sourceIds, source_statuses: statuses, detail: "mídia curada contém fonte/URL ausente, duplicada ou não validada" })
      else plans.push({ source, state: "ready", collector: CURATED_MEDIA_SOURCE, source_ids: sourceIds, source_statuses: statuses, detail: "mídia nominal selecionada com URL original e data editorial" })
      continue
    }
    if (source === "curated-networks") {
      const items = manifest.curated_networks ?? []
      const sourceIds = [...new Set(items.map((item) => item.source_id))]
      const statuses = sourceStatuses(manifest, sourceIds)
      if (items.length === 0) plans.push({ source, state: "indeterminado", collector: null, source_ids: [], source_statuses: {}, detail: "manifesto sem redes sociais declaradas com recibo TSE" })
      else if (sourceIds.length !== items.length || sourceIds.some((id) => statuses[id] !== "available")) plans.push({ source, state: "indeterminado", collector: null, source_ids: sourceIds, source_statuses: statuses, detail: "redes declaradas contêm fonte ausente ou não validada" })
      else plans.push({ source, state: "ready", collector: "curated-networks", source_ids: sourceIds, source_statuses: statuses, detail: "sites declarados pela UI oficial TSE com recibo e vínculo de identidade" })
      continue
    }
    if (!TASK_SOURCES.has(source as IngestTask["source"])) {
      plans.push(blockedPlan(source, "fonte não registrada no ingest-all; nenhuma execução silenciosa", [], manifest))
      continue
    }
    const sourceIds = sourceIdsFor(manifest,
      source === "tse" ? ["tse-registration", "candidate-profile"]
        : source === "tse-historico" ? ["tse-historical"]
          : source === "google-news" ? ["official-media", "party-media"] : [],
      source === "tse-historico" ? ["available", "lead_requires_tse_validation"] : ["available"])
    const observedSourceIds = source === "wikipedia"
      ? manifest.sources.filter((entry) => entry.source_id.startsWith("wikipedia-")).map((entry) => entry.source_id)
      : source === "wikidata"
        ? manifest.sources.filter((entry) => entry.source_id.startsWith("wikidata-")).map((entry) => entry.source_id)
        : []
    const planSourceIds = [...new Set([...sourceIds, ...observedSourceIds])]
    const federalReceipt = manifest.curated_federal_receipts?.find((receipt) => receipt.source === source)
    if (federalReceipt) {
      plans.push({ source, state: "ready", collector: "curated-federal-receipt", source_ids: federalReceipt.source_ids, source_statuses: sourceStatuses(manifest, federalReceipt.source_ids), detail: `${federalReceipt.resultado}: ${federalReceipt.detalhe}` })
      continue
    }
    if (source === "senado" && !config.ids.senado) { plans.push(blockedPlan(source, "ID Senado ausente; aplicabilidade do acervo parlamentar permanece indeterminada", planSourceIds, manifest)); continue }
    if (source === "camara" && !config.ids.camara) { plans.push(blockedPlan(source, "ID Câmara ausente; aplicabilidade do acervo parlamentar permanece indeterminada", planSourceIds, manifest)); continue }
    if (source === "ceaps-senado" && !config.ids.senado) { plans.push(blockedPlan(source, "ID Senado ausente; CEAPS não pode ser consultado com identidade determinística", planSourceIds, manifest)); continue }
    if (source === "jarbas" && !config.ids.camara) { plans.push(blockedPlan(source, "ID Câmara ausente; Jarbas não pode ser consultado com identidade determinística", planSourceIds, manifest)); continue }
    if ((source === "wikipedia" || source === "wiki-historico") && !config.wikipedia_title) {
      plans.push(blockedPlan(source, "título Wikipedia não foi verificado no manifesto/override; ausência de ID não prova ausência de fonte", planSourceIds, manifest)); continue
    }
    if ((source === "wikidata" || source === "wikidata-politico") && !validWikidataId(enrichment.candidate.wikidata_id)) {
      plans.push(blockedPlan(source, "QID Wikidata validado ausente no cadastro local; descoberta nominal é somente pista", planSourceIds, manifest)); continue
    }
    if (source === "tse-historico" && sourceIds.length === 0) {
      plans.push(blockedPlan(source, "manifesto não traz pista histórica aplicável; histórico não pode ser inferido", planSourceIds, manifest)); continue
    }
    if (source === "tse-historico" && !Object.keys(config.ids.tse_sq_candidato).some((year) => year !== "2026")) {
      plans.push(blockedPlan(source, "SQ histórico não foi verificado por manifesto/override; histórico não pode ser inferido por nome", planSourceIds, manifest)); continue
    }
    plans.push({ source, state: "ready", collector: source, source_ids: planSourceIds, source_statuses: sourceStatuses(manifest, planSourceIds), detail: planSourceIds.length ? `aplicável por ${planSourceIds.join(", ")}` : "coletor registrado; estado será determinado pela resposta da fonte" })
  }
  return plans
}

function resultForPlan(slug: string, plan: SenadoEnrichmentSourcePlan): IngestResult {
  return {
    source: plan.source,
    candidato: slug,
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 0,
    coleta_resultado: plan.state === "nao_aplicavel" ? "nao_aplicavel" : "indeterminado",
    coleta_detalhe: plan.detail,
  }
}

function resultForFederalReceipt(slug: string, receipt: SenadoFederalReceipt): IngestResult {
  return {
    source: receipt.source,
    candidato: slug,
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 0,
    coleta_resultado: receipt.resultado,
    coleta_detalhe: `${receipt.detalhe} Escopo: ${receipt.escopo}. Fontes ${receipt.source_ids.join(", ")}; verificado em ${receipt.checked_at}; URLs: ${receipt.urls.join(" | ")}. Readback obrigatório da execução ${EXECUCAO}.`,
  }
}

async function readbackCollectionResults(
  results: readonly IngestResult[],
  database: PublishedReadClient,
): Promise<boolean> {
  const table = database.from("coleta_log")
  for (const result of results) {
    const query = await table.select("fonte,alvo,resultado,volume,detalhe,execucao").eq("fonte", result.source).eq("alvo", result.candidato).eq("execucao", EXECUCAO).maybeSingle()
    const row = query.data as { fonte?: unknown; alvo?: unknown; resultado?: unknown; volume?: unknown; detalhe?: unknown; execucao?: unknown } | null
    const expected = entradaDeResultado(result)
    if (query.error || !row || !expected || row.fonte !== result.source || row.alvo !== result.candidato || row.resultado !== expected.resultado || row.volume !== (expected.volume ?? 0) || row.detalhe !== (expected.detalhe ?? null) || row.execucao !== EXECUCAO) return false
  }
  return true
}

function normalizeScopedResults(source: string, results: IngestResult[] | void): IngestResult[] | void {
  if (!results || source !== "instagram") return results
  return results.map((result) => {
    if (result.coleta_resultado !== "nao_aplicavel" || !/sem Instagram declarado/i.test(`${result.skip_reason ?? ""} ${result.coleta_detalhe ?? ""}`)) return result
    return {
      ...result,
      coleta_resultado: "indeterminado",
      coleta_detalhe: "pré-requisito ausente: perfil sem Instagram declarado; aplicabilidade não determinada, nenhuma consulta externa executada.",
    }
  })
}

async function applyCuratedProfile(
  enrichment: SenadoEnrichmentConfig,
  database: PublishedReadClient,
): Promise<IngestResult> {
  const result: IngestResult = {
    source: CURATED_PROFILE_SOURCE,
    candidato: enrichment.candidate.slug,
    tables_updated: [],
    rows_upserted: 0,
    errors: [],
    duration_ms: 0,
  }
  const patch = buildCuratedProfilePatch(enrichment)
  const fieldsPatch = buildCuratedProfileFieldsPatch(enrichment)
  if (!patch && !fieldsPatch) {
    result.skipped = true
    result.skip_reason = "biografia curada ausente ou campo protegido por freeze editorial"
    result.coleta_resultado = "indeterminado"
    result.coleta_detalhe = result.skip_reason
    return result
  }
  if (patch && enrichment.candidate.biografia === patch.biography && !fieldsPatch) {
    result.coleta_resultado = "encontrado"
    result.coleta_volume = 1
    result.coleta_detalhe = "biografia curada já aplicada; nenhuma escrita necessária"
    return result
  }
  const table = database.from("candidatos")
  if (!table.update) throw new Error("adapter de perfil curado não oferece update")
  const existingVerification = enrichment.candidate.verificacao_campos && typeof enrichment.candidate.verificacao_campos === "object" ? enrichment.candidate.verificacao_campos : {}
  const verification = {
    ...existingVerification,
    ...(patch ? { biografia: patch.verification } : {}),
    ...(fieldsPatch ? { formacao_instituicao: fieldsPatch.verification } : {}),
  }
  const currentSources = Array.isArray(enrichment.candidate.fonte_dados) ? enrichment.candidate.fonte_dados : []
  const fonteDados = currentSources.includes("Curadoria Puxa Ficha") ? currentSources : [...currentSources, "Curadoria Puxa Ficha"]
  const updates: Record<string, unknown> = { fonte_dados: fonteDados, verificacao_campos: verification }
  if (patch && enrichment.candidate.biografia !== patch.biography) updates.biografia = patch.biography
  if (fieldsPatch && !clean(enrichment.candidate.formacao_instituicao)) updates.formacao_instituicao = fieldsPatch.formacao_instituicao
  const desiredBiography = patch?.biography ?? enrichment.candidate.biografia ?? null
  const desiredFormation = fieldsPatch?.formacao_instituicao ?? enrichment.candidate.formacao_instituicao ?? null
  const changed = enrichment.candidate.biografia !== desiredBiography
    || enrichment.candidate.formacao_instituicao !== desiredFormation
    || !isDeepStrictEqual(enrichment.candidate.fonte_dados, fonteDados)
    || !isDeepStrictEqual(enrichment.candidate.verificacao_campos, verification)
  if (!changed) {
    result.coleta_resultado = "encontrado"
    result.coleta_volume = 1
    result.coleta_detalhe = "perfil curado já aplicado; nenhuma escrita necessária"
    return result
  }
  const mutation = table.update(updates)
  const response = await mutation.eq("id", enrichment.candidate.id).eq("slug", enrichment.candidate.slug).eq("publicavel", true)
  if (response?.error) throw new Error(`biografia curada update: ${response.error.message ?? "erro sem mensagem"}`)
  const readback = await table.select("biografia,formacao_instituicao,fonte_dados,verificacao_campos").eq("id", enrichment.candidate.id).eq("slug", enrichment.candidate.slug).maybeSingle()
  if (readback.error || !readback.data) throw new Error(`biografia curada readback: ${readback.error?.message ?? "linha ausente"}`)
  const row = readback.data as { biografia?: string; formacao_instituicao?: string; fonte_dados?: unknown; verificacao_campos?: Record<string, unknown> }
  if ((patch && row.biografia !== patch.biography) || (fieldsPatch && row.formacao_instituicao !== fieldsPatch.formacao_instituicao) || (patch && !isDeepStrictEqual(row.verificacao_campos?.biografia, patch.verification)) || (fieldsPatch && !isDeepStrictEqual(row.verificacao_campos?.formacao_instituicao, fieldsPatch.verification)) || !isDeepStrictEqual(row.fonte_dados, fonteDados)) throw new Error("perfil curado readback divergente")
  result.tables_updated.push("candidatos")
  result.rows_upserted = 1
  result.coleta_resultado = "encontrado"
  result.coleta_volume = 1
  result.coleta_detalhe = "perfil curado aplicado com fontes vinculadas e readback confirmado"
  return result
}

async function applyCuratedMedia(enrichment: SenadoEnrichmentConfig, database: PublishedReadClient): Promise<IngestResult> {
  const result: IngestResult = { source: CURATED_MEDIA_SOURCE, candidato: enrichment.candidate.slug, tables_updated: [], rows_upserted: 0, errors: [], duration_ms: 0 }
  const items = enrichment.manifest.curated_media ?? []
  const table = database.from("noticias_candidato")
  if (!table.upsert) throw new Error("mídia curada não oferece upsert")
  const urls = new Set<string>()
  for (const item of items) {
    if (urls.has(item.url)) throw new Error(`mídia curada duplicada por URL: ${item.url}`)
    urls.add(item.url)
    if (!item.identity_evidence?.trim()) throw new Error(`mídia curada sem evidência de identidade: ${item.source_id}`)
  }
  const rows = items.map((item) => ({ candidato_id: enrichment.candidate.id, titulo: item.title, fonte: item.source, url: item.url, data_publicacao: item.published_at }))
  const existingUrls = new Set<string>()
  for (const item of items) {
    const existing = await table.select("url").eq("candidato_id", enrichment.candidate.id).eq("url", item.url).maybeSingle()
    if (existing.error) throw new Error(`mídia curada preflight: ${existing.error.message ?? "erro sem mensagem"}`)
    if (existing.data) existingUrls.add(item.url)
  }
  const response = await table.upsert(rows, { onConflict: "candidato_id,url", ignoreDuplicates: true })
  if (response?.error) throw new Error(`mídia curada upsert: ${response.error.message ?? "erro sem mensagem"}`)
  for (const item of items) {
    const readback = await table.select("url").eq("candidato_id", enrichment.candidate.id).eq("url", item.url).maybeSingle()
    if (readback.error || !readback.data) throw new Error(`mídia curada readback ausente: ${item.url}`)
  }
  result.tables_updated.push("noticias_candidato")
  result.rows_upserted = items.filter((item) => !existingUrls.has(item.url)).length
  result.coleta_resultado = items.length > 0 ? "encontrado" : "indeterminado"
  result.coleta_volume = items.length
  result.coleta_detalhe = "mídia nominal curada aplicada com URL original, data editorial e readback"
  return result
}

async function applyCuratedNetworks(enrichment: SenadoEnrichmentConfig, database: PublishedReadClient): Promise<IngestResult> {
  const result: IngestResult = { source: "curated-networks", candidato: enrichment.candidate.slug, tables_updated: [], rows_upserted: 0, errors: [], duration_ms: 0 }
  const items = enrichment.manifest.curated_networks ?? []
  if (items.length === 0) {
    result.coleta_resultado = "indeterminado"
    result.coleta_detalhe = "manifesto sem redes sociais declaradas com recibo TSE"
    return result
  }
  const table = database.from("candidatos")
  if (!table.update) throw new Error("redes curadas não oferecem update")
  const currentQuery = await table.select("redes_sociais,fonte_dados,verificacao_campos").eq("id", enrichment.candidate.id).eq("slug", enrichment.candidate.slug).maybeSingle()
  if (currentQuery.error || !currentQuery.data) throw new Error(`redes curadas preflight: ${currentQuery.error?.message ?? "linha ausente"}`)
  const current = currentQuery.data as { redes_sociais?: unknown; fonte_dados?: unknown; verificacao_campos?: unknown }
  const currentNetworks = current.redes_sociais && typeof current.redes_sociais === "object" ? { ...(current.redes_sociais as Record<string, unknown>) } : {}
  const networks = { ...currentNetworks }
  for (const item of items) {
    const parsed = new URL(item.url)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "")
    if (item.network === "instagram") {
      const username = parsed.pathname.split("/").filter(Boolean)[0]
      if (hostname !== "instagram.com" || !username) throw new Error(`rede Instagram inválida: ${item.source_id}`)
      const existing = networks.instagram
      const existingFollowers = existing && typeof existing === "object" && typeof (existing as Record<string, unknown>).followers === "number" ? (existing as Record<string, unknown>).followers : null
      networks.instagram = { ...(existing && typeof existing === "object" ? existing as Record<string, unknown> : {}), username, url: `https://instagram.com/${username}`, followers: item.public_metrics?.followers ?? existingFollowers }
    } else if (item.network === "facebook") {
      if (hostname !== "facebook.com") throw new Error(`rede Facebook inválida: ${item.source_id}`)
      networks.facebook = item.url
    } else {
      throw new Error(`rede não suportada: ${item.network}`)
    }
  }
  const existingVerification = current.verificacao_campos && typeof current.verificacao_campos === "object" ? current.verificacao_campos as Record<string, unknown> : {}
  const verification = {
    ...existingVerification,
    redes_sociais: {
      estado: "publicado",
      fonte: "TSE",
      verificado_em: enrichment.manifest.generated_at,
      fontes_consultadas: items.map((item) => ({ source_id: item.source_id, url: item.url, checked_at: item.checked_at, identity_evidence: item.identity_evidence })),
      metricas_publicas: items.filter((item) => item.public_metrics).map((item) => ({ source_id: item.public_metrics?.source_id, url: item.public_metrics?.source_url, checked_at: item.public_metrics?.checked_at, seguidores: item.public_metrics?.followers, precision: item.public_metrics?.precision })),
      recibo_identidade: enrichment.manifest.curated_network_receipt,
    },
  }
  const currentSources = Array.isArray(current.fonte_dados) ? current.fonte_dados : []
  const fonteDados = currentSources.includes("TSE Sites do Candidato") ? currentSources : [...currentSources, "TSE Sites do Candidato"]
  const changed = !isDeepStrictEqual(currentNetworks, networks) || !isDeepStrictEqual(current.fonte_dados, fonteDados) || !isDeepStrictEqual(current.verificacao_campos, verification)
  if (changed) {
    const response = await table.update({ redes_sociais: networks, fonte_dados: fonteDados, verificacao_campos: verification }).eq("id", enrichment.candidate.id).eq("slug", enrichment.candidate.slug).eq("publicavel", true)
    if (response?.error) throw new Error(`redes curadas update: ${response.error.message ?? "erro sem mensagem"}`)
  }
  const readback = await table.select("redes_sociais,fonte_dados,verificacao_campos").eq("id", enrichment.candidate.id).eq("slug", enrichment.candidate.slug).maybeSingle()
  if (readback.error || !readback.data) throw new Error(`redes curadas readback: ${readback.error?.message ?? "linha ausente"}`)
  const row = readback.data as { redes_sociais?: unknown; fonte_dados?: unknown; verificacao_campos?: Record<string, unknown> }
  if (!isDeepStrictEqual(row.redes_sociais, networks) || !isDeepStrictEqual(row.fonte_dados, fonteDados) || !isDeepStrictEqual(row.verificacao_campos?.redes_sociais, verification.redes_sociais)) throw new Error("redes curadas readback divergente")
  result.tables_updated.push("candidatos")
  result.rows_upserted = changed ? 1 : 0
  result.coleta_resultado = "encontrado"
  result.coleta_volume = items.length
  result.coleta_detalhe = changed ? "sites declarados pelo TSE aplicados com recibo e readback" : "sites declarados pelo TSE já aplicados; nenhuma escrita necessária"
  return result
}

export interface RunSenadoEnrichmentOptions {
  requestedSources?: readonly string[]
  years?: readonly number[]
  database?: PublishedReadClient
  taskRegistry?: readonly IngestTask[]
  registerResults?: (results: IngestResult[]) => Promise<void>
  readbackResults?: (results: readonly IngestResult[]) => Promise<boolean>
}

/** Executa somente fontes prontas sob o contexto explícito do candidato público. */
export async function runSenadoEnrichment(
  enrichment: SenadoEnrichmentConfig,
  options: RunSenadoEnrichmentOptions = {},
): Promise<SenadoEnrichmentRun> {
  const plans = planSenadoEnrichmentSources(enrichment, options.requestedSources)
  const results: IngestResult[] = []
  let sourceErrors = false
  let unresolved = false
  const blocked = plans.some((plan) => plan.state !== "ready")
  const register = options.registerResults ?? registrarColetaDeResultados
  await withExplicitCohort([enrichment.config], async () => {
    for (const plan of plans) {
      if (plan.state !== "ready") {
        const result = resultForPlan(enrichment.candidate.slug, plan)
        results.push(result)
        await register([result])
        continue
      }
      if (plan.collector === "curated-federal-receipt") {
        const receipt = enrichment.manifest.curated_federal_receipts?.find((item) => item.source === plan.source)
        if (!receipt) throw new Error(`recibo federal ausente para ${plan.source}`)
        const result = resultForFederalReceipt(enrichment.candidate.slug, receipt)
        results.push(result)
        if (result.coleta_resultado === "indeterminado") unresolved = true
        let registrationError: unknown = null
        try {
          await register([result])
        } catch (error) {
          registrationError = error
        }
        let persisted = emDryRun()
        if (!registrationError && !persisted) try {
          persisted = await (options.readbackResults
            ? options.readbackResults([result])
            : readbackCollectionResults([result], options.database ?? (supabase as unknown as PublishedReadClient)))
        } catch {
          persisted = false
        }
        if (!persisted || registrationError) {
          sourceErrors = true
          result.errors.push(`recibo federal sem readback de persistência da execução; estado não pode ser considerado aplicado${registrationError ? `; registro falhou: ${registrationError instanceof Error ? registrationError.message : String(registrationError)}` : ""}`)
          result.coleta_resultado = "erro"
          result.coleta_detalhe = `${result.coleta_detalhe} Readback obrigatório ausente ou divergente.`
        }
        continue
      }
      if (plan.source === CURATED_PROFILE_SOURCE) {
        try {
          const curated = await applyCuratedProfile(enrichment, options.database ?? (supabase as unknown as PublishedReadClient))
          results.push(curated)
          if (curated.coleta_resultado === "indeterminado") unresolved = true
          await register([curated])
        } catch (error) {
          sourceErrors = true
          const result: IngestResult = {
            source: CURATED_PROFILE_SOURCE,
            candidato: enrichment.candidate.slug,
            tables_updated: [],
            rows_upserted: 0,
            errors: [error instanceof Error ? error.message : String(error)],
            duration_ms: 0,
            coleta_resultado: "erro",
            coleta_detalhe: "biografia curada não foi aplicada; readback ausente ou divergente",
          }
          results.push(result)
          await register([result])
        }
        continue
      }
      if (plan.source === CURATED_MEDIA_SOURCE) {
        try {
          const curated = await applyCuratedMedia(enrichment, options.database ?? (supabase as unknown as PublishedReadClient))
          results.push(curated)
          if (curated.coleta_resultado === "indeterminado") unresolved = true
          await register([curated])
        } catch (error) {
          sourceErrors = true
          const result: IngestResult = { source: CURATED_MEDIA_SOURCE, candidato: enrichment.candidate.slug, tables_updated: [], rows_upserted: 0, errors: [error instanceof Error ? error.message : String(error)], duration_ms: 0, coleta_resultado: "erro", coleta_detalhe: "mídia curada não foi aplicada; readback ausente ou divergente" }
          results.push(result)
          await register([result])
        }
        continue
      }
      if (plan.source === "curated-networks") {
        try {
          const curated = await applyCuratedNetworks(enrichment, options.database ?? (supabase as unknown as PublishedReadClient))
          results.push(curated)
          if (curated.coleta_resultado === "indeterminado") unresolved = true
          await register([curated])
        } catch (error) {
          sourceErrors = true
          const result: IngestResult = { source: "curated-networks", candidato: enrichment.candidate.slug, tables_updated: [], rows_upserted: 0, errors: [error instanceof Error ? error.message : String(error)], duration_ms: 0, coleta_resultado: "erro", coleta_detalhe: "redes declaradas pelo TSE não foram aplicadas; readback ausente ou divergente" }
          results.push(result)
          await register([result])
        }
        continue
      }
      const registry = options.taskRegistry ?? INGEST_TASKS
      const task = registry.find((entry) => entry.source === plan.source)
      if (!task) throw new Error(`coletor não registrado: ${plan.source}`)
      const executable = plan.source === "tse" && options.years
        ? { ...task, run: async () => normalizeScopedResults(plan.source, await ingestTSE([...options.years!])) }
        : { ...task, run: async () => normalizeScopedResults(plan.source, await task.run()) }
      const before = results.length
      const ok = await runIngestTask(executable, results, register)
      const produced = results.slice(before)
      if (!ok || produced.length === 0) {
        sourceErrors = true
        const result: IngestResult = {
          source: plan.source,
          candidato: enrichment.candidate.slug,
          tables_updated: [],
          rows_upserted: 0,
          errors: [!ok ? `coletor ${plan.source} falhou antes de devolver resultados` : `coletor ${plan.source} não devolveu resultado por candidato`],
          duration_ms: 0,
          coleta_resultado: "erro",
          coleta_detalhe: "tentativa sem resultado por candidato; falha não pode virar ausência",
        }
        results.push(result)
        await register([result])
      } else {
        if (produced.some((result) => result.errors.length > 0 || result.coleta_resultado === "erro")) sourceErrors = true
        if (produced.some((result) => result.coleta_resultado === "indeterminado")) unresolved = true
      }
    }
  })
  return {
    config: enrichment,
    plans,
    results,
    status: sourceErrors ? "error" : blocked || unresolved ? "partial" : "success",
    exit_code: sourceErrors || blocked || unresolved ? 1 : 0,
  }
}

export { DEFAULT_SOURCES }
