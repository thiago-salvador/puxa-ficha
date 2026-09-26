import { createReadStream, mkdirSync, readdirSync, rmSync, type Dirent } from "fs"
import { createHash } from "crypto"
import { resolve, sep } from "path"
import { execFileSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatosCohortNaoPublica, loadCandidatosPublicos, resolveCandidatoId, type ExplicitCohortSelection } from "./helpers-db"
import { loadCandidatos, parseCSV, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { HistoricalCandidateIdentity, IngestResult, CandidatoConfig } from "./types"
import {
  createTSEResolver,
  getResolveMethodPriority,
  shouldSkipWeakMatch,
  type ResolveMethod,
  type TSEResolver,
} from "./tse-resolver"
import { extractOptionalDonorIdsFromTseRow } from "../../src/lib/financiamento-doador-identifiers"
import {
  normalizeDoadorTipoWithIdentifiers,
  normalizeMaioresDoadoresForStorage,
  sanitizeMaioresDoadoresForPublic,
} from "../../src/lib/financiamento-public"
import { maskDocumentLikeSequences } from "../../src/lib/public-profile-dto"
import { sanitizePublicTextOrThrow } from "../../src/lib/public-text"
import { dedupeTsePatrimonioRows } from "../../src/lib/tse-patrimonio-dedupe"
import { stripAccents } from "../../src/lib/strip-accents"
import { carregarBloqueios } from "./identidade-bloqueada"
import { financiamentoReceitasZipUrls } from "./tse-financiamento-receitas-urls"
import {
  financiamentoReceitaIdentity,
  financiamentoReceitaIdentityKey,
  historicalCandidateRowMatches,
  normalizeFinanciamentoReceitaRow,
  resolveLegacyReceiptSqIdentity,
} from "./financiamento-receita-legacy-row"
import { financiamentoReceitaDedupKey } from "./financiamento-receita-dedup"
import { downloadToFile } from "./download-to-file"
import { observeVerifiedCandidateChange } from "./verified-candidate-changes"
import { resolveEffectiveElectionContext } from "./tse-effective-election-year"
import { assertTseContextSchemaReady, pendingContextMigrationError } from "./tse-context-schema"
import {
  findPatrimonioIdentityReceipt,
  patrimonioAbsencePublicDetail,
  validatesPatrimonioFileAbsence,
  type PatrimonioFileAbsenceReceipt,
} from "./patrimonio-ausencia-receipts"

const DATA_DIR = resolve(process.cwd(), "data/tse")
export const DEFAULT_TSE_ANOS = [
  2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024,
]
/** 2026 é um recorte explícito do lote Senado; não entra no default histórico. */
const SUPPORTED_TSE_ANOS = new Set([...DEFAULT_TSE_ANOS, 2026])
const KEEP_TSE_DOWNLOADS = process.env.PF_KEEP_TSE_DOWNLOADS === "1"

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest("hex")
}

/**
 * O portal oficial do TSE só publica declarações de bens a partir de 2006.
 * 2002 e 2004 continuam no ingest para candidaturas e financiamento, mas não
 * devem transformar a inexistência conhecida do pacote em falha de execução.
 */
export function hasOfficialPatrimonioPackage(ano: number): boolean {
  return ano >= 2006
}

/**
 * Recorte explícito usado pelos shards do workflow. Ausente ou vazio preserva
 * o lote completo; valores declarados falham fechado para ano estranho,
 * repetido ou item vazio, evitando cobertura aparentemente completa e incorreta.
 */
export function parseTseYearsEnv(value: string | undefined): number[] {
  if (value === undefined || value.trim() === "") return [...DEFAULT_TSE_ANOS]

  const rawYears = value.split(",").map((year) => year.trim())
  if (rawYears.length === 0 || rawYears.some((year) => year === "")) {
    throw new Error("PF_TSE_ANOS deve listar anos separados por virgula")
  }

  const years = rawYears.map((year) => Number(year))
  if (years.some((year) => !Number.isInteger(year) || !SUPPORTED_TSE_ANOS.has(year))) {
    throw new Error(`PF_TSE_ANOS contem ano invalido: ${value}`)
  }
  if (new Set(years).size !== years.length) {
    throw new Error(`PF_TSE_ANOS contem ano repetido: ${value}`)
  }

  return years
}

/**
 * O pacote de 2018 inclui arquivos auxiliares de doador originario junto das
 * receitas principais. Eles descrevem a cadeia do recurso, mas nao carregam a
 * identidade da candidatura e nao podem entrar na soma por SQ_CANDIDATO.
 */
export function isDoadorOriginarioReceiptSource(pathOrName: string): boolean {
  return /doador[ _-]*originario/i.test(pathOrName)
}

/**
 * Alguns CSVs historicos do proprio TSE usam U+00BF como marcador de lista ou
 * separador. Normalizamos apenas esse caractere documentado para hifen e ainda
 * submetemos o resultado ao guard geral de texto publico.
 */
export function sanitizeTseLegacyAssetText(value: string, context: string): string {
  const normalized = value.replace(/\s*¿\s*/g, " - ").trim()
  return sanitizePublicTextOrThrow(normalized, context)
}

/** UFs estaduais necessárias para Governador e Senado; Presidente usa BR. */
function getGovernorUFs(candidatos: CandidatoConfig[], slugAllowlist?: Set<string> | null): string[] {
  return [
    ...new Set(
      candidatos
        .filter(
          (candidato) =>
            (candidato.cargo_disputado === "Governador" || candidato.cargo_disputado === "Senador") &&
            candidato.estado &&
            (!slugAllowlist || slugAllowlist.has(candidato.slug))
        )
        .map((candidato) => candidato.estado!.toUpperCase())
    ),
  ]
}

function parseBRL(value: string, context: string): number {
  if (!value || value === "#NULO#" || value === "#NE#" || value === "-1") return 0
  const parsed = parseFloat(value.replace(/\./g, "").replace(",", "."))
  if (Number.isNaN(parsed)) {
    warn("tse", `  Valor monetario invalido em ${context}: "${value}"`)
    return 0
  }
  return parsed
}

type FinanciamentoOrigemCategoria =
  | "fundo_partidario"
  | "fundo_eleitoral"
  | "pessoa_fisica"
  | "recursos_proprios"
  | "outros"

/**
 * Classifica a origem declarada pelo TSE depois da normalização de layouts.
 * Os arquivos legados usam plural e acentos (por exemplo, "pessoas físicas"
 * e "recursos próprios"); comparar somente o singular ASCII transforma essas
 * linhas em "outros" e perde a composição, embora o total permaneça correto.
 */
export function classifyFinanciamentoOrigem(value: string): FinanciamentoOrigemCategoria {
  const normalized = stripAccents(value).toUpperCase()
  if (normalized.includes("FUNDO PARTID")) return "fundo_partidario"
  if (normalized.includes("FUNDO ESPECIAL") || normalized.includes("FEFC")) return "fundo_eleitoral"
  if (/PESSOAS?\s+FISIC/.test(normalized)) return "pessoa_fisica"
  if (/RECURSOS?\s+PROPRIOS?/.test(normalized)) return "recursos_proprios"
  return "outros"
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  return downloadToFile(url, dest, {
    onCacheHit: (path) => log("tse", `  Cache hit: ${path}`),
    onStart: (source) => log("tse", `  Baixando: ${source}`),
    onHttpError: (status, source) => warn("tse", `  HTTP ${status} para ${source}`),
    onError: (err) => warn("tse", `  Falha no download: ${err}`),
  })
}

export function extractZip(zipPath: string, extractDir: string, extraPatterns?: string[]) {
  // Extraction is a completeness boundary: a stale or partially removed
  // directory must never be mistaken for a successful package.
  rmSync(extractDir, { recursive: true, force: true })
  log("tse", `  Cleanup: ${extractDir}`)
  mkdirSync(extractDir, { recursive: true })
  const listing = execFileSync("unzip", ["-Z1", zipPath], { stdio: ["ignore", "pipe", "pipe"] }).toString("latin1")
  const members = listing.split(/\r?\n/).filter(Boolean)
  const requestedUfs = (extraPatterns ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean)
  const hasPartition = (lower: string, token: string): boolean =>
    lower.includes(`_${token}.`) || lower.includes(`_${token}_`) || lower.includes(`/${token}/`)
  const selected = members.filter((member) => {
    const lower = member.toLowerCase()
    if (!/\.(csv|txt)$/.test(lower)) return false
    if (hasPartition(lower, "br") || hasPartition(lower, "brasil")) return true
    return requestedUfs.some((uf) => hasPartition(lower, uf))
  })
  const candidateFallback = members.filter((member) => {
    const lower = member.toLowerCase()
    return lower.endsWith(".csv") && (
      /consulta_cand(?:_complementar)?/.test(lower) ||
      /receita[c_]?candidato|receitas[_-]candidatos/.test(lower) ||
      /bem[_-]candidato/.test(lower)
    )
  })
  const names = selected.length > 0 ? selected : candidateFallback
  if (names.length === 0) throw new Error(`ZIP TSE sem arquivo de candidatura extraível: ${zipPath}`)
  // Passing concrete member names avoids optional glob failures and prevents
  // malformed committee filenames from being touched. unzip still validates
  // each selected member's CRC and exits non-zero on truncation.
  execFileSync("unzip", ["-o", zipPath, ...names, "-d", extractDir], { stdio: "pipe" })
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
    log("tse", `  Cleanup: ${dir}`)
  } catch {
    warn("tse", `  Nao conseguiu limpar: ${dir}`)
  }
}

function cleanupFile(filePath: string) {
  try {
    rmSync(filePath, { force: true })
    log("tse", `  Cleanup: ${filePath}`)
  } catch {
    warn("tse", `  Nao conseguiu limpar: ${filePath}`)
  }
}

function cleanupDownloadedZip(filePath: string) {
  if (KEEP_TSE_DOWNLOADS) {
    log("tse", `  Cache preservado: ${filePath}`)
    return
  }

  cleanupFile(filePath)
}

function findCSVs(dir: string, pattern: string): string[] {
  try {
    const files = readdirSync(dir) as string[]
    return files
      .filter((f: string) => f.toLowerCase().includes(pattern.toLowerCase()) && f.endsWith(".csv"))
      .map((f: string) => resolve(dir, f))
  } catch {
    return []
  }
}

