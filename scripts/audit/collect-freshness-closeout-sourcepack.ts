/** Read-only, fixed-scope official sourcepack. Raw candidate JSON never reaches disk. */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { collectCandidateVices, DIVULGACAND_BASE, ELECTION_ID_2026, sanitizeVices } from "../lib/data-freshness/divulgacand-current"
import { fetchTseProgramaBytes } from "../lib/programas-governo-extracao"
import { TSE_CANDIDACY_URL } from "../lib/data-freshness/tse-source"
import { parseCSV } from "../lib/parse-csv-local"

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
const CANDIDATES = [
  { sq: "140002554434", uf: "PA", label: "ruth-reis" },
  { sq: "140002551357", uf: "PA", label: "jose-moita" },
  { sq: "140002554426", uf: "PA", label: "marcia-carvalho" },
  { sq: "130002544411", uf: "MG", label: "ben-mendes" },
  { sq: "270002546368", uf: "TO", label: "subtenente-luiz-carlos" },
  { sq: "140002551358", uf: "PA", label: "ruth-reis-vice-anterior" },
] as const
const ZIP_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_MG.zip"
const DETAIL_URLS = new Set(CANDIDATES.map(({ sq, uf }) => `${DIVULGACAND_BASE}/buscar/2026/${uf}/${ELECTION_ID_2026}/candidato/${sq}`))
const SHA = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const DIAGNOSTIC_PHASES = new Set(["initialize", "detail_fetch", "detail_json", "detail_identity", "vice_parse", "binary_fetch", "binary_validate", "binary_write", "csv_fetch", "csv_validate", "csv_zip", "csv_parse", "csv_scope", "report_write", "sourcepack"])
const DIAGNOSTIC_NAMES = new Set(["Error", "TypeError", "SyntaxError", "RangeError", "AbortError", "TimeoutError", "CsvError"])
const DIAGNOSTIC_CODES = new Set(["ENOENT", "EACCES", "ENOSPC", "ENOBUFS", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ERR_STREAM_PREMATURE_CLOSE", "HTTP_ERROR", "INVALID_FORMAT", "IDENTITY_MISMATCH", "INVALID_VICE", "SIZE_LIMIT", "REDIRECT_BLOCKED", "URL_NOT_ALLOWED", "CSV_MEMBERS_INVALID", "CSV_CONFLICT", "CSV_INCOMPLETE", "CSV_INVALID_CLOSING_QUOTE", "CSV_QUOTE_NOT_CLOSED"])
const DIAGNOSTIC_SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGABRT"])

// Read data properties only: neither error getters nor message/cause.message are evaluated.
function diagnosticField(value: unknown, key: string): unknown {
  try {
    let current = value
    for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (descriptor) return descriptor.value
      current = Object.getPrototypeOf(current)
    }
  } catch { /* A hostile error object is not diagnostic evidence. */ }
  return undefined
}

export function sanitizeSourcepackDiagnostic(phase: unknown, error: unknown) {
  const name = diagnosticField(error, "name")
  const ownCode = diagnosticField(error, "code")
  const nestedCode = diagnosticField(diagnosticField(error, "cause"), "code")
  const code = typeof ownCode === "string" && DIAGNOSTIC_CODES.has(ownCode) ? ownCode
    : typeof nestedCode === "string" && DIAGNOSTIC_CODES.has(nestedCode) ? nestedCode : null
  const status = diagnosticField(error, "status")
  const signal = diagnosticField(error, "signal")
  return {
    phase: typeof phase === "string" && DIAGNOSTIC_PHASES.has(phase) ? phase : "unknown",
    name: typeof name === "string" && DIAGNOSTIC_NAMES.has(name) ? name : "unknown", code,
    status: typeof status === "number" && Number.isInteger(status) && status >= 0 && status <= 599 ? status : null,
    signal: typeof signal === "string" && DIAGNOSTIC_SIGNALS.has(signal) ? signal : null,
  }
}

class SafeSourcepackError extends Error {
  constructor(readonly diagnostic: ReturnType<typeof sanitizeSourcepackDiagnostic>) { super("sourcepack failed") }
}

function failure(code: string, message: string, status?: number) { return Object.assign(new Error(message), { code, status }) }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null
  // A selected text field must not smuggle contact identifiers into a public artifact.
  if (/@|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\(?\d{2}\)?[ -]?9?\d{4}[ -]?\d{4}\b/.test(value)) return null
  return value.replace(/[\u0000-\u001f]/g, " ").trim()
}

