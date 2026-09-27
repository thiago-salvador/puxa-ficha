/**
 * Builds a private, dry-run-only plan for safe per-election-year patrimônio
 * replacements. It reads SHA-locked TSE ZIPs and a current public profile
 * snapshot; it never connects to Supabase or performs writes.
 *
 * Required arguments:
 *   --manifest=/private/combined-assets.json
 *   --candidates=/private/coorte-candidatos.json
 *   --profiles=/private/coorte-perfis.json
 *   --classification=<private>/classificacao-celulas.json
 *   --out=<private>/patrimonio-acoes.json
 */
import { createHash } from "node:crypto"
import { chmodSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { basename, dirname, resolve } from "node:path"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { parse } from "csv-parse"
import iconv from "iconv-lite"
import { canonicalCargo } from "../../src/lib/cargo-utils"
import { stripAccents } from "../../src/lib/strip-accents"
import { buildPatrimonioEleicoes, maskDocumentLikeSequences } from "../../src/lib/public-profile-dto"
import { dedupeTsePatrimonioRows } from "../../src/lib/tse-patrimonio-dedupe"
import { sanitizeTseLegacyAssetText } from "../lib/ingest-tse"
import { resolveEffectiveElectionContext } from "../lib/tse-effective-election-year"
import { assertOutsideRepository } from "./lib/private-output"

type Candidate = {
  slug: string
  candidato_id?: string
  id?: string
  ids?: {
    tse_sq_candidato?: Record<string, string>
    tse_uf_candidatura?: Record<string, string>
  }
}
type PublicProfile = {
  id?: string
  candidato_id?: string
  slug: string
  patrimonio?: Array<Record<string, unknown>>
  patrimonio_eleicoes?: Array<Record<string, unknown>>
  patrimonio_ausencias_oficiais?: Array<Record<string, unknown>>
  historico?: Array<Record<string, unknown>>
}
type Cell = {
  slug: string
  family: string
  category: string
  writer_status?: string
  reason?: string
}
type Asset = {
  family: string
  year: number
  path: string
  url: string
  sha256: string
  bytes?: number
}
type SourceRow = Record<string, string> & { __member: string }

const DISPLAY_FIELDS = ["ano_eleicao", "cargo_candidatura", "tipo_eleicao", "valor_total", "bens"] as const
const PROFILE_ROW_FIELDS = [
  "id", "ano_eleicao", "ano_arquivo", "sq_candidato", "uf_candidatura",
  "cargo_candidatura", "tipo_eleicao", "data_eleicao", "valor_total", "bens", "fonte",
] as const
const SOURCE_HOST = "https://cdn.tse.jus.br/"

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function required(name: string): string {
  const value = argument(name)
  if (!value) throw new Error(`argumento obrigatório: --${name}=...`)
  return resolve(value)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest("hex")
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

function cents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100)
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (!raw) return null
  const normalizedValue = raw.replace(/\./g, "").replace(",", ".")
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalizedValue)) return null
  const parsed = Number(normalizedValue)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

function money(value: unknown): number | null {
  const valueCents = cents(value)
  return valueCents == null ? null : valueCents / 100
}

function profileRows(value: unknown): PublicProfile[] {
  if (Array.isArray(value)) return value as PublicProfile[]
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    const rows = record.profiles ?? record.perfis ?? record.data
    if (Array.isArray(rows)) return rows as PublicProfile[]
  }
  throw new Error("snapshot público sem lista de perfis reconhecida")
}

