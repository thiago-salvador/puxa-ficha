import { existsSync, mkdirSync, createWriteStream, rmSync, writeFileSync } from "fs"
import { resolve } from "path"
import { execSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatos, parseCSV, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"
import { createTSEResolver, shouldSkipWeakMatchForAno, type ResolveResult } from "./tse-resolver"

const DATA_DIR = resolve(process.cwd(), "data/tse-situacao")
const AUDIT_PATH = resolve(process.cwd(), "scripts/tse-situacao-audit.json")

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
  match_method: ResolveResult["method"]
  ds_cargo: string
  sg_uf: string
  uf_nascimento: string
  data_nascimento: string
  genero: string
  grau_instrucao: string
  estado_civil: string
  cor_raca: string
  ocupacao: string
  email: string
}

interface IngestTSESituacaoOptions {
  dryRun?: boolean
  auditPath?: string
}

interface CandidateSnapshot {
  cpf: string | null
  situacao_candidatura: string | null
  naturalidade: string | null
  data_nascimento: string | null
  formacao: string | null
  profissao_declarada: string | null
  genero: string | null
  estado_civil: string | null
  cor_raca: string | null
  email_campanha: string | null
}

interface AuditEntry {
  slug: string
  ano: number
  match_method: ResolveResult["method"]
  source_row: {
    ds_cargo: string
    sg_uf: string
    cpf_present: boolean
  }
  before: CandidateSnapshot | null
  proposed_update: Record<string, string>
  blocked_reasons: string[]
  persisted: boolean
}

function normalizeCPF(value: string): string {
  return value.replace(/\D/g, "")
}

function getValidCPF(value: string | null | undefined): string {
  const normalized = normalizeCPF(value || "")
  return normalized.length === 11 ? normalized : ""
}

/**
 * Tenta baixar e parsear o ZIP de consulta_cand para um dado ano.
 * Retorna um mapa slug -> MatchedData para candidatos encontrados.
 */