function code(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value
  if (typeof value === "string" && /^[\d-]{1,32}$/.test(value)) return value
  return null
}

/** Schema diagnostic: only field paths and types, never unknown field values. */
export function sourceShape(payload: unknown): Record<string, string> {
  const shape: Record<string, string> = {}
  function visit(value: unknown, prefix: string, depth: number) {
    if (depth > 3) return
    for (const [key, child] of Object.entries(object(value)).slice(0, 150)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(key)) continue
      const path = prefix ? `${prefix}.${key}` : key
      shape[path] = child === null ? "null" : Array.isArray(child) ? "array" : typeof child
      if (Array.isArray(child)) { if (child.length) visit(child[0], `${path}[]`, depth + 1) }
      else if (child && typeof child === "object") visit(child, path, depth + 1)
    }
  }
  visit(payload, "", 0)
  return shape
}

const CSV_FIELDS = [
  "DT_GERACAO", "HH_GERACAO", "ANO_ELEICAO", "CD_ELEICAO", "NR_TURNO", "SG_UF",
  "SQ_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO", "NR_CANDIDATO", "DS_CARGO", "CD_CARGO",
  "NR_PARTIDO", "SG_PARTIDO", "NM_PARTIDO", "SQ_COLIGACAO", "NM_COLIGACAO", "DS_COMPOSICAO_COLIGACAO", "TP_AGREMIACAO",
  "DT_NASCIMENTO", "SG_UF_NASCIMENTO", "NM_MUNICIPIO_NASCIMENTO", "DS_GRAU_INSTRUCAO", "DS_OCUPACAO",
  "DS_GENERO", "DS_ESTADO_CIVIL", "DS_COR_RACA", "CD_SITUACAO_CANDIDATURA", "DS_SITUACAO_CANDIDATURA",
  "CD_SITUACAO_CANDIDATO", "DS_SITUACAO_CANDIDATO", "DS_SITUACAO_CANDIDATO_PLEITO", "DS_SIT_TOT_TURNO",
] as const
const CANDIDATE_SQS = new Set<string>(CANDIDATES.map((candidate) => candidate.sq))

export function sanitizeCandidateCsvRow(row: Record<string, string>): Record<string, string | null> | null {
  if (!CANDIDATE_SQS.has(row.SQ_CANDIDATO) || row.NR_TURNO !== "1") return null
  return Object.fromEntries(CSV_FIELDS.map((key) => [key, /^SQ_|^CD_|^NR_|^ANO_/.test(key) ? String(code(row[key]) ?? "") || null : text(row[key])]))
}

