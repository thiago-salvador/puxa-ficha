import { mkdir, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { canonicalCargo } from "../../src/lib/cargo-utils"
import { isHistoricoCandidaturaRow } from "../../src/lib/historico-tipo-evento"
import { anosDePleitoDisputado, type LinhaDeTrajetoriaParaPleito } from "../../src/lib/pleitos-disputados"
import { PATRIMONIO_ANO_INICIAL_APLICAVEL } from "../../src/lib/public-profile-dto"
import { resolveEstadoUf } from "../../src/lib/br-uf"

const CORE_FIELDS = [
  "partido_sigla",
  "situacao_candidatura",
  "foto_url",
  "biografia",
  "naturalidade",
  "data_nascimento",
  "formacao",
  "profissao_declarada",
  "genero",
  "estado_civil",
  "cor_raca",
] as const

type ProfileEnvelope = {
  data?: Record<string, unknown>
  sourceStatus?: string
}

type MoneyElection = {
  ano?: number
  estado?: string
  fonte_url?: string | null
  verificado_em?: string | null
  contextos?: unknown
}

const PATRIMONIO_STATES = new Set(["publicado", "vazio_confirmado", "nao_coletado"])
const FINANCIAMENTO_STATES = new Set([
  "publicado",
  "zero_declarado",
  "ausencia_oficial",
  "erro",
  "fora_da_serie_oficial",
  "pleito_futuro",
  "nao_coletado",
])

export type ProfileCompletenessIssue = {
  slug: string
  kind:
    | "source_not_live"
    | "core_field_missing"
    | "profile_payload_invalid"
    | "patrimonio_uncollected"
    | "financiamento_uncollected"
    | "current_candidacy_missing_from_history"
    | "current_candidacy_duplicate_in_history"
    | "current_candidacy_unverified_provenance"
    | "current_registration_status_mismatch"
    | "public_profile_missing_from_seed"
  field?: string
  year?: number
  state?: string
}

export type ProfileReviewNotice = {
  slug: string
  section: string
  reason: "missing_verification" | "section_missing" | "invalid_verification" | "freshness_invalid"
}

type CompletenessOptions = {
  strict?: boolean
}

const STRICT_FRESHNESS_SECTIONS = [
  "perfil_atual",
  "historico_politico",
  "mudancas_partido",
  "patrimonio",
  "financiamento",
  "projetos_lei",
  "votos_candidato",
  "gastos_parlamentares",
  "gastos_executivo",
] as const

const STRICT_VERIFICATION_RESULTS = new Set([
  "encontrado",
  "vazio_confirmado",
  "nao_aplicavel",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function hasPublishedTseIdentity(slug: string, envelope: ProfileEnvelope): boolean {
  if (envelope.sourceStatus !== "live" || !isRecord(envelope.data)) return false
  const data = envelope.data
  const yearAndSq = /^tse-(\d{4})-(\d+)$/.exec(slug)
  const explicitSq = typeof data.sq_candidato === "string" ? data.sq_candidato.trim() : ""
  const year = yearAndSq?.[1] ?? ""
  const slugSq = yearAndSq?.[2] || ""
  if (explicitSq && slugSq && explicitSq !== slugSq) return false
  const sq = explicitSq || slugSq
  const uf = typeof data.estado === "string" ? resolveEstadoUf(data.estado)?.toUpperCase() : null
  if (!year || !sq || !uf) return false
  if (typeof data.cargo_disputado !== "string" || !data.cargo_disputado.trim()) return false
  const profileCargo = data.cargo_disputado

  const verification = isRecord(data.verificacao_campos) ? data.verificacao_campos : null
  const registration = verification && isRecord(verification.candidate_registration)
    ? verification.candidate_registration
    : null
  if (!registration || registration.estado !== "publicado" || registration.fonte !== "TSE") return false
  if (typeof registration.verificado_em !== "string" || !Number.isFinite(Date.parse(registration.verificado_em))) return false
  if (!Array.isArray(registration.fontes_consultadas)) return false

  return registration.fontes_consultadas.some((rawSource) => {
    if (!isRecord(rawSource)) return false
    const url = typeof rawSource.url === "string" ? rawSource.url : ""
    const scope = typeof rawSource.escopo === "string" ? rawSource.escopo : ""
    let sourceUrl: URL
    try {
      sourceUrl = new URL(url)
    } catch {
      return false
    }
    const officialHost = sourceUrl.protocol === "https:" &&
      (sourceUrl.hostname === "tse.jus.br" || sourceUrl.hostname.endsWith(".tse.jus.br"))
    const receiptCargo = typeof registration.cargo === "string"
      ? registration.cargo
      : typeof registration.cargo_disputado === "string"
        ? registration.cargo_disputado
        : null
    const sourceCargo = typeof rawSource.cargo === "string" ? rawSource.cargo.trim() : ""
    const cargoConsistent = receiptCargo == null
      ? sourceCargo
        ? canonicalCargo(sourceCargo) === canonicalCargo(profileCargo)
        : data.cargo_disputado_proveniencia === "registro_tse"
      : canonicalCargo(receiptCargo) === canonicalCargo(profileCargo)
    const structuredMember = typeof rawSource.membro_csv === "string" ? rawSource.membro_csv.trim() : ""
    const structuredUf = typeof rawSource.uf === "string" ? rawSource.uf.trim().toUpperCase() : ""
    const structuredCargo = sourceCargo
    const structuredGeneratedAt = typeof rawSource.data_geracao === "string" ? rawSource.data_geracao.trim() : ""
    const hasStructuredReceipt = Boolean(structuredMember || structuredUf || structuredCargo || structuredGeneratedAt)
    const structuredEvidence = structuredMember === `consulta_cand_${year}_BRASIL.csv` &&
      structuredUf === uf &&
      canonicalCargo(structuredCargo) === canonicalCargo(profileCargo) &&
      /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(structuredGeneratedAt) &&
      scope.includes(`membro_csv=${structuredMember}`) &&
      scope.includes(`UF=${structuredUf}`) &&
      scope.includes(`cargo=${structuredCargo}`) &&
      scope.includes(`data_geracao=${structuredGeneratedAt}`)
    const legacyEvidence = new RegExp(`_${uf}\\.csv\\b`, "i").test(scope)
    return officialHost &&
      url.includes(`consulta_cand_${year}`) &&
      (!hasStructuredReceipt ? legacyEvidence : structuredEvidence) &&
      cargoConsistent &&
      new RegExp(`\\bSQ(?:[_ ]?CANDIDATO)?\\b[^\\d]*${sq}\\b`, "i").test(scope)
  })
}

function strictVerificationIsComplete(value: unknown, requiredEvidenceSources: readonly string[] = []): boolean {
  if (!isRecord(value)) return false
  if (typeof value.resultado !== "string" || !STRICT_VERIFICATION_RESULTS.has(value.resultado)) return false
  if (typeof value.executado_em !== "string" || !value.executado_em.trim() || !Number.isFinite(Date.parse(value.executado_em))) {
    return false
  }
  if (typeof value.fonte !== "string" || !value.fonte.trim()) return false
  // Empty and N/A conclusions both need an explicit, human-readable scope or
  // receipt detail. A source name and timestamp alone are not proof.
  if (value.resultado === "vazio_confirmado" || value.resultado === "nao_aplicavel") {
    if (typeof value.detalhe !== "string" || !value.detalhe.trim() ||
        typeof value.escopo !== "string" || !value.escopo.trim()) {
    return false
    }
  }
  if (value.resultado === "nao_aplicavel") {
    const evidenceSources = value.evidence_sources
    if (!Array.isArray(evidenceSources) || evidenceSources.length === 0 || evidenceSources.some((source) => typeof source !== "string" || !source.trim())) {
      return false
    }
    const sourceUrls = value.source_urls
    if (!Array.isArray(sourceUrls) || sourceUrls.length === 0 || sourceUrls.some((url) => typeof url !== "string" || !url.trim())) {
      return false
    }
    if (requiredEvidenceSources.length > 0 &&
        (evidenceSources.length !== requiredEvidenceSources.length ||
          requiredEvidenceSources.some((source) => !evidenceSources.includes(source)))) {
      return false
    }
  }
  return true
}

export function strictTcuVerificationIsComplete(value: unknown): boolean {
  if (!strictVerificationIsComplete(value)) return false
  if (!isRecord(value) || value.fonte !== "tcu") return false
  const estado = value.estado
  if (estado !== "encontrado_em_revisao" && estado !== "vazio_verificado") return false
  if (typeof value.escopo !== "string" || !value.escopo.trim()) return false
  if (estado === "encontrado_em_revisao") {
    if (typeof value.volume !== "number" || !Number.isInteger(value.volume) || value.volume < 1) return false
    const fontes = value.fontes
    return Array.isArray(fontes) && fontes.some((item) =>
      isRecord(item) && item.resultado === "encontrado" &&
      typeof item.url === "string" && item.url.startsWith("https://certidoes.apps.tcu.gov.br/"),
    )
  }
  if (value.resultado !== "vazio_confirmado" || value.volume !== 0) return false
  const expected = new Map([
    ["responsaveis_inabilitados", "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-inabilitados"],
    ["responsaveis_contas_irregulares", "https://certidoes.apps.tcu.gov.br/api/publico/responsaveis-contas-irregulares"],
  ])
  const fontes = value.fontes
  if (!Array.isArray(fontes) || fontes.length !== expected.size) return false
  return fontes.every((item) => {
    if (!isRecord(item) || typeof item.cadastro !== "string") return false
    const url = expected.get(item.cadastro)
    return Boolean(url) && item.url === url && item.resultado === "vazio_confirmado" && item.volume === 0
  }) && new Set(fontes.map((item) => isRecord(item) ? item.cadastro : null)).size === expected.size
}

export function strictTransparenciaIsComplete(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 3) return false
  const familias = new Set<string>()
  return value.every((item) => {
    if (!isRecord(item) || typeof item.familia !== "string" || familias.has(item.familia)) return false
    if (item.familia !== "cartoes" && item.familia !== "viagens" && item.familia !== "contratos") return false
    familias.add(item.familia)
    if (item.resultado !== "encontrado" && item.resultado !== "vazio_confirmado") return false
    if (typeof item.executado_em !== "string" || !Number.isFinite(Date.parse(item.executado_em))) return false
    if (typeof item.endpoint !== "string") return false
    try {
      const endpoint = new URL(item.endpoint)
      if (endpoint.protocol !== "https:" || endpoint.hostname !== "api.portaldatransparencia.gov.br") return false
    } catch {
      return false
    }
    const paginas = typeof item.paginas === "number" ? item.paginas : null
    if (paginas === null || !Number.isInteger(paginas) || paginas < 1) return false
    const volume = typeof item.volume === "number" ? item.volume : null
    if (item.resultado === "vazio_confirmado") return item.cobertura === "vazio_escopo_verificado" && volume === 0
    return item.cobertura === "dados_presentes_escopo_verificado" && volume !== null && volume > 0
  })
}

function strictNotApplicableFreshnessIsComplete(
  section: string,
  value: Record<string, unknown>,
): boolean {
  if (value.status !== "not_applicable") return false
  if (typeof value.verifiedAt !== "string" || !Number.isFinite(Date.parse(value.verifiedAt))) return false
  if (typeof value.sourceLabel !== "string" || !value.sourceLabel.trim()) return false
  if (typeof value.scope !== "string" || !value.scope.trim()) return false
  if (typeof value.message !== "string" || !value.message.trim()) return false
  if (section === "gastos_parlamentares" && strictTemporalExpenseNotApplicable(value)) return true
  const required = section === "gastos_parlamentares"
    ? ["camara", "senado", "ceaps-senado", "jarbas"]
    : section === "projetos_lei" || section === "votos_candidato"
      ? ["camara", "senado"]
      : section === "gastos_executivo"
        ? ["executive-collector-binding-lula-20101", "executive-cohort-identity-check"]
      : []
  const sources = value.evidence_sources
  const urls = value.source_urls
  const executiveScopeValid = section !== "gastos_executivo" || (
    typeof value.scope === "string" &&
    /coorte nominal/i.test(value.scope) &&
    /01\/2023/.test(value.scope) &&
    /20101/.test(value.scope) &&
    /Presidência da República/i.test(value.scope)
  )
  return required.length > 0 && executiveScopeValid && Array.isArray(sources) &&
    required.every((source) => sources.includes(source)) &&
    sources.length === required.length && Array.isArray(urls) && urls.length > 0 &&
    urls.every((url) => typeof url === "string" && url.startsWith("https://"))
}

function strictTemporalExpenseNotApplicable(value: Record<string, unknown>): boolean {
  const sources = value.evidence_sources
  const urls = value.source_urls
  return value.sourceLabel === "Jarbas; despesas da Câmara na série anual consultada" &&
    value.referenceYear === 2026 &&
    typeof value.scope === "string" &&
    /despesas Jarbas/i.test(value.scope) &&
    /série anual 2009-2026/i.test(value.scope) &&
    /identidade nominal/i.test(value.scope) &&
    typeof value.message === "string" &&
    /recorte consultado de 2009 a 2026/i.test(value.message) &&
    Array.isArray(sources) &&
    sources.length === 2 &&
    sources.includes("camara-parliamentarian-registry-all-legislatures") &&
    sources.includes("camara-parliamentarian-registry-scope-control") &&
    Array.isArray(urls) &&
    urls.length === 2 &&
    urls.every((url) => typeof url === "string" && /^https:\/\/(?:[^/]+\.)?camara\.leg\.br(?:\/|$)/.test(url))
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null
}

function currentCandidacyHistoryRows(data: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(data.historico) || typeof data.cargo_disputado !== "string") return []
  const currentCargo = canonicalCargo(data.cargo_disputado)
  return data.historico.filter((raw): raw is Record<string, unknown> => {
    if (!raw || typeof raw !== "object") return false
    const row = raw as Record<string, unknown>
    const rowCargo = typeof row.cargo_canonico === "string"
      ? row.cargo_canonico
      : typeof row.cargo === "string"
        ? row.cargo
        : ""
    return row.periodo_inicio === 2026 &&
      isHistoricoCandidaturaRow({
        tipo_evento: typeof row.tipo_evento === "string" ? row.tipo_evento : null,
        observacoes: typeof row.observacoes === "string" ? row.observacoes : null,
        periodo_inicio: typeof row.periodo_inicio === "number" ? row.periodo_inicio : null,
        periodo_fim: typeof row.periodo_fim === "number" ? row.periodo_fim : null,
      }) &&
      canonicalCargo(rowCargo) === currentCargo
  })
}

function moneyElectionHasOfficialProof(item: MoneyElection): boolean {
  if (hasValue(item.fonte_url) && hasValue(item.verificado_em)) return true
  if (!Array.isArray(item.contextos) || item.contextos.length === 0) return false

  return item.contextos.every((rawContext) => {
    if (!isRecord(rawContext)) return false
    return rawContext.estado === item.estado &&
      rawContext.ano_eleicao === item.ano &&
      hasValue(rawContext.fonte_url) &&
      hasValue(rawContext.verificado_em)
  })
}

function moneyIssues(
  slug: string,
  value: unknown,
  kind: "patrimonio_uncollected" | "financiamento_uncollected",
  field: "patrimonio_eleicoes" | "financiamento_eleicoes",
  allowedStates: ReadonlySet<string>,
  proofRequiredStates: ReadonlySet<string>,
  expectedYears: ReadonlySet<number>,
): ProfileCompletenessIssue[] {
  if (!Array.isArray(value)) {
    return [{ slug, kind: "profile_payload_invalid", field, state: "missing_or_not_array" }]
  }
  const issues: ProfileCompletenessIssue[] = []
  const receivedYears = new Set<number>()
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      issues.push({ slug, kind: "profile_payload_invalid", field: `${field}[${index}]`, state: "not_object" })
      return
    }
    const item = raw as MoneyElection
    if (!Number.isInteger(item.ano) || !item.estado || !allowedStates.has(item.estado)) {
      issues.push({
        slug,
        kind: "profile_payload_invalid",
        field: `${field}[${index}]`,
        year: item.ano,
        state: item.estado ?? "invalid_year_or_state",
      })
      return
    }
    receivedYears.add(item.ano as number)
    if (
      proofRequiredStates.has(item.estado) &&
      !moneyElectionHasOfficialProof(item)
    ) {
      issues.push({
        slug,
        kind: "profile_payload_invalid",
        field: `${field}[${index}]`,
        year: item.ano,
        state: `${item.estado}_without_official_proof`,
      })
      return
    }
    if (item.estado === "nao_coletado" || item.estado === "erro") {
      issues.push({ slug, kind, year: item.ano, state: item.estado })
    }
  })
  for (const year of expectedYears) {
    if (!receivedYears.has(year)) issues.push({ slug, kind, year, state: "missing" })
  }
  return issues
}

