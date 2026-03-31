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
const ANOS_TENTATIVA = [2026, 2024, 2022, 2020]

const JUNK_EMAIL_VALUES = new Set([
  "NAO DIVULGAVEL",
  "NÃO DIVULGÁVEL",
  "NAO DIVULGAVEL",
  "#NULO#",
  "#NE#",
  "",
])

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
  // Extract ALL files (including state CSVs for governors)
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" })
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

function findAllCSVs(dir: string): string[] {
  const { readdirSync } = require("fs")
  try {
    const files = readdirSync(dir) as string[]
    return files
      .filter((f: string) => f.endsWith(".csv") && f.startsWith("consulta_cand_"))
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

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD. Returns empty string if invalid.
 */
function convertDateBR(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return ""
  const parts = dateStr.split("/")
  if (parts.length !== 3) return ""
  const [dd, mm, yyyy] = parts
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return ""
  // Basic sanity check
  const numDay = parseInt(dd, 10)
  const numMonth = parseInt(mm, 10)
  const numYear = parseInt(yyyy, 10)
  if (isNaN(numDay) || isNaN(numMonth) || isNaN(numYear)) return ""
  if (numMonth < 1 || numMonth > 12 || numDay < 1 || numDay > 31) return ""
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
}

function cleanEmail(raw: string): string {
  if (!raw) return ""
  const upper = raw.toUpperCase().trim()
  if (JUNK_EMAIL_VALUES.has(upper)) return ""
  return raw.trim()
}

interface MatchedData {
  cpf: string
  situacao: string
  detalhe: string
  ano: number
  cand: CandidatoConfig
  uf_nascimento: string
  data_nascimento: string
  genero: string
  grau_instrucao: string
  estado_civil: string
  cor_raca: string
  ocupacao: string
  email: string
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

  const csvPaths = findAllCSVs(extractDir)

  if (csvPaths.length === 0) {
    warn("tse-situacao", `Nenhum CSV encontrado no ZIP ${ano}`)
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

      // Safety filter: check cargo compatibility to reduce homonym collisions
      const dsCargo = (row.DS_CARGO || "").toUpperCase()
      if (dsCargo && cand.cargo_disputado) {
        const cargoMap: Record<string, string[]> = {
          "Presidente": ["PRESIDENTE"],
          "Governador": ["GOVERNADOR"],
        }
        const validTseCargos = cargoMap[cand.cargo_disputado]
        if (validTseCargos && !validTseCargos.some((c) => dsCargo.includes(c))) {
          warn("tse-situacao", `  ${cand.slug}: match ignorado (cargo TSE="${dsCargo}" vs esperado="${cand.cargo_disputado}")`)
          return
        }
      }

      // Safety filter: check UF compatibility
      const sgUf = (row.SG_UF || "").toUpperCase()
      if (sgUf && cand.estado) {
        if (sgUf !== cand.estado.toUpperCase()) {
          warn("tse-situacao", `  ${cand.slug}: match ignorado (UF TSE="${sgUf}" vs esperado="${cand.estado}")`)
          return
        }
      }

      const existing = existingMatches.get(cand.slug)

      // Prefere match de ano mais recente (ja no mapa) mas aceita dados de ano mais antigo se ainda nao tem
      if (existing && existing.ano > ano) return
      // Prefere entrada com CPF sobre sem CPF no mesmo ano
      if (existing && existing.ano === ano && existing.cpf && !row.NR_CPF_CANDIDATO) return

      existingMatches.set(cand.slug, {
        cpf: row.NR_CPF_CANDIDATO || existing?.cpf || "",
        situacao: row.DS_SITUACAO_CANDIDATURA || existing?.situacao || "",
        detalhe: row.DS_DETALHE_SITUACAO_CAND || existing?.detalhe || "",
        ano,
        cand,
        uf_nascimento: row.SG_UF_NASCIMENTO || existing?.uf_nascimento || "",
        data_nascimento: convertDateBR(row.DT_NASCIMENTO || "") || existing?.data_nascimento || "",
        genero: row.DS_GENERO || existing?.genero || "",
        grau_instrucao: row.DS_GRAU_INSTRUCAO || existing?.grau_instrucao || "",
        estado_civil: row.DS_ESTADO_CIVIL || existing?.estado_civil || "",
        cor_raca: row.DS_COR_RACA || existing?.cor_raca || "",
        ocupacao: row.DS_OCUPACAO || existing?.ocupacao || "",
        email: cleanEmail(row.DS_EMAIL || "") || existing?.email || "",
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

      // Fetch current DB values to avoid overwriting manually curated data
      const { data: dbCand } = await supabase
        .from("candidatos")
        .select("naturalidade, data_nascimento, formacao, profissao_declarada, genero, estado_civil, cor_raca, email_campanha")
        .eq("id", candidatoId)
        .single()

      const updatePayload: Record<string, string> = {}

      if (info.cpf) {
        updatePayload.cpf = info.cpf
      }

      // Situacao_candidatura: always save with year annotation
      if (info.situacao) {
        updatePayload.situacao_candidatura = `${info.situacao}${info.detalhe ? ` (${info.detalhe})` : ""} [${info.ano}]`
      }

      // Only fill if DB field is null (never overwrite curated data)
      if (!dbCand?.naturalidade && info.uf_nascimento) {
        updatePayload.naturalidade = info.uf_nascimento
      }
      if (!dbCand?.data_nascimento && info.data_nascimento) {
        updatePayload.data_nascimento = info.data_nascimento
      }
      if (!dbCand?.genero && info.genero) {
        updatePayload.genero = info.genero
      }
      if (!dbCand?.formacao && info.grau_instrucao) {
        updatePayload.formacao = info.grau_instrucao
      }
      if (!dbCand?.estado_civil && info.estado_civil) {
        updatePayload.estado_civil = info.estado_civil
      }
      if (!dbCand?.cor_raca && info.cor_raca) {
        updatePayload.cor_raca = info.cor_raca
      }
      if (!dbCand?.profissao_declarada && info.ocupacao) {
        updatePayload.profissao_declarada = info.ocupacao
      }
      if (!dbCand?.email_campanha && info.email) {
        updatePayload.email_campanha = info.email
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
        const fields = Object.keys(updatePayload).join(", ")
        log(
          "tse-situacao",
          `  ${slug}: atualizado [${fields}] do ano ${info.ano}`
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
