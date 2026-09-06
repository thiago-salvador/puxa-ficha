import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const TSE_HOST = "divulgacandcontas.tse.jus.br"
const USER_AGENT = "PuxaFichaDataFreshness/1.0"

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface TseDependentMonitorConfig {
  schema_version: 1
  laudicerio: {
    profile_slug: "laudicerio-aguiar"
    canonical_registration_sq: null
    alert_message: "julgamento Laudicério: revisar canônica"
    registrations: Array<{
      sq_candidato: string
      url: string
      expected_descricao_situacao: string
      expected_descricao_totalizacao: string
    }>
  }
  program_control: {
    profile_slug: "jorginho-mello"
    sq_candidato: string
    url: string
    expected_cod_tipo: "5"
  }
  program_files: Array<{
    profile_slug: string
    sq_candidato: string
    url: string
    revisoes?: TseDependentProgramReview[]
  }>
}

/**
 * Revisão já feita de um arquivo que a DivulgaCandContas anuncia com codTipo 5.
 * Nomeia um `id_arquivo` específico: enquanto o TSE anunciar esse mesmo id, o
 * monitor não repete o alerta, porque a revisão registrada já é a resposta. Um
 * id diferente é arquivo novo e volta a alertar.
 *
 * A revisão NÃO expira sozinha quando o pacote oficial é republicado, porque o
 * monitor só fala com a DivulgaCandContas e nunca com o CDN. Por isso ela grava
 * o pacote medido (`pacote_sha256`, `pacote_last_modified`): pacote novo torna a
 * revisão vencida, e ela sai daqui por PR.
 */
export interface TseDependentProgramReview {
  id_arquivo: string
  revisado_em: string
  pacote_url: string
  pacote_sha256: string
  pacote_last_modified: string
  resultado: "ausente_do_pacote"
  referencia: string
}

interface SourceReceipt {
  url: string
  checked_at: string
  http_status: number | null
  payload_raw_sha256: string | null
  artifact_path: string | null
  attempt: number
  error: string | null
}

interface MonitorAlert {
  code: "laudicerio_registration_changed" | "program_file_available"
  message: string
  profile_slug: string
  sq_candidato: string
  details: Record<string, unknown>
}

interface MonitorError {
  profile_slug: string
  sq_candidato: string
  url: string
  error: string
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function validateOfficialUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== "https:" || url.hostname !== TSE_HOST
    || !url.pathname.startsWith("/divulga/rest/v1/candidatura/buscar/2026/")) {
    throw new Error(`endpoint DivulgaCand fora da allowlist: ${raw}`)
  }
  return url
}

function compactExcerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240)
}

async function fetchRawJson(input: {
  url: string
  outputDir: string
  receipts: SourceReceipt[]
  fetchImpl: FetchLike
  now: () => Date
  attempts?: number
}): Promise<Record<string, unknown>> {
  validateOfficialUrl(input.url)
  const rawDir = join(input.outputDir, "raw")
  mkdirSync(rawDir, { recursive: true })
  let lastError = "DivulgaCand sem resposta"
  const attempts = input.attempts ?? 3
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await input.fetchImpl(input.url, {
        headers: {
          accept: "application/json",
          referer: "https://divulgacandcontas.tse.jus.br/divulga/",
          "user-agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(20_000),
      })
      const checkedAt = input.now().toISOString()
      const body = await response.text()
      const payloadHash = sha256(body)
      const artifact = join(rawDir, `${payloadHash}.raw`)
      writeFileSync(artifact, body)
      const receipt: SourceReceipt = {
        url: input.url,
        checked_at: checkedAt,
        http_status: response.status,
        payload_raw_sha256: payloadHash,
        artifact_path: relative(input.outputDir, artifact),
        attempt,
        error: null,
      }
      input.receipts.push(receipt)
      if (!response.ok) {
        lastError = `DivulgaCand HTTP ${response.status}: ${input.url}; payload_sha256=${payloadHash}; body=${compactExcerpt(body)}`
        receipt.error = lastError
        if (![403, 408, 429, 500, 502, 503, 504].includes(response.status)) break
      } else {
        try {
          const parsed: unknown = JSON.parse(body)
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("resposta não é objeto")
          }
          return parsed as Record<string, unknown>
        } catch (error) {
          lastError = `DivulgaCand JSON inválido: ${input.url}; payload_sha256=${payloadHash}; ${error instanceof Error ? error.message : String(error)}`
          receipt.error = lastError
        }
      }
    } catch (error) {
      const checkedAt = input.now().toISOString()
      lastError = `DivulgaCand erro de rede: ${input.url}; ${error instanceof Error ? error.message : String(error)}`
      input.receipts.push({
        url: input.url,
        checked_at: checkedAt,
        http_status: null,
        payload_raw_sha256: null,
        artifact_path: null,
        attempt,
        error: lastError,
      })
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 250))
  }
  throw new Error(lastError)
}