export function analyzePublicProfileCompleteness(
  slug: string,
  envelope: ProfileEnvelope,
  options: CompletenessOptions = {},
): { actionable: ProfileCompletenessIssue[]; review: ProfileReviewNotice[] } {
  const data = envelope.data ?? {}
  const actionable: ProfileCompletenessIssue[] = []
  const review: ProfileReviewNotice[] = []

  if (envelope.sourceStatus !== "live") {
    actionable.push({ slug, kind: "source_not_live", state: envelope.sourceStatus })
  }
  if (data.slug !== slug) {
    actionable.push({
      slug,
      kind: "profile_payload_invalid",
      field: "slug",
      state: typeof data.slug === "string" ? data.slug : "missing",
    })
  }

  for (const field of CORE_FIELDS) {
    if (!hasValue(data[field])) actionable.push({ slug, kind: "core_field_missing", field })
  }

  if (typeof data.cargo_disputado === "string" && data.cargo_disputado !== "Nenhum") {
    const currentCandidacies = currentCandidacyHistoryRows(data)
    const currentCandidacyCount = currentCandidacies.length
    if (currentCandidacyCount === 0) {
      actionable.push({
        slug,
        kind: "current_candidacy_missing_from_history",
        field: "historico",
        year: 2026,
      })
    } else if (currentCandidacyCount > 1) {
      actionable.push({
        slug,
        kind: "current_candidacy_duplicate_in_history",
        field: "historico",
        year: 2026,
        state: String(currentCandidacyCount),
      })
    }
    if (
      currentCandidacyCount === 1 &&
      data.status === "candidato" &&
      currentCandidacies[0]?.proveniencia !== "tse"
    ) {
      actionable.push({
        slug,
        kind: "current_candidacy_unverified_provenance",
        field: "historico",
        year: 2026,
        state: typeof currentCandidacies[0]?.proveniencia === "string"
          ? currentCandidacies[0].proveniencia
          : "missing",
      })
    }
    if (currentCandidacyCount > 0 && data.status !== "candidato") {
      actionable.push({
        slug,
        kind: "current_registration_status_mismatch",
        field: "status",
        year: 2026,
        state: typeof data.status === "string" ? data.status : "missing",
      })
    }
  }

  const historico = Array.isArray(data.historico)
    ? data.historico.filter((row): row is LinhaDeTrajetoriaParaPleito => Boolean(row && typeof row === "object"))
    : []
  const pleitos = anosDePleitoDisputado(historico)
  const pleitosPatrimonio = new Set([...pleitos].filter((year) => year >= PATRIMONIO_ANO_INICIAL_APLICAVEL))

  actionable.push(
    ...moneyIssues(
      slug,
      data.patrimonio_eleicoes,
      "patrimonio_uncollected",
      "patrimonio_eleicoes",
      PATRIMONIO_STATES,
      new Set(["vazio_confirmado"]),
      pleitosPatrimonio,
    ),
  )
  actionable.push(
    ...moneyIssues(
      slug,
      data.financiamento_eleicoes,
      "financiamento_uncollected",
      "financiamento_eleicoes",
      FINANCIAMENTO_STATES,
      new Set(["ausencia_oficial", "fora_da_serie_oficial"]),
      pleitos,
    ),
  )

  for (const [section, value] of [
    ["processos", data.processos_verificacao],
    ["trajetoria", data.trajetoria_verificacao],
    ["patrimonio", data.patrimonio_verificacao],
    ["votacoes", data.votacoes_verificacao],
  ] as const) {
    if (value == null) review.push({ slug, section, reason: "missing_verification" })
  }

  const freshness = data.section_freshness
  if (freshness && typeof freshness === "object") {
    for (const [section, value] of Object.entries(freshness)) {
      if (value && typeof value === "object" && (value as { status?: unknown }).status === "missing") {
        review.push({ slug, section, reason: "section_missing" })
      }
    }
  }

  if (options.strict) {
    const strictVerificationSections = [
      ["processos", data.processos_verificacao],
      ["trajetoria", data.trajetoria_verificacao],
      ["patrimonio", data.patrimonio_verificacao],
      ["votacoes", data.votacoes_verificacao],
      ["sancoes", data.sancoes_verificacao],
    ] as const
    for (const [section, value] of strictVerificationSections) {
      if (value == null) {
        if (section === "sancoes") review.push({ slug, section, reason: "missing_verification" })
      } else if (!strictVerificationIsComplete(value, section === "votacoes" ? ["camara", "senado"] : [])) {
        review.push({ slug, section, reason: "invalid_verification" })
      }
    }
    if ("tcu_verificacao" in data && !strictTcuVerificationIsComplete(data.tcu_verificacao)) {
      review.push({ slug, section: "tcu", reason: "invalid_verification" })
    }
    if ("transparencia" in data && !strictTransparenciaIsComplete(data.transparencia)) {
      review.push({ slug, section: "transparencia", reason: "invalid_verification" })
    }

    if (!isRecord(freshness)) {
      review.push({ slug, section: "freshness", reason: "freshness_invalid" })
    } else {
      for (const section of STRICT_FRESHNESS_SECTIONS) {
        const value = freshness[section]
        if (!isRecord(value)) {
          review.push({ slug, section, reason: "freshness_invalid" })
          continue
        }
        const status = value.status
        if (status !== "current" && status !== "historical" && status !== "not_applicable") {
          // `missing` already has the legacy section_missing notice. Keep the
          // strict reason separate for stale/invalid states and for omitted
          // required keys without changing the legacy audit output.
          if (status !== "missing") review.push({ slug, section, reason: "freshness_invalid" })
        } else if (status === "not_applicable" && !strictNotApplicableFreshnessIsComplete(section, value)) {
          review.push({ slug, section, reason: "freshness_invalid" })
        }
      }
    }
  }

  return { actionable, review }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchJson(url: string, attempts = 8): Promise<unknown> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } })
      if (response.ok) return await response.json()
      lastError = new Error(`HTTP ${response.status}`)
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) throw Object.assign(new Error(`HTTP ${response.status}`), { retryable: false })
      const retryAfter = Number(response.headers.get("retry-after"))
      await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 500 * 2 ** attempt)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if ((error as { retryable?: unknown })?.retryable === false) throw lastError
      if (attempt + 1 < attempts) await delay(500 * 2 ** attempt)
    }
  }
  throw lastError ?? new Error("resposta indisponível depois das tentativas")
}