/** Receitas de candidatos: CSV (2018+) ou TXT legado (ex. 2010), recursivo após unzip. */
function collectReceitasCandidatoSourceFiles(rootDir: string): string[] {
  const results: string[] = []
  const walk = (dir: string) => {
    let dirents: Dirent[]
    try {
      dirents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of dirents) {
      const p = resolve(dir, d.name)
      if (d.isDirectory()) walk(p)
      else if (d.isFile()) {
        const lower = d.name.toLowerCase()
        if (!(lower.endsWith(".csv") || lower.endsWith(".txt"))) continue
        if (
          lower.includes("receita") &&
          lower.includes("candidat") &&
          !isDoadorOriginarioReceiptSource(lower)
        ) {
          results.push(p)
        }
      }
    }
  }
  walk(rootDir)
  return [...new Set(results)]
}

export function financiamentoSourceFileUf(path: string, governorUFs: string[]): string | undefined {
  const normalized = path.toLowerCase()
  for (const uf of ["BR", ...governorUFs]) {
    const token = uf.toLowerCase()
    if (
      normalized.includes(`_${token}.`) ||
      normalized.includes(`_${token}_`) ||
      normalized.includes(`${sep}${token}${sep}`) ||
      (uf === "BR" && normalized.includes("brasil"))
    ) {
      return uf
    }
  }
  return undefined
}

/**
 * Quando o pacote oferece um consolidado nacional, ele é o snapshot canônico
 * para receitas. As partições estaduais só entram como fallback quando não há
 * membro BR/BRASIL; nunca se somam os dois snapshots.
 */
export function selectCanonicalFinanciamentoSourceFiles(paths: string[], ano?: number): string[] {
  const unique = [...new Set(paths)]
  // A adoção nacional comprovada nesta rodada é específica do fechamento
  // 2012. Em 2010, por exemplo, `candidato/BR/` é uma partição presidencial,
  // não um consolidado que possa substituir as UFs.
  if (ano !== 2012) return unique
  const brasil = unique.filter((path) => /(?:^|[\\/])receitas_candidatos_2012_brasil\.(?:csv|txt)$/i.test(path))
  if (brasil.length > 1) throw new Error("mais de um consolidado BRASIL 2012 no pacote")
  return brasil.length === 1 ? brasil : unique
}

export function validarCoberturaPacoteReceitas(
  ano: number,
  extractDir: string,
  requiredUFs: string[],
): string[] {
  const files = collectReceitasCandidatoSourceFiles(extractDir)
  if (files.length === 0) throw new Error(`Pacote de receitas ${ano}: nenhum arquivo de receitas de candidatos`)

  const basenames = files.map((file) => file.split(sep).pop()?.toLowerCase() ?? "")
  if ([2002, 2004, 2006].includes(ano)) {
    const legacy = basenames.filter((name) => name === "receitacandidato.csv")
    if (legacy.length !== 1 || files.length !== 1) {
      throw new Error(`Pacote de receitas ${ano}: layout legado incompleto ou inesperado`)
    }
    return files
  }

  const inferred = new Set(files.map((file) => financiamentoSourceFileUf(file, requiredUFs)).filter(Boolean))
  if (inferred.has("BR")) return files
  const missing = requiredUFs.filter((uf) => !inferred.has(uf))
  if (missing.length > 0) {
    throw new Error(`Pacote de receitas ${ano}: cobertura incompleta das UFs (${missing.join(",")})`)
  }
  return files
}

/**
 * Download and parse consulta_cand to build SQ_CANDIDATO → slug mapping.
 * The bens CSV only has SQ_CANDIDATO (no name), so we need this cross-reference.
 */
type SqCandidateIdentity = {
  candidato: CandidatoConfig
  sqCandidato: string
  uf?: string
  historicalIdentity?: HistoricalCandidateIdentity
  declarouBens?: string
  sourceYear: number
  effectiveYear: number
  electionDate: string | null
  electionType: string | null
  cargo: string | null
  fileAbsenceReceipt?: PatrimonioFileAbsenceReceipt
  /**
   * A identidade foi reencontrada no pacote oficial pelo SQ curado do seed.
   * Somente esse nível autoriza retirar uma quarentena antiga ao reingerir.
   */
  publicacaoAutorizada: boolean
}