export async function parseCandidatePackage(bytes: Buffer, onPhase: (phase: string) => void = () => {}) {
  onPhase("csv_validate")
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw failure("INVALID_FORMAT", "pacote de candidaturas inválido")
  const privateDir = mkdtempSync(join(tmpdir(), "pf-private-candidacy-sourcepack-"))
  try {
    const archive = join(privateDir, "consulta_cand_2026.zip")
    writeFileSync(archive, bytes, { mode: 0o600 })
    onPhase("csv_zip")
    const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }).trim().split(/\r?\n/)
      .filter((entry) => /^[A-Za-z0-9_/-]+\.csv$/.test(entry) && !entry.includes("..") && !entry.startsWith("/")
        && /^consulta_cand_2026_(BRASIL|PA|MG|TO)\.csv$/.test(basename(entry)))
    const brasil = entries.filter((entry) => basename(entry) === "consulta_cand_2026_BRASIL.csv")
    const selected = brasil.length ? brasil : entries
    if (!selected.length || selected.length > 3) throw failure("CSV_MEMBERS_INVALID", "CSV canônico ausente ou ambíguo")
    const records = new Map<string, Record<string, string | null>>()
    const members: Array<{ member: string; raw_sha256: string; bytes: number }> = []
    for (const entry of selected) {
      onPhase("csv_zip")
      const csv = execFileSync("unzip", ["-p", archive, entry], { timeout: 60_000, maxBuffer: 512 * 1024 * 1024 })
      members.push({ member: entry, raw_sha256: SHA(csv), bytes: csv.length })
      const csvPath = join(privateDir, basename(entry))
      writeFileSync(csvPath, csv, { mode: 0o600 })
      onPhase("csv_parse")
      await parseCSV(csvPath, (row) => {
        const safe = sanitizeCandidateCsvRow(row)
        if (!safe) return
        const sq = safe.SQ_CANDIDATO!
        const previous = records.get(sq)
        if (previous && JSON.stringify(previous) !== JSON.stringify(safe)) throw failure("CSV_CONFLICT", "SQ com linhas oficiais divergentes")
        records.set(sq, safe)
      })
    }
    const missingSqs = CANDIDATES.filter((candidate) => !records.has(candidate.sq)).map((candidate) => candidate.sq)
    return {
      members, complete: missingSqs.length === 0, missing_sqs: missingSqs,
      records: CANDIDATES.flatMap((candidate) => records.has(candidate.sq) ? [records.get(candidate.sq)!] : []),
    }
  } finally { rmSync(privateDir, { recursive: true, force: true }) }
}

export function safeProgramUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.hostname !== "divulgacandcontas.tse.jus.br"
      || url.username || url.password || url.port || url.search || url.hash
      || !/(?:^|\/)130017139584(?:\.pdf)?(?:\/|$)/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}

function safePhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.hostname !== "divulgacandcontas.tse.jus.br"
      || url.username || url.password || url.port || url.search || url.hash
      || !/^\/divulga\/(?:images\/|rest\/arquivo\/img\/)/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}

export function sanitizeDetail(payload: unknown, expectedSq: string) {
  const row = object(payload)
  if (String(row.id ?? "") !== expectedSq) throw failure("IDENTITY_MISMATCH", "identidade da candidatura divergiu")
  const party = object(row.partido)
  const office = object(row.cargo)
  const vices = sanitizeVices(row).map((vice) => {
    if (!/^\d{1,15}$/.test(vice.sq_candidato) || !text(vice.name)) throw failure("INVALID_VICE", "vice com campos inválidos")
    return { ...vice, name: text(vice.name)! }
  })
  return {
    id: expectedSq,
    source_shape: sourceShape(row),
    nomeUrna: text(row.nomeUrna), nomeCompleto: text(row.nomeCompleto), numero: code(row.numero),
    descricaoSituacao: text(row.descricaoSituacao), descricaoTotalizacao: text(row.descricaoTotalizacao),
    descricaoSituacaoComplementar: text(row.descricaoSituacaoComplementar),
    codigoSituacao: code(row.codigoSituacao), codigoSituacaoCandidato: code(row.codigoSituacaoCandidato),
    situacaoCandidato: text(row.situacaoCandidato), dataUltimaAtualizacao: text(row.dataUltimaAtualizacao),
    dataDeNascimento: text(row.dataDeNascimento) ?? code(row.dataDeNascimento),
    municipioNascimento: text(row.municipioNascimento), ufNascimento: text(row.ufNascimento),
    grauInstrucao: text(row.grauInstrucao), ocupacao: text(row.ocupacao),
    genero: text(row.genero), sexo: text(row.sexo), estadoCivil: text(row.estadoCivil), corRaca: text(row.corRaca),
    fotoUrl: safePhotoUrl(row.fotoUrl),
    uf: text(row.uf), localCandidatura: text(row.localCandidatura),
    nomeColigacao: text(row.nomeColigacao), composicaoColigacao: text(row.composicaoColigacao),
    cargo: { codigo: code(office.codigo), nome: text(office.nome) },
    partido: { numero: code(party.numero), sigla: text(party.sigla), nome: text(party.nome) },
    vices,
    arquivos: (Array.isArray(row.arquivos) ? row.arquivos : []).map(object)
      .filter((file) => String(file.codTipo) === "5" && String(file.idArquivo) === "130017139584")
      .map((file) => ({ idArquivo: "130017139584", codTipo: "5", nome: text(file.nome), url: safeProgramUrl(file.url) })),
  }
}

