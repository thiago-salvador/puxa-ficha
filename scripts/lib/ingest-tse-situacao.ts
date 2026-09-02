import { mkdirSync, readdirSync, rmSync, writeFileSync } from "fs"
import { resolve } from "path"
import { execFileSync } from "child_process"
import { supabase } from "./supabase"
import { normalizarCpfTse } from "./cpf"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { parseCSV, sleep } from "./helpers"
import { log, warn, error } from "./logger"
import type { IngestResult, CandidatoConfig } from "./types"
import {
  createTSEResolver,
  getResolveMethodPriority,
  shouldSkipWeakMatch,
  type ResolveMethod,
  type ResolveResult,
} from "./tse-resolver"
import { downloadToFile } from "./download-to-file"

const DATA_DIR = resolve(process.cwd(), "data/tse-situacao")
const AUDIT_PATH = resolve(process.cwd(), "scripts/tse-situacao-audit.json")

// Pleito corrente do produto. Usado pelo buildIngestPayload para decidir quando
// o ingest pode reescrever situacao_candidatura. Linhas de pleitos historicos
// (2022, 2020, 2024 municipal) nao tocam o campo, porque a convencao editorial
// da coorte 2026 usa situacao_candidatura como estado do pleito corrente
// (pre-candidato/incerto/APTO [2026]), nao historico.
const PLEITO_CORRENTE = 2026

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

async function downloadFile(url: string, dest: string): Promise<boolean> {
  return downloadToFile(url, dest, {
    onCacheHit: (path) => log("tse-situacao", `  Cache hit: ${path}`),
    onStart: (source) => log("tse-situacao", `  Baixando: ${source}`),
    onHttpError: (status, source) => warn("tse-situacao", `  HTTP ${status} para ${source}`),
    onError: (err) => warn("tse-situacao", `  Falha no download: ${err}`),
  })
}