export function selectPatrimonioAbsenceCandidates(
  identities: Array<{
    slug: string
    sqCandidato: string
    uf?: string
    declarouBens?: string
    sourceYear?: number
    effectiveYear?: number
    electionDate?: string | null
    electionType?: string | null
    cargo?: string | null
    fileAbsenceReceipt?: PatrimonioFileAbsenceReceipt
  }>,
  slugsWithPatrimonio: ReadonlySet<string>,
  slugAllowlist: ReadonlySet<string> | null = null,
) {
  const byContext = new Map(identities.map((identity) => [
    `${identity.slug}|${identity.sqCandidato}|${identity.uf ?? ""}`,
    identity,
  ]))
  return [...byContext.values()]
    .filter((identity) =>
      !slugsWithPatrimonio.has(identity.slug) &&
      !slugsWithPatrimonio.has(`${identity.slug}|${identity.sqCandidato}|${identity.uf ?? ""}`),
    )
    .filter((identity) => identity.declarouBens === "N" || Boolean(identity.fileAbsenceReceipt))
    .filter((identity) => !slugAllowlist || slugAllowlist.has(identity.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

type LegacyPatrimonioRow = { id: string; valor_total: number | string | null; bens: unknown }
export type PatrimonioLegacyDecision =
  | { action: "insert" }
  | { action: "update_legacy"; id: string; expectedTotal: number; expectedBens: unknown }
  | { action: "block"; reason: string }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "undefined"
}

function sameAssetMultiset(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  const sorted = (items: unknown[]) => items.map(stableJson).sort()
  const before = sorted(left)
  const after = sorted(right)
  return before.every((item, index) => item === after[index])
}

export function decidePatrimonioLegacyReconciliation(input: {
  contextCount: number
  legacyRows: LegacyPatrimonioRow[]
  valorTotal: number
  bens: unknown
}): PatrimonioLegacyDecision {
  if (input.legacyRows.length === 0) return { action: "insert" }
  if (input.contextCount !== 1) {
    return { action: "block", reason: "legado sem SQ coexistiria com múltiplos contextos nominais" }
  }
  if (input.legacyRows.length !== 1) {
    return { action: "block", reason: `esperado um legado sem SQ, encontrados ${input.legacyRows.length}` }
  }
  const legacy = input.legacyRows[0]
  const legacyTotal = Number(legacy.valor_total)
  if (!Number.isFinite(legacyTotal) || legacyTotal !== input.valorTotal || !sameAssetMultiset(legacy.bens, input.bens)) {
    return { action: "block", reason: "legado sem SQ diverge do total ou dos itens do contexto nominal" }
  }
  return { action: "update_legacy", id: legacy.id, expectedTotal: legacyTotal, expectedBens: legacy.bens }
}

export function validarCoberturaPacotePatrimonio(
  ano: number,
  sourcePaths: string[],
  requiredUFs: string[],
): void {
  const upperNames = sourcePaths.map((sourcePath) => sourcePath.split(sep).pop()?.toUpperCase() ?? "")
  if (upperNames.some((name) => /_(BR|BRASIL)\.(CSV|TXT)$/.test(name))) return
  const observedUFs = new Set(
    upperNames
      .map((name) => name.match(/_([A-Z]{2})\.(?:CSV|TXT)$/)?.[1])
      .filter((uf): uf is string => Boolean(uf)),
  )
  const missing = requiredUFs.filter((uf) => !observedUFs.has(uf))
  if (missing.length > 0) {
    throw new Error(`Pacote de bens ${ano}: cobertura incompleta das UFs (${missing.join(",")})`)
  }
}

function candidateUfFromTseRow(row: Record<string, string>): string | undefined {
  const uf = (
    row.SG_UF ||
    row.SG_UE ||
    row.SG_UE_SUPERIOR ||
    row.UNIDADE_ELEITORAL_CANDIDATO ||
    row.SG_UE_SUP ||
    ""
  ).trim().toUpperCase()
  return uf || undefined
}

export function patrimonioDeclarationObservation(
  row: Record<string, string>,
  ano: number,
  sourceUf?: string,
): { identityKey: string; status: "S" | "N" } | null {
  const sqCandidato = (row.SQ_CANDIDATO || "").trim()
  const rowUf = candidateUfFromTseRow(row)
  const uf = rowUf || (sourceUf && sourceUf !== "BR" ? sourceUf.trim().toUpperCase() : undefined)
  const status = row.ST_DECLARAR_BENS?.trim().toUpperCase()
  if (!sqCandidato || !uf || (status !== "S" && status !== "N")) return null

  return {
    identityKey: financiamentoReceitaIdentityKey({ sqCandidato, ano, uf }),
    status,
  }
}

/**
 * SQ dos ciclos antigos não é global. Quando existe uma identidade histórica
 * reconciliada, a linha precisa repetir a unidade eleitoral, cargo e número
 * registrados no manifesto; o nome histórico permite aliases como COSTA sem
 * abrir um fallback nominal. Sem essa identidade por linha, o SQ é recusado.
 */
function historicalIdentityFromValidatedRow(
  candidato: CandidatoConfig,
  row: Record<string, string>,
  ano: number,
  sqCandidato: string,
  uf: string,
): HistoricalCandidateIdentity | undefined {
  if (ano >= 2010) return candidato.historical_identity_by_year?.[String(ano)]
  const configured = candidato.historical_identity_by_year?.[String(ano)]
  const sgUe = (row.SG_UE || row.SG_UE_SUP || row.SG_UE_SUPERIOR || "").trim()
  const cargoCodigo = (row.CD_CARGO || row.CD_CARGO_CANDIDATO || "").trim()
  const cargo = (row.DS_CARGO || "").trim()
  const numero = (row.NR_CAND || row.NR_CANDIDATO || row.NR_CANDIDATO_DIG || "").trim()
  const nome = (row.NM_CANDIDATO || row.NOME_CANDIDATO || row.NO_CAND || "").trim()
  const nomeUrna = (row.NM_URNA_CANDIDATO || row.NOME_URNA || "").trim()
  return {
    ...configured,
    sq_candidato: sqCandidato,
    uf,
    ...(sgUe ? { sg_ue: sgUe } : {}),
    ...(cargoCodigo ? { cargo_codigo: cargoCodigo } : {}),
    ...(cargo ? { cargo } : {}),
    ...(numero ? { numero } : {}),
    ...(nome ? { nome } : {}),
    ...(nomeUrna ? { nome_urna: nomeUrna } : {}),
  }
}

export function historicalPreloadedRowMatches(
  candidato: CandidatoConfig,
  row: Record<string, string>,
  ano: number,
): boolean {
  if (ano >= 2010) return true
  const historical = candidato.historical_identity_by_year?.[String(ano)]
  // Existing cohorts may lack the new historical context, but retain the
  // previous exact-name guard. Apply the stricter SG_UE/cargo/número/alias
  // contract only when a historical identity was explicitly reconciled.
  if (!historical) return historicalCandidateRowMatches(row, candidato)
  if (!historicalCandidateRowMatches(row, {
    nome_completo: candidato.nome_completo,
    nome_urna: candidato.nome_urna,
    ...(historical.nome ? { nome_completo_alternativos: [historical.nome] } : {}),
    ...(historical.nome_urna ? { nome_urna_alternativos: [historical.nome_urna] } : {}),
  })) return false
  const rowSgUe = (row.SG_UE || row.SG_UE_SUP || row.SG_UE_SUPERIOR || "").trim().toUpperCase()
  const rowCargoCode = (row.CD_CARGO || row.CD_CARGO_CANDIDATO || "").trim().toUpperCase()
  const rowCargoLabel = (row.DS_CARGO || "").trim().toUpperCase()
  const rowNumero = (row.NR_CAND || row.NR_CANDIDATO || row.NR_CANDIDATO_DIG || "").trim()
  if (!historical.sg_ue || rowSgUe !== historical.sg_ue.trim().toUpperCase()) return false
  if (historical.cargo_codigo && rowCargoCode && rowCargoCode !== historical.cargo_codigo.trim().toUpperCase()) return false
  if (historical.cargo_codigo && !rowCargoCode && (!historical.cargo || rowCargoLabel !== historical.cargo.trim().toUpperCase())) return false
  if (historical.numero && rowNumero !== historical.numero.trim()) return false
  return true
}

type PatrimonioDeclarationStatus = "S" | "N"

export function recordPatrimonioDeclarationObservation(
  observations: Map<string, PatrimonioDeclarationStatus>,
  conflicts: Set<string>,
  declaration: { identityKey: string; status: PatrimonioDeclarationStatus },
): void {
  if (conflicts.has(declaration.identityKey)) return

  const existingStatus = observations.get(declaration.identityKey)
  if (existingStatus && existingStatus !== declaration.status) {
    observations.delete(declaration.identityKey)
    conflicts.add(declaration.identityKey)
    return
  }

  observations.set(declaration.identityKey, declaration.status)
}

export function hasOfficialCandidateComplementaryPackage(ano: number): boolean {
  return ano >= 2018
}

async function loadPatrimonioDeclarationObservations(
  ano: number,
  governorUFs: string[],
): Promise<{
  observations: Map<string, PatrimonioDeclarationStatus>
  conflicts: Set<string>
}> {
  const observations = new Map<string, PatrimonioDeclarationStatus>()
  const conflicts = new Set<string>()
  if (!hasOfficialCandidateComplementaryPackage(ano)) return { observations, conflicts }

  const zipPath = resolve(DATA_DIR, `consulta_cand_complementar_${ano}.zip`)
  const extractDir = resolve(DATA_DIR, `consulta_cand_complementar_${ano}`)
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_${ano}.zip`

  const ok = await downloadFile(url, zipPath)
  if (!ok) {
    throw new Error(`Consulta complementar de candidaturas ${ano}: download do pacote oficial falhou`)
  }

  try {
    extractZip(zipPath, extractDir, governorUFs)
    const brPaths = findCSVs(extractDir, "_BR").concat(findCSVs(extractDir, "_BRASIL"))
    const ufPaths = governorUFs.flatMap((uf) => findCSVs(extractDir, `_${uf}`))
    const csvPaths = [...brPaths, ...ufPaths].filter((value, index, all) => all.indexOf(value) === index)
    if (csvPaths.length === 0) {
      throw new Error(`Consulta complementar de candidaturas ${ano}: nenhum CSV oficial encontrado`)
    }

    for (const csvPath of csvPaths) {
      const sourceUf = financiamentoSourceFileUf(csvPath, governorUFs)
      await parseCSV(csvPath, (row) => {
        const declaration = patrimonioDeclarationObservation(row, ano, sourceUf)
        if (!declaration) return
        recordPatrimonioDeclarationObservation(observations, conflicts, declaration)
      })
    }
  } finally {
    cleanupDir(extractDir)
    cleanupDownloadedZip(zipPath)
  }

  return { observations, conflicts }
}

async function buildSQMap(
  ano: number,
  candidatos: CandidatoConfig[],
  resolver: TSEResolver,
  governorUFs = getGovernorUFs(candidatos)
): Promise<Map<string, SqCandidateIdentity>> {
  const candZip = resolve(DATA_DIR, `consulta_cand_${ano}.zip`)
  const candDir = resolve(DATA_DIR, `consulta_cand_${ano}`)
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`

  const ok = await downloadFile(url, candZip)
  if (!ok) return new Map()

  extractZip(candZip, candDir, governorUFs)

  const brPaths = findCSVs(candDir, "_BR").concat(findCSVs(candDir, "_BRASIL"))
  const ufPaths = governorUFs.flatMap((uf) => findCSVs(candDir, `_${uf}`))
  const allPaths = [...brPaths, ...ufPaths].filter((v, i, a) => a.indexOf(v) === i)
  if (allPaths.length === 0) return new Map()

  const candidatosBySlug = new Map(candidatos.map((candidato) => [candidato.slug, candidato]))
  const selectedBySlug = new Map<
    string,
    {
      candidato: CandidatoConfig
      sq: string
      method: ResolveMethod
      priority: number
      observed: boolean
      uf?: string
      declarouBens?: string
      historicalIdentity?: HistoricalCandidateIdentity
      sourceYear: number
      effectiveYear: number
      electionDate: string | null
      electionType: string | null
      cargo: string | null
      fileAbsenceReceipt?: PatrimonioFileAbsenceReceipt
    }
  >()
  const callerAmbiguousPriority = new Map<string, number>()
  const receiptSelections = new Map<string, {
    candidato: CandidatoConfig
    sq: string
    uf: string
    sourceYear: number
    effectiveYear: number
    electionDate: string | null
    electionType: string | null
    cargo: string | null
    fileAbsenceReceipt: PatrimonioFileAbsenceReceipt
  }>()
  const consultaPackageSha256 = await sha256File(candZip)
  const patrimonioDeclarations = await loadPatrimonioDeclarationObservations(ano, governorUFs)

  // O SQ curado continua disponível para coletar linhas reais. Ele não prova
  // ausência por si só: `declarouBens` só é preenchido quando a linha oficial
  // de consulta_cand passa pelo resolver logo abaixo.
  const bloqueios = carregarBloqueios()
  for (const candidato of candidatos) {
    const sq = candidato.ids.tse_sq_candidato?.[String(ano)]?.trim()
    if (!sq) continue
    const configuredUf = candidato.ids.tse_uf_candidatura?.[String(ano)]?.trim().toUpperCase()
    if (bloqueios.bloqueio({ slug: candidato.slug, sq, ano })) continue
    selectedBySlug.set(candidato.slug, {
      candidato,
      sq,
      method: "sq-preloaded",
      priority: getResolveMethodPriority("sq-preloaded"),
      observed: false,
      uf: configuredUf || undefined,
      declarouBens: undefined,
      historicalIdentity: candidato.historical_identity_by_year?.[String(ano)],
      sourceYear: ano,
      effectiveYear: ano,
      electionDate: null,
      electionType: null,
      cargo: candidato.historical_identity_by_year?.[String(ano)]?.cargo ?? null,
    })
  }

  for (const csvPath of allPaths) {
    const sourceUf = financiamentoSourceFileUf(csvPath, governorUFs)
    await parseCSV(csvPath, (row) => {
      const declaration = patrimonioDeclarationObservation(row, ano, sourceUf)
      if (declaration) {
        recordPatrimonioDeclarationObservation(
          patrimonioDeclarations.observations,
          patrimonioDeclarations.conflicts,
          declaration,
        )
      }

      const sq = (row.SQ_CANDIDATO || "").trim()
      if (!sq) return
      const uf = candidateUfFromTseRow(row)

      const election = resolveEffectiveElectionContext({
        ano_eleicao: ano,
        dt_eleicao: row.DT_ELEICAO,
        nm_tipo_eleicao: row.NM_TIPO_ELEICAO,
      })
      const electionType = row.NM_TIPO_ELEICAO?.trim() || null
      const cargo = row.DS_CARGO?.trim() || null
      if (uf && cargo) {
        const receipt = findPatrimonioIdentityReceipt({
          sourceYear: ano,
          consultaPackageSha256,
          sqCandidato: sq,
          uf,
          cargo,
          electionDate: election.electionDate,
          electionType,
        })
        const receiptCandidate = receipt ? candidatosBySlug.get(receipt.slug) : undefined
        if (receipt && receiptCandidate) {
          receiptSelections.set(receipt.slug, {
            candidato: receiptCandidate,
            sq,
            uf,
            sourceYear: election.sourceYear,
            effectiveYear: election.effectiveYear,
            electionDate: election.electionDate,
            electionType,
            cargo,
            fileAbsenceReceipt: receipt,
          })
        }
      }

      const match = resolver.resolveRow(row)
      if (!match) return
      if (shouldSkipWeakMatch(match.method)) return

      const candidato = candidatosBySlug.get(match.slug)
      if (!candidato) return
      const configuredUf = candidato.ids.tse_uf_candidatura?.[String(ano)]?.trim().toUpperCase()
      const effectiveUf = uf ?? configuredUf
      const declarouBens = row.ST_DECLARAR_BENS?.trim().toUpperCase() || undefined
      if (
        ano < 2010 &&
        match.method === "sq-preloaded" &&
        !historicalPreloadedRowMatches(candidato, row, ano)
      ) {
        return
      }
      if (!effectiveUf || (configuredUf && uf && configuredUf !== uf)) return

      const priority = getResolveMethodPriority(match.method)
      const existing = selectedBySlug.get(match.slug)
      if (!existing) {
        selectedBySlug.set(match.slug, {
          candidato,
          sq,
          method: match.method,
          priority,
          observed: true,
          uf: effectiveUf,
          declarouBens,
          historicalIdentity: historicalIdentityFromValidatedRow(candidato, row, ano, sq, effectiveUf),
          sourceYear: election.sourceYear,
          effectiveYear: election.effectiveYear,
          electionDate: election.electionDate,
          electionType,
          cargo,
        })
        return
      }

      // O preload é uma pista curada para localizar linhas de bens/receitas,
      // não uma observação do pacote atual. Qualquer identidade aceita pelo
      // resolver no consulta_cand atual substitui essa pista, mesmo que tenha
      // prioridade nominal menor (por exemplo, CPF corrigindo um SQ antigo).
      if (!existing.observed) {
        selectedBySlug.set(match.slug, {
          candidato,
          sq,
          method: match.method,
          priority,
          observed: true,
          uf: effectiveUf,
          declarouBens,
          historicalIdentity: historicalIdentityFromValidatedRow(candidato, row, ano, sq, effectiveUf),
          sourceYear: election.sourceYear,
          effectiveYear: election.effectiveYear,
          electionDate: election.electionDate,
          electionType,
          cargo,
        })
        callerAmbiguousPriority.delete(match.slug)
        return
      }

      if (priority > existing.priority) {
        selectedBySlug.set(match.slug, {
          candidato,
          sq,
          method: match.method,
          priority,
          observed: true,
          uf: effectiveUf,
          declarouBens,
          historicalIdentity: historicalIdentityFromValidatedRow(candidato, row, ano, sq, effectiveUf),
          sourceYear: election.sourceYear,
          effectiveYear: election.effectiveYear,
          electionDate: election.electionDate,
          electionType,
          cargo,
        })
        callerAmbiguousPriority.delete(match.slug)
        return
      }

      if (existing.sq === sq) {
        const rowIdentity = historicalIdentityFromValidatedRow(candidato, row, ano, sq, effectiveUf)
        const existingIdentity = existing.historicalIdentity
        const contextConflict = ["sg_ue", "cargo_codigo", "numero"].some((field) => {
          const left = existingIdentity?.[field as keyof HistoricalCandidateIdentity]
          const right = rowIdentity?.[field as keyof HistoricalCandidateIdentity]
          return typeof left === "string" && typeof right === "string" && left.trim().toUpperCase() !== right.trim().toUpperCase()
        })
        if (contextConflict) {
          callerAmbiguousPriority.set(match.slug, priority)
          return
        }
        if (!existing.uf && effectiveUf) existing.uf = effectiveUf
        if (!existing.declarouBens && declarouBens) existing.declarouBens = declarouBens
        if (!existing.historicalIdentity && rowIdentity) existing.historicalIdentity = rowIdentity
        return
      }

      if (priority < existing.priority) {
        return
      }

      callerAmbiguousPriority.set(match.slug, priority)
    })
  }

  if (patrimonioDeclarations.conflicts.size > 0) {
    warn(
      "tse",
      `  Consulta de candidaturas ${ano}: ${patrimonioDeclarations.conflicts.size} identidade(s) com ST_DECLARAR_BENS conflitante; somente essas identidades ficaram sem prova de ausência`,
    )
  }

  // O recibo é nominal, ligado aos hashes dos pacotes e à linha exata de
  // consulta_cand. Ele resolve somente os 17 contextos auditados; em especial,
  // impede que a candidatura suplementar 2026 de Bartô substitua seu pleito
  // ordinário de senador em 2022.
  for (const [slug, receiptSelection] of receiptSelections) {
    selectedBySlug.set(slug, {
      ...receiptSelection,
      method: "sq-preloaded",
      priority: getResolveMethodPriority("sq-preloaded"),
      observed: true,
      declarouBens: undefined,
      historicalIdentity: undefined,
    })
    callerAmbiguousPriority.delete(slug)
  }

  const sqMap = new Map<string, SqCandidateIdentity>()
  let preloaded = 0
  let resolved = 0

  for (const [slug, selection] of selectedBySlug) {
    if (callerAmbiguousPriority.has(slug)) continue
    if (!selection.uf) {
      warn("tse", `  ${slug} ${ano}: identidade sem UF oficial; SQ recusado`)
      continue
    }
    const identidade = {
      candidato: selection.candidato,
      sqCandidato: selection.sq,
      uf: selection.uf,
      historicalIdentity: selection.historicalIdentity ?? selection.candidato.historical_identity_by_year?.[String(ano)],
      publicacaoAutorizada: selection.observed && selection.method === "sq-preloaded",
      declarouBens: selection.observed
        ? patrimonioDeclarations.observations.get(
            financiamentoReceitaIdentityKey({
              sqCandidato: selection.sq,
              ano,
              uf: selection.uf,
            }),
          ) ?? selection.declarouBens
        : undefined,
      sourceYear: selection.sourceYear,
      effectiveYear: selection.effectiveYear,
      electionDate: selection.electionDate,
      electionType: selection.electionType,
      cargo: selection.cargo ?? selection.historicalIdentity?.cargo ?? null,
      fileAbsenceReceipt: selection.fileAbsenceReceipt,
    }
    if (selection.uf) {
      sqMap.set(
        financiamentoReceitaIdentityKey({
          sqCandidato: selection.sq,
          ano,
          uf: selection.uf,
        }),
        identidade,
      )
    }
    if (selection.method === "sq-preloaded") preloaded++
    else resolved++
  }

  log("tse", `  SQ map ${ano}: ${sqMap.size} candidatos mapeados (${preloaded} preloaded, ${resolved} via resolver)`)
  if (callerAmbiguousPriority.size > 0) {
    warn("tse", `  Ambiguos SQ map ${ano}: ${[...callerAmbiguousPriority.keys()].join(", ")}`)
  }
  return sqMap
}

async function processPatrimonio(
  ano: number,
  extractDir: string,
  sqMap: Map<string, SqCandidateIdentity>,
  slugAllowlist: Set<string> | null,
  options: Pick<IngestTseOptions, "dryRun" | "onPlannedRow" | "observationOnly" | "onObservation">,
  sourceUrl: string,
  bensPackageSha256: string,
): Promise<IngestResult[]> {
  const brPaths = findCSVs(extractDir, "_BR").concat(findCSVs(extractDir, "_BRASIL"))
  const requiredUFs = [
    ...new Set([...sqMap.values()].map((identity) => identity.uf).filter((uf): uf is string => Boolean(uf))),
  ]
  const ufPaths = requiredUFs.flatMap((uf) => findCSVs(extractDir, `_${uf}`))
  const allSourcePaths = [...brPaths, ...ufPaths]
  const csvPaths = allSourcePaths.length > 0
    ? allSourcePaths
    : findCSVs(extractDir, `bem_candidato_${ano}`).concat(findCSVs(extractDir, "bem_candidato"))
  const uniquePaths = csvPaths.filter((v, i, a) => a.indexOf(v) === i)

  if (uniquePaths.length === 0) {
    warn("tse", `  CSV de bens nao encontrado para ${ano}`)
    if (options.observationOnly) throw new Error(`Official wealth CSV unavailable for ${ano}`)
    return []
  }
  validarCoberturaPacotePatrimonio(ano, uniquePaths, requiredUFs)

  const parsedRows: Array<{
    slug: string
    candidateSlug: string
    identity: SqCandidateIdentity
    sourceKey: string
    ordem: string
    tipo: string
    descricao: string
    valor: number
  }> = []

  log("tse", `  Parseando patrimonio ${ano}: ${uniquePaths.length} arquivos CSV (BR${requiredUFs.length > 0 ? " + " + requiredUFs.length + " UFs" : ""})`)
  for (const csvPath of uniquePaths) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim()
      const uf = candidateUfFromTseRow(row)
      const identity = uf
        ? sqMap.get(financiamentoReceitaIdentityKey({ sqCandidato: sq, ano, uf }))
        : undefined
      const cand = identity?.candidato
      if (!cand) return
      if (slugAllowlist && !slugAllowlist.has(cand.slug)) return

      const valor = parseBRL(
        row.VR_BEM_CANDIDATO || "0",
        `patrimonio ${ano} ${cand.slug}`
      )

      parsedRows.push({
        slug: `${cand.slug}|${identity.sqCandidato}|${identity.uf ?? ""}`,
        candidateSlug: cand.slug,
        identity,
        sourceKey: csvPath,
        ordem: row.NR_ORDEM_BEM_CANDIDATO || "",
        tipo: sanitizeTseLegacyAssetText(
          row.DS_TIPO_BEM_CANDIDATO,
          `bem-candidato:${cand.slug}:${ano}:${sq}:tipo`,
        ),
        descricao: sanitizeTseLegacyAssetText(
          maskDocumentLikeSequences(row.DS_BEM_CANDIDATO || ""),
          `bem-candidato:${cand.slug}:${ano}:${sq}:descricao`,
        ),
        valor,
      })
    })
  }

  const dedupedRows = dedupeTsePatrimonioRows(parsedRows)
  if (dedupedRows.length !== parsedRows.length) {
    log(
      "tse",
      `  Patrimonio ${ano}: removidas ${parsedRows.length - dedupedRows.length} duplicatas cruzadas entre arquivos BR/UF`
    )
  }

  const aggregated = new Map<string, {
    candidateSlug: string
    identity: SqCandidateIdentity
    bens: { tipo: string; descricao: string; valor: number }[]
    total: number
  }>()
  for (const item of dedupedRows) {
    const existing = aggregated.get(item.slug) ?? {
      candidateSlug: item.candidateSlug,
      identity: item.identity,
      bens: [],
      total: 0,
    }
    existing.bens.push({
      tipo: item.tipo,
      descricao: item.descricao,
      valor: item.valor,
    })
    existing.total += item.valor
    aggregated.set(item.slug, existing)
  }

  const contextCounts = new Map<string, number>()
  for (const data of aggregated.values()) {
    const key = `${data.candidateSlug}|${data.identity.effectiveYear}`
    contextCounts.set(key, (contextCounts.get(key) ?? 0) + 1)
  }

  const results: IngestResult[] = []
  for (const data of aggregated.values()) {
    const slug = data.candidateSlug
    const identity = data.identity
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue

    const row = {
      candidato_id: candidatoId,
      ano_eleicao: identity.effectiveYear,
      ano_arquivo: identity.sourceYear,
      sq_candidato: identity.sqCandidato,
      uf_candidatura: identity.uf ?? null,
      cargo_candidatura: identity.cargo,
      data_eleicao: identity.electionDate
        ? identity.electionDate.split("/").reverse().join("-")
        : null,
      tipo_eleicao: identity.electionType,
      valor_total: Math.round(data.total * 100) / 100,
      bens: data.bens,
      fonte: "TSE",
      ...(identity.publicacaoAutorizada
        ? { despublicado_em: null, despublicacao_motivo: null }
        : {}),
    }

    const observeWealth = async () => {
      if (!identity.publicacaoAutorizada) return
      const outcome = await observeVerifiedCandidateChange({
        candidateId: candidatoId, field: "patrimonio", year: identity.effectiveYear,
        value: String(row.valor_total), sq: identity.sqCandidato, uf: identity.uf ?? "",
        sourceUrl, identityVerified: identity.publicacaoAutorizada,
        dryRun: options.dryRun, observationOnly: options.observationOnly,
      }, {
        rpc: (name, args) => supabase.rpc(name, args),
        confirmPersisted: async () => {
          const { data: persisted, error: readError } = await supabase.from("patrimonio")
            .select("valor_total, despublicado_em")
            .eq("candidato_id", candidatoId)
            .eq("ano_eleicao", identity.effectiveYear)
            .eq("sq_candidato", identity.sqCandidato)
            .maybeSingle()
          if (readError) throw readError
          return persisted != null && persisted.despublicado_em == null && persisted.valor_total != null && Number(persisted.valor_total) === row.valor_total
        },
      })
      options.onObservation?.(outcome)
    }
    if (options.observationOnly) {
      await observeWealth()
      continue
    }
    if (options.dryRun) {
      options.onPlannedRow?.({
        table: "patrimonio",
        slug,
        row: {
          ...row,
          bens: row.bens.map((bem) => ({
            ...bem,
            descricao: maskDocumentLikeSequences(bem.descricao),
          })),
        },
      })
    } else {
      const { data: existing, error: existingError } = await supabase
        .from("patrimonio")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", identity.effectiveYear)
        .eq("sq_candidato", identity.sqCandidato)
        .maybeSingle()
      if (existingError) throw existingError

      if (existing) {
        const { error: updateError } = await supabase
          .from("patrimonio")
          .update(row)
          .eq("id", existing.id)
        if (updateError) throw updateError
      } else {
        const { data: legacyRows, error: legacyError } = await supabase
          .from("patrimonio")
          .select("id,valor_total,bens")
          .eq("candidato_id", candidatoId)
          .eq("ano_eleicao", identity.effectiveYear)
          .is("sq_candidato", null)
        if (legacyError) throw legacyError
        const decision = decidePatrimonioLegacyReconciliation({
          contextCount: contextCounts.get(`${slug}|${identity.effectiveYear}`) ?? 0,
          legacyRows: (legacyRows ?? []) as LegacyPatrimonioRow[],
          valorTotal: row.valor_total,
          bens: row.bens,
        })
        if (decision.action === "block") throw new Error(`${slug}/${identity.effectiveYear}: ${decision.reason}`)
        if (decision.action === "update_legacy") {
          const { data: reconciled, error: reconcileError } = await supabase
            .from("patrimonio")
            .update(row)
            .eq("id", decision.id)
            .is("sq_candidato", null)
            .eq("valor_total", decision.expectedTotal)
            .eq("bens", JSON.stringify(decision.expectedBens))
            .select("id")
            .maybeSingle()
          if (reconcileError) throw reconcileError
          if (!reconciled) throw new Error(`${slug}/${identity.effectiveYear}: CAS do legado sem SQ não alterou linha`)
        } else {
          const { error: insertError } = await supabase.from("patrimonio").insert(row)
          if (insertError) throw insertError
        }
      }

      // Só retire uma ausência anterior depois que o patrimônio real estiver
      // confirmado no banco. Assim uma falha de escrita nunca apaga a última
      // evidência válida e transforma o estado em "não coletado".
      const { error: staleAbsenceError } = await supabase
        .from("patrimonio_ausencia_oficial")
        .delete()
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", identity.effectiveYear)
        .eq("sq_candidato", identity.sqCandidato)
      if (staleAbsenceError) throw staleAbsenceError
      await observeWealth()
    }

    log("tse", `  ${slug}: patrimonio ${identity.effectiveYear} (${identity.sqCandidato}) — R$ ${Math.round(data.total).toLocaleString()} (${data.bens.length} bens)`)
    results.push({
      source: "tse",
      candidato: slug,
      tables_updated: ["patrimonio"],
      rows_upserted: options.dryRun ? 0 : 1,
      errors: [],
      duration_ms: 0,
    })
  }

  if (options.observationOnly) return results
  const absenceCandidates = selectPatrimonioAbsenceCandidates(
    [...sqMap.values()].map((identity) => ({
      slug: identity.candidato.slug,
      sqCandidato: identity.sqCandidato,
      uf: identity.uf,
      declarouBens: identity.declarouBens,
      sourceYear: identity.sourceYear,
      effectiveYear: identity.effectiveYear,
      electionDate: identity.electionDate,
      electionType: identity.electionType,
      cargo: identity.cargo,
      fileAbsenceReceipt: validatesPatrimonioFileAbsence(identity.fileAbsenceReceipt, bensPackageSha256)
        ? identity.fileAbsenceReceipt
        : undefined,
    })),
    new Set([...aggregated.values()].map((data) =>
      `${data.candidateSlug}|${data.identity.sqCandidato}|${data.identity.uf ?? ""}`,
    )),
    slugAllowlist,
  )
  const verifiedAt = new Date().toISOString()
  const execution = process.env.GITHUB_RUN_ID
    ? `github-actions:${process.env.GITHUB_RUN_ID}`
    : "ingest-tse"
  const absenceContextCounts = new Map<string, number>()
  for (const identity of absenceCandidates) {
    const key = `${identity.slug}|${identity.effectiveYear ?? ano}`
    absenceContextCounts.set(key, (absenceContextCounts.get(key) ?? 0) + 1)
  }

  for (const identity of absenceCandidates) {
    const candidatoId = await resolveCandidatoId(identity.slug)
    if (!candidatoId) continue
    const row = {
      candidato_id: candidatoId,
      ano_eleicao: identity.effectiveYear ?? ano,
      ano_arquivo: identity.sourceYear ?? ano,
      sq_candidato: identity.sqCandidato,
      uf_candidatura: identity.uf ?? null,
      cargo_candidatura: identity.cargo,
      data_eleicao: identity.electionDate
        ? identity.electionDate.split("/").reverse().join("-")
        : null,
      tipo_eleicao: identity.electionType,
      fonte_url: sourceUrl,
      verificado_em: verifiedAt,
      detalhe: patrimonioAbsencePublicDetail({
        cargo: identity.cargo,
        uf: identity.uf,
        effectiveYear: identity.effectiveYear ?? ano,
        declarouBens: identity.declarouBens,
      }),
      execucao: execution,
    }

    if (options.dryRun) {
      options.onPlannedRow?.({ table: "patrimonio_ausencia_oficial", slug: identity.slug, row })
    } else {
      const { data: existingPatrimonio, error: existingPatrimonioError } = await supabase
        .from("patrimonio")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", identity.effectiveYear)
        .eq("sq_candidato", identity.sqCandidato)
        .maybeSingle()
      if (existingPatrimonioError) throw existingPatrimonioError
      if (existingPatrimonio) continue

      const { data: legacyPatrimonio, error: legacyPatrimonioError } = await supabase
        .from("patrimonio")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", identity.effectiveYear)
        .is("sq_candidato", null)
      if (legacyPatrimonioError) throw legacyPatrimonioError
      if ((legacyPatrimonio ?? []).length > 0) {
        throw new Error(`${identity.slug}/${identity.effectiveYear}: patrimônio legado sem SQ impede registrar ausência para um contexto nominal`)
      }

      const { data: existingAbsence, error: existingAbsenceError } = await supabase
        .from("patrimonio_ausencia_oficial")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", identity.effectiveYear)
        .eq("sq_candidato", identity.sqCandidato)
        .maybeSingle()
      if (existingAbsenceError) throw existingAbsenceError
      if (existingAbsence) continue

      const { data: legacyAbsences, error: legacyAbsencesError } = await supabase
        .from("patrimonio_ausencia_oficial")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", identity.effectiveYear)
        .is("sq_candidato", null)
      if (legacyAbsencesError) throw legacyAbsencesError
      if ((legacyAbsences ?? []).length > 0) {
        const contextCount = absenceContextCounts.get(`${identity.slug}|${identity.effectiveYear}`) ?? 0
        if (contextCount !== 1 || legacyAbsences!.length !== 1) {
          throw new Error(`${identity.slug}/${identity.effectiveYear}: ausência legada sem SQ não pode ser escolhida entre múltiplos contextos`)
        }
        const { data: reconciled, error: reconcileError } = await supabase
          .from("patrimonio_ausencia_oficial")
          .update(row)
          .eq("id", legacyAbsences![0].id)
          .is("sq_candidato", null)
          .select("id")
          .maybeSingle()
        if (reconcileError) throw reconcileError
        if (!reconciled) throw new Error(`${identity.slug}/${identity.effectiveYear}: CAS da ausência legada sem SQ não alterou linha`)
      } else {
        const { error: absenceError } = await supabase
          .from("patrimonio_ausencia_oficial")
          .insert(row)
        if (absenceError) throw absenceError
      }
    }

    results.push({
      source: "tse",
      candidato: identity.slug,
      tables_updated: ["patrimonio_ausencia_oficial"],
      rows_upserted: options.dryRun ? 0 : 1,
      errors: [],
      duration_ms: 0,
      coleta_resultado: "vazio_confirmado",
      coleta_volume: 0,
      coleta_detalhe: row.detalhe,
    })
  }

  return results
}

