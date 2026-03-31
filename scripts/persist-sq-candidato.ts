import { existsSync, mkdirSync, createWriteStream, readFileSync, rmSync, writeFileSync } from "fs"
import path, { dirname, resolve } from "path"
import { execSync } from "child_process"
import { fileURLToPath } from "url"
import { parseCSV } from "./lib/helpers"
import { log, warn, error } from "./lib/logger"
import { createTSEResolver } from "./lib/tse-resolver"
import type { CandidatoConfig } from "./lib/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CANDIDATOS_PATH = path.join(__dirname, "../data/candidatos.json")
const DATA_DIR = resolve(process.cwd(), "data/tse-persist-sq")
const ANOS = [2018, 2020, 2022, 2024]

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
  if (existsSync(dest)) {
    log("persist-sq", `  Cache hit: ${dest}`)
    return true
  }

  log("persist-sq", `  Baixando: ${url}`)
  try {
    const res = await fetch(url)
    if (!res.ok) {
      warn("persist-sq", `  HTTP ${res.status} para ${url}`)
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
    warn("persist-sq", `  Falha no download: ${err}`)
    return false
  }
}

function extractZip(zipPath: string, extractDir: string, extraPatterns?: string[]) {
  mkdirSync(extractDir, { recursive: true })
  const patterns = ["'*_BR*'", "'*_BRASIL*'", ...(extraPatterns || []).map((pattern) => `'*_${pattern}*'`)]
  try {
    execSync(`unzip -o "${zipPath}" ${patterns.join(" ")} -d "${extractDir}"`, { stdio: "pipe" })
  } catch {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" })
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
  const { readdirSync } = require("fs")
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

async function persistForAno(candidatos: CandidatoConfig[], ano: number) {
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
  const bySlug = new Map<string, string>()
  const callerAmbiguous = new Set<string>()

  for (const csvPath of csvPaths) {
    await parseCSV(csvPath, (row) => {
      const sq = (row.SQ_CANDIDATO || "").trim()
      if (!sq) return

      const match = resolver.resolveRow(row)
      if (!match) return
      if (callerAmbiguous.has(match.slug)) return

      const existing = bySlug.get(match.slug)
      if (!existing) {
        bySlug.set(match.slug, sq)
        return
      }

      if (existing === sq) {
        return
      }

      bySlug.delete(match.slug)
      callerAmbiguous.add(match.slug)
    })
  }

  let persisted = 0
  let removed = 0

  for (const candidato of candidatos) {
    candidato.ids.tse_sq_candidato ??= {}

    if (callerAmbiguous.has(candidato.slug)) {
      if (candidato.ids.tse_sq_candidato[String(ano)]) {
        delete candidato.ids.tse_sq_candidato[String(ano)]
        removed++
      }
      continue
    }

    const sq = bySlug.get(candidato.slug)
    if (!sq) continue

    if (candidato.ids.tse_sq_candidato[String(ano)] !== sq) {
      candidato.ids.tse_sq_candidato[String(ano)] = sq
      persisted++
    }
  }

  log(
    "persist-sq",
    `Ano ${ano}: persistidos=${persisted}, ambiguos-caller=${callerAmbiguous.size}, removidos=${removed}, ambiguos-resolver=${resolver.ambiguousSlugs.length}`
  )

  if (callerAmbiguous.size > 0) {
    warn("persist-sq", `  Ambiguos caller ${ano}: ${[...callerAmbiguous].join(", ")}`)
  }
  if (resolver.ambiguousSlugs.length > 0) {
    warn("persist-sq", `  Ambiguos resolver ${ano}: ${resolver.ambiguousSlugs.join(", ")}`)
  }

  cleanupDir(extractDir)
  cleanupFile(zipPath)
}

async function main() {
  const candidatos = loadCandidatosFromDisk()
  mkdirSync(DATA_DIR, { recursive: true })

  for (const ano of ANOS) {
    log("persist-sq", `=== Processando ${ano} ===`)
    try {
      await persistForAno(candidatos, ano)
    } catch (err) {
      error("persist-sq", `Falha no ano ${ano}: ${err}`)
    }
  }

  writeFileSync(CANDIDATOS_PATH, `${JSON.stringify(candidatos, null, 2)}\n`)
  cleanupDir(DATA_DIR)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