async function processAno(
  ano: number,
  candidatos: CandidatoConfig[],
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
  const resolver = await createTSEResolver(candidatos, ano)
  const candidatosBySlug = new Map(candidatos.map((candidato) => [candidato.slug, candidato]))

  for (const csvPath of csvPaths) {
    await parseCSV(csvPath, (row) => {
      const match = resolver.resolveRow(row)
      if (!match) return
      if (shouldSkipWeakMatchForAno(ano, match.method)) {
        return
      }

      const cand = candidatosBySlug.get(match.slug)
      if (!cand) return

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
        match_method: match.method,
        ds_cargo: (row.DS_CARGO || "").toUpperCase(),
        sg_uf: (row.SG_UF || "").toUpperCase(),
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

  log(
    "tse-situacao",
    `  Stats ${ano}: sq=${resolver.stats.sqPreloaded}, cpf=${resolver.stats.cpf}, nome-unico=${resolver.stats.nameUnique}, nome-uf=${resolver.stats.nameUf}, ambiguo=${resolver.stats.ambiguous}, sem-match=${resolver.stats.noMatch}`
  )
  if (resolver.ambiguousSlugs.length > 0) {
    warn("tse-situacao", `  Ambiguos ${ano}: ${resolver.ambiguousSlugs.join(", ")}`)
  }

  return { matched: existingMatches, success: true }
}

export async function ingestTSESituacao(
  options: IngestTSESituacaoOptions = {}
): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  mkdirSync(DATA_DIR, { recursive: true })
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
    await processAno(ano, candidatos, matched)
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
  const auditEntries: AuditEntry[] = []

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
        .select("cpf, situacao_candidatura, naturalidade, data_nascimento, formacao, profissao_declarada, genero, estado_civil, cor_raca, email_campanha")
        .eq("id", candidatoId)
        .single()

      const before: CandidateSnapshot | null = dbCand
        ? {
            cpf: dbCand.cpf ?? null,
            situacao_candidatura: dbCand.situacao_candidatura ?? null,
            naturalidade: dbCand.naturalidade ?? null,
            data_nascimento: dbCand.data_nascimento ?? null,
            formacao: dbCand.formacao ?? null,
            profissao_declarada: dbCand.profissao_declarada ?? null,
            genero: dbCand.genero ?? null,
            estado_civil: dbCand.estado_civil ?? null,
            cor_raca: dbCand.cor_raca ?? null,
            email_campanha: dbCand.email_campanha ?? null,
          }
        : null

      const updatePayload: Record<string, string> = {}
      const blockedReasons: string[] = []

      const currentCPF = getValidCPF(before?.cpf)
      const matchedCPF = getValidCPF(info.cpf)

      if (matchedCPF) {
        if (currentCPF && currentCPF !== matchedCPF) {
          blockedReasons.push(`cpf-inconsistente:${currentCPF}->${matchedCPF}`)
        }
        updatePayload.cpf = matchedCPF
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

      const auditEntry: AuditEntry = {
        slug,
        ano: info.ano,
        match_method: info.match_method,
        source_row: {
          ds_cargo: info.ds_cargo,
          sg_uf: info.sg_uf,
          cpf_present: Boolean(info.cpf),
        },
        before,
        proposed_update: updatePayload,
        blocked_reasons: blockedReasons,
        persisted: false,
      }

      if (Object.keys(updatePayload).length === 0) {
        auditEntries.push(auditEntry)
        result.duration_ms = Date.now() - start
        allResults.push(result)
        continue
      }

      if (blockedReasons.length > 0) {
        warn("tse-situacao", `  ${slug}: persistencia bloqueada (${blockedReasons.join(", ")})`)
        auditEntries.push(auditEntry)
        result.errors.push(`Persistencia bloqueada: ${blockedReasons.join(", ")}`)
        result.duration_ms = Date.now() - start
        allResults.push(result)
        continue
      }

      if (options.dryRun) {
        log(
          "tse-situacao",
          `  ${slug}: dry-run [${Object.keys(updatePayload).join(", ")}] do ano ${info.ano} via ${info.match_method}`
        )
        auditEntries.push(auditEntry)
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
        auditEntry.persisted = true
        result.tables_updated.push("candidatos")
        result.rows_upserted++
        const fields = Object.keys(updatePayload).join(", ")
        log(
          "tse-situacao",
          `  ${slug}: atualizado [${fields}] do ano ${info.ano}`
        )
      }

      auditEntries.push(auditEntry)
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    allResults.push(result)
    await sleep(100)
  }

  const auditSummary = {
    generated_at: new Date().toISOString(),
    dry_run: Boolean(options.dryRun),
    summary: {
      matched: matched.size,
      audit_entries: auditEntries.length,
      persisted: auditEntries.filter((entry) => entry.persisted).length,
      blocked: auditEntries.filter((entry) => entry.blocked_reasons.length > 0).length,
      proposed_cpf_updates: auditEntries.filter((entry) => Boolean(entry.proposed_update.cpf)).length,
      methods: {
        sq_preloaded: auditEntries.filter((entry) => entry.match_method === "sq-preloaded").length,
        cpf: auditEntries.filter((entry) => entry.match_method === "cpf").length,
        name_unique: auditEntries.filter((entry) => entry.match_method === "name-unique").length,
        name_uf: auditEntries.filter((entry) => entry.match_method === "name-uf").length,
      },
    },
    entries: auditEntries,
  }

  writeFileSync(options.auditPath ?? AUDIT_PATH, `${JSON.stringify(auditSummary, null, 2)}\n`)
  log("tse-situacao", `Auditoria salva em ${options.auditPath ?? AUDIT_PATH}`)

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
  const dryRun = process.argv.includes("--dry-run")
  const auditPathArg = process.argv.find((arg) => arg.startsWith("--audit-path="))
  const auditPath = auditPathArg?.split("=")[1]

  ingestTSESituacao({ dryRun, auditPath }).then((r) => console.log(JSON.stringify(r, null, 2)))
}