async function processFinanciamento(
  ano: number,
  candidatos: CandidatoConfig[],
  extractDir: string,
  sqMap: Map<string, SqCandidateIdentity>,
  slugAllowlist: Set<string> | null,
  options: Pick<IngestTseOptions, "dryRun" | "onPlannedRow" | "planStorageRows">,
  sourceUrl: string,
  confirmOfficialAbsence: boolean,
): Promise<IngestResult[]> {
  const governorUFs = getGovernorUFs(candidatos)
  const allReceiptFiles = collectReceitasCandidatoSourceFiles(extractDir)
  const lowerPath = (p: string) => p.toLowerCase()
  const brPaths = allReceiptFiles.filter((p) => {
    const lp = lowerPath(p)
    return (
      lp.includes("_br") ||
      lp.includes("_brasil") ||
      lp.includes("brasil.csv") ||
      // Legacy 2010 layout: candidato/BR/ReceitasCandidatos.txt — directory-based BR partition.
      lp.includes(`${sep}br${sep}`) ||
      lp.includes(`${sep}brasil${sep}`)
    )
  })
  const ufPaths = allReceiptFiles.filter((p) =>
    governorUFs.some((uf) => {
      const u = uf.toLowerCase()
      const lp = lowerPath(p)
      return (
        lp.includes(`_${u}.`) ||
        lp.includes(`${sep}${u}${sep}`) ||
        lp.includes(`${sep}${u.toLowerCase()}${sep}`)
      )
    })
  )
  const allSourcePaths = [...brPaths, ...ufPaths]
  const csvPaths =
    allSourcePaths.length > 0
      ? allSourcePaths
      : allReceiptFiles.length > 0
        ? allReceiptFiles
        : findCSVs(extractDir, `receitas_candidatos_${ano}`)
            .concat(findCSVs(extractDir, "receitas_candidatos"))
            .concat(findCSVs(extractDir, "receita_candidato"))
            .concat(findCSVs(extractDir, "receitascandidatos"))
  const uniquePaths = selectCanonicalFinanciamentoSourceFiles(csvPaths, ano)

  if (uniquePaths.length === 0) {
    throw new Error(`Ficheiros de receitas de candidatos nao encontrados para ${ano}`)
  }

  const doadorCpfSalt = process.env.PF_DOADOR_CPF_HASH_SALT?.trim()
  const requireSaltWhenCpfPresent =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
  if (!doadorCpfSalt && !requireSaltWhenCpfPresent) {
    log(
      "tse",
      "  Aviso: PF_DOADOR_CPF_HASH_SALT ausente — CPF de doador no CSV nao gera cpf_hash ate configurar o salt."
    )
  }

  interface FinData {
    sqCandidato: string
    uf: string | null
    cargoCandidatura: string | null
    publicacaoAutorizada: boolean
    total: number
    fundo_partidario: number
    fundo_eleitoral: number
    pessoa_fisica: number
    recursos_proprios: number
    doadores: { nome: string; valor: number; tipo: string; cnpj?: string; cpf_hash?: string; cpf_hash_versao?: number }[]
  }

  const aggregated = new Map<string, FinData>()
  // Dedup: cópia exata entre CSV _BR/_UF cai pelo fingerprint semântico;
  // itens distintos com o mesmo SQ_RECEITA permanecem separados.
  const seenReceiptKeys = new Set<string>()
  const legacyIdentityTargetsByUf = new Map<string, SqCandidateIdentity[]>()
  for (const identity of sqMap.values()) {
    const uf = identity.uf?.trim().toUpperCase()
    if (!uf) continue
    const targets = legacyIdentityTargetsByUf.get(uf) ?? []
    targets.push(identity)
    legacyIdentityTargetsByUf.set(uf, targets)
  }

  log(
    "tse",
    `  Parseando financiamento ${ano}: ${uniquePaths.length} ficheiros de receitas (BR${governorUFs.length > 0 ? " + " + governorUFs.length + " UFs" : ""})`
  )
  for (const csvPath of uniquePaths) {
    const ufFromPath = financiamentoSourceFileUf(csvPath, governorUFs)
    await parseCSV(csvPath, (raw) => {
      const row = normalizeFinanciamentoReceitaRow(raw)
      if (!row.SG_UF_CANDIDATURA && ufFromPath && ufFromPath !== "BR") row.SG_UF_CANDIDATURA = ufFromPath
      if (!row.SQ_CANDIDATO?.trim()) {
        const rowUf = row.SG_UF_CANDIDATURA?.trim().toUpperCase() ?? ""
        const legacyTargets = rowUf
          ? (legacyIdentityTargetsByUf.get(rowUf) ?? [])
          : [...sqMap.values()]
        const legacyIdentity = resolveLegacyReceiptSqIdentity(row, ano, legacyTargets)
        if (!legacyIdentity) return
        row.SQ_CANDIDATO = legacyIdentity.sqCandidato
        row.SG_UF_CANDIDATURA = legacyIdentity.uf
      }
      const identidadeDaLinha = financiamentoReceitaIdentity(row, ano)
      const sq = identidadeDaLinha.sqCandidato

      const identidade = sqMap.get(financiamentoReceitaIdentityKey(identidadeDaLinha))
      if (!identidade) return
      financiamentoReceitaIdentity(row, ano, identidade.uf)
      const candidato = identidade.candidato

      const dedupKey = financiamentoReceitaDedupKey(row, {
        ano,
        uf: identidadeDaLinha.uf,
        sqCandidato: sq,
      })
      if (dedupKey && seenReceiptKeys.has(dedupKey)) return
      if (dedupKey) seenReceiptKeys.add(dedupKey)

      const aggregateKey = `${candidato.slug}|${identidade.sqCandidato}|${(identidade.uf ?? "").toUpperCase()}`
      const existing = aggregated.get(aggregateKey) ?? {
        sqCandidato: identidade.sqCandidato,
        uf: identidade.uf ?? null,
        cargoCandidatura: identidade.historicalIdentity?.cargo?.trim() || null,
        publicacaoAutorizada: identidade.publicacaoAutorizada,
        total: 0,
        fundo_partidario: 0,
        fundo_eleitoral: 0,
        pessoa_fisica: 0,
        recursos_proprios: 0,
        doadores: [],
      }

      const valor = parseBRL(
        row.VR_RECEITA || "0",
        `financiamento ${ano} ${candidato.slug}`
      )
      const origem = [row.DS_FONTE_RECEITA, row.DS_ORIGEM_RECEITA].filter(Boolean).join(" — ")
      const origemCategoria = classifyFinanciamentoOrigem(origem)

      existing.total += valor

      if (origemCategoria === "fundo_partidario") existing.fundo_partidario += valor
      else if (origemCategoria === "fundo_eleitoral") existing.fundo_eleitoral += valor
      else if (origemCategoria === "pessoa_fisica") existing.pessoa_fisica += valor
      else if (origemCategoria === "recursos_proprios") existing.recursos_proprios += valor

      const nomeDoador = row.NM_DOADOR || row.NM_DOADOR_RFB || ""
      const tipoDoadorInicial: FinData["doadores"][number]["tipo"] = origemCategoria === "pessoa_fisica"
        ? "PF"
        : origemCategoria === "fundo_partidario"
          ? "fundo_partidario"
          : origemCategoria === "fundo_eleitoral"
            ? "fundo_eleitoral"
            : origemCategoria === "recursos_proprios"
              ? "recursos_proprios"
              : "PJ"

      let donorIds: { cnpj?: string; cpf_hash?: string; cpf_hash_versao?: number }
      try {
        donorIds = extractOptionalDonorIdsFromTseRow(row, doadorCpfSalt, { requireSaltWhenCpfPresent })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        error("tse", `  ${msg}`)
        throw e // não engole: interrompe o ingest (ex.: CPF no CSV em prod sem PF_DOADOR_CPF_HASH_SALT)
      }

      const doador: FinData["doadores"][number] = {
        nome: nomeDoador,
        valor,
        tipo: normalizeDoadorTipoWithIdentifiers(tipoDoadorInicial, donorIds),
      }
      if (donorIds.cnpj) doador.cnpj = donorIds.cnpj
      if (donorIds.cpf_hash) {
        doador.cpf_hash = donorIds.cpf_hash
        if (donorIds.cpf_hash_versao !== undefined) doador.cpf_hash_versao = donorIds.cpf_hash_versao
      }

      existing.doadores.push(doador)

      aggregated.set(aggregateKey, existing)
    })
  }

  const results: IngestResult[] = []
  for (const [aggregateKey, data] of aggregated) {
    const slug = aggregateKey.split("|", 1)[0]!
    if (slugAllowlist && !slugAllowlist.has(slug)) continue
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue

    // Agregar pela chave publica exibida; se IDs divergirem no mesmo nome, nao persiste um ID unico enganoso.
    const maioresDoadores = normalizeMaioresDoadoresForStorage(data.doadores)

    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      sq_candidato: data.sqCandidato,
      uf_candidatura: data.uf,
      ...(data.cargoCandidatura ? { cargo_candidatura: data.cargoCandidatura } : {}),
      total_arrecadado: Math.round(data.total * 100) / 100,
      total_fundo_partidario: Math.round(data.fundo_partidario * 100) / 100,
      total_fundo_eleitoral: Math.round(data.fundo_eleitoral * 100) / 100,
      total_pessoa_fisica: Math.round(data.pessoa_fisica * 100) / 100,
      total_recursos_proprios: Math.round(data.recursos_proprios * 100) / 100,
      maiores_doadores: maioresDoadores,
      fonte: "TSE",
      ...(data.publicacaoAutorizada
        ? { despublicado_em: null, despublicacao_motivo: null }
        : {}),
    }

    if (options.dryRun) {
      options.onPlannedRow?.({
        table: "financiamento",
        slug,
        row: options.planStorageRows
          ? {
              ...row,
              // Lista completa, sem o corte dos 10 maiores, para quem precisa
              // casar doador por nome (rehash de cpf_hash). Nunca vai a log.
              doadores_completos: normalizeMaioresDoadoresForStorage(data.doadores, Number.MAX_SAFE_INTEGER),
              receitas: data.doadores.length,
            }
          : {
              ...row,
              maiores_doadores: sanitizeMaioresDoadoresForPublic(row.maiores_doadores),
            },
      })
    } else {
      const { error: staleVerificationError } = await supabase
        .from("financiamento_verificacoes")
        .delete()
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", ano)
        .eq("sq_candidato", data.sqCandidato)
        .eq("uf_candidatura", data.uf)
      if (staleVerificationError) throw staleVerificationError

      const { data: existing, error: lookupError } = await supabase
        .from("financiamento")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", ano)
        .eq("sq_candidato", data.sqCandidato)
        .eq("uf_candidatura", data.uf)
        .maybeSingle()
      if (lookupError) throw lookupError

      const { error: writeError } = existing
        ? await supabase.from("financiamento").update(row).eq("id", existing.id)
        : await supabase.from("financiamento").insert(row)
      if (writeError) throw writeError

    }

    log("tse", `  ${slug}: financiamento ${ano} — R$ ${Math.round(data.total).toLocaleString()} (${data.doadores.length} receitas)`)
    results.push({
      source: "tse",
      candidato: slug,
      tables_updated: ["financiamento"],
      rows_upserted: options.dryRun ? 0 : 1,
      errors: [],
      duration_ms: 0,
    })
  }

  for (const identity of sqMap.values()) {
    const slug = identity.candidato.slug
    if ([...aggregated.keys()].some((key) => key.startsWith(`${slug}|`))) continue
    if (slugAllowlist && !slugAllowlist.has(slug)) continue
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue
    const resultado = confirmOfficialAbsence ? "ausencia_oficial" : "erro"
    const detalhe = confirmOfficialAbsence
      ? "Identidade confirmada por SQ_CANDIDATO, ano e UF; pacote oficial completo sem receita para a candidatura."
      : "Pacote oficial de receitas incompleto; a ausencia nao foi confirmada."
    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      sq_candidato: identity.sqCandidato,
      uf_candidatura: identity.uf ?? null,
      cargo_candidatura: identity.historicalIdentity?.cargo?.trim() || null,
      resultado,
      fonte_url: sourceUrl,
      verificado_em: "2026-08-10T00:00:00.000Z",
      detalhe,
      execucao: "pf-ajustes-financiamento-20260810",
    }
    if (resultado === "ausencia_oficial" && !row.uf_candidatura) continue
    if (options.dryRun) {
      options.onPlannedRow?.({ table: "financiamento_verificacoes", slug, row })
    } else {
      const { data: existingFinance, error: existingFinanceError } = await supabase
        .from("financiamento")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", ano)
        .eq("sq_candidato", identity.sqCandidato)
        .eq("uf_candidatura", identity.uf)
        .maybeSingle()
      if (existingFinanceError) throw existingFinanceError
      if (existingFinance) continue

      const { error: verificationError } = await supabase
        .from("financiamento_verificacoes")
        .upsert(row, { onConflict: "candidato_id,ano_eleicao,sq_candidato,uf_candidatura" })
      if (verificationError) throw pendingContextMigrationError(verificationError, "financiamento_verificacoes") ?? verificationError
    }
    results.push({
      source: "tse",
      candidato: slug,
      tables_updated: ["financiamento_verificacoes"],
      rows_upserted: options.dryRun ? 0 : 1,
      errors: resultado === "erro" ? [detalhe] : [],
      duration_ms: 0,
      coleta_resultado: resultado === "ausencia_oficial" ? "vazio_confirmado" : "erro",
      coleta_volume: 0,
      coleta_detalhe: detalhe,
    })
  }

  return results
}

