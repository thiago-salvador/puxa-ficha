/**
 * Gera recibos locais, somente leitura, para as quatro famílias deriváveis dos
 * pacotes oficiais de dados abertos do TSE.
 *
 * O comando não baixa, não consulta banco e não materializa dados. Cada ZIP
 * deve ser fornecido por um manifesto privado com URL oficial, caminho local e
 * SHA-256. O relatório contém apenas slugs, contagens e digests; nunca copia
 * nome, CPF, e-mail, endereço ou conteúdo textual dos CSVs.
 *
 * Uso:
 *   node --import tsx scripts/audit/collect-tse-family-receipts-local.ts \
 *     --manifest=/privado/tse-assets.json --out=/privado/recibos.json \
 *     [--candidates=data/candidatos.json] [--materialized=/privado/readback.json]
 *     [--public-profiles=/privado/perfis-publicos.json]
 */
import { createHash } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { parseCSV } from "../lib/parse-csv-local"
import { publicFamilyPayloadSha256, publicFamilyRowCount } from "./lib/coverage-source-proof"
import type { CoverageProfile } from "./audit-cobertura-fichas"

export const TSE_FAMILIES = ["perfil_atual", "historico_politico", "patrimonio", "financiamento"] as const
export type TseFamily = (typeof TSE_FAMILIES)[number]
export const TSE_SOURCE_BY_FAMILY: Record<TseFamily, "tse" | "tse-historico" | "tse-patrimonio" | "tse-financiamento"> = {
  perfil_atual: "tse", historico_politico: "tse-historico", patrimonio: "tse-patrimonio", financiamento: "tse-financiamento",
}

const OFFICIAL_HOST = "https://cdn.tse.jus.br/"
const CORE_FIELDS = [
  "partido_sigla", "situacao_candidatura", "foto_url", "biografia", "naturalidade",
  "data_nascimento", "formacao", "profissao_declarada", "genero", "estado_civil", "cor_raca",
] as const

