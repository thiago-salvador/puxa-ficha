import { createReadStream, existsSync, mkdirSync, createWriteStream, rmSync } from "fs"
import { parse } from "csv-parse"
import { resolve } from "path"
import { execSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatos, normalizeForMatch, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"

const DATA_DIR = resolve(process.cwd(), "data/filiacao")
const FILIADOS_URL =
  "https://cdn.tse.jus.br/estatistica/sead/eleitorado/filiados/arquivos/filiados_totais.zip"

function parseDateBR(value: string): string | null {
  if (!value || value.trim() === "" || value === "#NULO#" || value === "#NE#") return null
  // Format: DD/MM/AAAA
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  if (existsSync(dest)) {
    log("filiacao", `  Cache hit: ${dest}`)
    return true
  }

  log("filiacao", `  Baixando: ${url}`)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      warn("filiacao", `  HTTP ${res.status} para ${url}`)
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
    warn("filiacao", `  Falha no download: ${err}`)
    return false
  }
}

function extractZip(zipPath: string, extractDir: string) {
  mkdirSync(extractDir, { recursive: true })
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" })
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
    log("filiacao", `  Cleanup: ${dir}`)
  } catch {
    warn("filiacao", `  Nao conseguiu limpar: ${dir}`)
  }
}

function cleanupFile(filePath: string) {
  try {
    rmSync(filePath, { force: true })
    log("filiacao", `  Cleanup: ${filePath}`)
  } catch {
    warn("filiacao", `  Nao conseguiu limpar: ${filePath}`)
  }
}

function findCSVs(dir: string): string[] {
  const { readdirSync } = require("fs")
  try {
    const files = readdirSync(dir) as string[]
    return files
      .filter((f: string) => f.toLowerCase().endsWith(".csv"))
      .map((f: string) => resolve(dir, f))
  } catch {
    return []
  }
}

async function parseCSV(
  filePath: string,
  onRow: (row: Record<string, string>) => void
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
    onRow(row as Record<string, string>)
    count++
  }

  return count
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

interface FiliacaoEntry {
  partido: string
  situacao: string
  dt_filiacao: string | null
  dt_desfiliacao: string | null
  municipio: string
  uf: string
}

function detectContexto(ano: number): string {
  if (ano === 2022 || ano === 2026) return "janela partidaria"
  return ""
}