function countBy<T extends { kind?: string; section?: string }>(rows: T[], key: "kind" | "section") {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[key]).filter((value): value is string => Boolean(value)))]
      .sort()
      .map((value) => [value, rows.filter((row) => row[key] === value).length]),
  )
}

export type CliOptions = {
  baseUrl: string
  out: string | null
  slug: string | null
  allowActionable: boolean
  expectZeroActionable: boolean
  /** Gate completo: nenhuma lacuna acionável e nenhum aviso de revisão. */
  strict?: boolean
}

function parseArgs(args: string[]): CliOptions {
  const value = (prefix: string) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
  return {
    baseUrl: (value("--base-url=") ?? "https://puxaficha.com.br").replace(/\/$/, ""),
    out: value("--out="),
    slug: value("--slug="),
    allowActionable: args.includes("--allow-actionable"),
    expectZeroActionable: args.includes("--expect-zero-actionable"),
    strict: args.includes("--strict"),
  }
}

export async function runPublicProfileCompletenessAudit(options: CliOptions) {
  const rawSlugs: unknown = options.slug
    ? [options.slug]
    : ((await fetchJson(`${options.baseUrl}/api/candidato-slugs`)) as { slugs?: unknown }).slugs
  if (!Array.isArray(rawSlugs) || rawSlugs.some((slug) => typeof slug !== "string")) {
    throw new Error("/api/candidato-slugs não retornou uma lista válida")
  }
  const slugs = rawSlugs as string[]
  if (slugs.length === 0 || slugs.some((slug) => slug.trim().length === 0)) {
    throw new Error("/api/candidato-slugs retornou um inventário vazio ou inválido")
  }
  if (new Set(slugs).size !== slugs.length) {
    throw new Error("/api/candidato-slugs retornou slugs duplicados")
  }

  const actionable: ProfileCompletenessIssue[] = []
  const review: ProfileReviewNotice[] = []
  const fetchErrors: Array<{ slug: string; error: string }> = []
  const seedSlugs = new Set(
    (JSON.parse(readFileSync(path.resolve("data/candidatos.json"), "utf8")) as Array<{ slug: string }>).map(
      (candidate) => candidate.slug,
    ),
  )
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < slugs.length) {
      const slug = slugs[nextIndex++] as string
      try {
        const envelope = (await fetchJson(`${options.baseUrl}/api/candidato-profile/${encodeURIComponent(slug)}`)) as ProfileEnvelope
        if (!seedSlugs.has(slug) && !hasPublishedTseIdentity(slug, envelope)) {
          actionable.push({ slug, kind: "public_profile_missing_from_seed" })
        }
        const result = analyzePublicProfileCompleteness(slug, envelope, { strict: options.strict })
        actionable.push(...result.actionable)
        review.push(...result.review)
      } catch (error) {
        fetchErrors.push({ slug, error: error instanceof Error ? error.message : String(error) })
      }
      await delay(250)
    }
  }

  // A rota tem limitação por IP. Uma fila serial é intencional: a varredura
  // precisa provar cobertura, não transformar 429 em falso dado ausente.
  await worker()
  actionable.sort((a, b) => `${a.slug}:${a.kind}:${a.year ?? ""}`.localeCompare(`${b.slug}:${b.kind}:${b.year ?? ""}`))
  review.sort((a, b) => `${a.slug}:${a.section}:${a.reason}`.localeCompare(`${b.slug}:${b.section}:${b.reason}`))
  fetchErrors.sort((a, b) => a.slug.localeCompare(b.slug))

  const report = {
    generated_at: new Date().toISOString(),
    base_url: options.baseUrl,
    requested_profiles: slugs.length,
    completed_profiles: slugs.length - fetchErrors.length,
    fetch_errors: fetchErrors,
    actionable_issues: actionable,
    actionable_by_kind: countBy(actionable, "kind"),
    review_notices: review,
    review_by_section: countBy(review, "section"),
    strict: options.strict === true,
  }

  if (options.out) {
    await mkdir(path.dirname(path.resolve(options.out)), { recursive: true })
    await writeFile(path.resolve(options.out), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }

  if (fetchErrors.length > 0) {
    throw new Error(`varredura incompleta: ${fetchErrors.length}/${slugs.length} fichas não responderam`)
  }
  if ((options.expectZeroActionable || options.strict) && actionable.length > 0) {
    throw new Error(`lacunas acionáveis: ${actionable.length} em ${new Set(actionable.map((row) => row.slug)).size} fichas`)
  }
  if (options.strict && review.length > 0) {
    throw new Error(`avisos de revisão: ${review.length} em ${new Set(review.map((row) => row.slug)).size} fichas`)
  }
  if (!options.allowActionable && !options.expectZeroActionable && actionable.length > 0) {
    throw new Error("use --allow-actionable para inventário ou --expect-zero-actionable para gate")
  }

  const marker = options.strict
    ? "PROFILE_STRICT_ZERO_ACTIONABLE_ZERO_REVIEW"
    : options.expectZeroActionable
    ? "PROFILE_CORE_ZERO_ACTIONABLE"
    : "PROFILE_CORE_AUDIT_OK"
  console.log(
    `${marker} requested=${slugs.length} completed=${slugs.length - fetchErrors.length} actionable=${actionable.length} actionable_profiles=${new Set(actionable.map((row) => row.slug)).size} review=${review.length}`,
  )
  return report
}

async function main(): Promise<void> {
  await runPublicProfileCompletenessAudit(parseArgs(process.argv.slice(2)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