async function planFinanciamentoYearError(
  ano: number,
  sqMap: Map<string, SqCandidateIdentity>,
  slugAllowlist: Set<string> | null,
  options: Pick<IngestTseOptions, "dryRun" | "onPlannedRow">,
  sourceUrl: string,
  message: string,
): Promise<void> {
  for (const identity of sqMap.values()) {
    const slug = identity.candidato.slug
    if (slugAllowlist && !slugAllowlist.has(slug)) continue
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue
    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      sq_candidato: identity.sqCandidato,
      uf_candidatura: identity.uf ?? null,
      cargo_candidatura: identity.historicalIdentity?.cargo?.trim() || null,
      resultado: "erro",
      fonte_url: sourceUrl,
      verificado_em: "2026-08-10T00:00:00.000Z",
      detalhe: message,
      execucao: "pf-ajustes-financiamento-20260810",
    }
    if (options.dryRun) {
      options.onPlannedRow?.({ table: "financiamento_verificacoes", slug, row })
    } else {
      const { data: existingFinance, error: existingFinanceError } = await supabase
        .from("financiamento")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", ano)
        .eq("sq_candidato", identity.sqCandidato)
        .eq("uf_candidatura", identity.uf)
        .maybeSingle()
      if (existingFinanceError) throw existingFinanceError
      if (existingFinance) continue

      const { error: verificationError } = await supabase
        .from("financiamento_verificacoes")
        .upsert(row, { onConflict: "candidato_id,ano_eleicao,sq_candidato,uf_candidatura" })
      if (verificationError) throw pendingContextMigrationError(verificationError, "financiamento_verificacoes") ?? verificationError
    }
  }
}