export async function ingestFiliacao(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  mkdirSync(DATA_DIR, { recursive: true })

  const zipPath = resolve(DATA_DIR, "filiados_totais.zip")
  const extractDir = resolve(DATA_DIR, "filiados_extracted")

  const ok = await downloadFile(FILIADOS_URL, zipPath)
  if (!ok) {
    error("filiacao", "Falha ao baixar arquivo de filiados")
    return results
  }

  log("filiacao", "Extraindo zip de filiados...")
  try {
    extractZip(zipPath, extractDir)
  } catch (err) {
    error("filiacao", `Erro ao extrair zip: ${err}`)
    cleanupFile(zipPath)
    return results
  }

  // Cleanup zip imediatamente para liberar espaco
  cleanupFile(zipPath)

  const csvFiles = findCSVs(extractDir)
  log("filiacao", `Encontrados ${csvFiles.length} CSVs para processar`)

  if (csvFiles.length === 0) {
    warn("filiacao", "Nenhum CSV encontrado no zip de filiados")
    cleanupDir(extractDir)
    return results
  }

  const nameMap = buildCandidateNameMap(candidatos)

  // Agrega todas as filiacoes por candidato
  const filiacoesPorCandidato = new Map<string, FiliacaoEntry[]>()

  for (const csvFile of csvFiles) {
    log("filiacao", `  Parseando: ${csvFile}`)
    try {
      await parseCSV(csvFile, (row) => {
        const nomeRaw = row.NM_ELEITOR || ""
        const nomeNorm = normalizeForMatch(nomeRaw)
        const cand = nameMap.get(nomeNorm)
        if (!cand) return

        const entry: FiliacaoEntry = {
          partido: (row.SG_PARTIDO || "").trim(),
          situacao: (row.DS_SITUACAO_FILIADO || "").trim().toUpperCase(),
          dt_filiacao: parseDateBR(row.DT_FILIACAO || ""),
          dt_desfiliacao: parseDateBR(row.DT_DESFILIACAO || ""),
          municipio: (row.NM_MUNICIPIO || "").trim(),
          uf: (row.SG_UF || "").trim(),
        }

        const existing = filiacoesPorCandidato.get(cand.slug) ?? []
        existing.push(entry)
        filiacoesPorCandidato.set(cand.slug, existing)
      })
    } catch (err) {
      warn("filiacao", `  Erro ao parsear ${csvFile}: ${err}`)
    }
  }

  // Cleanup arquivos extraidos
  cleanupDir(extractDir)

  log("filiacao", `Candidatos encontrados no CSV: ${filiacoesPorCandidato.size}`)

  // Processa cada candidato: gera timeline de mudancas de partido
  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "filiacao",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    const start = Date.now()

    const filiacoes = filiacoesPorCandidato.get(cand.slug)
    if (!filiacoes || filiacoes.length === 0) {
      log("filiacao", `  ${cand.slug}: sem dados de filiacao encontrados`)
      result.duration_ms = Date.now() - start
      results.push(result)
      continue
    }

    log("filiacao", `  ${cand.slug}: ${filiacoes.length} registros de filiacao`)

    try {
      const candidatoId = await resolveCandidatoId(cand.slug)
      if (!candidatoId) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      // Ordena por data de filiacao ascendente para gerar timeline correta
      const ordenadas = [...filiacoes].sort((a, b) => {
        if (!a.dt_filiacao) return 1
        if (!b.dt_filiacao) return -1
        return a.dt_filiacao.localeCompare(b.dt_filiacao)
      })

      // Gera mudancas de partido: cada vez que o partido muda de uma filiacao para outra
      let partidoAnterior: string | null = null
      let dataAnterior: string | null = null

      for (const filiacao of ordenadas) {
        if (!filiacao.partido) continue

        // So registra mudanca quando o partido muda
        if (partidoAnterior !== null && partidoAnterior !== filiacao.partido) {
          const dataMudanca = filiacao.dt_filiacao ?? dataAnterior
          if (!dataMudanca) {
            partidoAnterior = filiacao.partido
            dataAnterior = filiacao.dt_filiacao
            continue
          }

          const ano = parseInt(dataMudanca.substring(0, 4), 10)
          const contexto = detectContexto(ano)

          // Checa se ja existe (idempotente)
          const { data: existing } = await supabase
            .from("mudancas_partido")
            .select("id")
            .eq("candidato_id", candidatoId)
            .eq("ano", ano)
            .eq("partido_novo", filiacao.partido)
            .single()

          if (!existing) {
            const row: Record<string, unknown> = {
              candidato_id: candidatoId,
              partido_anterior: partidoAnterior,
              partido_novo: filiacao.partido,
              data_mudanca: dataMudanca,
              ano,
            }
            if (contexto) row.contexto = contexto

            const { error: insertErr } = await supabase.from("mudancas_partido").insert(row)
            if (insertErr) {
              result.errors.push(`Erro ao inserir mudanca de partido: ${insertErr.message}`)
            } else {
              result.rows_upserted++
              result.tables_updated = ["mudancas_partido"]
              log(
                "filiacao",
                `  ${cand.slug}: ${partidoAnterior} -> ${filiacao.partido} (${dataMudanca}${contexto ? `, ${contexto}` : ""})`
              )
            }
          } else {
            log("filiacao", `  ${cand.slug}: mudanca ${partidoAnterior} -> ${filiacao.partido} ja existe, pulando`)
          }
        }

        partidoAnterior = filiacao.partido
        dataAnterior = filiacao.dt_filiacao
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
  }

  // Cleanup data dir se vazio
  try {
    const { readdirSync } = require("fs")
    const remaining = (readdirSync(DATA_DIR) as string[]).filter((f) => f !== ".DS_Store")
    if (remaining.length === 0) {
      cleanupDir(DATA_DIR)
    }
  } catch {
    // ignore
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestFiliacao().then((r) => console.log(JSON.stringify(r, null, 2)))
}
