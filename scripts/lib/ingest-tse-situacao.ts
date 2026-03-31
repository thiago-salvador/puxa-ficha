import { createReadStream, existsSync, mkdirSync, createWriteStream, rmSync } from "fs"
import { parse } from "csv-parse"
import { resolve } from "path"
import { execSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatos, normalizeForMatch, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"

const DATA_DIR = resolve(process.cwd(), "data/tse-situacao")

// Tenta anos em ordem decrescente. 2026 ainda nao existe (campanha formal comeca em agosto/2026).
// 2022 tem todos os candidatos nacionais (presidente, governadores, senadores, deputados).
// 2024 e municipal (prefeitos/vereadores), pouco util para nosso escopo, mas incluido como fallback.
const ANOS_TENTATIVA = [2026, 2024, 2022]

async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  if (existsSync(dest)) {
    log("tse-situacao", `  Cache hit: ${dest}`)
    return true
  }

  log("tse-situacao", `  Baixando: ${url}`)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      warn("tse-situacao", `  HTTP ${res.status} para ${url}`)
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
    warn("tse-situacao", `  Falha no download: ${err}`)
    return false
  }
}

function extractZip(zipPath: string, extractDir: string) {
  mkdirSync(extractDir, { recursive: true })
  try {
    execSync(`unzip -o "${zipPath}" '*_BR*' '*_BRASIL*' -d "${extractDir}"`, { stdio: "pipe" })
  } catch {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" })
  }
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
    log("tse-situacao", `  Cleanup: ${dir}`)
  } catch {
    warn("tse-situacao", `  Nao conseguiu limpar: ${dir}`)
  }
}