function assertReviewContract(profileSlug: string, reviews: unknown): TseDependentProgramReview[] {
  if (reviews === undefined) return []
  if (!Array.isArray(reviews)) {
    throw new Error(`configuração dos monitores TSE divergiu do contrato: revisoes de ${profileSlug} não é lista`)
  }
  return reviews.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`configuração dos monitores TSE divergiu do contrato: revisão de ${profileSlug} não é objeto`)
    }
    const review = entry as Record<string, unknown>
    for (const field of [
      "id_arquivo",
      "revisado_em",
      "pacote_url",
      "pacote_sha256",
      "pacote_last_modified",
      "referencia",
    ]) {
      const value = review[field]
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`configuração dos monitores TSE divergiu do contrato: revisão de ${profileSlug} sem ${field}`)
      }
    }
    if (!/^[a-f0-9]{64}$/.test(String(review.pacote_sha256))) {
      throw new Error(`configuração dos monitores TSE divergiu do contrato: revisão de ${profileSlug} com pacote_sha256 inválido`)
    }
    if (review.resultado !== "ausente_do_pacote") {
      throw new Error(`configuração dos monitores TSE divergiu do contrato: revisão de ${profileSlug} com resultado não suportado`)
    }
    return review as unknown as TseDependentProgramReview
  })
}

function requiredString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field]
  if (typeof value !== "string" || value.trim() === "") throw new Error(`DivulgaCand sem ${field}`)
  return value.trim()
}

function requireCandidateIdentity(payload: Record<string, unknown>, expectedSq: string): void {
  if (String(payload.id ?? "") !== expectedSq) {
    throw new Error(`DivulgaCand retornou candidatura ${String(payload.id ?? "ausente")} para SQ ${expectedSq}`)
  }
}

function programFiles(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.arquivos)) throw new Error("DivulgaCand sem arquivos[]")
  if (!payload.arquivos.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    throw new Error("DivulgaCand com arquivos[] inválido")
  }
  return payload.arquivos as Array<Record<string, unknown>>
}

