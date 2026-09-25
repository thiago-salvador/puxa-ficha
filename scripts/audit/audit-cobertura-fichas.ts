import { chmod, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { isHistoricoCandidaturaRow } from "../../src/lib/historico-tipo-evento"
import { validCoverageSourceProof } from "./lib/coverage-source-proof"

/**
 * Etapa 0: matriz somente leitura da cobertura pública por candidato e família.
 *
 * A matriz deliberadamente exige recibo para fechar uma célula. A presença de
 * linhas no payload prova materialização, mas não prova que a fonte foi
 * consultada; por isso uma célula aplicável sem recibo fica `sem_recibo`.
 */

export const COVERAGE_FAMILIES = [
  "perfil_atual",
  "historico_politico",
  "mudancas_partido",
  "patrimonio",
  "financiamento",
  "projetos_lei",
  "votos_candidato",
  "gastos_parlamentares",
  "gastos_executivo",
  "processos",
  "sites_tse",
  "chapa_vice",
] as const

export type CoverageFamily = (typeof COVERAGE_FAMILIES)[number]
export type CoverageState =
  | "publicado"
  | "vazio_confirmado"
  | "nao_aplicavel"
  | "indeterminado"
  | "sem_recibo"
  | "erro"
  | "desatualizado"
  | "frescor_indefinido"

export type CoverageProfile = Record<string, unknown> & {
  id?: string
  slug?: string
  nome_completo?: string
  nome_urna?: string
  cargo_disputado?: string
  cargo_atual?: string | null
  ids?: Record<string, unknown>
  section_freshness?: Record<string, Record<string, unknown> | undefined>
}

export type CoverageCell = {
  slug: string
  familia: CoverageFamily
  aplicavel: boolean
  estado: CoverageState
  motivo: string
  verificado_em: string | null
  fonte: string | null
  escopo: string | null
}

export type CoverageMatrix = {
  generated_at: string
  requested_profiles: number
  completed_profiles: number
  families: readonly CoverageFamily[]
  cells: CoverageCell[]
  summary: Record<CoverageFamily, Record<CoverageState, number>>
  profile_errors: Array<{ slug: string; error: string }>
}

type Receipt = Record<string, unknown>
export type CoverageReceiptJoin = Record<string, Partial<Record<CoverageFamily, Receipt | null>>>

export type LatestReceiptRow = {
  fonte?: unknown
  escopo?: unknown
  alvo?: unknown
  candidato_id?: unknown
  executado_em?: unknown
  resultado?: unknown
  volume?: unknown
  url?: unknown
  detalhe?: unknown
  periodo?: unknown
}

export type ReceiptAdapterResult = {
  joins: CoverageReceiptJoin
  rejected: Array<{ fonte: string | null; alvo: string | null; motivo: string }>
  ignored_partial_receipts: number
}

const STATES: readonly CoverageState[] = [
  "publicado", "vazio_confirmado", "nao_aplicavel", "indeterminado",
  "sem_recibo", "erro", "desatualizado", "frescor_indefinido",
]

/**
 * Fontes canônicas da view `coleta_log_ultima` por família da matriz.
 *
 * A view é por fonte, candidato e escopo, enquanto a matriz é por família.
 * Portanto o adaptador precisa fazer essa redução explicitamente. Aliases
 * históricos são aceitos porque existem recibos gravados com mais de um nome;
 * nenhum nome desconhecido fecha uma célula.
 */
const FAMILIES_BY_SOURCE: Record<string, readonly CoverageFamily[]> = {
  "perfil_atual": ["perfil_atual"], "tse": ["perfil_atual"], "tse-candidaturas": ["perfil_atual"],
  "tse-current": ["perfil_atual"], "tse-cpf": ["perfil_atual"],
  // Situação de julgamento não certifica os demais campos do perfil.
  "tse-situacao": [],
  "historico_politico": ["historico_politico"], "tse-historico": ["historico_politico"], "tse-history": ["historico_politico"],
  "mudancas_partido": ["mudancas_partido"], "filiacao": ["mudancas_partido"], "tse-filiacao": ["mudancas_partido"],
  "patrimonio": ["patrimonio"], "tse-patrimonio": ["patrimonio"], "bem-candidato-tse-2018": ["patrimonio"], "destaques-patrimonio": ["patrimonio"],
  "financiamento": ["financiamento"], "tse-financiamento": ["financiamento"], "financiamento-tse": ["financiamento"], "financiamento-verificacoes": ["financiamento"],
  "projetos_lei": ["projetos_lei"], "projetos-lei": ["projetos_lei"], "camara-proposicoes": ["projetos_lei"], "senado-proposicoes": ["projetos_lei"], "camara-dadosabertos-v2": ["projetos_lei"],
  "votos_candidato": ["votos_candidato"], "votos": ["votos_candidato"], "votacoes": ["votos_candidato"], "camara-votacoes": ["votos_candidato"], "destaques-votacoes": ["votos_candidato"], "senado-votacoes": ["votos_candidato"],
  "gastos_parlamentares": ["gastos_parlamentares"], "gastos-parlamentares": ["gastos_parlamentares"], "camara-gastos": ["gastos_parlamentares"], "senado-gastos": ["gastos_parlamentares"], "ceaps-senado": ["gastos_parlamentares"], "jarbas": ["gastos_parlamentares"],
  "gastos_executivo": ["gastos_executivo"], "gastos-executivo": ["gastos_executivo"], "transparencia": ["gastos_executivo"],
  "processos": ["processos"], "processos-curadoria": ["processos"],
  "sites_tse": ["sites_tse"], "sites-tse": ["sites_tse"], "candidate-sites-tse": ["sites_tse"], "tse-sites": ["sites_tse"],
  "chapa_vice": ["chapa_vice"], "chapa-vice": ["chapa_vice"], "chapa": ["chapa_vice"], "chapas": ["chapa_vice"], "tse-chapas": ["chapa_vice"],
}

const CORE_FIELDS = [
  "partido_sigla", "situacao_candidatura", "foto_url", "biografia",
  "naturalidade", "data_nascimento", "formacao", "profissao_declarada",
  "genero", "estado_civil", "cor_raca",
]

function record(value: unknown): Receipt | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Receipt : null
}

