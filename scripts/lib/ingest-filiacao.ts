import { createReadStream, mkdirSync, readdirSync, rmSync } from "fs"
import { constants, inflateRawSync } from "node:zlib"
import { parse } from "csv-parse"
import { resolve } from "path"
import { execFileSync } from "child_process"
import { supabase } from "./supabase"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { normalizeForMatch } from "./helpers"
import { log, warn, error } from "./logger"
import { resolveCanonicalParty } from "./party-canonical"
import type { IngestResult, CandidatoConfig } from "./types"
import { downloadToFile } from "./download-to-file"

const DATA_DIR = resolve(process.cwd(), "data/filiacao")
const FILIADOS_URL =
  "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip"

function parseDateBR(value: string): string | null {
  if (!value || value.trim() === "" || value === "#NULO#" || value === "#NE#") return null
  // Format: DD/MM/AAAA
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  return downloadToFile(url, dest, {
    onCacheHit: (path) => log("filiacao", `  Cache hit: ${path}`),
    onStart: (source) => log("filiacao", `  Baixando: ${source}`),
    onHttpError: (status, source) => warn("filiacao", `  HTTP ${status} para ${source}`),
    onError: (err) => warn("filiacao", `  Falha no download: ${err}`),
  })
}

function extractZip(zipPath: string, extractDir: string) {
  mkdirSync(extractDir, { recursive: true })
  execFileSync("unzip", ["-o", zipPath, "-d", extractDir], { stdio: "pipe" })
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
  try {
    const files = readdirSync(dir) as string[]
    return files
      .filter((f: string) => f.toLowerCase().endsWith(".csv"))
      .map((f: string) => resolve(dir, f))
  } catch {
    return []
  }
}

export async function parseCSV(
  filePath: string,
  onRow: (row: Record<string, string>) => void
): Promise<number> {
  let count = 0
  const parser = createReadStream(filePath, { encoding: "latin1" }).pipe(
    parse({
      delimiter: ";",
      columns: (columns: string[]) => {
        validarEsquemaIndividual(Object.fromEntries(columns.map((column) => [column, ""])))
        return columns
      },
      skip_empty_lines: true,
      relax_column_count: true,
      cast: (value) => value.trim(),
    })
  )

  for await (const row of parser) {
    onRow(row as Record<string, string>)
    count++
  }

  if (count === 0) throw new Error("Arquivo oficial de filiação sem registros; cobertura não confirmada")
  return count
}

/**
 * Índice de nome para candidato, com guarda de homônimo.
 *
 * O arquivo oficial de filiação não traz CPF nem título: o esquema validado tem
 * NM_ELEITOR, SG_PARTIDO, DS_SITUACAO_FILIADO, DT_FILIACAO e DT_DESFILIACAO. O
 * casamento é, portanto, por nome, sobre uma base nacional de dezenas de milhões
 * de linhas, e nome repete. Duas consequências, as duas tratadas aqui:
 *
 * 1. Chave que resolve para mais de um candidato da coorte é ambígua por
 *    construção e sai do índice. Atribuir a filiação aos dois é o erro de
 *    homônimo de 26/07/2026, que já custou uma linha do tempo inteira.
 * 2. `nome_urna` não é nome civil ("POLICIAL EDJANE", "GALVAN"). Casar por ele
 *    contra NM_ELEITOR só acerta por acidente e abre superfície de colisão, então
 *    o índice usa apenas `nome_completo`.
 */
function buildCandidateNameMap(candidatos: CandidatoConfig[]): {
  map: Map<string, CandidatoConfig>
  ambiguos: Array<{ nome: string; slugs: string[] }>
} {
  const porNome = new Map<string, CandidatoConfig[]>()
  for (const c of candidatos) {
    const key = normalizeForMatch(c.nome_completo)
    if (!key) continue
    const existing = porNome.get(key) ?? []
    if (!existing.some((item) => item.slug === c.slug)) {
      existing.push(c)
    }
    porNome.set(key, existing)
  }

  const map = new Map<string, CandidatoConfig>()
  const ambiguos: Array<{ nome: string; slugs: string[] }> = []
  for (const [key, lista] of porNome) {
    if (lista.length > 1) {
      ambiguos.push({ nome: key, slugs: lista.map((item) => item.slug) })
      continue
    }
    if (lista[0]) map.set(key, lista[0])
  }
  return { map, ambiguos }
}