function extractZip(zipPath: string, extractDir: string) {
  mkdirSync(extractDir, { recursive: true })
  // Extract ALL files (including state CSVs for governors)
  execFileSync("unzip", ["-o", zipPath, "-d", extractDir], { stdio: "pipe" })
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

export interface MatchedData {
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

export interface CandidateSnapshot {
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

/**
 * CPF utilizavel, dos dois lados: o que o CSV do TSE publicou e o que o banco
 * ja tem.
 *
 * Delega para `normalizarCpfTse` (ver `lib/cpf`) porque o piso cru de 11
 * digitos que morava aqui descartava a linha quando o publicador do TSE comia
 * os zeros a esquerda: `cpf_present` saia false e o CPF verdadeiro nunca era
 * gravado em `candidatos.cpf`.
 */
function getValidCPF(value: string | null | undefined): string {
  return normalizarCpfTse(value)
}

/**
 * Decide se um match de uma linha do CSV deve ser descartado em favor do
 * match ja acumulado em `existing`.
 *
 * Comportamento historico: se ja existia um match de um ano mais recente,
 * qualquer linha de ano mais antigo era descartada. Problema: slugs que
 * matcharam em 2024 ou 2026 sem CPF ficavam trancados no bucket `no_cpf`
 * porque o ingest nunca voltava pra pegar o CPF em 2022.
 *
 * Fase 4 (2026-04-14): agora permitimos que uma linha de ano mais antigo
 * preencha CPF se `existing` ainda nao tem um CPF valido e a linha atual
 * tem. Nunca sobrescreve CPF ja presente em `existing`.
 *
 * Exportado pra permitir unit test sem precisar mockar createTSEResolver
 * nem parseCSV inteiro.
 */
export function shouldSkipExistingMatch(
  existing: { ano: number; cpf: string } | undefined,
  ano: number,
  rowCpfRaw: string | null | undefined
): boolean {
  if (!existing) return false
  if (existing.ano > ano) {
    const existingHasCpf = Boolean(getValidCPF(existing.cpf))
    const rowHasCpf = Boolean(getValidCPF(rowCpfRaw))
    if (existingHasCpf) return true
    if (!rowHasCpf) return true
    return false
  }
  if (existing.ano === ano && existing.cpf && !rowCpfRaw) return true
  return false
}

/**
 * Fase 14.1 (2026-04-14): mesmo slug matcha duas linhas do mesmo ano com
 * metodos diferentes (ex: sq-preloaded via SQ explicito E name-unique via
 * homonimo no mesmo UF). Sem esse guard, a linha processada depois sobrescreve
 * a anterior pela ordem de iteracao do CSV, rebaixando sq-preloaded
 * (prioridade 4) para name-unique (prioridade 2) e derrubando o match certo.
 *
 * Caso canonico: rafael-greca 2020 PR tem SQ 160000657203 (PREFEITO Curitiba,
 * CPF 11111111111, sq-preloaded) e SQ 160001230899 (VEREADOR Assai, CPF
 * 22222222222, name-unique homonimo). A linha do vereador sobrescrevia a do
 * prefeito e disparava o guard cpf-inconsistente na persistencia.
 *
 * Regra: se existing tem prioridade estritamente maior que o metodo da nova
 * linha no mesmo ano, skip. Cross-year ja e tratado por shouldSkipExistingMatch.
 */
export function shouldSkipLowerPriorityInSameYear(
  existing: { ano: number; match_method: ResolveMethod } | undefined,
  ano: number,
  rowMethod: ResolveMethod
): boolean {
  if (!existing) return false
  if (existing.ano !== ano) return false
  return getResolveMethodPriority(existing.match_method) > getResolveMethodPriority(rowMethod)
}

/**
 * Fase 14.2 (2026-04-14, Caminho 2): constroi o payload de update a partir do
 * match acumulado (info) e do snapshot atual do DB (before). Pure function,
 * sem IO, testavel.
 *
 * Regras:
 * - cpf: so grava quando DB nao tem CPF valido. Se DB ja tem CPF (mesmo que
 *   bate com o matched), nao sobrescreve (reduz ruido de update gratuito).
 * - cpf-inconsistente: se DB tem CPF diferente do matched, adiciona blocked
 *   reason mas NAO apaga o CPF antigo (guard fail-safe preservado).
 * - situacao_candidatura: so reescrita quando info.ano === pleitoCorrente.
 *   Anos historicos nao tocam o campo (convencao editorial da coorte 2026).
 * - demograficos (naturalidade, data_nascimento, etc): fill-only, so escreve
 *   quando DB esta null naquele campo.
 *
 * Preserva todos os guards do ingest anterior e ainda corrige o blast radius
 * de situacao_candidatura que bloqueava o Caminho 3 (apply real amplo).
 */
export function buildIngestPayload(
  info: MatchedData,
  before: CandidateSnapshot | null,
  pleitoCorrente: number = PLEITO_CORRENTE
): { payload: Record<string, string>; blockedReasons: string[] } {
  const payload: Record<string, string> = {}
  const blockedReasons: string[] = []

  const currentCPF = getValidCPF(before?.cpf)
  const matchedCPF = getValidCPF(info.cpf)

  if (matchedCPF) {
    if (currentCPF && currentCPF !== matchedCPF) {
      blockedReasons.push(`cpf-inconsistente:${currentCPF}->${matchedCPF}`)
    }
    // Fase 14.2: so grava cpf quando DB nao tem CPF valido. Se DB ja tem
    // CPF (mesmo que bate), skip pra reduzir ruido. O guard cpf-inconsistente
    // acima continua ativo caso os dois existam e divirjam.
    if (!currentCPF) {
      payload.cpf = matchedCPF
    }
  }

  // Fase 14.2: situacao_candidatura so e reescrita quando a linha vem do
  // pleito corrente. Anos historicos nao tocam esse campo.
  //
  // 02/09/2026: o campo tem vocabulario fechado (src/lib/situacao-candidatura.ts
  // e o CHECK candidatos_situacao_candidatura_dominio). Este ingest era o ultimo
  // caminho que gravava texto livre ("APTO [2026]", "DEFERIDO (COM RECURSO)
  // [2026]"), e foi assim que as onze grafias nasceram. Agora ele so grava o
  // valor do dominio que a fonte sustenta: codigo `#NE` (ou vazio) no pleito
  // corrente, com identidade fechada por SQ, e pedido de registro protocolado
  // sem julgamento publicado, ou seja `aguardando julgamento`. Qualquer outro
  // codigo (DEFERIDO, INDEFERIDO, APTO, INAPTO, RENUNCIA...) bloqueia a
  // persistencia deste candidato ate o vocabulario ganhar o valor numa PR
  // deliberada. Match por nome nao basta para afirmar que ha pedido de registro.
  if (info.situacao.trim() && info.ano === pleitoCorrente) {
    const codigo = info.situacao.trim().toUpperCase()
    const pendenteSemJulgamento = codigo === "#NE" || codigo === "#NE#" || codigo === "#NULO#"
    if (!pendenteSemJulgamento) {
      blockedReasons.push(`situacao-fora-do-vocabulario:${codigo}${info.detalhe ? ` (${info.detalhe})` : ""}`)
    } else if (info.match_method !== "sq-preloaded") {
      blockedReasons.push(`situacao-match-fraco:${info.match_method}`)
    } else if (before?.situacao_candidatura !== "aguardando julgamento") {
      payload.situacao_candidatura = "aguardando julgamento"
    }
  }

  // Fase 14 closure (invariante 13.7 do spec): naturalidade nunca e gravada
  // a partir de TSE. O unico campo disponivel no CSV e SG_UF_NASCIMENTO
  // (so a UF, ex: "AM"), que e pior que NULL pra curadoria downstream:
  // quebra busca por cidade-natal, confunde enriquecimento Wikipedia, e
  // contamina display publico com string que nao e realmente uma naturalidade.
  // Se naturalidade vier alguma vez, tem que ser de curadoria ou de fonte
  // que tenha cidade + UF juntos (Wikidata P19, Wikipedia infobox, etc).
  // Deliberadamente nao ha fallback de uf_nascimento aqui.

  // Only fill if DB field is null (never overwrite curated data).
  if (!before?.data_nascimento && info.data_nascimento) {
    payload.data_nascimento = info.data_nascimento
  }
  if (!before?.genero && info.genero) {
    payload.genero = info.genero
  }
  if (!before?.formacao && info.grau_instrucao) {
    payload.formacao = info.grau_instrucao
  }
  if (!before?.estado_civil && info.estado_civil) {
    payload.estado_civil = info.estado_civil
  }
  if (!before?.cor_raca && info.cor_raca) {
    payload.cor_raca = info.cor_raca
  }
  if (!before?.profissao_declarada && info.ocupacao) {
    payload.profissao_declarada = info.ocupacao
  }
  if (!before?.email_campanha && info.email) {
    payload.email_campanha = info.email
  }

  return { payload, blockedReasons }
}

/**
 * Tenta baixar e parsear o ZIP de consulta_cand para um dado ano.
 * Retorna um mapa slug -> MatchedData para candidatos encontrados.
 *
 * Fase 14.3: `ambiguousByYear` acumula slugs que o resolver rejeitou por
 * colisao de nome/UF naquele ano, pra que o audit file exponha esse bucket
 * ao report.
 */
async function processAno(
  ano: number,
  candidatos: CandidatoConfig[],
  existingMatches: Map<string, MatchedData>,
  ambiguousByYear: Map<number, string[]>
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
      if (shouldSkipWeakMatch(match.method)) {
        return
      }

      const cand = candidatosBySlug.get(match.slug)
      if (!cand) return

      const existing = existingMatches.get(cand.slug)

      // Decide se descartamos essa linha em favor do match acumulado.
      // Ver shouldSkipExistingMatch pra logica completa (Fase 4 merge condicional).
      if (shouldSkipExistingMatch(existing, ano, row.NR_CPF_CANDIDATO)) return

      // Fase 14.1: se existing e do mesmo ano e tem prioridade estritamente
      // maior (ex: sq-preloaded vs name-unique), descarta a nova linha.
      // Sem esse guard, ordem de iteracao do CSV podia rebaixar sq-preloaded.
      if (shouldSkipLowerPriorityInSameYear(existing, ano, match.method)) return

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
  // Fase 14.3: persiste resolver.ambiguousSlugs por ano no bucket compartilhado
  // pra que o audit file exponha ao report-tse-situacao-gaps.ts.
  if (resolver.ambiguousSlugs.length > 0) {
    ambiguousByYear.set(ano, [...resolver.ambiguousSlugs].sort())
    warn("tse-situacao", `  Ambiguos ${ano}: ${resolver.ambiguousSlugs.join(", ")}`)
  }

  return { matched: existingMatches, success: true }
}

export async function ingestTSESituacao(
  options: IngestTSESituacaoOptions = {}
): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
  mkdirSync(DATA_DIR, { recursive: true })
  const matched = new Map<string, MatchedData>()
  const ambiguousByYear = new Map<number, string[]>()

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
    await processAno(ano, candidatos, matched, ambiguousByYear)
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

      // Fase 14.2: logica de payload extraida pra buildIngestPayload (testavel).
      const { payload: updatePayload, blockedReasons } = buildIngestPayload(info, before)

      const auditEntry: AuditEntry = {
        slug,
        ano: info.ano,
        match_method: info.match_method,
        source_row: {
          ds_cargo: info.ds_cargo,
          sg_uf: info.sg_uf,
          // Fase 14.4: cpf_present reflete CPF valido de verdade (11 digitos),
          // nao Boolean(info.cpf) que aceitava "#NULO#" e similares como truthy.
          cpf_present: Boolean(getValidCPF(info.cpf)),
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

  // Fase 14.3: ambiguous_by_year exposto no audit summary. Chaves sao strings
  // de ano (ex: "2020", "2022") pra JSON-friendliness.
  const ambiguousByYearPayload: Record<string, string[]> = {}
  for (const [ano, slugs] of [...ambiguousByYear.entries()].sort((a, b) => a[0] - b[0])) {
    ambiguousByYearPayload[String(ano)] = slugs
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
      proposed_situacao_updates: auditEntries.filter((entry) =>
        Boolean(entry.proposed_update.situacao_candidatura)
      ).length,
      proposed_any_field_updates: auditEntries.filter(
        (entry) => Object.keys(entry.proposed_update).length > 0
      ).length,
      methods: {
        sq_preloaded: auditEntries.filter((entry) => entry.match_method === "sq-preloaded").length,
        cpf: auditEntries.filter((entry) => entry.match_method === "cpf").length,
        name_unique: auditEntries.filter((entry) => entry.match_method === "name-unique").length,
        name_uf: auditEntries.filter((entry) => entry.match_method === "name-uf").length,
      },
    },
    ambiguous_by_year: ambiguousByYearPayload,
    entries: auditEntries,
  }

  writeFileSync(options.auditPath ?? AUDIT_PATH, `${JSON.stringify(auditSummary, null, 2)}\n`)
  log("tse-situacao", `Auditoria salva em ${options.auditPath ?? AUDIT_PATH}`)

  // Limpa DATA_DIR se vazio
  try {
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
