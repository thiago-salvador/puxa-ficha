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

import { parseCSV } from "../parse-csv-local"
import { stripAccents } from "../../../src/lib/strip-accents"
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