export function hasConfiguredElectionContext(candidato: CandidatoConfig, ano: number): boolean {
  return Boolean(
    candidato.ids.tse_sq_candidato?.[String(ano)]?.trim() ||
    candidato.historical_identity_by_year?.[String(ano)],
  )
}

async function planFinanciamentoCandidatesYearError(
  ano: number,
  candidatos: CandidatoConfig[],
  slugAllowlist: Set<string> | null,
  mappedSlugs: Set<string>,
  options: Pick<IngestTseOptions, "dryRun" | "onPlannedRow">,
  sourceUrl: string,
  message: string,
): Promise<void> {
  for (const candidato of candidatos) {
    if (mappedSlugs.has(candidato.slug)) continue
    const configuredSq = candidato.ids.tse_sq_candidato?.[String(ano)]?.trim() || null
    if (slugAllowlist && !slugAllowlist.has(candidato.slug)) continue
    // A allowlist restringe quem pode ser escrito, mas não prova que a pessoa
    // disputou aquele ano. Sem SQ ou identidade histórica configurada, um erro
    // de coleta criaria um pleito inexistente na ficha.
    if (!hasConfiguredElectionContext(candidato, ano)) continue
    const candidatoId = await resolveCandidatoId(candidato.slug)
    if (!candidatoId) continue
    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      sq_candidato: configuredSq,
      uf_candidatura:
        candidato.ids.tse_uf_candidatura?.[String(ano)]?.trim().toUpperCase() || null,
      cargo_candidatura: candidato.historical_identity_by_year?.[String(ano)]?.cargo?.trim() || null,
      resultado: "erro",
      fonte_url: sourceUrl,
      verificado_em: "2026-08-10T00:00:00.000Z",
      detalhe: message,
      execucao: "pf-ajustes-financiamento-20260810",
    }
    if (options.dryRun) {
      options.onPlannedRow?.({ table: "financiamento_verificacoes", slug: candidato.slug, row })
      continue
    }
    const { data: existingFinance, error: existingFinanceError } = await supabase
      .from("financiamento")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano_eleicao", ano)
      .eq("sq_candidato", configuredSq)
      .eq("uf_candidatura", row.uf_candidatura)
      .maybeSingle()
    if (existingFinanceError) throw existingFinanceError
    if (existingFinance) continue
    const { error: verificationError } = await supabase
      .from("financiamento_verificacoes")
      .upsert(row, { onConflict: "candidato_id,ano_eleicao,sq_candidato,uf_candidatura" })
    if (verificationError) throw pendingContextMigrationError(verificationError, "financiamento_verificacoes") ?? verificationError
  }
}