type Row = Record<string, string>
type Candidate = {
  slug: string
  id?: string
  candidato_id?: string
  ids?: { tse_sq_candidato?: Record<string, string>; tse_uf_candidatura?: Record<string, string> }
}
export type SourceAsset = { family: TseFamily; year: number; path: string; url: string; sha256: string }
export type MaterializedReadback = {
  slug: string
  family: TseFamily
  candidato_id: string
  /** Perfil público lido por id+slug, sem digest declarado pelo chamador. */
  public_profile: CoverageProfile
  core_fields?: string[]
  source_years?: number[]
}
type Manifest = { assets: SourceAsset[] }

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function canonicalDigest(rows: readonly Row[], fields: readonly string[]): string {
  const selected = rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? ""])))
    .sort((a, b) => stable(a).localeCompare(stable(b)))
  return createHash("sha256").update(stable(selected)).digest("hex")
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : "" }
function validSha(value: string): boolean { return /^[a-f0-9]{64}$/i.test(value) }
function validOfficialUrl(value: string): boolean { return value.startsWith(OFFICIAL_HOST) && !/[\r\n]/.test(value) }
function arg(name: string, required = true): string | undefined {
  const prefix = `--${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)
  if (!value && required) throw new Error(`argumento obrigatório: ${prefix}<arquivo>`)
  return value ? resolve(value) : undefined
}

function sourcePattern(family: TseFamily): RegExp {
  if (family === "perfil_atual" || family === "historico_politico") return /consulta_cand(?:_complementar)?_/i
  if (family === "patrimonio") return /(?:bem[_-]candidato|consulta_cand_complementar)_/i
  return /receitas?[^/]*candid[^/]*\.(?:csv|txt)$/i
}

export function selectCsvMembers(listing: string, family: TseFamily): string[] {
  const matches = listing.split(/\r?\n/).filter((member) => /\.(?:csv|txt)$/i.test(member) && sourcePattern(family).test(member))
  const base = family === "financiamento"
    ? matches.filter((member) => !/doador[_-]?originario|(?:_|-)sup\.(?:csv|txt)$/i.test(member))
    : matches
  const national = base.filter((member) => /(?:_|-)brasil\.(?:csv|txt)$/i.test(member))
  return national.length === 1 ? national : base
}

function csvMembers(zipPath: string, family: TseFamily): string[] {
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
  return selectCsvMembers(listing, family)
}

async function readRows(zipPath: string, family: TseFamily, wantedSq: ReadonlySet<string>): Promise<Row[]> {
  const members = csvMembers(zipPath, family)
  if (members.length === 0) throw new Error(`ZIP ${basename(zipPath)} sem CSV compatível com ${family}`)
  const work = mkdtempSync(resolve(tmpdir(), "pf-tse-family-"))
  const rows: Row[] = []
  try {
    for (const member of members) {
      const path = resolve(work, basename(member))
      const child = spawn("unzip", ["-p", zipPath, member], { stdio: ["ignore", "pipe", "pipe"] })
      const exit = new Promise<number>((accept, reject) => {
        child.once("error", reject)
        child.once("close", (code) => accept(code ?? 1))
      })
      const stderr: Buffer[] = []
      child.stderr.on("data", (chunk: Buffer) => { if (stderr.reduce((n, part) => n + part.length, 0) < 4096) stderr.push(chunk) })
      await pipeline(child.stdout, createWriteStream(path, { mode: 0o600 }))
      if (await exit !== 0) throw new Error(`unzip falhou para ${basename(zipPath)}: ${Buffer.concat(stderr).toString("utf8").slice(0, 400)}`)
      await parseCSV(path, (row) => { if (wantedSq.has(rowSq(row))) rows.push(row) })
    }
  } finally { rmSync(work, { recursive: true, force: true }) }
  return rows
}

function rowSq(row: Row): string { return text(row.SQ_CANDIDATO || row.SQ_CANDIDATO_2026 || row.SEQUENCIAL_CANDIDATO || row["Sequencial Candidato"]) }
function rowUf(row: Row): string {
  return text(row.SG_UF || row.SG_UF_CANDIDATURA || row.UF || row.SG_UE_SUPERIOR || row.UNIDADE_ELEITORAL_CANDIDATO || row.SG_UE).toUpperCase()
}
function rowYear(row: Row, fallback: number): number {
  const value = Number(text(row.ANO_ELEICAO || row.ANO || row.ANO_CANDIDATURA))
  return Number.isInteger(value) && value > 1900 ? value : fallback
}

const FIELDS: Record<TseFamily, readonly string[]> = {
  perfil_atual: ["SQ_CANDIDATO", "SG_UF", "ANO_ELEICAO", "DS_CARGO", "SG_PARTIDO", "NM_URNA_CANDIDATO", "DS_SITUACAO_CANDIDATURA", "CD_SITUACAO_CANDIDATURA", "DT_ELEICAO"],
  historico_politico: ["SQ_CANDIDATO", "SG_UF", "ANO_ELEICAO", "DS_CARGO", "SG_PARTIDO", "DS_SITUACAO_CANDIDATURA", "CD_SITUACAO_CANDIDATURA", "NR_TURNO"],
  patrimonio: ["SQ_CANDIDATO", "SG_UF", "ANO_ELEICAO", "VR_BEM_CANDIDATO", "DS_TIPO_BEM_CANDIDATO", "DS_BEM_CANDIDATO"],
  financiamento: ["SQ_CANDIDATO", "SG_UF_CANDIDATURA", "ANO_ELEICAO", "VR_RECEITA", "DS_FONTE_RECEITA", "DS_ORIGEM_RECEITA", "DS_TIPO_RECEITA"],
}

function identityRows(rows: readonly Row[], candidate: Candidate, year: number, officialUf?: ReadonlyMap<string, string | null>): Row[] {
  const sq = text(candidate.ids?.tse_sq_candidato?.[String(year)])
  const seedUf = text(candidate.ids?.tse_uf_candidatura?.[String(year)]).toUpperCase()
  const observedUf = sq ? officialUf?.get(`${year}|${sq}`) : undefined
  if (observedUf === null) return []
  if (seedUf && observedUf && seedUf !== observedUf) return []
  const uf = seedUf || observedUf || ""
  if (!sq) return []
  if (!uf) return []
  return rows.filter((row) => rowSq(row) === sq && rowYear(row, year) === year && rowUf(row) === uf)
}

function normalized(value: unknown): string {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase()
}

function publicFamilyEntries(profile: CoverageProfile, family: TseFamily): Record<string, unknown>[] {
  const key = family === "historico_politico" ? "historico" : family === "patrimonio" ? "patrimonio_eleicoes" : family === "financiamento" ? "financiamento_eleicoes" : ""
  const value = key ? profile[key] : null
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : []
}

export function money(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : Number.NaN
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value || value === "#NULO#" || value === "#NE#" || value === "-1") return Number.NaN
  const parsed = value.includes(",") ? Number(value.replace(/\./g, "").replace(",", ".")) : Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function numberEqual(left: number, right: number): boolean { return Math.abs(left - right) < 0.005 }

function comparePatrimonio(profile: CoverageProfile, rows: readonly Row[]): boolean {
  const raw = Array.isArray(profile.patrimonio) ? profile.patrimonio.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : []
  const series = publicFamilyEntries(profile, "patrimonio")
  const byYear = new Map<number, { total: number; bens: Array<{ tipo: string; descricao: string; valor: number }> }>()
  for (const row of rows) {
    const year = rowYear(row, 0)
    if (!year) return false
    const item = byYear.get(year) ?? { total: 0, bens: [] }
    const value = money(row.VR_BEM_CANDIDATO || row.VR_BEM || row.VALOR_BEM)
    item.total += value
    item.bens.push({ tipo: normalized(row.DS_TIPO_BEM_CANDIDATO || row.TP_BEM_CANDIDATO), descricao: normalized(row.DS_BEM_CANDIDATO || row.DS_BEM), valor: value })
    byYear.set(year, item)
  }
  if (byYear.size === 0 || raw.length !== byYear.size) return false
  for (const [year, expected] of byYear) {
    const item = raw.find((candidate) => Number(candidate.ano_eleicao ?? candidate.ano) === year)
    const publicBens = Array.isArray(item?.bens) ? item.bens : []
    const actualBens = publicBens.map((bem) => ({ tipo: normalized((bem as Record<string, unknown>).tipo), descricao: normalized((bem as Record<string, unknown>).descricao), valor: money((bem as Record<string, unknown>).valor) }))
    if (!item || !numberEqual(money(item.valor_total), expected.total) || actualBens.length !== expected.bens.length) return false
    const left = expected.bens.map(stable).sort()
    const right = actualBens.map(stable).sort()
    if (left.some((value, index) => value !== right[index])) return false
  }
  const seriesYears = new Set(series.map((entry) => Number(entry.ano)).filter((year) => year > 0))
  return series.length === byYear.size && seriesYears.size === byYear.size && [...byYear.keys()].every((year) => seriesYears.has(year)) && series.every((entry) => text(entry.estado) === "publicado" && Number(entry.ano) > 0)
}

function compareFinanciamento(profile: CoverageProfile, rows: readonly Row[]): boolean {
  const raw = Array.isArray(profile.financiamento) ? profile.financiamento.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : []
  const series = publicFamilyEntries(profile, "financiamento")
  const byYear = new Map<number, { total: number; categorias: Record<string, number>; doadores: Array<{ nome: string; valor: number; tipo: string }> }>()
  for (const row of rows) {
    const year = rowYear(row, 0)
    if (!year) return false
    const item = byYear.get(year) ?? { total: 0, categorias: {}, doadores: [] }
    const value = money(row.VR_RECEITA || row.VALOR_RECEITA)
    item.total += value
    const category = normalized(row.DS_FONTE_RECEITA || row.DS_ORIGEM_RECEITA || row.DS_TIPO_RECEITA) || "OUTROS"
    item.categorias[category] = (item.categorias[category] ?? 0) + value
    item.doadores.push({ nome: normalized(row.NM_DOADOR_ORIGINARIO || row.NM_DOADOR), valor: value, tipo: normalized(row.DS_TIPO_DOADOR || row.TP_DOADOR) })
    byYear.set(year, item)
  }
  if (byYear.size === 0 || raw.length !== byYear.size || series.length !== byYear.size) return false
  for (const [year, expected] of byYear) {
    const item = raw.find((candidate) => Number(candidate.ano_eleicao ?? candidate.ano) === year)
    if (!item || !numberEqual(money(item.total_arrecadado), expected.total)) return false
    const publicCategories = item.categorias_origem && typeof item.categorias_origem === "object" ? item.categorias_origem as Record<string, unknown> : {}
    const normalizedCategories = Object.entries(publicCategories).map(([key, value]) => [normalized(key), money(value)] as const)
    if (normalizedCategories.length !== Object.keys(expected.categorias).length || new Set(normalizedCategories.map(([key]) => key)).size !== normalizedCategories.length) return false
    for (const [category, value] of Object.entries(expected.categorias)) {
      const matched = normalizedCategories.find(([key]) => key === category)
      if (!matched || !numberEqual(matched[1], value)) return false
    }
    const publicDonors = Array.isArray(item.maiores_doadores) ? item.maiores_doadores : []
    const donorKeys = publicDonors.map((donor) => JSON.stringify([normalized((donor as Record<string, unknown>).nome), money((donor as Record<string, unknown>).valor), normalized((donor as Record<string, unknown>).tipo)]))
    const sourceDonorKeys = expected.doadores.map((donor) => JSON.stringify([donor.nome, donor.valor, donor.tipo]))
    donorKeys.sort()
    sourceDonorKeys.sort()
    if (donorKeys.length !== sourceDonorKeys.length || donorKeys.some((key, index) => key !== sourceDonorKeys[index])) return false
  }
  return new Set(series.map((entry) => Number(entry.ano))).size === byYear.size && series.every((entry) => text(entry.estado) === "publicado" && byYear.has(Number(entry.ano)))
}

/** Compara somente projeções que possuem uma chave pública estável. Perfis exigem fontes externas e nunca fecham aqui. */
function comparePublicProjection(profile: CoverageProfile, family: TseFamily, rows: readonly Row[], assets: readonly SourceAsset[]): boolean {
  if (family === "perfil_atual") return false
  const publicRows = publicFamilyEntries(profile, family)
  if (publicRows.length === 0) return false
  if (family === "patrimonio") return comparePatrimonio(profile, rows)
  if (family === "financiamento") return compareFinanciamento(profile, rows)
  if (family === "historico_politico") {
    if (rows.length === 0 || publicRows.length !== rows.length) return false
    const key = (items: unknown[]) => JSON.stringify(items)
    const sourceKeys = rows.map((row) => key([
      rowYear(row, 0), normalized(row.DS_CARGO), normalized(row.SG_PARTIDO), rowUf(row),
      normalized(row.NR_TURNO), normalized(row.DS_SITUACAO_CANDIDATURA),
    ])).sort()
    const publicKeys = publicRows.map((row) => key([
      Number(row.periodo_inicio ?? row.ano ?? 0), normalized(row.cargo_canonico ?? row.cargo),
      normalized(row.partido ?? row.partido_sigla), normalized(row.estado),
      normalized(row.turno), normalized(row.situacao_candidatura),
    ])).sort()
    return publicRows.every((row) => normalized(row.proveniencia) === "TSE" && normalized(row.tipo_evento) === "CANDIDATURA") &&
      sourceKeys.every((value, index) => value === publicKeys[index])
  }
  return false
}

async function manifestAssets(raw: Manifest): Promise<SourceAsset[]> {
  if (!raw || !Array.isArray(raw.assets) || raw.assets.length === 0) throw new Error("manifesto sem assets")
  const assets = raw.assets.map((asset) => ({ ...asset, path: resolve(asset.path), url: text(asset.url), sha256: text(asset.sha256).toLowerCase() }))
  const checkedPaths = new Map<string, string>()
  for (const asset of assets) {
    if (!TSE_FAMILIES.includes(asset.family) || !Number.isInteger(asset.year) || !existsSync(asset.path) ||
      !validOfficialUrl(asset.url) || !validSha(asset.sha256)) throw new Error(`asset inválido: ${JSON.stringify({ family: asset.family, year: asset.year, url: asset.url })}`)
    let actual = checkedPaths.get(asset.path)
    if (!actual) {
      actual = await sha256File(asset.path)
      checkedPaths.set(asset.path, actual)
    }
    if (actual !== asset.sha256) throw new Error(`SHA-256 divergente: ${asset.path}`)
  }
  return assets
}

function sourceRevision(assets: readonly SourceAsset[]): Array<{ year: number; url: string; sha256: string }> {
  return [...assets].sort((a, b) => a.year - b.year || a.url.localeCompare(b.url)).map(({ year, url, sha256 }) => ({ year, url, sha256 }))
}

function parseReadback(path: string | undefined): Map<string, MaterializedReadback> {
  if (!path) return new Map()
  const raw = JSON.parse(readFileSync(path, "utf8")) as { rows?: MaterializedReadback[] }
  if (!Array.isArray(raw.rows)) throw new Error("readback materializado deve ter rows[]")
  const map = new Map<string, MaterializedReadback>()
  for (const row of raw.rows) {
    if (!TSE_FAMILIES.includes(row.family) || !row.slug || !row.candidato_id || !row.public_profile) throw new Error("linha de readback inválida")
    map.set(`${row.slug}|${row.family}`, row)
  }
  return map
}

/** Reutiliza o snapshot público já relido para a matriz; IDs vêm só do seed. */
export function readbackFromPublicProfiles(path: string, candidates: readonly Candidate[]): Map<string, MaterializedReadback> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!Array.isArray(parsed)) throw new Error("--public-profiles exige a lista de perfis públicos relidos")
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  const map = new Map<string, MaterializedReadback>()
  const seen = new Set<string>()
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("perfil público inválido")
    const profile = raw as CoverageProfile
    const slug = text(profile.slug)
    const id = text(profile.id)
    if (!slug || !id || seen.has(slug)) throw new Error("slug/id público ausente ou duplicado")
    seen.add(slug)
    if (!bySlug.has(slug)) throw new Error(`perfil público fora da coorte local: ${slug}`)
    for (const family of TSE_FAMILIES) {
      map.set(`${slug}|${family}`, { slug, family, candidato_id: id, public_profile: profile })
    }
  }
  return map
}

export function buildReceipt(input: {
  candidate: Candidate; family: TseFamily; assets: readonly SourceAsset[]; sourceRowsByAsset: ReadonlyMap<string, readonly Row[]>; readback?: MaterializedReadback
  officialUf?: ReadonlyMap<string, string | null>
  checkedAt: string
}): { receipt: Record<string, unknown>; reason: string } {
  const { candidate, family, assets, sourceRowsByAsset, readback, officialUf, checkedAt } = input
  const candidateId = text(candidate.id || candidate.candidato_id || readback?.candidato_id || readback?.public_profile?.id)
  const ufMissing = assets.some((asset) => {
    const sq = text(candidate.ids?.tse_sq_candidato?.[String(asset.year)])
    const seedUf = text(candidate.ids?.tse_uf_candidatura?.[String(asset.year)]).toUpperCase()
    const observedUf = sq ? officialUf?.get(`${asset.year}|${sq}`) : undefined
    return !sq || observedUf === null || (!seedUf && !observedUf) || Boolean(seedUf && observedUf && seedUf !== observedUf)
  })
  const knownYears = Object.keys(candidate.ids?.tse_sq_candidato ?? {}).map(Number).filter(Number.isInteger)
  const requiredYears = family === "perfil_atual" ? knownYears.slice().sort((a, b) => b - a).slice(0, 1) : knownYears
  const manifestComplete = requiredYears.every((year) => assets.some((asset) => asset.year === year))
  const matches = assets.flatMap((asset) => identityRows(sourceRowsByAsset.get(`${asset.family}|${asset.year}|${asset.path}`) ?? [], candidate, asset.year, officialUf))
  const digest = canonicalDigest(matches, FIELDS[family])
  const revision = sourceRevision(assets)
  const publicDigest = readback ? publicFamilyPayloadSha256(readback.public_profile, family) : null
  const publicRows = readback ? publicFamilyRowCount(readback.public_profile, family) : 0
  const sourceMatch = readback ? comparePublicProjection(readback.public_profile, family, matches, assets) : false
  const readbackOk = Boolean(readback && readback.candidato_id === candidateId && readback.public_profile.slug === candidate.slug && readback.public_profile.id === candidateId && sourceMatch && publicRows > 0)
  const profileCoreOk = family !== "perfil_atual" || Boolean(readback?.core_fields && CORE_FIELDS.every((field) => readback.core_fields?.includes(field)))
  const found = manifestComplete && !ufMissing && matches.length > 0 && readbackOk && profileCoreOk
  const reason = found ? "ok" : !candidateId ? "candidate_id_missing" : !manifestComplete ? "source_manifest_incomplete" : ufMissing ? "uf_identity_missing" : matches.length === 0 ? "official_row_missing_or_identity_mismatch" : !readbackOk ? "materialized_readback_missing_or_digest_mismatch" : "profile_core_fields_or_external_sources_missing"
  const fonte = TSE_SOURCE_BY_FAMILY[family]
  return {
    reason,
    receipt: {
      fonte, escopo: "candidato", alvo: candidate.slug, candidato_id: candidateId || null, resultado: found ? "encontrado" : "indeterminado", volume: found ? matches.length : 0,
      url: revision[0]?.url ?? null, executado_em: checkedAt,
      detalhe: JSON.stringify({
        contract_version: 1, family, source_revision: revision,
        identity_contract: { match: "SQ_CANDIDATO+UF+ANO_ELEICAO", matched_rows: matches.length },
        coverage_proof: {
          contract_version: 1,
          family,
          method: "official-source-to-public-readback",
          source_revisions: revision,
          public_payload_sha256: publicDigest,
          source_rows: matches.length,
          public_rows: publicRows,
          matched_rows: readbackOk ? publicRows : 0,
          unmatched_rows: readbackOk ? 0 : publicRows,
          scope_complete: manifestComplete && readbackOk && profileCoreOk,
          identity: { key: "SQ_CANDIDATO+UF+ANO_ELEICAO", slug: candidate.slug, candidate_id: candidateId || null, source_id: text(candidate.ids?.tse_sq_candidato?.[String(assets[0]?.year)]) || "" },
        },
        materialized_readback: { required: true, provided: Boolean(readback), row_count: publicRows, canonical_digest: publicDigest, source_canonical_digest: digest, equal: readbackOk },
        profile_core_fields: family === "perfil_atual" ? { required: [...CORE_FIELDS], complete: profileCoreOk, external_sources_required: ["wikipedia", "wikidata"] } : undefined,
        canonical_fields: FIELDS[family], freshness_days: null,
      }),
    },
  }
}

async function main(): Promise<void> {
  const manifestPath = arg("manifest")!
  const outPath = arg("out")!
  const candidatePath = arg("candidates", false) ?? resolve("data/candidatos.json")
  const checkedAt = process.argv.find((item) => item.startsWith("--checked-at="))?.slice("--checked-at=".length) ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(checkedAt))) throw new Error("--checked-at inválido")
  const candidates = JSON.parse(readFileSync(candidatePath, "utf8")) as Candidate[]
  const assets = await manifestAssets(JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest)
  const materializedPath = arg("materialized", false)
  const publicProfilesPath = arg("public-profiles", false)
  if (materializedPath && publicProfilesPath) throw new Error("use somente um de --materialized e --public-profiles")
  const readback = publicProfilesPath ? readbackFromPublicProfiles(publicProfilesPath, candidates) : parseReadback(materializedPath)
  const rowsByAsset = new Map<string, Row[]>()
  const parsedZip = new Map<string, Row[]>()
  const wantedSq = new Set(candidates.flatMap((candidate) => Object.values(candidate.ids?.tse_sq_candidato ?? {})))
  for (const asset of assets) {
    const parserFamily = asset.family === "perfil_atual" || asset.family === "historico_politico" ? "consulta_cand" : asset.family
    const key = `${asset.path}|${parserFamily}`
    let rows = parsedZip.get(key)
    if (!rows) {
      rows = await readRows(asset.path, asset.family, wantedSq)
      parsedZip.set(key, rows)
    }
    rowsByAsset.set(`${asset.family}|${asset.year}|${asset.path}`, rows)
  }
  const wanted = new Set(candidates.flatMap((candidate) => Object.entries(candidate.ids?.tse_sq_candidato ?? {}).map(([year, sq]) => `${year}|${sq}`)))
  const officialUf = new Map<string, string | null>()
  for (const asset of assets.filter((item) => item.family === "perfil_atual" || item.family === "historico_politico")) {
    for (const row of rowsByAsset.get(`${asset.family}|${asset.year}|${asset.path}`) ?? []) {
      const key = `${rowYear(row, asset.year)}|${rowSq(row)}`
      if (!wanted.has(key)) continue
      const uf = rowUf(row)
      if (!uf) continue
      const prior = officialUf.get(key)
      officialUf.set(key, prior === undefined || prior === uf ? uf : null)
    }
  }
  const receipts: Record<string, unknown>[] = []
  const diagnostics: Array<{ slug: string; family: TseFamily; reason: string }> = []
  for (const candidate of candidates) {
    if (!candidate.slug) continue
    for (const family of TSE_FAMILIES) {
      const familyAssets = assets.filter((asset) => asset.family === family && candidate.ids?.tse_sq_candidato?.[String(asset.year)])
      if (familyAssets.length === 0) continue
      const built = buildReceipt({ candidate, family, assets: familyAssets, sourceRowsByAsset: rowsByAsset, officialUf, readback: readback.get(`${candidate.slug}|${family}`), checkedAt })
      receipts.push(built.receipt)
      if (built.reason !== "ok") diagnostics.push({ slug: candidate.slug, family, reason: built.reason })
    }
  }
  const output = { schema_version: 1, generated_at: checkedAt, source: "TSE Dados Abertos", receipts, diagnostics, contract: { identity: "SQ_CANDIDATO+UF+ANO_ELEICAO", raw_rows_emitted: false, source_revision_is_array: true, materialized_readback_digest: "sha256(stable(canonical selected fields))" } }
  mkdirSync(dirname(outPath), { recursive: true })
  const temporary = `${outPath}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  renameSync(temporary, outPath)
  console.log(JSON.stringify({ receipts: receipts.length, diagnostics: diagnostics.length, families: TSE_FAMILIES }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