interface FiliacaoEntry {
  partido: string
  situacao: string
  dt_filiacao: string | null
  dt_desfiliacao: string | null
  municipio: string
  uf: string
}

const COLUNAS_FILIACAO_INDIVIDUAL = [
  "NM_ELEITOR",
  "SG_PARTIDO",
  "DS_SITUACAO_FILIADO",
  "DT_FILIACAO",
  "DT_DESFILIACAO",
] as const

/**
 * O recurso publicado pelo TSE com este nome e um perfil estatistico
 * agregado. Ele nao contem eleitor, CPF, data de filiacao ou situacao
 * individual e, portanto, nao pode ser usado para atribuir uma linha a um
 * candidato. Mantemos o esquema aqui para que a recusa seja auditavel e nao
 * pareca um arquivo corrompido.
 */
export const COLUNAS_FILIACAO_AGREGADA = [
  "DT_GERACAO",
  "HH_GERACAO",
  "NR_ANO_MES",
  "NR_PARTIDO",
  "SG_PARTIDO",
  "NM_PARTIDO",
  "SG_UF",
  "CD_MUNICIPIO",
  "NM_MUNICIPIO",
  "NR_ZONA",
  "CD_GENERO",
  "DS_GENERO",
  "CD_FAIXA_ETARIA",
  "DS_FAIXA_ETARIA",
  "CD_ESTADO_CIVIL",
  "DS_ESTADO_CIVIL",
  "CD_GRAU_INSTRUCAO",
  "DS_GRAU_INSTRUCAO",
  "CD_OBJETO_OCUPACAO",
  "NM_OCUPACAO",
  "CD_RACA_COR",
  "DS_RACA_COR",
  "CD_IDENTIDADE_GENERO",
  "DS_IDENTIDADE_GENERO",
  "CD_QUILOMBOLA",
  "DS_QUILOMBOLA",
  "CD_INTERPRETE_LIBRAS",
  "DS_INTERPRETE_LIBRAS",
  "QT_FILIADO",
] as const

export type FiliacaoSchema = "individual" | "agregada" | "desconhecida"

function normalizarCabecalho(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().replace(/^"|"$/g, "")
}

export function classificarEsquemaFiliacao(columns: readonly string[]): FiliacaoSchema {
  const observed = new Set(columns.map(normalizarCabecalho))
  if (COLUNAS_FILIACAO_INDIVIDUAL.every((column) => observed.has(column))) return "individual"
  if (COLUNAS_FILIACAO_AGREGADA.every((column) => observed.has(column))) return "agregada"
  return "desconhecida"
}

export class FiliacaoSchemaError extends Error {
  readonly schema: FiliacaoSchema
  readonly headers: string[]

  constructor(schema: FiliacaoSchema, headers: readonly string[]) {
    const normalizedHeaders = headers.map(normalizarCabecalho)
    const missing = COLUNAS_FILIACAO_INDIVIDUAL.filter((column) => !normalizedHeaders.includes(column))
    const detail = schema === "agregada"
      ? `recurso agregado do TSE (cabeçalho observado: ${normalizedHeaders.join(",")})`
      : `colunas ausentes: ${missing.join(", ")}`
    super(`Arquivo oficial nao contem filiacao individual; ${detail}`)
    this.name = "FiliacaoSchemaError"
    this.schema = schema
    this.headers = normalizedHeaders
  }
}

export function validarEsquemaIndividual(row: Record<string, string>): void {
  const schema = classificarEsquemaFiliacao(Object.keys(row))
  if (schema !== "individual") throw new FiliacaoSchemaError(schema, Object.keys(row))
}

interface TimelineEntry {
  partido_anterior: string
  partido_novo: string
  data_mudanca: string
  ano: number
  contexto: string
}

function detectContexto(ano: number): string {
  if (ano === 2022 || ano === 2026) return "janela partidária"
  return ""
}

function normalizePartySigla(value: string): string {
  const canonical = resolveCanonicalParty(value)
  return canonical?.sigla ?? value.trim().toUpperCase()
}