function csvMembers(asset: Asset, requiredUfs?: ReadonlySet<string>): string[] {
  const result = spawnSync("unzip", ["-Z1", asset.path], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`não foi possível listar ZIP TSE de ${asset.year}`)
  const prefix = asset.family === "patrimonio" ? "bem_candidato" : "consulta_cand"
  const expected = new RegExp(`^${prefix}_${asset.year}(?:_([A-Z]{2}|BR|BRASIL))?\\.csv$`, "i")
  const entries = result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  const relevant = entries.filter((entry) => expected.test(basename(entry)))
  const national = relevant.filter((entry) => {
    const suffix = basename(entry).match(/_([A-Z]{2}|BR|BRASIL)\.csv$/i)?.[1]?.toUpperCase()
    return suffix == null || suffix === "BR" || suffix === "BRASIL"
  })
  const ufs = new Set<string>()
  const selectedUfs: string[] = []
  for (const entry of relevant) {
    const suffix = basename(entry).match(/_([A-Z]{2})\.csv$/i)?.[1]?.toUpperCase()
    if (!suffix || suffix === "BR") continue
    if (!ufs.has(suffix)) {
      ufs.add(suffix)
      selectedUfs.push(entry)
    }
  }
  // The national file carries the main cohort; UF shards fill years where
  // the source archive is split. Dedupe later uses the shared TSE rule.
  const narrowed = requiredUfs && requiredUfs.size > 0
    ? selectedUfs.filter((entry) => requiredUfs.has(basename(entry).match(/_([A-Z]{2})\.csv$/i)?.[1]?.toUpperCase() ?? ""))
    : selectedUfs
  const selected = [...national, ...(requiredUfs ? narrowed : selectedUfs)]
  if (selected.length === 0) throw new Error(`ZIP oficial de ${asset.family}/${asset.year} sem CSV esperado`)
  return [...new Set(selected)].sort()
}

async function readCsvMember(asset: Asset, member: string, keep: (row: Record<string, string>) => boolean): Promise<SourceRow[]> {
  const child = spawn("unzip", ["-p", asset.path, member], { stdio: ["ignore", "pipe", "ignore"] })
  let invalidRows = 0
  const parser = parse({
    columns: true,
    delimiter: ";",
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
    on_record: (record: Record<string, string>, context: { invalid_field_length: number }) => {
      const truncated = context.invalid_field_length > invalidRows
      invalidRows = context.invalid_field_length
      return truncated ? { ...record, __truncated_row: "1" } : record
    },
  })
  const decoded = iconv.decodeStream("windows-1252")
  const closed = once(child, "close") as Promise<[number | null]>
  child.stdout.pipe(decoded).pipe(parser)
  const rows: SourceRow[] = []
  try {
    for await (const raw of parser) {
      const row = raw as Record<string, string>
      if (keep(row)) rows.push({ ...row, __member: member })
    }
    const [code] = await closed
    if (code !== 0) throw new Error("unzip não concluiu a leitura do pacote")
    return rows
  } catch {
    child.kill()
    await closed.catch(() => undefined)
    throw new Error(`CSV oficial inválido para ${asset.family}/${asset.year}`)
  }
}

async function sourceRows(asset: Asset, keep: (row: Record<string, string>) => boolean, requiredUfs?: ReadonlySet<string>): Promise<SourceRow[]> {
  const rows: SourceRow[] = []
  for (const member of csvMembers(asset, requiredUfs)) rows.push(...await readCsvMember(asset, member, keep))
  return rows
}

function contextKey(year: number, sq: string, uf: string): string {
  return `${year}|${sq}|${uf}`
}

export function publicPatrimonioRow(row: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const field of PROFILE_ROW_FIELDS) {
    if (row[field] === undefined) continue
    if (field === "bens" && Array.isArray(row.bens)) {
      safe.bens = row.bens.map((item) => {
        const bem = item && typeof item === "object" ? item as Record<string, unknown> : {}
        return {
          tipo: maskDocumentLikeSequences(normalized(bem.tipo)),
          descricao: maskDocumentLikeSequences(normalized(bem.descricao)),
          valor: money(bem.valor),
        }
      })
    } else if (field === "valor_total") {
      safe[field] = money(row[field])
    } else if (field === "fonte" && typeof row[field] === "string") {
      safe[field] = row[field]
    } else {
      safe[field] = row[field]
    }
  }
  return safe
}

function displayed(row: Record<string, unknown>): Record<string, unknown> {
  const safe = publicPatrimonioRow(row)
  return Object.fromEntries(DISPLAY_FIELDS.map((field) => [field, safe[field] ?? null]))
}

function sameDisplay(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return stable(displayed(a)) === stable(displayed(b))
}