function logResolverStats(ano: number, resolver: TSEResolver) {
  const { stats } = resolver
  log(
    "tse",
    `  Resolver ${ano}: sq-preloaded=${stats.sqPreloaded}, cpf=${stats.cpf}, name-unique=${stats.nameUnique}, name-uf=${stats.nameUf}, ambiguous=${stats.ambiguous}, no-match=${stats.noMatch}`
  )

  if (resolver.ambiguousSlugs.length > 0) {
    log("tse", `  Ambiguos ${ano}: ${resolver.ambiguousSlugs.join(", ")}`)
  }
}

export interface PlannedTseRow {
  table:
    | "patrimonio"
    | "patrimonio_ausencia_oficial"
    | "financiamento"
    | "financiamento_verificacoes"
  slug: string
  row: Record<string, unknown>
}

export type IngestTseOptions = {
  /** Read official facts and observe already published values only; never rewrite facts. */
  observationOnly?: boolean
  onObservation?: (outcome: "baseline" | "unchanged" | "changed" | "skipped") => void
  skipFinanciamento?: boolean
  /** Omite download/parse de patrimônio (bens) — útil para lote só `financiamento-gap`. */
  skipPatrimonio?: boolean
  /** Se definido, só persiste linhas de `patrimonio` para estes slugs. */
  patrimonioSlugAllowlist?: Set<string> | null
  /** Se definido, só persiste linhas de `financiamento` para estes slugs. */
  financiamentoSlugAllowlist?: Set<string> | null
  /** Planeja linhas a partir dos arquivos oficiais sem fazer INSERT/UPDATE. */
  dryRun?: boolean
  /** Recebe cada linha normalizada quando `dryRun` está ativo. */
  onPlannedRow?: (entry: PlannedTseRow) => void
  /**
   * Em `dryRun`, entrega a linha de financiamento como seria gravada (com
   * `cnpj`/`cpf_hash`) e a lista completa de doadores. Só para escritores
   * auditados que aplicam a linha por conta própria; o CLI nunca liga isto.
   */
  planStorageRows?: boolean
  /** Coorte explícita não publicada, consumida pelo mesmo fluxo TSE após onboarding. */
  cohort?: ExplicitCohortSelection
}

async function loadCandidatosParaTse(cohort?: ExplicitCohortSelection): Promise<CandidatoConfig[]> {
  if (!cohort) return loadCandidatosPublicos()
  const rows = await loadCandidatosCohortNaoPublica(cohort)
  const seedBySlug = new Map(loadCandidatos().map((candidate) => [candidate.slug, candidate]))
  return rows.map((row): CandidatoConfig => {
    const seed = seedBySlug.get(row.slug)
    return seed ?? {
      slug: row.slug,
      nome_completo: row.nome_completo ?? row.slug,
      nome_urna: row.nome_urna ?? row.slug,
      cargo_disputado: "Senador",
      ...(row.estado ? { estado: row.estado } : {}),
      ids: { camara: null, senado: null, tse_sq_candidato: { "2026": row.sq_candidato_2026! } },
    }
  })
}