export async function fetchBounded(url: string, maxBytes: number, timeoutMs: number, fetchImpl: FetchLike = fetch) {
  if (!DETAIL_URLS.has(url) && url !== ZIP_URL && url !== TSE_CANDIDACY_URL && safeProgramUrl(url) !== url) throw failure("URL_NOT_ALLOWED", "URL fora da allowlist")
  const response = await fetchImpl(url, {
    redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json, application/pdf, application/zip", referer: "https://divulgacandcontas.tse.jus.br/divulga/", "user-agent": "PuxaFichaDataFreshness/1.0" },
  })
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw failure("REDIRECT_BLOCKED", "redirect recusado", response.status) }
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw failure("SIZE_LIMIT", "corpo excede limite", response.status) }
  const reader = response.body?.getReader()
  const chunks: Buffer[] = []
  let size = 0
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maxBytes) { await reader.cancel(); throw failure("SIZE_LIMIT", "corpo excede limite", response.status) }
        chunks.push(Buffer.from(chunk.value))
      }
    } finally { reader.releaseLock() }
  }
  return { response, bytes: Buffer.concat(chunks) }
}

type Receipt = {
  url: string; checked_at: string; http_status: number; payload_raw_sha256: string;
  bytes: number; last_modified: string | null; etag: string | null; content_type: string | null;
  artifact_path: string | null;
}