export function hashPatrimonioPreimage(rows: readonly Record<string, unknown>[]): string {
  return sha256(stable(rows.map(publicPatrimonioRow)))
}

function sourceCargo(rows: readonly SourceRow[]): string | null {
  const values = [...new Set(rows.map((row) => canonicalCargo(normalized(row.DS_CARGO))).filter(Boolean))]
  return values.length === 1 ? values[0] : null
}

function sourceElectionType(rows: readonly SourceRow[]): string | null {
  const values = new Map<string, string>()
  for (const row of rows) {
    const value = normalized(row.NM_TIPO_ELEICAO)
    if (value) values.set(stripAccents(value).toLocaleLowerCase("pt-BR"), value)
  }
  return values.size === 1 ? [...values.values()][0]! : null
}

function sameElectionType(a: string, b: string): boolean {
  const key = (value: string) => stripAccents(value).toLocaleLowerCase("pt-BR")
  return key(a) === key(b)
}

function seriesAfter(
  profile: PublicProfile,
  input: { year: number; after: Record<string, unknown>; replaceRowId?: string },
): Record<string, unknown> {
  const year = Number(input.after.ano_eleicao)
  const sq = normalized(input.after.sq_candidato)
  const uf = normalized(input.after.uf_candidatura).toUpperCase()
  const patrimonio = [
    ...(profile.patrimonio ?? []).filter((row) => input.replaceRowId
      ? row.id !== input.replaceRowId
      : !(Number(row.ano_eleicao) === year
        && normalized(row.sq_candidato) === sq
        && normalized(row.uf_candidatura).toUpperCase() === uf)),
    input.after,
  ]
  const series = buildPatrimonioEleicoes(
    patrimonio as Array<Parameters<typeof buildPatrimonioEleicoes>[0][number]>,
    (profile.patrimonio_ausencias_oficiais ?? []) as Array<Parameters<typeof buildPatrimonioEleicoes>[1][number]>,
    (profile.historico ?? []) as Array<Parameters<typeof buildPatrimonioEleicoes>[2][number]>,
  )
  const exact = series.find((row) => row.ano === year)
  if (!exact) throw new Error(`série pública de patrimônio não contém o ano ${year}`)
  return exact as unknown as Record<string, unknown>
}

export type PatrimonioPlanInput = {
  sourceComplete?: boolean
  candidates: readonly Candidate[]
  profiles: readonly PublicProfile[]
  cells: readonly Cell[]
  riskSlugs: readonly string[]
  assets: readonly Asset[]
  checkedAt: string
  rowsByAsset: ReadonlyMap<string, readonly SourceRow[]>
  historyByContext: ReadonlyMap<string, readonly SourceRow[]>
}

export type PatrimonioPlanResult = {
  acoes: Array<Record<string, unknown>>
  revisao: Array<{ slug: string; ano_eleicao: number; motivo: string }>
  resumo: { perfis_seguros: number; anos_com_fonte: number; acoes: number; revisao: number }
}

