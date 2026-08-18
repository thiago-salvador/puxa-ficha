import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import path, { dirname, resolve } from "path"
import { execFileSync } from "child_process"
import { fileURLToPath } from "url"
import { parseCSV } from "./lib/helpers"
import { log, warn, error } from "./lib/logger"
import {
  createTSEResolver,
  getResolveMethodPriority,
  shouldSkipWeakMatch,
  type ResolveMethod,
} from "./lib/tse-resolver"
import type { CandidatoConfig } from "./lib/types"
import { downloadToFile } from "./lib/download-to-file"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CANDIDATOS_PATH = path.join(__dirname, "../data/candidatos.json")
const DATA_DIR = resolve(process.cwd(), "data/tse-persist-sq")
const OUTPUT_DIR = resolve(process.cwd(), "output")
const ANOS = [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024]

// Ambiguidade emitida por persistForAno — consumida no main pra emitir JSON.
// Formato conforme curadoria interna (Fluxo 1; persistência reversa de SQ):
//   { slug, ano, motivo, sq_removed }
// Motivos:
//   - "ambiguous-caller-removed": caller detectou prioridades conflitantes E
//     existia um SQ anterior no seed, que foi deletado. sq_removed é o valor
//     antigo (nunca null).
//   - "ambiguous-caller-blocked": caller detectou prioridades conflitantes MAS
//     não havia SQ no seed pra remover. sq_removed é null. Signal de que o
//     caller evitou aceitar um match ambíguo.
//   - "ambiguous-resolver-skipped": resolver nunca atribuiu SQ por colisão de
//     nome/UF; o slug nunca chegou a `selectedBySlug`. sq_removed é null.
export type AmbiguousMotivo =
  | "ambiguous-caller-removed"
  | "ambiguous-caller-blocked"
  | "ambiguous-resolver-skipped"

export interface AmbiguousEvent {
  slug: string
  ano: number
  motivo: AmbiguousMotivo
  sq_removed: string | null
}

export interface AmbiguousPayload {
  generated_at: string
  source: "persist-sq-candidato"
  total_events: number
  distinct_slugs: string[]
  events: AmbiguousEvent[]
}

/** Visible for testing. Pure function; no IO. */
export function buildAmbiguousPayload(
  events: AmbiguousEvent[],
  generated_at: string = new Date().toISOString()
): AmbiguousPayload {
  const sortedEvents = events.slice().sort((a, b) => {
    if (a.ano !== b.ano) return a.ano - b.ano
    if (a.slug !== b.slug) return a.slug.localeCompare(b.slug)
    return a.motivo.localeCompare(b.motivo)
  })
  return {
    generated_at,
    source: "persist-sq-candidato",
    total_events: sortedEvents.length,
    distinct_slugs: [...new Set(sortedEvents.map((e) => e.slug))].sort(),
    events: sortedEvents,
  }
}

function loadCandidatosFromDisk(): CandidatoConfig[] {
  return JSON.parse(readFileSync(CANDIDATOS_PATH, "utf-8")) as CandidatoConfig[]
}

function getGovernorUFs(candidatos: CandidatoConfig[]): string[] {
  return [
    ...new Set(
      candidatos
        .filter((candidato) => candidato.cargo_disputado === "Governador" && candidato.estado)
        .map((candidato) => candidato.estado!.toUpperCase())
    ),
  ]
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  return downloadToFile(url, dest, {
    onCacheHit: (path) => log("persist-sq", `  Cache hit: ${path}`),
    onStart: (source) => log("persist-sq", `  Baixando: ${source}`),
    onHttpError: (status, source) => warn("persist-sq", `  HTTP ${status} para ${source}`),
    onError: (err) => warn("persist-sq", `  Falha no download: ${err}`),
  })
}

function extractZip(zipPath: string, extractDir: string, extraPatterns?: string[]) {
  mkdirSync(extractDir, { recursive: true })
  const patterns = ["*_BR*", "*_BRASIL*", ...(extraPatterns || []).map((pattern) => `*_${pattern}*`)]
  try {
    execFileSync("unzip", ["-o", zipPath, ...patterns, "-d", extractDir], { stdio: "pipe" })
  } catch {
    execFileSync("unzip", ["-o", zipPath, "-d", extractDir], { stdio: "pipe" })
  }
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    warn("persist-sq", `  Nao conseguiu limpar: ${dir}`)
  }
}

function cleanupFile(filePath: string) {
  try {
    rmSync(filePath, { force: true })
  } catch {
    warn("persist-sq", `  Nao conseguiu limpar: ${filePath}`)
  }
}

function findCSVs(dir: string, pattern: string): string[] {
  try {
    const files = readdirSync(dir) as string[]
    return files
      .filter((file: string) => file.toLowerCase().includes(pattern.toLowerCase()) && file.endsWith(".csv"))
      .map((file: string) => resolve(dir, file))
  } catch {
    return []
  }
}

function getConsultaCSVPaths(extractDir: string, governorUFs: string[]): string[] {
  const brPaths = findCSVs(extractDir, "_BR").concat(findCSVs(extractDir, "_BRASIL"))
  const ufPaths = governorUFs.flatMap((uf) => findCSVs(extractDir, `_${uf}`))
  return [...brPaths, ...ufPaths].filter((value, index, array) => array.indexOf(value) === index)
}