export async function collectFreshnessCloseoutSourcepack(outputDir: string, options: { fetchImpl?: FetchLike; now?: () => Date } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())
  try { mkdirSync(outputDir, { recursive: true }) } catch (error) { throw new SafeSourcepackError(sanitizeSourcepackDiagnostic("initialize", error)) }
  const receipts: Receipt[] = []
  const candidates: Array<ReturnType<typeof sanitizeDetail> & { source: string; label: string }> = []
  const errors: Array<{ target: string; reason: string; diagnostic: ReturnType<typeof sanitizeSourcepackDiagnostic> }> = []
  const record = (url: string, result: Awaited<ReturnType<typeof fetchBounded>>) => {
    const receipt: Receipt = {
      url, checked_at: now().toISOString(), http_status: result.response.status,
      payload_raw_sha256: SHA(result.bytes), bytes: result.bytes.length,
      last_modified: text(result.response.headers.get("last-modified")),
      etag: text(result.response.headers.get("etag")), content_type: text(result.response.headers.get("content-type")), artifact_path: null,
    }
    receipts.push(receipt)
    return receipt
  }
  for (const candidate of CANDIDATES) {
    let phase = "detail_fetch"
    let diagnostic: ReturnType<typeof sanitizeSourcepackDiagnostic> | undefined
    try {
      let selected: ReturnType<typeof sanitizeDetail> | undefined
      const official = await collectCandidateVices(candidate.sq, candidate.uf, async (input) => {
        phase = "detail_fetch"
        try {
        const url = String(input)
        const result = await fetchBounded(url, 2 * 1024 * 1024, 20_000, fetchImpl)
        record(url, result)
        if (result.response.ok) {
          phase = "detail_json"
          const payload: unknown = JSON.parse(result.bytes.toString("utf8"))
          phase = "detail_identity"
          selected = sanitizeDetail(payload, candidate.sq)
        } else diagnostic = sanitizeSourcepackDiagnostic(phase, failure("HTTP_ERROR", "HTTP não aprovado", result.response.status))
        // Canonical collector receives only the allowlisted object, never unfiltered JSON.
        const canonicalVices = selected?.vices.map((vice) => ({ sq_CANDIDATO: vice.sq_candidato, nm_URNA: vice.name, situacaoVice: vice.situacao_vice }))
        return new Response(result.response.ok ? JSON.stringify({ vices: canonicalVices }) : "source_error", { status: result.response.status })
        } catch (error) { diagnostic = sanitizeSourcepackDiagnostic(phase, error); throw error }
      })
      if (!selected) throw new Error("detalhe não obtido")
      // Preserve canonical vice parser output from the original payload, already sanitized above.
      candidates.push({ ...selected, vices: official.vices, source: official.source, label: candidate.label })
    } catch (error) { errors.push({ target: candidate.sq, reason: "detalhe indisponível, inválido ou identidade divergente; consultar recibos HTTP", diagnostic: diagnostic ?? sanitizeSourcepackDiagnostic(phase, error) }) }
  }

  async function binary(url: string, filename: string, kind: "pdf" | "zip"): Promise<boolean> {
    let phase = "binary_fetch"
    try {
      let receipt: Receipt | undefined
      const bytes = await fetchTseProgramaBytes(url, { fetchBytes: async (officialUrl) => {
        const result = await fetchBounded(officialUrl, kind === "pdf" ? 64 * 1024 * 1024 : 256 * 1024 * 1024, 120_000, fetchImpl)
        receipt = record(officialUrl, result)
        if (!result.response.ok) throw failure("HTTP_ERROR", "HTTP não aprovado", result.response.status)
        return result.bytes
      } })
      phase = "binary_validate"
      const valid = kind === "pdf" ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
        : bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
      if (!valid) throw failure("INVALID_FORMAT", "magic bytes incompatíveis")
      phase = "binary_write"
      writeFileSync(join(outputDir, filename), bytes)
      receipt!.artifact_path = filename
      return true
    } catch (error) { errors.push({ target: url, reason: "arquivo indisponível, inválido ou acima do limite; nenhum corpo de erro persistido", diagnostic: sanitizeSourcepackDiagnostic(phase, error) }); return false }
  }
  const file = candidates.find((candidate) => candidate.id === "130002544411")?.arquivos[0]
  const directPdf = file?.url ? await binary(file.url, "ben-mendes-130017139584.pdf", "pdf") : false
  if (!directPdf) await binary(ZIP_URL, "proposta_governo_2026_MG.zip", "zip")
  let officialCsv: Awaited<ReturnType<typeof parseCandidatePackage>> | null = null
  let csvPhase = "csv_fetch"
  try {
    const result = await fetchBounded(TSE_CANDIDACY_URL, 128 * 1024 * 1024, 120_000, fetchImpl)
    record(TSE_CANDIDACY_URL, result)
    if (!result.response.ok) throw failure("HTTP_ERROR", "HTTP não aprovado", result.response.status)
    officialCsv = await parseCandidatePackage(result.bytes, (phase) => { csvPhase = phase })
    if (!officialCsv.complete) errors.push({ target: TSE_CANDIDACY_URL, reason: `pacote consultado ainda não contém SQs: ${officialCsv.missing_sqs.join(",")}; recorte existente preservado, sem inferir situação da pessoa`, diagnostic: sanitizeSourcepackDiagnostic("csv_scope", failure("CSV_INCOMPLETE", "recorte parcial")) })
  } catch (error) { errors.push({ target: TSE_CANDIDACY_URL, reason: "CSV indisponível, inválido, incompleto ou acima do limite; nenhum dado bruto persistido no artefato", diagnostic: sanitizeSourcepackDiagnostic(csvPhase, error) }) }
  const report = {
    schema_version: 1, generated_at: now().toISOString(), scope: "freshness-closeout-readonly",
    privacy: "allowlisted candidate fields only; original JSON bytes hashed but never persisted",
    direct_pdf_metadata_url: file?.url ?? null, candidates, official_csv: officialCsv, receipts, errors,
  }
  try { writeFileSync(join(outputDir, "sourcepack.json"), `${JSON.stringify(report, null, 2)}\n`) } catch (error) { throw new SafeSourcepackError(sanitizeSourcepackDiagnostic("report_write", error)) }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputDir = resolve("reports/freshness-closeout-sourcepack")
  collectFreshnessCloseoutSourcepack(outputDir).then((report) => {
    console.log(JSON.stringify({ outputDir, candidates: report.candidates.length, receipts: report.receipts.length, errors: report.errors.length }))
    if (report.errors.length) process.exitCode = 1
  }).catch((error: unknown) => {
    console.error(JSON.stringify({ error: "sourcepack_failed", diagnostic: error instanceof SafeSourcepackError ? error.diagnostic : sanitizeSourcepackDiagnostic("sourcepack", error) }))
    process.exitCode = 1
  })
}
