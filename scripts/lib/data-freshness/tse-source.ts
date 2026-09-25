import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parse } from "csv-parse/sync"

import { parseCSV } from "../parse-csv-local"
import type { LinhaSiteCandidatoTse } from "../candidate-sites-tse"
import { indexarJulgamentoPorSq, type JulgamentoTse } from "../tse-situacao-julgamento"
import { stripAccents } from "../../../src/lib/strip-accents"
import type { OfficialFichaRow } from "./ficha-tse"
import type { CandidacyRecord, RelevantOffice } from "./types"

export const TSE_CANDIDACY_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
export const TSE_CATALOG_URL =
  "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-2026"

export interface SourceAttempt {
  surface: "cdn" | "catalog"
  url: string
  ok: boolean
  status: number | null
  error: string | null
}

export interface OfficialPackage {
  bytes: Uint8Array
  source_url: string
  source_catalog_url: string
  source_sha256: string
  checked_at: string
  attempts: SourceAttempt[]
}

type FetchLike = typeof fetch

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchZip(url: string, fetcher: FetchLike): Promise<{ bytes: Uint8Array; status: number }> {
  const response = await fetcher(url, {
    headers: { "user-agent": "PuxaFichaDataFreshness/1.0" },
    redirect: "follow",
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("resposta não é um arquivo ZIP válido")
  }
  return { bytes, status: response.status }
}

function catalogZipUrl(payload: unknown): string | null {
  const candidate = payload as {
    success?: boolean
    result?: { resources?: Array<{ url?: string; format?: string; name?: string }> }
  }
  if (!candidate.success) return null
  const resources = candidate.result?.resources ?? []
  const zip = resources.find((resource) =>
    /consulta_cand_2026\.zip(?:$|\?)/i.test(resource.url ?? ""),
  ) ?? resources.find((resource) => /zip/i.test(`${resource.format ?? ""} ${resource.name ?? ""}`))
  return zip?.url ?? null
}

export async function downloadOfficialCandidacies(fetcher: FetchLike = fetch): Promise<OfficialPackage> {
  const attempts: SourceAttempt[] = []
  try {
    const direct = await fetchZip(TSE_CANDIDACY_URL, fetcher)
    attempts.push({ surface: "cdn", url: TSE_CANDIDACY_URL, ok: true, status: direct.status, error: null })
    return packageResult(direct.bytes, TSE_CANDIDACY_URL, attempts)
  } catch (error) {
    attempts.push({
      surface: "cdn",
      url: TSE_CANDIDACY_URL,
      ok: false,
      status: null,
      error: errorMessage(error),
    })
  }

  try {
    const response = await fetcher(TSE_CATALOG_URL, {
      headers: { "user-agent": "PuxaFichaDataFreshness/1.0" },
      redirect: "follow",
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const discoveredUrl = catalogZipUrl(await response.json())
    if (!discoveredUrl) throw new Error("catálogo não informou um ZIP oficial de candidaturas 2026")
    const fallback = await fetchZip(discoveredUrl, fetcher)
    attempts.push({ surface: "catalog", url: discoveredUrl, ok: true, status: fallback.status, error: null })
    return packageResult(fallback.bytes, discoveredUrl, attempts)
  } catch (error) {
    attempts.push({
      surface: "catalog",
      url: TSE_CATALOG_URL,
      ok: false,
      status: null,
      error: errorMessage(error),
    })
    throw new OfficialSourceError("as duas superfícies oficiais do TSE falharam", attempts)
  }
}

function packageResult(bytes: Uint8Array, sourceUrl: string, attempts: SourceAttempt[]): OfficialPackage {
  return {
    bytes,
    source_url: sourceUrl,
    source_catalog_url: TSE_CATALOG_URL,
    source_sha256: createHash("sha256").update(bytes).digest("hex"),
    checked_at: new Date().toISOString(),
    attempts,
  }
}

export class OfficialSourceError extends Error {
  constructor(message: string, readonly attempts: SourceAttempt[]) {
    super(message)
    this.name = "OfficialSourceError"
  }
}

function normalized(value: string): string {
  return stripAccents(value)
    .replace(/[-\u2010-\u2015]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function relevantOffice(value: string): RelevantOffice | null {
  const office = normalized(value) as RelevantOffice
  return ["PRESIDENTE", "VICE PRESIDENTE", "GOVERNADOR", "VICE GOVERNADOR"].includes(office)
    ? office
    : null
}

export async function parseOfficialCandidaciesZip(bytes: Uint8Array): Promise<CandidacyRecord[]> {
  const work = mkdtempSync(join(tmpdir(), "puxaficha-candidaturas-"))
  const zipPath = join(work, "consulta_cand_2026.zip")
  const extracted = join(work, "csv")
  try {
    writeFileSync(zipPath, bytes)
    execFileSync("unzip", ["-qq", "-j", zipPath, "*.csv", "-d", extracted], { stdio: "pipe" })
    const records = new Map<string, CandidacyRecord>()
    for (const filename of readdirSync(extracted).filter((name) => name.endsWith(".csv")).sort()) {
      await parseCSV(join(extracted, filename), (row) => {
        const cargo = relevantOffice(row.DS_CARGO ?? "")
        if (!cargo || row.NR_TURNO !== "1" || !row.SQ_CANDIDATO) return
        const record: CandidacyRecord = {
          sq_candidato: row.SQ_CANDIDATO,
          cargo,
          uf: cargo === "PRESIDENTE" || cargo === "VICE PRESIDENTE" ? null : row.SG_UF,
          sq_coligacao: row.SQ_COLIGACAO ?? "",
          nome_urna: row.NM_URNA_CANDIDATO ?? row.NM_CANDIDATO ?? "",
          partido_sigla: row.SG_PARTIDO ?? "",
          situacao_codigo: row.CD_SITUACAO_CANDIDATURA || row.CD_SITUACAO_CANDIDATO || null,
          situacao_descricao: row.DS_SITUACAO_CANDIDATURA || row.DS_SITUACAO_CANDIDATO || null,
          perfil_slug: null,
        }
        records.set(`${record.sq_candidato}:${record.cargo}`, record)
      })
    }
    if (records.size === 0) throw new Error("ZIP oficial não contém candidaturas relevantes do primeiro turno")
    return [...records.values()]
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export const TSE_COMPLEMENTAR_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip"
export const TSE_REDES_SOCIAIS_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip"

/** Revisão de um recurso oficial lido: de onde, qual conteúdo e quando. */
export interface OfficialResourceRevision {
  url: string
  sha256: string
  checked_at: string
}

export interface OfficialResource extends OfficialResourceRevision {
  bytes: Uint8Array
}

/** Baixa um ZIP oficial auxiliar (complementar, redes) sem fallback de catálogo. */
export async function downloadOfficialResource(url: string, fetcher: FetchLike = fetch): Promise<OfficialResource> {
  const { bytes } = await fetchZip(url, fetcher)
  return {
    bytes,
    url,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    checked_at: new Date().toISOString(),
  }
}

interface LocalCatalog {
  fetched_at?: string
  resources?: Array<{ url?: string; arquivo?: string; sha256?: string }>
}

/**
 * Lê de um diretório local os ZIPs oficiais já baixados, com o `catalog.json`
 * que registrou URL, SHA-256 e horário da coleta. O SHA de cada arquivo é
 * recalculado e precisa bater com o catálogo. Não é leitura ao vivo: quem
 * chama marca o modo como `local_official_zip`.
 */
export function loadLocalOfficialResources(dir: string): {
  candidaturas: OfficialResource
  complementar: OfficialResource | null
  redes: OfficialResource | null
} {
  const catalog = JSON.parse(readFileSync(join(dir, "catalog.json"), "utf8")) as LocalCatalog
  const checkedAt = catalog.fetched_at
  if (!checkedAt || !Number.isFinite(Date.parse(checkedAt))) {
    throw new Error("catalog.json local sem fetched_at válido")
  }
  const read = (arquivo: string, required: boolean): OfficialResource | null => {
    const entry = catalog.resources?.find((resource) => resource.arquivo === arquivo)
    if (!entry?.url || !entry.sha256) {
      if (required) throw new Error(`catalog.json local sem ${arquivo}`)
      return null
    }
    const bytes = new Uint8Array(readFileSync(join(dir, arquivo)))
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    if (sha256 !== entry.sha256) {
      throw new Error(`${arquivo}: SHA-256 ${sha256} diverge do catálogo local ${entry.sha256}`)
    }
    return { bytes, url: entry.url, sha256, checked_at: checkedAt }
  }
  return {
    candidaturas: read("consulta_cand_2026.zip", true)!,
    complementar: read("consulta_cand_complementar_2026.zip", false),
    redes: read("rede_social_candidato_2026.zip", false),
  }
}

/** Linhas do CSV `_BRASIL` de um ZIP do TSE (windows-1252, `;`). */
export function readBrasilCsvRows(bytes: Uint8Array): { header: string[]; rows: Array<Record<string, string>> } {
  const work = mkdtempSync(join(tmpdir(), "puxaficha-tse-brasil-"))
  const zipPath = join(work, "pacote.zip")
  try {
    writeFileSync(zipPath, bytes)
    const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((entry) => /_BRASIL\.csv$/i.test(entry))
    if (entries.length !== 1) throw new Error(`esperado um CSV _BRASIL no pacote, encontrados ${entries.length}`)
    const buffer = execFileSync("unzip", ["-p", zipPath, entries[0]], { maxBuffer: 200 * 1024 * 1024 })
    const rows = parse(new TextDecoder("windows-1252").decode(buffer), {
      bom: true,
      columns: true,
      delimiter: ";",
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, string>>
    return { header: rows.length > 0 ? Object.keys(rows[0]) : [], rows }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const FICHA_ROW_CARGOS = new Set(["PRESIDENTE", "VICE PRESIDENTE", "GOVERNADOR", "VICE GOVERNADOR", "SENADOR"])

/** Registros de 1º turno de Presidente, Governador, Senador e vices, por SQ. */
export function parseOfficialFichaRows(bytes: Uint8Array): OfficialFichaRow[] {
  const { rows } = readBrasilCsvRows(bytes)
  const result: OfficialFichaRow[] = []
  for (const row of rows) {
    const cargo = normalized(row.DS_CARGO ?? "")
    if (!FICHA_ROW_CARGOS.has(cargo) || row.NR_TURNO !== "1" || !row.SQ_CANDIDATO) continue
    result.push({
      sq_candidato: row.SQ_CANDIDATO.trim(),
      cargo,
      uf: (row.SG_UF ?? "").trim().toUpperCase(),
      nome_urna: row.NM_URNA_CANDIDATO ?? "",
      nome_civil: row.NM_CANDIDATO ?? "",
      partido_sigla: row.SG_PARTIDO ?? "",
      numero_urna: row.NR_CANDIDATO ?? "",
      sq_coligacao: row.SQ_COLIGACAO ?? "",
    })
  }
  if (!result.some((row) => row.cargo === "SENADOR")) {
    throw new Error("consulta_cand sem registros de Senador no primeiro turno")
  }
  return result
}

export function parseJulgamentosZip(bytes: Uint8Array): Map<string, JulgamentoTse> {
  const { header, rows } = readBrasilCsvRows(bytes)
  return indexarJulgamentoPorSq(rows, header)
}

export function parseRedesSociaisZip(bytes: Uint8Array): Map<string, LinhaSiteCandidatoTse[]> {
  const { header, rows } = readBrasilCsvRows(bytes)
  for (const column of ["SQ_CANDIDATO", "NR_ORDEM_REDE_SOCIAL", "DS_URL"]) {
    if (!header.includes(column)) throw new Error(`rede_social_candidato sem a coluna ${column}`)
  }
  const bySq = new Map<string, LinhaSiteCandidatoTse[]>()
  for (const row of rows) {
    const sq = (row.SQ_CANDIDATO ?? "").trim()
    if (!sq) continue
    const list = bySq.get(sq) ?? []
    list.push(row as unknown as LinhaSiteCandidatoTse)
    bySq.set(sq, list)
  }
  return bySq
}

export function officialRecordsFromVersionedSnapshot(path: string): CandidacyRecord[] {
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as {
    chapas: Array<{
      uf: string | null
      cargo_titular: "Presidente" | "Governador"
      sq_coligacao: string | null
      tse_situacao_titular_codigo: string
      tse_situacao_vice_codigo: string
      titular: { sq_candidato: string | null; nome_urna: string; partido_sigla: string; perfil_slug: string | null }
      vice: { sq_candidato: string | null; nome_urna: string; partido_sigla: string; perfil_slug: string | null }
    }>
  }
  return snapshot.chapas.flatMap((slate) => {
    const records: CandidacyRecord[] = []
    if (slate.titular.sq_candidato) {
      records.push({
        sq_candidato: slate.titular.sq_candidato,
        cargo: slate.cargo_titular === "Presidente" ? "PRESIDENTE" : "GOVERNADOR",
        uf: slate.uf,
        sq_coligacao: slate.sq_coligacao ?? "",
        nome_urna: slate.titular.nome_urna,
        partido_sigla: slate.titular.partido_sigla,
        situacao_codigo: slate.tse_situacao_titular_codigo,
        situacao_descricao: null,
        perfil_slug: slate.titular.perfil_slug,
      })
    }
    if (slate.vice.sq_candidato) {
      records.push({
        sq_candidato: slate.vice.sq_candidato,
        cargo: slate.cargo_titular === "Presidente" ? "VICE PRESIDENTE" : "VICE GOVERNADOR",
        uf: slate.uf,
        sq_coligacao: slate.sq_coligacao ?? "",
        nome_urna: slate.vice.nome_urna,
        partido_sigla: slate.vice.partido_sigla,
        situacao_codigo: slate.tse_situacao_vice_codigo,
        situacao_descricao: null,
        perfil_slug: slate.vice.perfil_slug,
      })
    }
    return records
  })
}
