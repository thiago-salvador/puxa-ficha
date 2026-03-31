import { createReadStream, existsSync, mkdirSync, createWriteStream, rmSync } from "fs"
import { parse } from "csv-parse"
import { resolve } from "path"
import { execSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatos, normalizeForMatch, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"

const DATA_DIR = resolve(process.cwd(), "data/tse")

function parseBRL(value: string): number {
  if (!value || value === "#NULO#" || value === "#NE#" || value === "-1") return 0
  return parseFloat(value.replace(/\./g, "").replace(",", ".")) || 0
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  if (existsSync(dest)) {
    log("tse", `  Cache hit: ${dest}`)
    return true
  }

  log("tse", `  Baixando: ${url}`)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      warn("tse", `  HTTP ${res.status} para ${url}`)
      return false
    }

    const fileStream = createWriteStream(dest)
    const reader = res.body?.getReader()
    if (!reader) return false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
    }
    fileStream.end()

    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve)
      fileStream.on("error", reject)
    })

    return true
  } catch (err) {
    warn("tse", `  Falha no download: ${err}`)
    return false
  }
}

function extractZip(zipPath: string, extractDir: string, extraPatterns?: string[]) {
  mkdirSync(extractDir, { recursive: true })
  // Extract BR/BRASIL files (national-level candidates) + any extra patterns (e.g. UF files for governors)
  const patterns = ["'*_BR*'", "'*_BRASIL*'", ...(extraPatterns || []).map((p) => `'*_${p}*'`)]
  try {
    execSync(`unzip -o "${zipPath}" ${patterns.join(" ")} -d "${extractDir}"`, { stdio: "pipe" })
  } catch {
    // Fallback: extract everything if pattern match fails (some ZIPs have different naming)
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" })
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

function findCSVs(dir: string, pattern: string): string[] {
  const { readdirSync } = require("fs")
  try {
    const files = readdirSync(dir) as string[]
    return files
      .filter((f: string) => f.toLowerCase().includes(pattern.toLowerCase()) && f.endsWith(".csv"))
      .map((f: string) => resolve(dir, f))
  } catch {
    return []
  }
}

async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

function buildCandidateNameMap(candidatos: CandidatoConfig[]): Map<string, CandidatoConfig> {
  const map = new Map<string, CandidatoConfig>()
  for (const c of candidatos) {
    map.set(normalizeForMatch(c.nome_completo), c)
    map.set(normalizeForMatch(c.nome_urna), c)
  }
  return map
}

/**
 * Download and parse consulta_cand to build SQ_CANDIDATO → slug mapping.
 * The bens CSV only has SQ_CANDIDATO (no name), so we need this cross-reference.
 */
async function buildSQMap(
  ano: number,
  candidatos: CandidatoConfig[]
): Promise<Map<string, CandidatoConfig>> {
  const candZip = resolve(DATA_DIR, `consulta_cand_${ano}.zip`)
  const candDir = resolve(DATA_DIR, `consulta_cand_${ano}`)
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`

  const ok = await downloadFile(url, candZip)
  if (!ok) return new Map()

  // Extract BR + UF files for governor candidates
  const governorUFs = [...new Set(candidatos.filter((c) => c.cargo_disputado === "Governador" && c.estado).map((c) => c.estado!.toUpperCase()))]
  extractZip(candZip, candDir, governorUFs)

  const brPaths = findCSVs(candDir, "_BR").concat(findCSVs(candDir, "_BRASIL"))
  // Also include UF-level files so governor SQ_CANDIDATO values are mapped
  const ufPaths = governorUFs.flatMap((uf) => findCSVs(candDir, `_${uf}`))
  const allPaths = [...brPaths, ...ufPaths].filter((v, i, a) => a.indexOf(v) === i)
  if (allPaths.length === 0) return new Map()

  const nameMap = buildCandidateNameMap(candidatos)
  const sqMap = new Map<string, CandidatoConfig>()

  for (const csvPath of allPaths) {
    await parseCSV(csvPath, (row) => {
      const nome = normalizeForMatch(row.NM_CANDIDATO || "")
      const cand = nameMap.get(nome)
      if (!cand) return
      const sq = row.SQ_CANDIDATO || ""
      if (sq) sqMap.set(sq, cand)
    })
  }

  log("tse", `  SQ map ${ano}: ${sqMap.size} candidatos mapeados`)
  return sqMap
}

async function parseCSV(
  filePath: string,
  onRow: (row: Record<string, string>) => Promise<void> | void
): Promise<number> {
  let count = 0
  const parser = createReadStream(filePath, { encoding: "latin1" }).pipe(
    parse({
      delimiter: ";",
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      cast: (value) => value.trim(),
    })
  )

  for await (const row of parser) {
    await onRow(row as Record<string, string>)
    count++
  }

  return count
}

async function processPatrimonio(
  ano: number,
  candidatos: CandidatoConfig[],
  extractDir: string,
  sqMap: Map<string, CandidatoConfig>
): Promise<IngestResult[]> {
  // Presidential candidates are in BR/BRASIL files; governor candidates need UF-level files too
  const brPaths = findCSVs(extractDir, "_BR").concat(findCSVs(extractDir, "_BRASIL"))
  const governorUFs = [...new Set(candidatos.filter((c) => c.cargo_disputado === "Governador" && c.estado).map((c) => c.estado!.toUpperCase()))]
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

  const aggregated = new Map<string, { bens: { tipo: string; descricao: string; valor: number }[]; total: number }>()

  log("tse", `  Parseando patrimonio ${ano}: ${uniquePaths.length} arquivos CSV (BR${governorUFs.length > 0 ? " + " + governorUFs.length + " UFs" : ""})`)
  for (const csvPath of uniquePaths) {
  await parseCSV(csvPath, (row) => {
    // bens CSV has SQ_CANDIDATO but no NM_CANDIDATO
    const sq = row.SQ_CANDIDATO || ""
    const cand = sqMap.get(sq)
    if (!cand) return

    const existing = aggregated.get(cand.slug) ?? { bens: [], total: 0 }
    const valor = parseBRL(row.VR_BEM_CANDIDATO || "0")
    existing.bens.push({
      tipo: row.DS_TIPO_BEM_CANDIDATO || "",
      descricao: row.DS_BEM_CANDIDATO || "",
      valor,
    })
    existing.total += valor
    aggregated.set(cand.slug, existing)
  })
  }

  const results: IngestResult[] = []
  for (const [slug, data] of aggregated) {
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue

    const { data: existing } = await supabase
      .from("patrimonio")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano_eleicao", ano)
      .single()

    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      valor_total: Math.round(data.total * 100) / 100,
      bens: data.bens,
      fonte: "TSE",
    }

    if (existing) {
      await supabase.from("patrimonio").update(row).eq("id", existing.id)
    } else {
      await supabase.from("patrimonio").insert(row)
    }

    log("tse", `  ${slug}: patrimonio ${ano} — R$ ${Math.round(data.total).toLocaleString()} (${data.bens.length} bens)`)
    results.push({
      source: "tse",
      candidato: slug,
      tables_updated: ["patrimonio"],
      rows_upserted: 1,
      errors: [],
      duration_ms: 0,
    })
  }

  return results
}

async function processFinanciamento(
  ano: number,
  candidatos: CandidatoConfig[],
  extractDir: string
): Promise<IngestResult[]> {
  // Presidential candidates in BR files; governor candidates need UF-level files too
  const brPaths = findCSVs(extractDir, "_BR").concat(findCSVs(extractDir, "_BRASIL"))
  const governorUFs = [...new Set(candidatos.filter((c) => c.cargo_disputado === "Governador" && c.estado).map((c) => c.estado!.toUpperCase()))]
  const ufPaths = governorUFs.flatMap((uf) => findCSVs(extractDir, `_${uf}`))
  const allSourcePaths = [...brPaths, ...ufPaths]
  const csvPaths = allSourcePaths.length > 0
    ? allSourcePaths
    : findCSVs(extractDir, `receitas_candidatos_${ano}`)
        .concat(findCSVs(extractDir, "receitas_candidatos"))
        .concat(findCSVs(extractDir, "receita_candidato"))
  const uniquePaths = csvPaths.filter((v, i, a) => a.indexOf(v) === i)

  if (uniquePaths.length === 0) {
    warn("tse", `  CSV de receitas nao encontrado para ${ano}`)
    return []
  }

  const nameMap = buildCandidateNameMap(candidatos)

  interface FinData {
    total: number
    fundo_partidario: number
    fundo_eleitoral: number
    pessoa_fisica: number
    recursos_proprios: number
    doadores: { nome: string; valor: number; tipo: string }[]
  }

  const aggregated = new Map<string, FinData>()

  log("tse", `  Parseando financiamento ${ano}: ${uniquePaths.length} arquivos CSV (BR${governorUFs.length > 0 ? " + " + governorUFs.length + " UFs" : ""})`)
  for (const csvPath of uniquePaths) {
  await parseCSV(csvPath, (row) => {
    const nome = normalizeForMatch(row.NM_CANDIDATO || "")
    const cand = nameMap.get(nome)
    if (!cand) return

    const existing = aggregated.get(cand.slug) ?? {
      total: 0,
      fundo_partidario: 0,
      fundo_eleitoral: 0,
      pessoa_fisica: 0,
      recursos_proprios: 0,
      doadores: [],
    }

    const valor = parseBRL(row.VR_RECEITA || "0")
    const origem = (row.DS_ORIGEM_RECEITA || "").toUpperCase()

    existing.total += valor

    if (origem.includes("FUNDO PARTID")) existing.fundo_partidario += valor
    else if (origem.includes("FUNDO ESPECIAL") || origem.includes("FEFC")) existing.fundo_eleitoral += valor
    else if (origem.includes("PESSOA F")) existing.pessoa_fisica += valor
    else if (origem.includes("RECURSO") && origem.includes("PROPRIO")) existing.recursos_proprios += valor

    existing.doadores.push({
      nome: row.NM_DOADOR || row.NM_DOADOR_RFB || "",
      valor,
      tipo: origem.includes("PESSOA F")
        ? "PF"
        : origem.includes("FUNDO PARTID")
          ? "fundo_partidario"
          : origem.includes("FUNDO ESPECIAL") || origem.includes("FEFC")
            ? "fundo_eleitoral"
            : origem.includes("PROPRIO")
              ? "recursos_proprios"
              : "PJ",
    })

    aggregated.set(cand.slug, existing)
  })
  }

  const results: IngestResult[] = []
  for (const [slug, data] of aggregated) {
    const candidatoId = await resolveCandidatoId(slug)
    if (!candidatoId) continue

    const maioresDoadores = data.doadores
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)
      .map((d) => ({ nome: d.nome, valor: Math.round(d.valor * 100) / 100, tipo: d.tipo }))

    const { data: existing } = await supabase
      .from("financiamento")
      .select("id")
      .eq("candidato_id", candidatoId)
      .eq("ano_eleicao", ano)
      .single()

    const row = {
      candidato_id: candidatoId,
      ano_eleicao: ano,
      total_arrecadado: Math.round(data.total * 100) / 100,
      total_fundo_partidario: Math.round(data.fundo_partidario * 100) / 100,
      total_fundo_eleitoral: Math.round(data.fundo_eleitoral * 100) / 100,
      total_pessoa_fisica: Math.round(data.pessoa_fisica * 100) / 100,
      total_recursos_proprios: Math.round(data.recursos_proprios * 100) / 100,
      maiores_doadores: maioresDoadores,
      fonte: "TSE",
    }

    if (existing) {
      await supabase.from("financiamento").update(row).eq("id", existing.id)
    } else {
      await supabase.from("financiamento").insert(row)
    }

    log("tse", `  ${slug}: financiamento ${ano} — R$ ${Math.round(data.total).toLocaleString()} (${data.doadores.length} receitas)`)
    results.push({
      source: "tse",
      candidato: slug,
      tables_updated: ["financiamento"],
      rows_upserted: 1,
      errors: [],
      duration_ms: 0,
    })
  }

  return results
}

export async function ingestTSE(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const allResults: IngestResult[] = []
  const anos = [2018, 2022]

  mkdirSync(DATA_DIR, { recursive: true })

  for (const ano of anos) {
    log("tse", `=== Processando eleicao ${ano} ===`)

    const bensZip = resolve(DATA_DIR, `bem_candidato_${ano}.zip`)
    const bensDir = resolve(DATA_DIR, `bem_${ano}`)
    const receitasZip = resolve(DATA_DIR, `receitas_candidatos_${ano}.zip`)
    const receitasDir = resolve(DATA_DIR, `receitas_${ano}`)

    // Governor UF patterns: extract state-level files alongside BR files
    const governorUFs = [...new Set(candidatos.filter((c) => c.cargo_disputado === "Governador" && c.estado).map((c) => c.estado!.toUpperCase()))]

    // Build SQ_CANDIDATO -> slug mapping from consulta_cand
    const sqMap = await buildSQMap(ano, candidatos)
    // Cleanup consulta_cand immediately (only needed for SQ mapping)
    cleanupDir(resolve(DATA_DIR, `consulta_cand_${ano}`))
    cleanupFile(resolve(DATA_DIR, `consulta_cand_${ano}.zip`))

    // Download bens
    const bensUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`
    const bensOk = await downloadFile(bensUrl, bensZip)
    if (bensOk) {
      try {
        extractZip(bensZip, bensDir, governorUFs)
        const patrimonioResults = await processPatrimonio(ano, candidatos, bensDir, sqMap)
        allResults.push(...patrimonioResults)
      } catch (err) {
        error("tse", `  Erro patrimonio ${ano}: ${err}`)
      }
      // Cleanup bens after processing
      cleanupDir(bensDir)
      cleanupFile(bensZip)
    }

    await sleep(1000)

    // Download receitas
    const receitasUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${ano}.zip`
    const receitasOk = await downloadFile(receitasUrl, receitasZip)
    if (receitasOk) {
      try {
        extractZip(receitasZip, receitasDir, governorUFs)
        const finResults = await processFinanciamento(ano, candidatos, receitasDir)
        allResults.push(...finResults)
      } catch (err) {
        error("tse", `  Erro financiamento ${ano}: ${err}`)
      }
      // Cleanup receitas after processing
      cleanupDir(receitasDir)
      cleanupFile(receitasZip)
    }

    await sleep(1000)
  }

  // Final cleanup: remove tse dir if empty
  try {
    const { readdirSync } = require("fs")
    const remaining = readdirSync(DATA_DIR).filter((f: string) => f !== ".DS_Store")
    if (remaining.length === 0) {
      cleanupDir(DATA_DIR)
    }
  } catch {
    // ignore
  }

  return allResults
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTSE().then((results) => {
    console.log(JSON.stringify(results, null, 2))
  })
}