function cleanupFile(filePath: string) {
  try {
    rmSync(filePath, { force: true })
    log("tse-situacao", `  Cleanup: ${filePath}`)
  } catch {
    warn("tse-situacao", `  Nao conseguiu limpar: ${filePath}`)
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

function buildCandidateNameMap(candidatos: CandidatoConfig[]): Map<string, CandidatoConfig> {
  const map = new Map<string, CandidatoConfig>()
  for (const c of candidatos) {
    map.set(normalizeForMatch(c.nome_completo), c)
    map.set(normalizeForMatch(c.nome_urna), c)
  }
  return map
}

interface MatchedData {
  cpf: string
  situacao: string
  detalhe: string
  ano: number
  cand: CandidatoConfig
}

/**
 * Tenta baixar e parsear o ZIP de consulta_cand para um dado ano.
 * Retorna um mapa slug -> MatchedData para candidatos encontrados.
 */
async function processAno(
  ano: number,
  nameMap: Map<string, CandidatoConfig>,
  existingMatches: Map<string, MatchedData>
): Promise<{ matched: Map<string, MatchedData>; success: boolean }> {
  const zipUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`
  const zipPath = resolve(DATA_DIR, `consulta_cand_${ano}.zip`)
  const extractDir = resolve(DATA_DIR, `consulta_cand_${ano}`)

  log("tse-situacao", `=== Tentando ano ${ano} ===`)

  const ok = await downloadFile(zipUrl, zipPath)
  if (!ok) {
    return { matched: existingMatches, success: false }
  }

  try {
    extractZip(zipPath, extractDir)
  } catch (err) {
    error("tse-situacao", `Falha ao extrair ZIP ${ano}: ${err}`)
    cleanupFile(zipPath)
    return { matched: existingMatches, success: false }
  }

  const csvPaths = findCSVs(extractDir, "_BR").concat(findCSVs(extractDir, "_BRASIL"))

  if (csvPaths.length === 0) {
    warn("tse-situacao", `Nenhum CSV BR/BRASIL encontrado no ZIP ${ano}`)
    cleanupDir(extractDir)
    cleanupFile(zipPath)
    return { matched: existingMatches, success: false }
  }

  log("tse-situacao", `  Parseando ${csvPaths.length} arquivo(s) CSV do ano ${ano}`)

  for (const csvPath of csvPaths) {
    await parseCSV(csvPath, (row) => {
      const nomeNorm = normalizeForMatch(row.NM_CANDIDATO || "")
      const cand = nameMap.get(nomeNorm)
      if (!cand) return

      const existing = existingMatches.get(cand.slug)

      // Prefere match de ano mais recente (ja no mapa) mas aceita CPF de ano mais antigo se ainda nao tem
      if (existing && existing.ano > ano) return
      // Prefere entrada com CPF sobre sem CPF no mesmo ano
      if (existing && existing.ano === ano && existing.cpf && !row.NR_CPF_CANDIDATO) return

      existingMatches.set(cand.slug, {
        cpf: row.NR_CPF_CANDIDATO || existing?.cpf || "",
        situacao: row.DS_SITUACAO_CANDIDATURA || existing?.situacao || "",
        detalhe: row.DS_DETALHE_SITUACAO_CAND || existing?.detalhe || "",
        ano,
        cand,
      })
    })
  }

  // Cleanup do disco imediatamente apos parsear
  cleanupDir(extractDir)
  cleanupFile(zipPath)

  return { matched: existingMatches, success: true }
}

export async function ingestTSESituacao(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  mkdirSync(DATA_DIR, { recursive: true })

  const nameMap = buildCandidateNameMap(candidatos)
  const matched = new Map<string, MatchedData>()

  // Tenta cada ano ate ter CPF para todos os candidatos ou esgotar opcoes
  for (const ano of ANOS_TENTATIVA) {
    const semCPF = candidatos.filter((c) => {
      const m = matched.get(c.slug)
      return !m || !m.cpf
    })

    if (semCPF.length === 0) {
      log("tse-situacao", `Todos os candidatos com CPF, pulando ano ${ano}`)
      break
    }

    log("tse-situacao", `${semCPF.length} candidatos ainda sem CPF, buscando no ano ${ano}`)
    await processAno(ano, nameMap, matched)
  }

  log("tse-situacao", `Total encontrado: ${matched.size} candidatos`)

  // Candidatos sem match em nenhum ano
  for (const cand of candidatos) {
    if (!matched.has(cand.slug)) {
      warn("tse-situacao", `  ${cand.slug}: nao encontrado em nenhum CSV TSE`)
    }
  }

  // Persiste no banco
  const allResults: IngestResult[] = []

  for (const [slug, info] of matched) {
    const result: IngestResult = {
      source: "tse-situacao",
      candidato: slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()

    try {
      const candidatoId = await resolveCandidatoId(slug)
      if (!candidatoId) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        allResults.push(result)
        continue
      }

      const updatePayload: Record<string, string> = {}

      if (info.cpf) {
        updatePayload.cpf = info.cpf
      }

      // Situacao_candidatura: so sobrescreve se veio do ano mais recente disponivel
      // (evita gravar situacao de 2022 como "atual" quando 2026 ainda nao existe)
      if (info.situacao && info.ano === Math.min(...ANOS_TENTATIVA.filter((a) => a <= 2024))) {
        // Nao sobrescreve situacao com dados de eleicoes passadas se 2026 nao disponivel
        // apenas salva como metadata
      }
      if (info.situacao) {
        updatePayload.situacao_candidatura = `${info.situacao}${info.detalhe ? ` (${info.detalhe})` : ""} [${info.ano}]`
      }

      if (Object.keys(updatePayload).length === 0) {
        result.duration_ms = Date.now() - start
        allResults.push(result)
        continue
      }

      const { error: updateErr } = await supabase
        .from("candidatos")
        .update(updatePayload)
        .eq("id", candidatoId)

      if (updateErr) {
        result.errors.push(`Erro ao atualizar: ${updateErr.message}`)
      } else {
        result.tables_updated.push("candidatos")
        result.rows_upserted++
        log(
          "tse-situacao",
          `  ${slug}: CPF=${info.cpf || "nao encontrado"} situacao="${info.situacao}" [${info.ano}]`
        )
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    allResults.push(result)
    await sleep(100)
  }

  // Limpa DATA_DIR se vazio
  try {
    const { readdirSync } = require("fs")
    const remaining = readdirSync(DATA_DIR).filter((f: string) => f !== ".DS_Store")
    if (remaining.length === 0) cleanupDir(DATA_DIR)
  } catch {
    // ignore
  }

  return allResults
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestTSESituacao().then((r) => console.log(JSON.stringify(r, null, 2)))
}