export async function collectTseDependentMonitors(
  config: TseDependentMonitorConfig,
  outputDir: string,
  options: { fetchImpl?: FetchLike; now?: () => Date; attempts?: number } = {},
): Promise<{
  schema_version: 1
  generated_at: string
  status: "ok" | "review_required" | "source_error"
  user_agent: string
  endpoints_configured: number
  alerts: MonitorAlert[]
  errors: MonitorError[]
  sources: SourceReceipt[]
  laudicerio: Array<Record<string, unknown>>
  program_control: Record<string, unknown> | null
  program_files: Array<Record<string, unknown>>
  report_sha256: string
}> {
  if (config.schema_version !== 1
    || config.laudicerio.canonical_registration_sq !== null
    || config.laudicerio.registrations.length !== 2
    || config.program_control?.expected_cod_tipo !== "5"
    // Dois desde 2026-09-06: Eduardo Paes (RJ), Vera Lúcia (CE) e Ben Mendes
    // (MG) saíram do monitor depois que os pacotes oficiais passaram a trazer
    // os programas e os registros foram publicados.
    || config.program_files.length !== 2) {
    throw new Error("configuração dos monitores TSE divergiu do contrato")
  }
  const reviewsBySlug = new Map<string, TseDependentProgramReview[]>()
  for (const candidate of config.program_files) {
    reviewsBySlug.set(
      candidate.profile_slug,
      assertReviewContract(candidate.profile_slug, candidate.revisoes),
    )
  }
  mkdirSync(outputDir, { recursive: true })
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())
  const sources: SourceReceipt[] = []
  const alerts: MonitorAlert[] = []
  const errors: MonitorError[] = []
  const laudicerio: Array<Record<string, unknown>> = []
  let programControl: Record<string, unknown> | null = null
  const programs: Array<Record<string, unknown>> = []

  for (const registration of config.laudicerio.registrations) {
    try {
      const payload = await fetchRawJson({
        url: registration.url,
        outputDir,
        receipts: sources,
        fetchImpl,
        now,
        attempts: options.attempts,
      })
      requireCandidateIdentity(payload, registration.sq_candidato)
      const descricaoSituacao = requiredString(payload, "descricaoSituacao")
      const descricaoTotalizacao = requiredString(payload, "descricaoTotalizacao")
      const changed = descricaoSituacao !== registration.expected_descricao_situacao
        || descricaoTotalizacao !== registration.expected_descricao_totalizacao
      laudicerio.push({
        sq_candidato: registration.sq_candidato,
        descricao_situacao: descricaoSituacao,
        descricao_totalizacao: descricaoTotalizacao,
        changed,
      })
      if (changed) alerts.push({
        code: "laudicerio_registration_changed",
        message: config.laudicerio.alert_message,
        profile_slug: config.laudicerio.profile_slug,
        sq_candidato: registration.sq_candidato,
        details: {
          expected_descricao_situacao: registration.expected_descricao_situacao,
          actual_descricao_situacao: descricaoSituacao,
          expected_descricao_totalizacao: registration.expected_descricao_totalizacao,
          actual_descricao_totalizacao: descricaoTotalizacao,
        },
      })
    } catch (error) {
      errors.push({
        profile_slug: config.laudicerio.profile_slug,
        sq_candidato: registration.sq_candidato,
        url: registration.url,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    const control = config.program_control
    const payload = await fetchRawJson({
      url: control.url,
      outputDir,
      receipts: sources,
      fetchImpl,
      now,
      attempts: options.attempts,
    })
    requireCandidateIdentity(payload, control.sq_candidato)
    const files = programFiles(payload)
    const programMatches = files.filter((file) => String(file.codTipo ?? "") === control.expected_cod_tipo)
    if (programMatches.length === 0) throw new Error("controle positivo Jorginho Mello sem arquivo codTipo 5")
    programControl = {
      profile_slug: control.profile_slug,
      sq_candidato: control.sq_candidato,
      program_file_count: programMatches.length,
    }
  } catch (error) {
    errors.push({
      profile_slug: config.program_control.profile_slug,
      sq_candidato: config.program_control.sq_candidato,
      url: config.program_control.url,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  for (const candidate of config.program_files) {
    try {
      const payload = await fetchRawJson({
        url: candidate.url,
        outputDir,
        receipts: sources,
        fetchImpl,
        now,
        attempts: options.attempts,
      })
      requireCandidateIdentity(payload, candidate.sq_candidato)
      const files = programFiles(payload)
      const programMatches = files.filter((file) => String(file.codTipo ?? "") === "5")
      const reviews = reviewsBySlug.get(candidate.profile_slug) ?? []
      // Arquivo sem idArquivo nunca casa com revisão: revisão só silencia o id
      // que ela nomeia, e um anúncio sem id não é nomeável.
      const annotated = programMatches.map((file) => {
        const idArquivo = file.idArquivo == null || String(file.idArquivo).trim() === ""
          ? null
          : String(file.idArquivo)
        const review = idArquivo === null
          ? undefined
          : reviews.find((item) => item.id_arquivo === idArquivo)
        return {
          id_arquivo: file.idArquivo ?? null,
          nome: file.nome ?? null,
          url: file.url ?? null,
          cod_tipo: file.codTipo ?? null,
          revisado: review !== undefined,
          revisao: review
            ? {
              revisado_em: review.revisado_em,
              resultado: review.resultado,
              pacote_url: review.pacote_url,
              pacote_sha256: review.pacote_sha256,
              pacote_last_modified: review.pacote_last_modified,
              referencia: review.referencia,
            }
            : null,
        }
      })
      const pending = annotated.filter((file) => !file.revisado)
      programs.push({
        profile_slug: candidate.profile_slug,
        sq_candidato: candidate.sq_candidato,
        files_total: files.length,
        program_file_count: annotated.length,
        reviewed_program_file_count: annotated.length - pending.length,
        pending_program_file_count: pending.length,
        program_files: annotated,
      })
      if (pending.length > 0) alerts.push({
        code: "program_file_available",
        message: `programa oficial disponível: revisar recibo de ${candidate.profile_slug}`,
        profile_slug: candidate.profile_slug,
        sq_candidato: candidate.sq_candidato,
        details: {
          program_file_count: pending.length,
          reviewed_program_file_count: annotated.length - pending.length,
          pending_id_arquivos: pending.map((file) => file.id_arquivo),
        },
      })
    } catch (error) {
      errors.push({
        profile_slug: candidate.profile_slug,
        sq_candidato: candidate.sq_candidato,
        url: candidate.url,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const core = {
    schema_version: 1 as const,
    generated_at: now().toISOString(),
    status: errors.length > 0 ? "source_error" as const : alerts.length > 0 ? "review_required" as const : "ok" as const,
    user_agent: USER_AGENT,
    endpoints_configured: config.laudicerio.registrations.length + 1 + config.program_files.length,
    alerts,
    errors,
    sources,
    laudicerio,
    program_control: programControl,
    program_files: programs,
  }
  return { ...core, report_sha256: sha256(JSON.stringify(core)) }
}

export function tseDependentMonitorsMarkdown(report: Awaited<ReturnType<typeof collectTseDependentMonitors>>): string {
  const alerts = report.alerts.length > 0
    ? report.alerts.map((alert) => `- **${alert.message}** (${alert.sq_candidato})`).join("\n")
    : "- Nenhuma mudança monitorada."
  const errors = report.errors.length > 0
    ? `\n\n### Erros brutos\n\n${report.errors.map((error) => `- ${error.sq_candidato}: \`${error.error}\``).join("\n")}`
    : ""
  const reviewed = report.program_files.flatMap((program) => {
    const files = Array.isArray(program.program_files) ? program.program_files : []
    return files
      .filter((file): file is Record<string, unknown> => Boolean(file) && typeof file === "object")
      .filter((file) => file.revisado === true)
      .map((file) => {
        const review = file.revisao as Record<string, unknown> | null
        return `- ${String(program.profile_slug)} (SQ ${String(program.sq_candidato)}): arquivo ${String(file.id_arquivo)} anunciado, revisado em ${String(review?.revisado_em)}: ${String(review?.resultado)} (pacote \`${String(review?.pacote_sha256)}\`, ${String(review?.pacote_last_modified)}, ${String(review?.referencia)})`
      })
  })
  const reviews = reviewed.length > 0
    ? `\n\n### Revisões registradas\n\n${reviewed.join("\n")}\n\nRevisão registrada vale só para o \`id_arquivo\` que ela nomeia. Id novo volta a alertar; pacote republicado não expira a revisão sozinho e exige nova conferência.`
    : ""
  return `## Monitores dependentes do TSE\n\n- Estado: **${report.status}**\n- Consultado em: ${report.generated_at}\n- Endpoints configurados: ${report.endpoints_configured}\n- Respostas HTTP preservadas: ${report.sources.filter((source) => source.payload_raw_sha256).length}\n- SHA-256 do relatório: \`${report.report_sha256}\`\n\n### Alertas\n\n${alerts}${reviews}${errors}\n`
}