/** Pure plan builder. Only stale class-(a) cells and exact SQ+UF contexts qualify. */
export function buildPatrimonioWriterPlan(input: PatrimonioPlanInput): PatrimonioPlanResult {
  const profilesBySlug = new Map<string, PublicProfile[]>()
  for (const profile of input.profiles) profilesBySlug.set(profile.slug, [...(profilesBySlug.get(profile.slug) ?? []), profile])
  const candidatesBySlug = new Map(input.candidates.map((candidate) => [candidate.slug, candidate]))
  const risks = new Set(input.riskSlugs)
  const cells = new Map(input.cells.filter((cell) => cell.family === "patrimonio").map((cell) => [cell.slug, cell]))
  const eligible = [...cells.values()].filter((cell) => cell.category === "stale_not_projected" && !risks.has(cell.slug))
  const acoes: Array<Record<string, unknown>> = []
  const revisao: PatrimonioPlanResult["revisao"] = []

  for (const cell of eligible) {
    if (!input.sourceComplete) {
      revisao.push({ slug: cell.slug, ano_eleicao: 0, motivo: "pacote_oficial_completo_nao_comprovado" })
      continue
    }
    const candidate = candidatesBySlug.get(cell.slug)
    const profiles = profilesBySlug.get(cell.slug) ?? []
    if (!candidate || profiles.length !== 1) {
      revisao.push({ slug: cell.slug, ano_eleicao: 0, motivo: !candidate ? "coorte_candidate_missing" : "public_profile_missing_or_duplicated" })
      continue
    }
    const profile = profiles[0]
    const candidateId = profile.id ?? profile.candidato_id
    if (!candidateId || (candidate.candidato_id && candidate.candidato_id !== candidateId)) {
      revisao.push({ slug: cell.slug, ano_eleicao: 0, motivo: "public_candidate_id_mismatch" })
      continue
    }

    for (const asset of input.assets.filter((item) => item.family === "patrimonio").sort((a, b) => a.year - b.year)) {
      const year = asset.year
      const sq = normalized(candidate.ids?.tse_sq_candidato?.[String(year)])
      const uf = normalized(candidate.ids?.tse_uf_candidatura?.[String(year)]).toUpperCase()
      if (!sq) continue
      if (!/^[A-Z]{2}$/.test(uf)) {
        revisao.push({ slug: cell.slug, ano_eleicao: year, motivo: "candidate_sq_or_uf_missing" })
        continue
      }
      const key = contextKey(year, sq, uf)
      const source = (input.rowsByAsset.get(`${asset.family}|${asset.year}`) ?? [])
        .filter((row) => normalized(row.SQ_CANDIDATO) === sq
          && normalized(row.SG_UF).toUpperCase() === uf
          && Number(row.ANO_ELEICAO || year) === year)
      const uniqueHistory = input.historyByContext.get(key) ?? []
      if (source.length === 0) continue // A missing source row does not authorize an absence write.
      const cargo = sourceCargo(uniqueHistory)
      const electionType = sourceElectionType(source) ?? sourceElectionType(uniqueHistory)
      if (!cargo || !electionType) {
        revisao.push({ slug: cell.slug, ano_eleicao: year, motivo: "official_candidacy_context_missing_or_conflicting" })
        continue
      }
      const conflictingType = sourceElectionType(uniqueHistory)
      const bemType = sourceElectionType(source)
      if (conflictingType && bemType && !sameElectionType(conflictingType, bemType)) {
        revisao.push({ slug: cell.slug, ano_eleicao: year, motivo: "official_election_type_conflict" })
        continue
      }
      const parsed = source.map((row) => {
        const value = money(row.VR_BEM_CANDIDATO)
        if (value == null || row.__truncated_row === "1") return null
        return {
          slug: candidate.slug,
          sourceKey: row.__member,
          ordem: normalized(row.NR_ORDEM_BEM_CANDIDATO),
          tipo: sanitizeTseLegacyAssetText(maskDocumentLikeSequences(normalized(row.DS_TIPO_BEM_CANDIDATO)), `patrimonio:${year}:tipo`),
          descricao: sanitizeTseLegacyAssetText(maskDocumentLikeSequences(normalized(row.DS_BEM_CANDIDATO)), `patrimonio:${year}:descricao`),
          valor: value,
        }
      })
      if (parsed.some((row) => row === null)) {
        revisao.push({ slug: cell.slug, ano_eleicao: year, motivo: "official_asset_row_truncated_or_amount_missing" })
        continue
      }
      const deduped = dedupeTsePatrimonioRows(parsed.filter((row): row is NonNullable<typeof row> => row !== null)).map((item) => ({ tipo: item.tipo, descricao: item.descricao, valor: item.valor }))
      const totalCents = deduped.reduce((sum, bem) => sum + Math.round(bem.valor * 100), 0)
      const after = {
        ano_eleicao: year,
        ano_arquivo: asset.year,
        sq_candidato: sq,
        uf_candidatura: uf,
        cargo_candidatura: cargo,
        tipo_eleicao: conflictingType ?? electionType,
        data_eleicao: (() => {
          const contextRows = uniqueHistory
          const dates = [...new Set(contextRows.map((row) => normalized(row.DT_ELEICAO)).filter(Boolean))]
          if (dates.length !== 1) return null
          return resolveEffectiveElectionContext({
            ano_eleicao: String(year),
            dt_eleicao: dates[0],
            nm_tipo_eleicao: electionType,
          }).electionDate
        })(),
        valor_total: totalCents / 100,
        bens: deduped,
        fonte: `TSE Dados Abertos ${asset.url} SHA-256 ${asset.sha256}`,
      }
      const currentYear = (profile.patrimonio ?? []).filter((row) => Number(row.ano_eleicao) === year)
      const current = currentYear.filter((row) => Number(row.ano_eleicao) === year
        && normalized(row.sq_candidato) === sq
        && normalized(row.uf_candidatura).toUpperCase() === uf)
      if (current.length > 1 || (current.length === 0 && currentYear.length > 1)) {
        revisao.push({
          slug: cell.slug,
          ano_eleicao: year,
          motivo: current.length > 1 ? "duplicate_exact_year_context" : "ambiguous_public_year_context",
        })
        continue
      }
      const matchMode = current.length === 1 ? "exact_context" : currentYear.length === 1 ? "unique_year_public" : "insert"
      const matchedCurrent = current[0] ?? (matchMode === "unique_year_public" ? currentYear[0] : undefined)
      if (matchMode === "unique_year_public" && matchedCurrent) {
        const publicSq = normalized(matchedCurrent.sq_candidato)
        const publicUf = normalized(matchedCurrent.uf_candidatura).toUpperCase()
        if ((publicSq && publicSq !== sq) || (publicUf && publicUf !== uf)) {
          revisao.push({ slug: cell.slug, ano_eleicao: year, motivo: "public_year_context_identity_conflict" })
          continue
        }
      }
      if (matchedCurrent && !normalized(matchedCurrent.id)) {
        revisao.push({ slug: cell.slug, ano_eleicao: year, motivo: "public_preimage_id_missing" })
        continue
      }
      const before = matchedCurrent ? [publicPatrimonioRow(matchedCurrent)] : []
      if (matchedCurrent && sameDisplay(matchedCurrent, after)) continue
      const beforeSha256 = hashPatrimonioPreimage(before)
      const currentYearSeries = profile.patrimonio_eleicoes?.filter((row) => Number(row.ano) === year) ?? []
      if (currentYearSeries.length > 1) {
        revisao.push({ slug: cell.slug, ano_eleicao: year, motivo: "duplicate_annual_series_context" })
        continue
      }
      const serie = seriesAfter(profile, {
        year, after,
        ...(matchMode === "unique_year_public" && typeof matchedCurrent?.id === "string" ? { replaceRowId: matchedCurrent.id } : {}),
      })
      acoes.push({
        tipo: "substituir_patrimonio",
        match_mode: matchMode,
        slug: cell.slug,
        candidato_id: candidateId,
        ano_eleicao: year,
        antes_publico: before,
        antes_sha256: beforeSha256,
        depois: after,
        serie,
        fonte_url: asset.url,
        pacote_sha256: asset.sha256,
        source_complete: true,
        pacote_bytes: asset.bytes ?? null,
        sq_candidato: sq,
        uf_candidatura: uf,
      })
    }
  }
  return {
    acoes,
    revisao,
    resumo: {
      perfis_seguros: eligible.length,
      anos_com_fonte: new Set(input.assets.filter((asset) => asset.family === "patrimonio").map((asset) => asset.year)).size,
      acoes: acoes.length,
      revisao: revisao.length,
    },
  }
}