function receiptDetail(value: unknown): Receipt | null {
  if (typeof value !== "string") return record(value)
  try { return record(JSON.parse(value)) } catch { return null }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function present(value: unknown): boolean {
  return text(value) !== null || (typeof value === "number" && Number.isFinite(value))
}

function parseDate(value: unknown): string | null {
  const raw = text(value)
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null
}

function federalParliamentary(profile: CoverageProfile): boolean {
  const ids = record(profile.ids)
  if (present(ids?.camara) || present(ids?.senado)) return true
  const historic = Array.isArray(profile.historico) ? profile.historico : []
  return historic.some((item) => {
    const row = record(item)
    if (!row || isCandidacyRow(row)) return false
    const cargo = text(row?.cargo_canonico) ?? text(row?.cargo)
    return cargo === "Deputado Federal" || cargo === "Senador"
  })
}

function isCandidacyRow(row: Receipt): boolean {
  return isHistoricoCandidaturaRow({
    tipo_evento: text(row.tipo_evento),
    observacoes: text(row.observacoes),
    periodo_inicio: typeof row.periodo_inicio === "number" ? row.periodo_inicio : null,
    periodo_fim: typeof row.periodo_fim === "number" ? row.periodo_fim : null,
  })
}

function isExecutive(profile: CoverageProfile): boolean {
  const current = text(profile.cargo_atual)
  return ["Presidente", "Governador", "Vice-Presidente", "Vice-Governador"].includes(current ?? "")
}

function isChapaApplicable(profile: CoverageProfile): boolean {
  return ["Presidente", "Vice-Presidente", "Governador", "Vice-Governador"].includes(text(profile.cargo_disputado) ?? "")
}

function applicable(profile: CoverageProfile, family: CoverageFamily): boolean {
  if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) return federalParliamentary(profile)
  if (family === "gastos_executivo") return isExecutive(profile)
  if (family === "chapa_vice") return isChapaApplicable(profile)
  return true
}

