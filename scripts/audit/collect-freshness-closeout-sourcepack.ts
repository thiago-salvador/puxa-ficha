/** Read-only, fixed-scope official sourcepack. Raw candidate JSON never reaches disk. */
import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { collectCandidateVices, DIVULGACAND_BASE, ELECTION_ID_2026, sanitizeVices } from "../lib/data-freshness/divulgacand-current"
import { fetchTseProgramaBytes } from "../lib/programas-governo-extracao"

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
  if (String(row.id ?? "") !== expectedSq) throw new Error("identidade da candidatura divergiu")
  const party = object(row.partido)
  const office = object(row.cargo)
  const vices = sanitizeVices(row).map((vice) => {
    if (!/^\d{1,15}$/.test(vice.sq_candidato) || !text(vice.name)) throw new Error("vice com campos inválidos")
    return { ...vice, name: text(vice.name)! }
  })
  return {
    id: expectedSq,
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
  if (!DETAIL_URLS.has(url) && url !== ZIP_URL && safeProgramUrl(url) !== url) throw new Error("URL fora da allowlist")
  const response = await fetchImpl(url, {
    redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json, application/pdf, application/zip", referer: "https://divulgacandcontas.tse.jus.br/divulga/", "user-agent": "PuxaFichaDataFreshness/1.0" },
  })
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error("redirect recusado") }
  if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new Error("corpo excede limite") }
  const reader = response.body?.getReader()
  const chunks: Buffer[] = []
  let size = 0
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maxBytes) { await reader.cancel(); throw new Error("corpo excede limite") }
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
  mkdirSync(outputDir, { recursive: true })
  const receipts: Receipt[] = []
  const candidates: Array<ReturnType<typeof sanitizeDetail> & { source: string; label: string }> = []
  const errors: Array<{ target: string; reason: string }> = []
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
    try {
      let selected: ReturnType<typeof sanitizeDetail> | undefined
      const official = await collectCandidateVices(candidate.sq, candidate.uf, async (input) => {
        const url = String(input)
        const result = await fetchBounded(url, 2 * 1024 * 1024, 20_000, fetchImpl)
        record(url, result)
        if (result.response.ok) selected = sanitizeDetail(JSON.parse(result.bytes.toString("utf8")), candidate.sq)
        // Canonical collector receives only the allowlisted object, never unfiltered JSON.
        const canonicalVices = selected?.vices.map((vice) => ({ sq_CANDIDATO: vice.sq_candidato, nm_URNA: vice.name, situacaoVice: vice.situacao_vice }))
        return new Response(result.response.ok ? JSON.stringify({ vices: canonicalVices }) : "source_error", { status: result.response.status })
      })
      if (!selected) throw new Error("detalhe não obtido")
      // Preserve canonical vice parser output from the original payload, already sanitized above.
      candidates.push({ ...selected, vices: official.vices, source: official.source, label: candidate.label })
    } catch { errors.push({ target: candidate.sq, reason: "detalhe indisponível, inválido ou identidade divergente; consultar recibos HTTP" }) }
  }

  async function binary(url: string, filename: string, kind: "pdf" | "zip"): Promise<boolean> {
    try {
      let receipt: Receipt | undefined
      const bytes = await fetchTseProgramaBytes(url, { fetchBytes: async (officialUrl) => {
        const result = await fetchBounded(officialUrl, kind === "pdf" ? 64 * 1024 * 1024 : 256 * 1024 * 1024, 120_000, fetchImpl)
        receipt = record(officialUrl, result)
        if (!result.response.ok) throw new Error("HTTP não aprovado")
        return result.bytes
      } })
      const valid = kind === "pdf" ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
        : bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
      if (!valid) throw new Error("magic bytes incompatíveis")
      writeFileSync(join(outputDir, filename), bytes)
      receipt!.artifact_path = filename
      return true
    } catch { errors.push({ target: url, reason: "arquivo indisponível, inválido ou acima do limite; nenhum corpo de erro persistido" }); return false }
  }
  const file = candidates.find((candidate) => candidate.id === "130002544411")?.arquivos[0]
  const directPdf = file?.url ? await binary(file.url, "ben-mendes-130017139584.pdf", "pdf") : false
  if (!directPdf) await binary(ZIP_URL, "proposta_governo_2026_MG.zip", "zip")
  const report = {
    schema_version: 1, generated_at: now().toISOString(), scope: "freshness-closeout-readonly",
    privacy: "allowlisted candidate fields only; original JSON bytes hashed but never persisted",
    direct_pdf_metadata_url: file?.url ?? null, candidates, receipts, errors,
  }
  writeFileSync(join(outputDir, "sourcepack.json"), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputDir = resolve("reports/freshness-closeout-sourcepack")
  collectFreshnessCloseoutSourcepack(outputDir).then((report) => {
    console.log(JSON.stringify({ outputDir, candidates: report.candidates.length, receipts: report.receipts.length, errors: report.errors.length }))
    if (report.errors.length) process.exitCode = 1
  }).catch(() => { console.error("sourcepack falhou antes do relatório; nenhum payload bruto foi registrado"); process.exitCode = 1 })
}