function buildTimelineEntries(filiacoes: FiliacaoEntry[]): TimelineEntry[] {
  const ordered = [...filiacoes]
    .filter((entry) => entry.partido && (entry.dt_filiacao || entry.dt_desfiliacao))
    .sort((left, right) => {
      const leftDate = left.dt_filiacao ?? left.dt_desfiliacao ?? "9999-12-31"
      const rightDate = right.dt_filiacao ?? right.dt_desfiliacao ?? "9999-12-31"
      return leftDate.localeCompare(rightDate)
    })

  const deduped: FiliacaoEntry[] = []
  const seen = new Set<string>()

  for (const entry of ordered) {
    const canonicalParty = normalizePartySigla(entry.partido)
    const key = [
      canonicalParty,
      entry.dt_filiacao ?? "",
      entry.dt_desfiliacao ?? "",
    ].join("|")

    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({
      ...entry,
      partido: canonicalParty,
    })
  }

  const timeline: TimelineEntry[] = []
  let currentParty: string | null = null

  for (const entry of deduped) {
    const dataMudanca = entry.dt_filiacao ?? entry.dt_desfiliacao
    if (!dataMudanca) continue

    const ano = Number.parseInt(dataMudanca.slice(0, 4), 10)
    if (Number.isNaN(ano)) continue

    if (currentParty === null) {
      currentParty = entry.partido
      timeline.push({
        partido_anterior: "Sem partido",
        partido_novo: entry.partido,
        data_mudanca: dataMudanca,
        ano,
        contexto: "filiação inicial conhecida",
      })
      continue
    }

    if (currentParty === entry.partido) continue

    timeline.push({
      partido_anterior: currentParty,
      partido_novo: entry.partido,
      data_mudanca: dataMudanca,
      ano,
      contexto: detectContexto(ano),
    })
    currentParty = entry.partido
  }

  return timeline
}

function pickCurrentParty(filiacoes: FiliacaoEntry[]): string | null {
  const canonicalRows = filiacoes
    .filter((entry) => entry.partido)
    .map((entry) => ({
      ...entry,
      partido: normalizePartySigla(entry.partido),
    }))

  const activeRows = canonicalRows
    .filter((entry) => !entry.dt_desfiliacao)
    .sort((left, right) => {
      const leftDate = left.dt_filiacao ?? "0000-00-00"
      const rightDate = right.dt_filiacao ?? "0000-00-00"
      return rightDate.localeCompare(leftDate)
    })

  if (activeRows.length > 0) return activeRows[0].partido

  const latestRows = canonicalRows.sort((left, right) => {
    const leftDate = left.dt_filiacao ?? left.dt_desfiliacao ?? "0000-00-00"
    const rightDate = right.dt_filiacao ?? right.dt_desfiliacao ?? "0000-00-00"
    return rightDate.localeCompare(leftDate)
  })

  return latestRows[0]?.partido ?? null
}

/**
 * Lê só o cabeçalho do CSV dentro do ZIP, por range request, e diz qual esquema
 * o TSE está publicando.
 *
 * Existe para não gastar 232 MB de download e um job inteiro para descobrir, na
 * primeira linha, que o recurso é o perfil agregado. O ZIP guarda o primeiro
 * arquivo logo no início, então os primeiros bytes já contêm o cabeçalho depois
 * de inflados.
 */
export async function inspecionarEsquemaPublicado(
  url = FILIADOS_URL,
  fetcher: typeof fetch = fetch,
): Promise<{ schema: FiliacaoSchema; headers: string[] } | null> {
  try {
    const resposta = await fetcher(url, { headers: { range: "bytes=0-300000" } })
    if (!resposta.ok) return null
    const buffer = Buffer.from(await resposta.arrayBuffer())
    if (buffer.length < 30 || buffer.readUInt32LE(0) !== 0x04034b50) return null

    const nameLen = buffer.readUInt16LE(26)
    const extraLen = buffer.readUInt16LE(28)
    const dataStart = 30 + nameLen + extraLen
    const inflado = inflateRawSync(buffer.subarray(dataStart), {
      finishFlush: constants.Z_SYNC_FLUSH,
    })
    const primeiraLinha = inflado.toString("latin1").split("\n")[0] ?? ""
    if (!primeiraLinha.trim()) return null

    const headers = primeiraLinha.split(";").map((coluna) => coluna.trim().replace(/^"|"$/g, ""))
    return { schema: classificarEsquemaFiliacao(headers), headers }
  } catch {
    return null
  }
}

