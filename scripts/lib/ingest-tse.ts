import { mkdirSync, readdirSync, rmSync, type Dirent } from "fs"
import { resolve, sep } from "path"
import { execFileSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { parseCSV, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"
import {
  createTSEResolver,
  getResolveMethodPriority,
  shouldSkipWeakMatch,
  type ResolveMethod,
  type TSEResolver,
} from "./tse-resolver"
import { carregarBloqueios } from "./identidade-bloqueada"
import { extractOptionalDonorIdsFromTseRow } from "../../src/lib/financiamento-doador-identifiers"
import {
  normalizeDoadorTipoWithIdentifiers,
  normalizeMaioresDoadoresForStorage,
  sanitizeMaioresDoadoresForPublic,
} from "../../src/lib/financiamento-public"
import { maskDocumentLikeSequences } from "../../src/lib/public-profile-dto"
import { sanitizePublicTextOrThrow } from "../../src/lib/public-text"
import { dedupeTsePatrimonioRows } from "../../src/lib/tse-patrimonio-dedupe"
import { financiamentoReceitasZipUrls } from "./tse-financiamento-receitas-urls"
import {
  financiamentoReceitaIdentity,
  financiamentoReceitaIdentityKey,
  historicalCandidateRowMatches,
  normalizeFinanciamentoReceitaRow,
  resolveLegacyReceiptSqIdentity,
} from "./financiamento-receita-legacy-row"
import { downloadToFile } from "./download-to-file"

const DATA_DIR = resolve(process.cwd(), "data/tse")
export const DEFAULT_TSE_ANOS = [
  2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024,
]
const KEEP_TSE_DOWNLOADS = process.env.PF_KEEP_TSE_DOWNLOADS === "1"

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
  if (years.some((year) => !Number.isInteger(year) || !DEFAULT_TSE_ANOS.includes(year))) {
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

function getGovernorUFs(candidatos: CandidatoConfig[], slugAllowlist?: Set<string> | null): string[] {
  return [
    ...new Set(
      candidatos
        .filter(
          (candidato) =>
            candidato.cargo_disputado === "Governador" &&
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

async function downloadFile(url: string, dest: string): Promise<boolean> {
  return downloadToFile(url, dest, {
    onCacheHit: (path) => log("tse", `  Cache hit: ${path}`),
    onStart: (source) => log("tse", `  Baixando: ${source}`),
    onHttpError: (status, source) => warn("tse", `  HTTP ${status} para ${source}`),
    onError: (err) => warn("tse", `  Falha no download: ${err}`),
  })
}

function extractZip(zipPath: string, extractDir: string, extraPatterns?: string[]) {
  mkdirSync(extractDir, { recursive: true })
  // Extract BR/BRASIL files (national-level candidates) + any extra patterns (e.g. UF files for governors)
  const patterns = ["*_BR*", "*_BRASIL*", ...(extraPatterns || []).map((p) => `*_${p}*`)]
  try {
    execFileSync("unzip", ["-C", "-o", zipPath, ...patterns, "-d", extractDir], { stdio: "pipe" })
  } catch {
    // `unzip` exits non-zero when one optional glob has no match even if the
    // requested BR/UF files were extracted. Preserve that bounded extraction.
    if (readdirSync(extractDir).length > 0) return
    // Fallback: extract everything if pattern match fails (some ZIPs have different naming)
    execFileSync("unzip", ["-C", "-o", zipPath, "-d", extractDir], { stdio: "pipe" })
  }
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
    { candidato: CandidatoConfig; sq: string; method: ResolveMethod; priority: number; uf?: string }
  >()
  const callerAmbiguousPriority = new Map<string, number>()

  const bloqueios = carregarBloqueios()

  for (const candidato of candidatos) {
    const sq = candidato.ids.tse_sq_candidato?.[String(ano)]?.trim()
    if (!sq) continue
    const configuredUf = candidato.ids.tse_uf_candidatura?.[String(ano)]?.trim().toUpperCase()
    // Este laco le o seed DIRETO, sem passar por `resolver.resolveRow`, entao o
    // filtro de identidade bloqueada do resolver nao o alcanca. Sem esta linha,
    // patrimonio e financiamento continuariam sendo colhidos pelo SQ que a
    // curadoria ja rejeitou, ainda que o historico parasse (issue #130).
    if (bloqueios.bloqueio({ slug: candidato.slug, sq, ano })) continue
    selectedBySlug.set(candidato.slug, {
      candidato,
      sq,
      method: "sq-preloaded",
      priority: getResolveMethodPriority("sq-preloaded"),
      uf: configuredUf || undefined,
    })
  }

  for (const csvPath of allPaths) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim()
      if (!sq) return
      const uf = candidateUfFromTseRow(row)

      const match = resolver.resolveRow(row)
      if (!match) return
      if (shouldSkipWeakMatch(match.method)) return

      const candidato = candidatosBySlug.get(match.slug)
      if (!candidato) return
      const configuredUf = candidato.ids.tse_uf_candidatura?.[String(ano)]?.trim().toUpperCase()
      if (
        ano < 2010 &&
        match.method === "sq-preloaded" &&
        !historicalCandidateRowMatches(row, candidato)
      ) {
        return
      }
      if (configuredUf && configuredUf !== uf) return

      const priority = getResolveMethodPriority(match.method)
      const existing = selectedBySlug.get(match.slug)
      if (!existing) {
        selectedBySlug.set(match.slug, { candidato, sq, method: match.method, priority, uf })
        return
      }

      if (priority > existing.priority) {
        selectedBySlug.set(match.slug, { candidato, sq, method: match.method, priority, uf })
        callerAmbiguousPriority.delete(match.slug)
        return
      }

      if (existing.sq === sq) {
        if (!existing.uf && uf) existing.uf = uf
        return
      }

      if (priority < existing.priority) {
        return
      }

      callerAmbiguousPriority.set(match.slug, priority)
    })
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
  candidatos: CandidatoConfig[],
  extractDir: string,
  sqMap: Map<string, SqCandidateIdentity>,
  slugAllowlist: Set<string> | null,
  options: Pick<IngestTseOptions, "dryRun" | "onPlannedRow">
): Promise<IngestResult[]> {
  const brPaths = findCSVs(extractDir, "_BR").concat(findCSVs(extractDir, "_BRASIL"))
  const governorUFs = getGovernorUFs(candidatos)
  const ufPaths = governorUFs.flatMap((uf) => findCSVs(extractDir, `_${uf}`))
  const allSourcePaths = [...brPaths, ...ufPaths]
  const csvPaths = allSourcePaths.length > 0
    ? allSourcePaths
    : findCSVs(extractDir, `bem_candidato_${ano}`).concat(findCSVs(extractDir, "bem_candidato"))
  const uniquePaths = csvPaths.filter((v, i, a) => a.indexOf(v) === i)

  if (uniquePaths.length === 0) {
    warn("tse", `  CSV de bens nao encontrado para ${ano}`)
    return []
  }

  const parsedRows: Array<{
    slug: string
    sourceKey: string
    ordem: string
    tipo: string
    descricao: string
    valor: number
  }> = []

  log("tse", `  Parseando patrimonio ${ano}: ${uniquePaths.length} arquivos CSV (BR${governorUFs.length > 0 ? " + " + governorUFs.length + " UFs" : ""})`)
  for (const csvPath of uniquePaths) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim()
      const uf = candidateUfFromTseRow(row)
      const cand = uf
        ? sqMap.get(financiamentoReceitaIdentityKey({ sqCandidato: sq, ano, uf }))?.candidato
        : undefined
      if (!cand) return
      if (slugAllowlist && !slugAllowlist.has(cand.slug)) return

      const valor = parseBRL(
        row.VR_BEM_CANDIDATO || "0",
        `patrimonio ${ano} ${cand.slug}`
      )

      parsedRows.push({
        slug: cand.slug,
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

  const aggregated = new Map<string, { bens: { tipo: string; descricao: string; valor: number }[]; total: number }>()
  for (const item of dedupedRows) {
    const existing = aggregated.get(item.slug) ?? { bens: [], total: 0 }
    existing.bens.push({
      tipo: item.tipo,
      descricao: item.descricao,
      valor: item.valor,
    })
    existing.total += item.valor
    aggregated.set(item.slug, existing)
  }

  const results: IngestResult[] = []
  for (const [slug, data] of aggregated) {
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue

    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      valor_total: Math.round(data.total * 100) / 100,
      bens: data.bens,
      fonte: "TSE",
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
      const { data: existing } = await supabase
        .from("patrimonio")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", ano)
        .single()

      if (existing) {
        await supabase.from("patrimonio").update(row).eq("id", existing.id)
      } else {
        await supabase.from("patrimonio").insert(row)
      }
    }

    log("tse", `  ${slug}: patrimonio ${ano} — R$ ${Math.round(data.total).toLocaleString()} (${data.bens.length} bens)`)
    results.push({
      source: "tse",
      candidato: slug,
      tables_updated: ["patrimonio"],
      rows_upserted: options.dryRun ? 0 : 1,
      errors: [],
      duration_ms: 0,
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
  options: Pick<IngestTseOptions, "dryRun" | "onPlannedRow">,
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
  const uniquePaths = csvPaths.filter((v, i, a) => a.indexOf(v) === i)

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
    total: number
    fundo_partidario: number
    fundo_eleitoral: number
    pessoa_fisica: number
    recursos_proprios: number
    doadores: { nome: string; valor: number; tipo: string; cnpj?: string; cpf_hash?: string }[]
  }

  const aggregated = new Map<string, FinData>()
  // Dedup: mesma receita pode aparecer em CSV _BR e _UF; SQ_RECEITA e unico por linha TSE.
  const seenReceipts = new Set<string>()
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
      if (!row.SG_UF_CANDIDATURA && ufFromPath) row.SG_UF_CANDIDATURA = ufFromPath
      if (!row.SQ_CANDIDATO?.trim()) {
        const legacyTargets = legacyIdentityTargetsByUf.get(
          row.SG_UF_CANDIDATURA?.trim().toUpperCase() ?? "",
        ) ?? []
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

      const sqReceita = (row.SQ_RECEITA || "").trim()
      if (sqReceita) {
        const dedupKey = `${ano}:${identidadeDaLinha.uf}:${sq}:${sqReceita}`
        if (seenReceipts.has(dedupKey)) return
        seenReceipts.add(dedupKey)
      }

      const existing = aggregated.get(candidato.slug) ?? {
        sqCandidato: identidade.sqCandidato,
        uf: identidade.uf ?? null,
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
      const origem = (row.DS_ORIGEM_RECEITA || "").toUpperCase()

      existing.total += valor

      if (origem.includes("FUNDO PARTID")) existing.fundo_partidario += valor
      else if (origem.includes("FUNDO ESPECIAL") || origem.includes("FEFC")) existing.fundo_eleitoral += valor
      else if (origem.includes("PESSOA F")) existing.pessoa_fisica += valor
      else if (origem.includes("RECURSO") && origem.includes("PROPRIO")) existing.recursos_proprios += valor

      const nomeDoador = row.NM_DOADOR || row.NM_DOADOR_RFB || ""
      const tipoDoadorInicial: FinData["doadores"][number]["tipo"] = origem.includes("PESSOA F")
        ? "PF"
        : origem.includes("FUNDO PARTID")
          ? "fundo_partidario"
          : origem.includes("FUNDO ESPECIAL") || origem.includes("FEFC")
            ? "fundo_eleitoral"
            : origem.includes("PROPRIO")
              ? "recursos_proprios"
              : "PJ"

      let donorIds: { cnpj?: string; cpf_hash?: string }
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
      if (donorIds.cpf_hash) doador.cpf_hash = donorIds.cpf_hash

      existing.doadores.push(doador)

      aggregated.set(candidato.slug, existing)
    })
  }

  const results: IngestResult[] = []
  for (const [slug, data] of aggregated) {
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
      total_arrecadado: Math.round(data.total * 100) / 100,
      total_fundo_partidario: Math.round(data.fundo_partidario * 100) / 100,
      total_fundo_eleitoral: Math.round(data.fundo_eleitoral * 100) / 100,
      total_pessoa_fisica: Math.round(data.pessoa_fisica * 100) / 100,
      total_recursos_proprios: Math.round(data.recursos_proprios * 100) / 100,
      maiores_doadores: maioresDoadores,
      fonte: "TSE",
    }

    if (options.dryRun) {
      options.onPlannedRow?.({
        table: "financiamento",
        slug,
        row: {
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
      if (staleVerificationError) throw staleVerificationError

      const { data: existing, error: lookupError } = await supabase
        .from("financiamento")
        .select("id")
        .eq("candidato_id", candidatoId)
        .eq("ano_eleicao", ano)
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

  const identitiesBySlug = new Map<string, SqCandidateIdentity>()
  for (const identity of sqMap.values()) identitiesBySlug.set(identity.candidato.slug, identity)
  for (const [slug, identity] of identitiesBySlug) {
    if (aggregated.has(slug)) continue
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
        .maybeSingle()
      if (existingFinanceError) throw existingFinanceError
      if (existingFinance) continue

      const { error: verificationError } = await supabase
        .from("financiamento_verificacoes")
        .upsert(row, { onConflict: "candidato_id,ano_eleicao" })
      if (verificationError) throw verificationError
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
  const identitiesBySlug = new Map<string, SqCandidateIdentity>()
  for (const identity of sqMap.values()) identitiesBySlug.set(identity.candidato.slug, identity)
  for (const [slug, identity] of identitiesBySlug) {
    if (slugAllowlist && !slugAllowlist.has(slug)) continue
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue
    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      sq_candidato: identity.sqCandidato,
      uf_candidatura: identity.uf ?? null,
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
        .maybeSingle()
      if (existingFinanceError) throw existingFinanceError
      if (existingFinance) continue

      const { error: verificationError } = await supabase
        .from("financiamento_verificacoes")
        .upsert(row, { onConflict: "candidato_id,ano_eleicao" })
      if (verificationError) throw verificationError
    }
  }
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
    if (slugAllowlist ? !slugAllowlist.has(candidato.slug) : !configuredSq) continue
    const candidatoId = await resolveCandidatoId(candidato.slug)
    if (!candidatoId) continue
    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      sq_candidato: configuredSq,
      uf_candidatura:
        candidato.ids.tse_uf_candidatura?.[String(ano)]?.trim().toUpperCase() || null,
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
      .maybeSingle()
    if (existingFinanceError) throw existingFinanceError
    if (existingFinance) continue
    const { error: verificationError } = await supabase
      .from("financiamento_verificacoes")
      .upsert(row, { onConflict: "candidato_id,ano_eleicao" })
    if (verificationError) throw verificationError
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
  table: "patrimonio" | "financiamento" | "financiamento_verificacoes"
  slug: string
  row: Record<string, unknown>
}

export type IngestTseOptions = {
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
}

export async function ingestTSE(
  anos: number[] = [...DEFAULT_TSE_ANOS],
  options: IngestTseOptions = {}
): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
  const allResults: IngestResult[] = []

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
    const resolver = await createTSEResolver(candidatos, ano)

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
    await planFinanciamentoCandidatesYearError(
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
    if (!options.skipPatrimonio) {
      const bensOk = await downloadFile(bensUrl, bensZip)
      if (bensOk) {
        try {
          extractZip(bensZip, bensDir, governorUFs)
          const patrimonioResults = await processPatrimonio(
            ano,
            candidatos,
            bensDir,
            sqMap,
            options.patrimonioSlugAllowlist ?? null,
            options
          )
          allResults.push(...patrimonioResults)
        } catch (err) {
          error("tse", `  Erro patrimonio ${ano}: ${err}`)
        }
        cleanupDir(bensDir)
        cleanupDownloadedZip(bensZip)
      }
    } else {
      log("tse", `  Patrimonio ${ano}: ignorado (skipPatrimonio)`)
    }

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