async function persistForAno(
  candidatos: CandidatoConfig[],
  ano: number,
  ambiguousEvents: AmbiguousEvent[]
) {
  const zipPath = resolve(DATA_DIR, `consulta_cand_${ano}.zip`)
  const extractDir = resolve(DATA_DIR, `consulta_cand_${ano}`)
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`
  const governorUFs = getGovernorUFs(candidatos)

  const ok = await downloadFile(url, zipPath)
  if (!ok) return

  extractZip(zipPath, extractDir, governorUFs)
  const csvPaths = getConsultaCSVPaths(extractDir, governorUFs)
  if (csvPaths.length === 0) {
    warn("persist-sq", `  Nenhum CSV consulta_cand encontrado para ${ano}`)
    cleanupDir(extractDir)
    cleanupFile(zipPath)
    return
  }

  const resolver = await createTSEResolver(candidatos, ano)
  const selectedBySlug = new Map<
    string,
    { sq: string; method: ResolveMethod; priority: number }
  >()
  const callerAmbiguousPriority = new Map<string, number>()

  for (const csvPath of csvPaths) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim()
      if (!sq) return

      const match = resolver.resolveRow(row)
      if (!match) return
      if (shouldSkipWeakMatch(match.method)) {
        return
      }

      const priority = getResolveMethodPriority(match.method)
      const existing = selectedBySlug.get(match.slug)
      if (!existing) {
        selectedBySlug.set(match.slug, { sq, method: match.method, priority })
        return
      }

      if (priority > existing.priority) {
        selectedBySlug.set(match.slug, { sq, method: match.method, priority })
        callerAmbiguousPriority.delete(match.slug)
        return
      }

      if (priority < existing.priority || existing.sq === sq) {
        return
      }

      callerAmbiguousPriority.set(match.slug, priority)
    })
  }

  let persisted = 0
  let removed = 0

  for (const candidato of candidatos) {
    candidato.ids.tse_sq_candidato ??= {}

    if (callerAmbiguousPriority.has(candidato.slug)) {
      const existingSq = candidato.ids.tse_sq_candidato[String(ano)] ?? null
      if (existingSq) {
        delete candidato.ids.tse_sq_candidato[String(ano)]
        removed++
        ambiguousEvents.push({
          slug: candidato.slug,
          ano,
          motivo: "ambiguous-caller-removed",
          sq_removed: existingSq,
        })
      } else {
        ambiguousEvents.push({
          slug: candidato.slug,
          ano,
          motivo: "ambiguous-caller-blocked",
          sq_removed: null,
        })
      }
      continue
    }

    const selected = selectedBySlug.get(candidato.slug)
    if (!selected) continue

    if (candidato.ids.tse_sq_candidato[String(ano)] !== selected.sq) {
      candidato.ids.tse_sq_candidato[String(ano)] = selected.sq
      persisted++
    }
  }

  for (const slug of resolver.ambiguousSlugs) {
    const alreadyCaller = callerAmbiguousPriority.has(slug)
    if (alreadyCaller) continue
    ambiguousEvents.push({
      slug,
      ano,
      motivo: "ambiguous-resolver-skipped",
      sq_removed: null,
    })
  }

  log(
    "persist-sq",
    `Ano ${ano}: persistidos=${persisted}, ambiguos-caller=${callerAmbiguousPriority.size}, removidos=${removed}, ambiguos-resolver=${resolver.ambiguousSlugs.length}`
  )

  if (callerAmbiguousPriority.size > 0) {
    warn("persist-sq", `  Ambiguos caller ${ano}: ${[...callerAmbiguousPriority.keys()].join(", ")}`)
  }
  if (resolver.ambiguousSlugs.length > 0) {
    warn("persist-sq", `  Ambiguos resolver ${ano}: ${resolver.ambiguousSlugs.join(", ")}`)
  }

  cleanupDir(extractDir)
  cleanupFile(zipPath)
}

function writeAmbiguousEventsJson(events: AmbiguousEvent[], emitStdout: boolean): string | null {
  // Retrocompat: logs texto continuam saindo normalmente. JSON é adicional.
  const payload = buildAmbiguousPayload(events)

  if (emitStdout) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return null
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const iso = payload.generated_at.replace(/[:.]/g, "-")
  const outputPath = resolve(OUTPUT_DIR, `persist-sq-ambiguous-${iso}.json`)
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
  log("persist-sq", `Ambiguidade JSON salva em ${outputPath}`)
  return outputPath
}

async function main() {
  const argv = process.argv.slice(2)
  const emitJsonStdout = argv.includes("--json")

  if (emitJsonStdout) {
    // Modo --json: reservar stdout pro JSON puro consumível por jq/CI.
    // Redirecionar console.log (usado por log()) pra stderr. warn/error já
    // vão pra stderr pelo padrão de console.warn/console.error.
    const toStderr = (...args: unknown[]) => console.error(...args)
    console.log = toStderr as typeof console.log
  }

  const candidatos = loadCandidatosFromDisk()
  const ambiguousEvents: AmbiguousEvent[] = []
  mkdirSync(DATA_DIR, { recursive: true })

  for (const ano of ANOS) {
    log("persist-sq", `=== Processando ${ano} ===`)
    try {
      await persistForAno(candidatos, ano, ambiguousEvents)
    } catch (err) {
      error("persist-sq", `Falha no ano ${ano}: ${err}`)
    }
  }

  writeFileSync(CANDIDATOS_PATH, `${JSON.stringify(candidatos, null, 2)}\n`)
  cleanupDir(DATA_DIR)

  writeAmbiguousEventsJson(ambiguousEvents, emitJsonStdout)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