async function main(): Promise<void> {
  const manifestPath = required("manifest")
  const candidatesPath = required("candidates")
  const profilesPath = required("profiles")
  const classificationPath = required("classification")
  const outPath = assertOutsideRepository(required("out"), "--out")
  const checkedAt = argument("checked-at") ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(checkedAt))) throw new Error("--checked-at inválido")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { assets?: Asset[]; pending?: unknown[] }
  const candidates = JSON.parse(readFileSync(candidatesPath, "utf8")) as Candidate[]
  const profiles = profileRows(JSON.parse(readFileSync(profilesPath, "utf8")))
  const classification = JSON.parse(readFileSync(classificationPath, "utf8")) as { cells?: Cell[]; risk_slugs?: string[] | number }
  if (!Array.isArray(manifest.assets) || manifest.pending?.length || !Array.isArray(classification.cells)) {
    throw new Error("manifesto, classificação ou lista de risco inválidos")
  }
  const riskSlugs = Array.isArray(classification.risk_slugs)
    ? classification.risk_slugs
    : [...new Set(classification.cells.filter((cell) => cell.category === "identity_review").map((cell) => cell.slug))]
  const relevantAssets = manifest.assets.filter((asset) => asset.family === "patrimonio" || asset.family === "historico_politico")
  const patrimonyAssets = relevantAssets.filter((asset) => asset.family === "patrimonio")
  const assetsByKey = new Map<string, Asset>()
  for (const asset of relevantAssets) {
    if (!Number.isInteger(asset.year) || !asset.path || !asset.url?.startsWith(SOURCE_HOST) || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      throw new Error(`asset TSE ${asset.family}/${asset.year} sem proveniência SHA/URL válida`)
    }
    if (!existsSync(asset.path) || lstatSync(asset.path).isSymbolicLink()) throw new Error(`ZIP TSE ausente ou link simbólico: ${asset.family}/${asset.year}`)
    const actualSha = await sha256File(asset.path)
    if (actualSha !== asset.sha256.toLowerCase()) throw new Error(`SHA-256 divergente em ZIP ${asset.family}/${asset.year}`)
    const key = `${asset.family}|${asset.year}`
    if (assetsByKey.has(key)) throw new Error(`asset TSE duplicado: ${key}`)
    assetsByKey.set(key, asset)
  }
  if (patrimonyAssets.length === 0) throw new Error("manifesto sem pacote TSE de patrimônio")

  const eligibleSlugs = new Set(classification.cells
    .filter((cell) => cell.family === "patrimonio" && cell.category === "stale_not_projected")
    .map((cell) => cell.slug)
    .filter((slug) => !riskSlugs.includes(slug)))
  const wantedContexts = new Map<string, Set<string>>()
  const wantedSqByYear = new Map<number, Set<string>>()
  for (const candidate of candidates) {
    if (!eligibleSlugs.has(candidate.slug)) continue
    for (const asset of patrimonyAssets) {
      const sq = normalized(candidate.ids?.tse_sq_candidato?.[String(asset.year)])
      const uf = normalized(candidate.ids?.tse_uf_candidatura?.[String(asset.year)]).toUpperCase()
      if (sq) {
        wantedSqByYear.set(asset.year, new Set([...(wantedSqByYear.get(asset.year) ?? []), sq]))
        if (/^[A-Z]{2}$/.test(uf)) {
          const key = contextKey(asset.year, sq, uf)
          wantedContexts.set(key, new Set([...(wantedContexts.get(key) ?? []), candidate.slug]))
        }
      }
    }
  }
  for (const [key, slugs] of wantedContexts) {
    if (slugs.size > 1) throw new Error(`identidade SQ+UF ambígua em fonte TSE (${key.split("|")[0]})`)
  }

  const rowsByAsset = new Map<string, readonly SourceRow[]>()
  const historyByContext = new Map<string, readonly SourceRow[]>()
  const historicalAssets = relevantAssets.filter((item) => item.family === "historico_politico" && patrimonyAssets.some((p) => p.year === item.year))
  const officialUfs = new Map<string, Set<string>>()
  for (const asset of historicalAssets) {
    const wantedSq = wantedSqByYear.get(asset.year) ?? new Set<string>()
    const knownUfs = new Set(candidates.filter((c) => eligibleSlugs.has(c.slug))
      .map((c) => normalized(c.ids?.tse_uf_candidatura?.[String(asset.year)]).toUpperCase()).filter((uf) => /^[A-Z]{2}$/.test(uf)))
    const missingUfExists = candidates.some((c) => eligibleSlugs.has(c.slug)
      && normalized(c.ids?.tse_sq_candidato?.[String(asset.year)])
      && !/^[A-Z]{2}$/.test(normalized(c.ids?.tse_uf_candidatura?.[String(asset.year)]).toUpperCase()))
    // The national CSV is the authoritative cross-UF lookup for unresolved
    // SQ/year contexts; known UFs additionally use only their matching shards.
    const rows = await sourceRows(asset, (row) => wantedSq.has(normalized(row.SQ_CANDIDATO)), missingUfExists ? new Set<string>() : knownUfs)
    for (const row of rows) {
      const sq = normalized(row.SQ_CANDIDATO)
      const uf = normalized(row.SG_UF).toUpperCase()
      if (!sq || !/^[A-Z]{2}$/.test(uf)) continue
      const key = `${asset.year}|${sq}`
      officialUfs.set(key, new Set([...(officialUfs.get(key) ?? []), uf]))
      const context = contextKey(asset.year, sq, uf)
      historyByContext.set(context, [...(historyByContext.get(context) ?? []), row])
    }
  }
  const effectiveCandidates = candidates.map((candidate) => {
    const sqByYear = candidate.ids?.tse_sq_candidato ?? {}
    const ufByYear = { ...(candidate.ids?.tse_uf_candidatura ?? {}) }
    for (const asset of patrimonyAssets) {
      const year = String(asset.year)
      const sq = normalized(sqByYear[year])
      if (!sq || /^[A-Z]{2}$/.test(normalized(ufByYear[year]).toUpperCase())) continue
      const ufs = officialUfs.get(`${year}|${sq}`)
      if (ufs?.size === 1) ufByYear[year] = [...ufs][0]!
    }
    return { ...candidate, ids: { ...candidate.ids, tse_uf_candidatura: ufByYear } }
  })
  for (const candidate of effectiveCandidates) {
    if (!eligibleSlugs.has(candidate.slug)) continue
    for (const asset of patrimonyAssets) {
      const sq = normalized(candidate.ids?.tse_sq_candidato?.[String(asset.year)])
      const uf = normalized(candidate.ids?.tse_uf_candidatura?.[String(asset.year)]).toUpperCase()
      if (sq && /^[A-Z]{2}$/.test(uf)) {
        const key = contextKey(asset.year, sq, uf)
        wantedContexts.set(key, new Set([...(wantedContexts.get(key) ?? []), candidate.slug]))
      }
    }
  }
  for (const [key, slugs] of wantedContexts) {
    if (slugs.size > 1) throw new Error(`identidade SQ+UF ambígua após resolução oficial (${key.split("|")[0]})`)
  }
  for (const asset of patrimonyAssets) {
    const wanted = new Set([...wantedContexts.keys()].filter((key) => key.startsWith(`${asset.year}|`)))
    const ufs = new Set([...wanted].map((key) => key.split("|")[2]!))
    const rows = await sourceRows(asset, (row) => wanted.has(contextKey(asset.year, normalized(row.SQ_CANDIDATO), normalized(row.SG_UF).toUpperCase())), ufs)
    rowsByAsset.set(`${asset.family}|${asset.year}`, rows)
  }
  const result = buildPatrimonioWriterPlan({
    sourceComplete: patrimonyAssets.every((asset) => rowsByAsset.has(`${asset.family}|${asset.year}`))
      && historicalAssets.every((asset) => assetsByKey.has(`${asset.family}|${asset.year}`)),
    candidates: effectiveCandidates, profiles, cells: classification.cells, riskSlugs,
    assets: patrimonyAssets, checkedAt, rowsByAsset, historyByContext,
  })
  const output = {
    schema_version: 1,
    gerado_em: checkedAt,
    modo: "dry-run",
    fonte: "TSE Dados Abertos; pacotes verificados por SHA-256",
    acoes: result.acoes,
    revisao: result.revisao,
    resumo: result.resumo,
  }
  mkdirSync(dirname(outPath), { recursive: true, mode: 0o700 })
  chmodSync(dirname(outPath), 0o700)
  const temporary = `${outPath}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, outPath)
  console.log(JSON.stringify({ out: outPath, ...result.resumo, mode: "dry-run", cpf_output: false }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "falha não identificada"
    console.error(`plan-patrimonio-writers-local: ${message}`)
    process.exitCode = 1
  })
}