export async function ingestTSE(
  anos: number[] = [...DEFAULT_TSE_ANOS],
  options: IngestTseOptions = {}
): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosParaTse(options.cohort)
  const allResults: IngestResult[] = []
  if (!options.dryRun) {
    // Falha antes de baixar ZIP ou gravar: sem as migrations de contexto o
    // banco só responderia 42P10/coluna inexistente no meio da carga.
    await assertTseContextSchemaReady(supabase, {
      patrimonio: !options.skipPatrimonio,
      financiamento: !options.skipFinanciamento && !options.observationOnly,
    })
  }

  mkdirSync(DATA_DIR, { recursive: true })
  if (KEEP_TSE_DOWNLOADS) {
    log("tse", "Cache de downloads TSE ativo (PF_KEEP_TSE_DOWNLOADS=1)")
  }

  for (const ano of anos) {
    log("tse", `=== Processando eleicao ${ano} ===`)

    const bensZip = resolve(DATA_DIR, `bem_candidato_${ano}.zip`)
    const bensDir = resolve(DATA_DIR, `bem_${ano}`)
    const receitasDir = resolve(DATA_DIR, `receitas_${ano}`)

    const targetSlugs = new Set([
      ...(options.patrimonioSlugAllowlist ?? []),
      ...(options.financiamentoSlugAllowlist ?? []),
    ])
    const governorUFs = getGovernorUFs(candidatos, targetSlugs.size > 0 ? targetSlugs : null)
    const resolver = await createTSEResolver(candidatos, ano, {
      validatePreloadedRow: (candidate, row) => historicalPreloadedRowMatches(candidate, row, ano),
    })

    let sqMap = new Map<string, SqCandidateIdentity>()
    let identitySourceError: string | null = null
    try {
      sqMap = await buildSQMap(ano, candidatos, resolver, governorUFs)
      if (sqMap.size === 0) identitySourceError = `Consulta de candidaturas ${ano}: nenhuma identidade comprovada`
    } catch (err) {
      identitySourceError = `Consulta de candidaturas ${ano}: ${err instanceof Error ? err.message : String(err)}`
    }
    cleanupDir(resolve(DATA_DIR, `consulta_cand_${ano}`))
    cleanupDownloadedZip(resolve(DATA_DIR, `consulta_cand_${ano}.zip`))

    const mappedSlugs = new Set([...sqMap.values()].map((identity) => identity.candidato.slug))
    const identityUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`
    if (!options.observationOnly && !options.skipFinanciamento) await planFinanciamentoCandidatesYearError(
      ano,
      candidatos,
      options.financiamentoSlugAllowlist ?? null,
      mappedSlugs,
      options,
      identityUrl,
      identitySourceError ?? `Identidade oficial ${ano} nao comprovada por SQ_CANDIDATO, ano e UF.`,
    )
    if (identitySourceError) {
      allResults.push({
        source: "tse",
        candidato: `financiamento-${ano}`,
        tables_updated: [],
        rows_upserted: 0,
        errors: [identitySourceError],
        duration_ms: 0,
        coleta_resultado: "erro",
        coleta_detalhe: identitySourceError,
      })
      continue
    }

    const bensUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`
    if (!options.skipPatrimonio && hasOfficialPatrimonioPackage(ano)) {
      const bensOk = await downloadFile(bensUrl, bensZip)
      if (bensOk) {
        try {
          extractZip(bensZip, bensDir, governorUFs)
          const patrimonioResults = await processPatrimonio(
            ano,
            bensDir,
            sqMap,
            options.patrimonioSlugAllowlist ?? null,
            options,
            bensUrl,
            await sha256File(bensZip),
          )
          allResults.push(...patrimonioResults)
        } catch (err) {
          error("tse", `  Erro patrimonio ${ano}: ${err}`)
          throw err
        } finally {
          cleanupDir(bensDir)
          cleanupDownloadedZip(bensZip)
        }
      } else {
        cleanupDownloadedZip(bensZip)
        throw new Error(`Patrimonio ${ano}: download do pacote oficial falhou`)
      }
    } else if (options.skipPatrimonio) {
      log("tse", `  Patrimonio ${ano}: ignorado (skipPatrimonio)`)
    } else {
      log("tse", `  Patrimonio ${ano}: pacote nao publicado pelo TSE; etapa ignorada`)
    }

    if (options.observationOnly || options.skipFinanciamento) continue
    await sleep(1000)

    cleanupDir(receitasDir)
    const receitasUrls = financiamentoReceitasZipUrls(ano)
    let anyReceitasZip = false
    let successfulReceitasZips = 0
    for (let i = 0; i < receitasUrls.length; i++) {
      const receitasUrl = receitasUrls[i]
      const pathTail = new URL(receitasUrl).pathname.split("/").pop() ?? `receitas_${i}.zip`
      const receitasZip = resolve(DATA_DIR, `receitas_${ano}_${i}_${pathTail}`)
      log("tse", `  Receitas ${ano}: baixando ${receitasUrl}`)
      const receitasOk = await downloadFile(receitasUrl, receitasZip)
      if (receitasOk) {
        anyReceitasZip = true
        try {
          const receitasPacoteDir = resolve(receitasDir, String(i))
          extractZip(receitasZip, receitasPacoteDir, governorUFs)
          const requiredReceiptUFs = [...new Set([...sqMap.values()].map((identity) => identity.uf).filter(Boolean))] as string[]
          validarCoberturaPacoteReceitas(ano, receitasPacoteDir, requiredReceiptUFs)
          successfulReceitasZips += 1
        } catch (err) {
          error("tse", `  Pacote de receitas invalido ${ano} (${receitasUrl}): ${err}`)
        }
        cleanupDownloadedZip(receitasZip)
      }
    }
    if (anyReceitasZip && successfulReceitasZips === receitasUrls.length) {
      try {
        const finResults = await processFinanciamento(
          ano,
          candidatos,
          receitasDir,
          sqMap,
          options.financiamentoSlugAllowlist ?? null,
          options,
          receitasUrls[receitasUrls.length - 1] ?? "https://dadosabertos.tse.jus.br/group/prestacao-de-contas-eleitorais",
          true,
        )
        allResults.push(...finResults)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        error("tse", `  Erro financiamento ${ano}: ${message}`)
        await planFinanciamentoYearError(
          ano,
          sqMap,
          options.financiamentoSlugAllowlist ?? null,
          options,
          receitasUrls[receitasUrls.length - 1] ?? "https://dadosabertos.tse.jus.br/group/prestacao-de-contas-eleitorais",
          message,
        )
        allResults.push({
          source: "tse",
          candidato: `financiamento-${ano}`,
          tables_updated: [],
          rows_upserted: 0,
          errors: [message],
          duration_ms: 0,
          coleta_resultado: "erro",
          coleta_detalhe: message,
        })
      }
    } else {
        const message = anyReceitasZip
          ? `Receitas ${ano}: pacote incompleto ou sem cobertura esperada (${successfulReceitasZips}/${receitasUrls.length})`
          : `Receitas ${ano}: nenhum ZIP de receitas baixado (URLs: ${receitasUrls.length})`
        warn("tse", `  ${message}`)
        await planFinanciamentoYearError(
          ano,
          sqMap,
          options.financiamentoSlugAllowlist ?? null,
          options,
          receitasUrls[receitasUrls.length - 1] ?? "https://dadosabertos.tse.jus.br/group/prestacao-de-contas-eleitorais",
          message,
        )
        allResults.push({
        source: "tse",
        candidato: `financiamento-${ano}`,
        tables_updated: [],
        rows_upserted: 0,
        errors: [message],
        duration_ms: 0,
        coleta_resultado: "erro",
        coleta_detalhe: message,
      })
    }
    cleanupDir(receitasDir)

    logResolverStats(ano, resolver)
    await sleep(1000)
  }

  // Final cleanup: remove tse dir if empty
  try {
    const remaining = readdirSync(DATA_DIR).filter((f: string) => f !== ".DS_Store")
    if (remaining.length === 0) {
      cleanupDir(DATA_DIR)
    }
  } catch {
    // ignore
  }

  return allResults
}

function parseIngestTseCli(): { anos: number[]; options: IngestTseOptions } {
  const argv = process.argv.slice(2)
  const anos: number[] = []
  let skipPatrimonio = false
  let patrimonioSlugs: string[] | null = null
  let financiamentoSlugs: string[] | null = null
  let dryRun = false
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true
      continue
    }
    if (arg === "--skip-patrimonio") {
      skipPatrimonio = true
      continue
    }
    const slugMatch = /^--financiamento-slugs=(.+)$/.exec(arg)
    if (slugMatch) {
      financiamentoSlugs = slugMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      continue
    }
    const patrimonioSlugMatch = /^--patrimonio-slugs=(.+)$/.exec(arg)
    if (patrimonioSlugMatch) {
      patrimonioSlugs = patrimonioSlugMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      continue
    }
    const n = Number(arg)
    if (Number.isInteger(n) && n > 1900 && n < 2100) anos.push(n)
  }
  if (process.env.PF_TSE_INGEST_SKIP_PATRIMONIO === "1") skipPatrimonio = true
  if (process.env.PF_TSE_INGEST_DRY_RUN === "1") dryRun = true
  const envSlugs = process.env.PF_TSE_FINANCIAMENTO_SLUGS?.trim()
  const financiamentoAllow =
    financiamentoSlugs != null && financiamentoSlugs.length > 0
      ? new Set(financiamentoSlugs)
      : envSlugs
        ? new Set(
            envSlugs
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        )
        : null
  const envPatrimonioSlugs = process.env.PF_TSE_PATRIMONIO_SLUGS?.trim()
  const patrimonioAllow =
    patrimonioSlugs != null && patrimonioSlugs.length > 0
      ? new Set(patrimonioSlugs)
      : envPatrimonioSlugs
        ? new Set(
            envPatrimonioSlugs
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        : null
  return {
    anos: anos.length > 0 ? anos : [...DEFAULT_TSE_ANOS],
    options: {
      skipPatrimonio,
      patrimonioSlugAllowlist: patrimonioAllow,
      financiamentoSlugAllowlist: financiamentoAllow,
      dryRun,
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { anos, options } = parseIngestTseCli()
  const plannedRows: PlannedTseRow[] = []
  if (options.dryRun) options.onPlannedRow = (entry) => plannedRows.push(entry)
  ingestTSE(anos, options).then((results) => {
    console.log(JSON.stringify(options.dryRun ? { dryRun: true, results, plannedRows } : results, null, 2))
  })
}