function profileId(profile: CoverageProfile): string | null {
  return text(profile.id) ?? text(profile.candidato_id) ?? text(profile.candidate_id)
}

function sourceKey(fonte: string): string {
  const normalized = fonte.toLocaleLowerCase()
  if (normalized.startsWith("camara")) return "camara"
  if (normalized.startsWith("senado")) return "senado"
  if (normalized === "ceaps-senado") return "ceaps-senado"
  return normalized
}

function federalSources(profile: CoverageProfile): string[] {
  const sources = new Set<string>()
  const ids = record(profile.ids)
  if (present(ids?.camara)) sources.add("camara")
  if (present(ids?.senado)) sources.add("senado")
  for (const item of Array.isArray(profile.historico) ? profile.historico : []) {
    const row = record(item)
    if (!row || isCandidacyRow(row)) continue
    const cargo = text(row.cargo_canonico) ?? text(row.cargo)
    if (cargo === "Deputado Federal") sources.add("camara")
    if (cargo === "Senador") sources.add("senado")
  }
  return [...sources]
}

function requiredSources(profile: CoverageProfile, family: CoverageFamily): string[] {
  if (!["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) return []
  return federalSources(profile)
}

/**
 * Adapta uma exportação somente leitura de `coleta_log_ultima`.
 *
 * O vínculo exige simultaneamente candidato_id, slug em `alvo`, escopo
 * candidato, fonte exata e timestamp válido. Uma linha global/territorial ou
 * uma linha de outro candidato não pode fechar nenhuma célula.
 */
export function adaptLatestReceipts(rows: LatestReceiptRow[], profiles: CoverageProfile[]): ReceiptAdapterResult {
  const bySlug = new Map(profiles.map((profile) => [text(profile.slug) ?? "", profile]))
  const joins: CoverageReceiptJoin = {}
  const rejected: ReceiptAdapterResult["rejected"] = []
  let ignoredPartialReceipts = 0
  for (const row of rows) {
    const fonte = text(row.fonte)
    const families = fonte ? FAMILIES_BY_SOURCE[fonte.toLocaleLowerCase()] ?? null : null
    if (!families) {
      rejected.push({ fonte, alvo: text(row.alvo), motivo: "fonte não mapeada para uma família da matriz" })
      continue
    }
    const alvo = text(row.alvo)
    const profile = alvo ? bySlug.get(alvo) : undefined
    const candidateId = text(row.candidato_id)
    const expectedId = profile ? profileId(profile) : null
    const reject = (motivo: string) => rejected.push({ fonte, alvo, motivo })
    if (!fonte || !alvo || !profile) { reject("alvo não pertence à coorte pública"); continue }
    if (text(row.escopo) !== "candidato") { reject("escopo não é candidato"); continue }
    if (!candidateId || !expectedId || candidateId !== expectedId) { reject("candidato_id não confere com o perfil"); continue }
    const executed = parseDate(row.executado_em)
    if (!executed) { reject("executado_em inválido"); continue }
    const result = text(row.resultado)
    if (!result || !["encontrado", "publicado", "vazio_confirmado", "nao_aplicavel", "erro", "indeterminado"].includes(result)) { reject("resultado inválido"); continue }
    if (result === "encontrado" && !(typeof row.volume === "number" && row.volume > 0)) { reject("encontrado sem volume positivo"); continue }
    if (result === "publicado" && !(typeof row.volume === "number" && row.volume > 0)) { reject("publicado sem volume positivo"); continue }
    if (!["encontrado", "publicado"].includes(result) && typeof row.volume === "number" && row.volume !== 0) { reject("resultado sem volume zero coerente"); continue }
    if (families.length === 0) { ignoredPartialReceipts++; continue }
    const detail = receiptDetail(row.detalhe)
    const incoming: Receipt = {
      resultado: result,
      executado_em: executed,
      fonte,
      escopo: text(detail?.escopo) ?? "candidato",
      url: text(row.url),
      source_sha256: text(detail?.resource_sha256),
      periodo: text(row.periodo),
      coverage_proof: detail?.coverage_proof,
    }
    const bucket = joins[alvo] ?? {}
    joins[alvo] = bucket
    for (const family of families) {
      const previous = record(bucket[family])
      const receipts = record(previous?.__receipts) ?? {}
      const key = sourceKey(fonte!)
      const priorSource = record(receipts[key])
      const priorDate = parseDate(priorSource?.executado_em)
      if (!priorDate || Date.parse(executed) >= Date.parse(priorDate)) receipts[key] = incoming
      const representative = Object.values(receipts)
        .map((item) => record(item))
        .filter((item): item is Receipt => Boolean(item))
        .sort((a, b) => Date.parse(parseDate(b.executado_em) ?? "1970-01-01") - Date.parse(parseDate(a.executado_em) ?? "1970-01-01"))[0] ?? incoming
      bucket[family] = { ...representative, __receipts: receipts }
    }
  }
  return { joins, rejected, ignored_partial_receipts: ignoredPartialReceipts }
}

function receiptFor(profile: CoverageProfile, family: CoverageFamily, joins: CoverageReceiptJoin): Receipt | null {
  const joined = joins[text(profile.slug) ?? ""]?.[family]
  if (joined) return record(joined)

  // Public profile payloads carry the same collector receipt used to render
  // the freshness badge. It is acceptable as a read-only receipt only when the
  // structured fields are present; arrays or counters never substitute for it.
  const freshness = record(profile.section_freshness?.[family])
  // A historical badge can intentionally omit its verification date. In that
  // case it is not a receipt and must not hide a dated family verification.
  if (freshness && (parseDate(freshness.verifiedAt) || parseDate(freshness.referenceDate))) {
    return {
      status: freshness.status,
      verifiedAt: freshness.verifiedAt ?? freshness.referenceDate,
      sourceLabel: freshness.sourceLabel,
      scope: freshness.scope,
      message: freshness.message,
    }
  }
  const field = ({
    historico_politico: "trajetoria_verificacao",
    mudancas_partido: "filiacao_verificacao",
    patrimonio: "patrimonio_verificacao",
    processos: "processos_verificacao",
    votos_candidato: "votacoes_verificacao",
  } as Partial<Record<CoverageFamily, string>>)[family]
  return field ? record(profile[field]) : null
}

// Null means that an official source revision, rather than elapsed days, must
// establish freshness. Until that comparison exists, do not certify a cell.
const FRESHNESS_DAYS: Record<CoverageFamily, number | null> = {
  perfil_atual: null, historico_politico: null, mudancas_partido: null, patrimonio: null,
  financiamento: null, projetos_lei: 9, votos_candidato: 9, gastos_parlamentares: 9,
  gastos_executivo: 90, processos: 14, sites_tse: null, chapa_vice: null,
}

function hasMaterializedData(profile: CoverageProfile, family: CoverageFamily): boolean {
  if (family === "perfil_atual") return CORE_FIELDS.every((field) => text(profile[field]) !== null)
  if (family === "processos") return Array.isArray(profile.processos) && profile.processos.length > 0
  if (family === "sites_tse") {
    const sites = record(profile.sites_candidato)
    return Boolean(sites && Array.isArray(sites.sites) && sites.sites.length > 0 && text(sites.fonte_url) && text(sites.fonte_sha256))
  }
  if (family === "chapa_vice") {
    const chapa = record(profile.chapa_2026)
    return Boolean(chapa && chapa.identidade_status === "confirmada" && chapa.vinculo_titular_status === "confirmado" && text(chapa.fonte_url) && text(chapa.fonte_sha256))
  }
  const key: Partial<Record<CoverageFamily, string>> = {
    historico_politico: "historico", mudancas_partido: "mudancas_partido",
    patrimonio: "patrimonio_eleicoes", financiamento: "financiamento_eleicoes",
    projetos_lei: "projetos_lei", votos_candidato: "votos",
    gastos_parlamentares: "gastos_parlamentares", gastos_executivo: "gastos_executivo",
  }
  const value = profile[key[family] ?? ""]
  return Array.isArray(value) && value.length > 0
}

function validReceipt(receipt: Receipt, state: string | null): boolean {
  const when = parseDate(receipt.verifiedAt) ?? parseDate(receipt.verificado_em) ?? parseDate(receipt.executado_em) ?? parseDate(receipt.coletado_em)
  if (!when || !text(receipt.sourceLabel) && !text(receipt.fonte) && !text(receipt.fonte_url)) return false
  if (Date.parse(when) > Date.now()) return false
  if (["vazio_confirmado", "sem_achado_no_escopo", "nao_aplicavel"].includes(state ?? "")) {
    return Boolean(text(receipt.scope) ?? text(receipt.escopo))
  }
  return true
}

function stateFromSingleReceipt(receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): CoverageCell["estado"] {
  if (!receipt) return "sem_recibo"
  const status = text(receipt?.status)
  if (status === "stale") return "desatualizado"
  if (status === "missing") return "sem_recibo"
  const result = text(receipt?.resultado)
  if (!validReceipt(receipt, result)) return "erro"
  const effectiveResult = result ?? (status === "current" || status === "historical" ? "encontrado" : null)
  if (effectiveResult === "erro") return "erro"
  if (effectiveResult === "indeterminado" || effectiveResult === "sem_achado_no_escopo") return "indeterminado"
  // Applicability is decided by the written cargo/history rule in makeCell.
  // A source badge that disagrees with that rule is a review item, not proof
  // that the family can disappear from the denominator.
  if (effectiveResult === "nao_aplicavel" || status === "not_applicable") return "indeterminado"
  // A found receipt without published evidence has no concluded public state,
  // even when the search itself is old. An empty receipt with published data is
  // contradictory and must be reviewed.
  if ((effectiveResult === "encontrado" || effectiveResult === "publicado") && !hasMaterializedData(profile, family)) return "indeterminado"
  if (effectiveResult === "vazio_confirmado" && hasMaterializedData(profile, family)) {
    // Os dados parlamentares podem vir da outra casa; sem partição por fonte
    // não há prova de contradição no recibo vazio desta casa.
    return ["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family) ? "indeterminado" : "erro"
  }
  const when = parseDate(receipt.verifiedAt) ?? parseDate(receipt.verificado_em) ?? parseDate(receipt.executado_em) ?? parseDate(receipt.coletado_em)
  if (family === "sites_tse") {
    const snapshot = record(profile.sites_candidato)
    const snapshotAt = parseDate(snapshot?.coletado_em)
    if (!snapshot || !snapshotAt || !when ||
        text(receipt.source_sha256) !== text(snapshot.fonte_sha256) ||
        text(receipt.url) !== text(snapshot.fonte_url) ||
        Date.parse(when) < Date.parse(snapshotAt)) return "frescor_indefinido"
    if (effectiveResult === "vazio_confirmado" && snapshot.resultado === "vazio_confirmado") return "vazio_confirmado"
    if ((effectiveResult === "encontrado" || effectiveResult === "publicado") && snapshot.resultado === "publicado") return "publicado"
    return "indeterminado"
  }
  if (family === "chapa_vice") {
    const snapshot = record(profile.chapa_2026)
    const snapshotAt = parseDate(snapshot?.snapshot_em)
    if (!snapshot || !snapshotAt || !when ||
        text(snapshot.titular_candidato_id) !== profileId(profile) ||
        text(receipt.source_sha256) !== text(snapshot.fonte_sha256) ||
        text(receipt.url) !== text(snapshot.fonte_url) ||
        Date.parse(when) < Date.parse(snapshotAt)) return "frescor_indefinido"
    return effectiveResult === "encontrado" || effectiveResult === "publicado"
      ? "publicado"
      : "indeterminado"
  }
  const maxAge = FRESHNESS_DAYS[family]
  if (maxAge === null) {
    if (!validCoverageSourceProof(profile, family, receipt)) return "frescor_indefinido"
    if (effectiveResult === "vazio_confirmado") return "vazio_confirmado"
    return effectiveResult === "encontrado" || effectiveResult === "publicado" ? "publicado" : "indeterminado"
  }
  if (when && (Date.now() - Date.parse(when)) > maxAge * 86_400_000) return "desatualizado"
  if (effectiveResult === "encontrado" || effectiveResult === "publicado") {
    // Contagem declarada pela Câmara ou Senado não prova persistência,
    // readback nem cobertura do DTO público. Exigir reconciliação por órgão
    // antes de fechar qualquer família parlamentar.
    if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
      return validCoverageSourceProof(profile, family, receipt) ? "publicado" : "indeterminado"
    }
    return hasMaterializedData(profile, family) ? "publicado" : "indeterminado"
  }
  if (effectiveResult === "vazio_confirmado") {
    if (["projetos_lei", "votos_candidato", "gastos_parlamentares"].includes(family)) {
      return validCoverageSourceProof(profile, family, receipt) ? "vazio_confirmado" : "indeterminado"
    }
    return "vazio_confirmado"
  }
  return "sem_recibo"
}

function stateFromReceipt(receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): CoverageCell["estado"] {
  if (!receipt) return "sem_recibo"
  const stored = record(receipt.__receipts)
  if (!stored) return stateFromSingleReceipt(receipt, profile, family)

  const required = requiredSources(profile, family)
  if (!required.length) return stateFromSingleReceipt(receipt, profile, family)
  const sourceReceipts = required.map((source) => record(stored[source]))
  if (sourceReceipts.some((item) => !item)) return "indeterminado"
  const sourceStates = sourceReceipts.map((item) => stateFromSingleReceipt(item, profile, family))
  if (sourceStates.includes("erro")) return "erro"
  if (sourceStates.includes("indeterminado")) return "indeterminado"
  if (sourceStates.includes("desatualizado")) return "desatualizado"
  if (sourceStates.includes("frescor_indefinido")) return "frescor_indefinido"
  // Duas casas podem ter resultados diferentes. Sem uma prova que atribua
  // cada linha pública à casa/ID correspondente, a união ainda é inconclusiva.
  if (sourceStates.includes("vazio_confirmado") && sourceStates.includes("publicado")) return "indeterminado"
  if (sourceStates.every((state) => state === "vazio_confirmado")) return "vazio_confirmado"
  if (sourceStates.every((state) => state === "publicado")) return "publicado"
  return "indeterminado"
}

function reasonFor(state: CoverageState, receipt: Receipt | null, profile: CoverageProfile, family: CoverageFamily): string {
  if (state === "sem_recibo") return "família aplicável sem recibo de fonte"
  if (state === "desatualizado") return "recibo de fonte fora do prazo de frescor"
  if (state === "frescor_indefinido") return "falta comparar a revisão atual da fonte oficial com o snapshot publicado"
  if (state === "nao_aplicavel") return "regra de aplicabilidade ou recibo explícito"
  if (state === "vazio_confirmado") return "fonte consultada sem registros no escopo"
  if (state === "indeterminado") return "fonte consultada sem conclusão de identidade ou cobertura"
  if (state === "erro") return "recibo ausente, malformado ou com erro de coleta"
  return family === "perfil_atual" ? "recibo de frescor do perfil presente" : "dados e recibo de fonte presentes"
}

function makeCell(profile: CoverageProfile, family: CoverageFamily, joins: CoverageReceiptJoin, profileError?: string): CoverageCell {
  const slug = text(profile.slug) ?? "<sem-slug>"
  // A failed profile read cannot establish either the data or the rule of
  // applicability. Keep every family as an errored, applicable cell instead
  // of manufacturing `nao_aplicavel` from missing fields.
  const applicableCell = profileError ? true : applicable(profile, family)
  const receipt = receiptFor(profile, family, joins)
  const state = !applicableCell
      ? "nao_aplicavel"
      : profileError
      ? "erro"
      : stateFromReceipt(receipt, profile, family)
  const explicitReason = !applicableCell
    ? "regra escrita: família não se aplica ao cargo ou ao histórico federal do candidato"
    : profileError
      ? `perfil não respondeu: ${profileError}`
      : reasonFor(state, receipt, profile, family)
  return {
    slug,
    familia: family,
    aplicavel: applicableCell,
    estado: state,
    motivo: explicitReason,
    verificado_em: parseDate(receipt?.verifiedAt) ?? parseDate(receipt?.verificado_em) ?? parseDate(receipt?.executado_em) ?? parseDate(receipt?.coletado_em),
    fonte: text(receipt?.sourceLabel) ?? text(receipt?.fonte) ?? text(receipt?.fonte_url),
    escopo: text(receipt?.scope) ?? text(receipt?.escopo),
  }
}

export function buildCoverageMatrix(profiles: CoverageProfile[], profileErrors: Array<{ slug: string; error: string }> = [], joins: CoverageReceiptJoin = {}): CoverageMatrix {
  const errors = new Map(profileErrors.map((item) => [item.slug, item.error]))
  const erroredProfiles = profileErrors.map((item) => ({ slug: item.slug } satisfies CoverageProfile))
  const cells = [...profiles, ...erroredProfiles].flatMap((profile) => COVERAGE_FAMILIES.map((family) => makeCell(profile, family, joins, errors.get(text(profile.slug) ?? ""))))
  const summary = Object.fromEntries(COVERAGE_FAMILIES.map((family) => {
    const counts = Object.fromEntries(STATES.map((state) => [state, 0])) as Record<CoverageState, number>
    for (const cell of cells) if (cell.familia === family) counts[cell.estado] += 1
    return [family, counts]
  })) as Record<CoverageFamily, Record<CoverageState, number>>
  return {
    generated_at: new Date().toISOString(),
    requested_profiles: profiles.length + profileErrors.length,
    completed_profiles: profiles.length,
    families: COVERAGE_FAMILIES,
    cells,
    summary,
    profile_errors: profileErrors,
  }
}

export async function fetchPublicProfiles(baseUrl: string, fetcher: typeof fetch = fetch): Promise<{ profiles: CoverageProfile[]; errors: Array<{ slug: string; error: string }> }> {
  const slugResponse = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/candidato-slugs`, { headers: { accept: "application/json" } })
  if (!slugResponse.ok) throw new Error(`/api/candidato-slugs HTTP ${slugResponse.status}`)
  const body = await slugResponse.json() as { slugs?: unknown }
  if (!Array.isArray(body.slugs) || body.slugs.some((slug) => typeof slug !== "string")) throw new Error("/api/candidato-slugs não retornou lista válida")
  if (!body.slugs.length || new Set(body.slugs).size !== body.slugs.length || body.slugs.some((slug) => !slug.trim())) {
    throw new Error("/api/candidato-slugs retornou coorte vazia, duplicada ou inválida")
  }
  const profiles: CoverageProfile[] = []
  const errors: Array<{ slug: string; error: string }> = []
  for (const slug of body.slugs as string[]) {
    try {
      const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/candidato-profile/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const envelope = await response.json() as { data?: unknown; sourceStatus?: unknown }
      if (envelope.sourceStatus !== "live") throw new Error(`perfil não publicado: ${String(envelope.sourceStatus)}`)
      const profile = record(envelope.data) ?? record(envelope)
      if (!profile) throw new Error("payload de perfil inválido")
      if (profile.slug !== slug) throw new Error("identidade do perfil diverge do slug solicitado")
      profiles.push(profile as CoverageProfile)
    } catch (error) {
      errors.push({ slug, error: error instanceof Error ? error.message : String(error) })
    }
    // The public profile route is IP-rate-limited. Mirror the existing audit's
    // serial cadence instead of turning 429 into a false absence.
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return { profiles, errors }
}

function parseArgs(args: string[]) {
  const value = (prefix: string) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
  return {
    baseUrl: value("--base-url=") ?? "https://puxaficha.com.br",
    input: value("--input="),
    receipts: value("--receipts="),
    receiptsExtra: args.filter((arg) => arg.startsWith("--receipts-extra=")).map((arg) => arg.slice("--receipts-extra=".length)),
    out: value("--out="),
    strict: args.includes("--strict"),
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const fetched = options.input
    ? { profiles: JSON.parse(await readFile(path.resolve(options.input), "utf8")) as CoverageProfile[], errors: [] }
    : await fetchPublicProfiles(options.baseUrl)
  let joins: CoverageReceiptJoin = {}
  let rejectedReceipts: ReceiptAdapterResult["rejected"] = []
  let ignoredPartialReceipts = 0
  const receiptPaths = [options.receipts, ...options.receiptsExtra].filter((item): item is string => Boolean(item))
  if (receiptPaths.length) {
    const loaded = await Promise.all(receiptPaths.map(async (file) => JSON.parse(await readFile(path.resolve(file), "utf8")) as unknown))
    const rowGroups = loaded.map((raw) => Array.isArray(raw)
      ? raw as LatestReceiptRow[]
      : Array.isArray(record(raw)?.rows) ? record(raw)?.rows as LatestReceiptRow[]
        : Array.isArray(record(raw)?.receipts) ? record(raw)?.receipts as LatestReceiptRow[] : null)
    if (rowGroups.every((rows) => rows !== null)) {
      const adapted = adaptLatestReceipts(rowGroups.flatMap((rows) => rows ?? []), fetched.profiles)
      joins = adapted.joins
      rejectedReceipts = adapted.rejected
      ignoredPartialReceipts = adapted.ignored_partial_receipts
    } else if (loaded.length === 1 && rowGroups[0] === null) {
      joins = loaded[0] as CoverageReceiptJoin
    } else {
      throw new Error("--receipts-extra exige que cada entrada seja uma lista, rows[] ou receipts[]")
    }
  }
  const matrix = buildCoverageMatrix(fetched.profiles, fetched.errors, joins)
  if (options.out) {
    const outputPath = path.resolve(options.out)
    await writeFile(outputPath, `${JSON.stringify(matrix, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
    await chmod(outputPath, 0o600)
  }
  const totals = Object.fromEntries(COVERAGE_FAMILIES.map((family) => [family, matrix.summary[family]]))
  console.log(JSON.stringify({ generated_at: matrix.generated_at, requested_profiles: matrix.requested_profiles, completed_profiles: matrix.completed_profiles, profile_errors: matrix.profile_errors.length, rejected_receipts: rejectedReceipts.length, ignored_partial_receipts: ignoredPartialReceipts, totals }, null, 2))
  const blocking = matrix.cells.filter((cell) => cell.aplicavel && ["sem_recibo", "indeterminado", "erro", "desatualizado", "frescor_indefinido"].includes(cell.estado))
  if (options.strict && blocking.length > 0) {
    throw new Error(`células aplicáveis sem fechamento: ${blocking.length}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