export async function ingestFiliacao(
  options: { dryRun?: boolean } = {},
): Promise<IngestResult[]> {
  const candidatos = await loadCandidatosPublicos()
  const results: IngestResult[] = []
  const dryRun = options.dryRun === true

  // Pré-voo antes do download. Medido em 18/09/2026: o recurso publicado em
  // `perfil_filiacao_partidaria.zip` é o PERFIL AGREGADO (contagem de filiados
  // por partido, município, zona, gênero e faixa etária), sem nome de eleitor.
  // Ele não sustenta nenhuma linha da timeline partidária, e o parser já o
  // recusa. Sem este pré-voo, descobrir isso custava 232 MB de download, 4,3 GB
  // em disco e um job de dezenas de minutos para terminar em erro.
  const preVoo = await inspecionarEsquemaPublicado()
  if (preVoo && preVoo.schema !== "individual") {
    const detalhe =
      `Fonte oficial publicada em ${FILIADOS_URL} é o perfil agregado de filiação ` +
      `(esquema ${preVoo.schema}; primeiras colunas: ${preVoo.headers.slice(0, 6).join(", ")}). ` +
      "Não traz nome de eleitor nem data de filiação individual, então nenhuma linha da " +
      "timeline partidária pode ser atribuída a partir dela. A base nominal (FILIA) exige " +
      "Partido, UF, Município e Zona por consulta e não permite varredura por candidato."
    warn("filiacao", detalhe)
    return [
      {
        source: "filiacao",
        candidato: "*",
        tables_updated: [],
        rows_upserted: 0,
        errors: [],
        duration_ms: 0,
        coleta_resultado: "nao_aplicavel",
        coleta_detalhe: detalhe,
        coleta_url: FILIADOS_URL,
      },
    ]
  }

  mkdirSync(DATA_DIR, { recursive: true })

  const zipPath = resolve(DATA_DIR, "filiados_totais.zip")
  const extractDir = resolve(DATA_DIR, "filiados_extracted")

  const ok = await downloadFile(FILIADOS_URL, zipPath)
  if (!ok) {
    error("filiacao", "Falha ao baixar arquivo de filiados")
    throw new Error(`Falha ao baixar ${FILIADOS_URL}`)
  }

  log("filiacao", "Extraindo zip de filiados...")
  try {
    extractZip(zipPath, extractDir)
  } catch (err) {
    error("filiacao", `Erro ao extrair zip: ${err}`)
    cleanupFile(zipPath)
    throw err
  }

  // Cleanup zip imediatamente para liberar espaco
  cleanupFile(zipPath)

  const csvFiles = findCSVs(extractDir)
  log("filiacao", `Encontrados ${csvFiles.length} CSVs para processar`)

  if (csvFiles.length === 0) {
    warn("filiacao", "Nenhum CSV encontrado no zip de filiados")
    cleanupDir(extractDir)
    throw new Error("Nenhum CSV encontrado no zip de filiados")
  }

  const { map: nameMap, ambiguos: nomesAmbiguos } = buildCandidateNameMap(candidatos)
  const slugsAmbiguos = new Set(nomesAmbiguos.flatMap((item) => item.slugs))
  for (const item of nomesAmbiguos) {
    warn(
      "filiacao",
      `  Nome ambíguo na coorte, ninguém recebe filiação por ele: ${item.nome} (${item.slugs.join(", ")})`,
    )
  }

  // Agrega todas as filiacoes por candidato
  const filiacoesPorCandidato = new Map<string, FiliacaoEntry[]>()
  const errosDeParse: string[] = []
  // Volume lido de fato. É o que permite dizer, no recibo de quem não aparece no
  // arquivo, que a ausência foi verificada contra a base inteira.
  let totalLinhasLidas = 0

  for (const csvFile of csvFiles) {
    log("filiacao", `  Parseando: ${csvFile}`)
    try {
      let esquemaValidado = false
      totalLinhasLidas += await parseCSV(csvFile, (row) => {
        if (!esquemaValidado) {
          validarEsquemaIndividual(row)
          esquemaValidado = true
        }
        const nomeRaw = row.NM_ELEITOR || ""
        const nomeNorm = normalizeForMatch(nomeRaw)
        const candidato = nameMap.get(nomeNorm)
        if (!candidato) return

        const entry: FiliacaoEntry = {
          partido: (row.SG_PARTIDO || "").trim(),
          situacao: (row.DS_SITUACAO_FILIADO || "").trim().toUpperCase(),
          dt_filiacao: parseDateBR(row.DT_FILIACAO || ""),
          dt_desfiliacao: parseDateBR(row.DT_DESFILIACAO || ""),
          municipio: (row.NM_MUNICIPIO || "").trim(),
          uf: (row.SG_UF || "").trim(),
        }

        const existing = filiacoesPorCandidato.get(candidato.slug) ?? []
        existing.push(entry)
        filiacoesPorCandidato.set(candidato.slug, existing)
      })
    } catch (err) {
      warn("filiacao", `  Erro ao parsear ${csvFile}: ${err}`)
      errosDeParse.push(err instanceof Error ? err.message : String(err))
    }
  }

  // Cleanup arquivos extraidos
  cleanupDir(extractDir)

  if (errosDeParse.length > 0) {
    throw new Error(errosDeParse.join("; ").slice(0, 500))
  }

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
      // Sem desfecho declarado, `entradaDeResultado` caía no genérico "ingest
      // terminou sem escrita e sem declarar desfecho", que é o mesmo texto de um
      // ingest que nem rodou. Aqui o arquivo oficial FOI lido inteiro e a pessoa
      // não está nele: isso é ausência confirmada no escopo, não lacuna de
      // coleta, e a ficha precisa poder distinguir as duas (auditoria 2026-09-18).
      // Homônimo na própria coorte não é ausência: é recusa deliberada de
      // atribuir, e o recibo precisa dizer isso, senão a ficha exibe "não consta
      // no arquivo" para quem o coletor nem chegou a procurar.
      const ambiguo = slugsAmbiguos.has(cand.slug)
      result.coleta_resultado = ambiguo ? "indeterminado" : "sem_achado_no_escopo"
      result.coleta_detalhe = ambiguo
        ? `Nome completo de ${cand.nome_completo} colide com outro candidato da coorte e a fonte não traz ` +
          "CPF nem título para desempatar; nenhuma filiação foi atribuída."
        : `Arquivo oficial de filiação partidária do TSE lido por completo (${totalLinhasLidas} linha(s), ` +
          `${filiacoesPorCandidato.size} candidato(s) da coorte casados por nome); nenhum registro para ${cand.nome_completo}.`
      result.coleta_url = FILIADOS_URL
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

      const timeline = buildTimelineEntries(filiacoes)
      const currentParty = pickCurrentParty(filiacoes)

      if (currentParty && dryRun) {
        log("filiacao", `  [dry-run] ${cand.slug}: partido atual seria sincronizado para ${currentParty}`)
      } else if (currentParty) {
        const { error: updateErr } = await supabase
          .from("candidatos")
          .update({
            partido_sigla: currentParty,
            partido_atual: currentParty,
            ultima_atualizacao: new Date().toISOString(),
          })
          .eq("id", candidatoId)

        if (updateErr) {
          result.errors.push(`Erro ao sincronizar partido atual: ${updateErr.message}`)
        } else {
          result.rows_upserted++
          if (!result.tables_updated.includes("candidatos")) {
            result.tables_updated.push("candidatos")
          }
        }
      }

      for (const mudanca of timeline) {
        const row: Record<string, unknown> = {
          candidato_id: candidatoId,
          partido_anterior: mudanca.partido_anterior,
          partido_novo: mudanca.partido_novo,
          data_mudanca: mudanca.data_mudanca,
          ano: mudanca.ano,
        }
        if (mudanca.contexto) row.contexto = mudanca.contexto

        if (dryRun) {
          log(
            "filiacao",
            `  [dry-run] ${cand.slug}: ${mudanca.ano} ${mudanca.partido_anterior} -> ${mudanca.partido_novo}`,
          )
          result.rows_upserted++
          continue
        }

        const { error: insertErr } = await supabase
          .from("mudancas_partido")
          .upsert(row, { onConflict: "candidato_id,ano,partido_novo" })
        if (insertErr) {
          result.errors.push(`Erro ao inserir mudanca de partido: ${insertErr.message}`)
          continue
        }

        result.rows_upserted++
        if (!result.tables_updated.includes("mudancas_partido")) {
          result.tables_updated.push("mudancas_partido")
        }
        log(
          "filiacao",
          `  ${cand.slug}: ${mudanca.partido_anterior} -> ${mudanca.partido_novo} (${mudanca.data_mudanca}${mudanca.contexto ? `, ${mudanca.contexto}` : ""})`
        )
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    result.duration_ms = Date.now() - start
    results.push(result)
  }

  // Cleanup data dir se vazio
  try {
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
