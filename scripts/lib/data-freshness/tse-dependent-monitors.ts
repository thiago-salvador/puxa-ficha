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
  }>
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
    // Quatro desde 2026-09-03: Eduardo Paes (RJ) saiu porque o pacote oficial
    // republicado em 2026-09-02 passou a trazer o programa e o registro foi
    // publicado. Vera Lúcia (CE) fica: a DivulgaCandContas lista codTipo 5, mas
    // o pacote oficial de CE ainda não carrega o PDF.
    || config.program_files.length !== 4) {
    throw new Error("configuração dos monitores TSE divergiu do contrato")
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
      programs.push({
        profile_slug: candidate.profile_slug,
        sq_candidato: candidate.sq_candidato,
        files_total: files.length,
        program_files: programMatches.map((file) => ({
          id_arquivo: file.idArquivo ?? null,
          nome: file.nome ?? null,
          url: file.url ?? null,
          cod_tipo: file.codTipo ?? null,
        })),
      })
      if (programMatches.length > 0) alerts.push({
        code: "program_file_available",
        message: `programa oficial disponível: revisar recibo de ${candidate.profile_slug}`,
        profile_slug: candidate.profile_slug,
        sq_candidato: candidate.sq_candidato,
        details: { program_file_count: programMatches.length },
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
  return `## Monitores dependentes do TSE\n\n- Estado: **${report.status}**\n- Consultado em: ${report.generated_at}\n- Endpoints configurados: 8\n- Respostas HTTP preservadas: ${report.sources.filter((source) => source.payload_raw_sha256).length}\n- SHA-256 do relatório: \`${report.report_sha256}\`\n\n### Alertas\n\n${alerts}${errors}\n`
}
