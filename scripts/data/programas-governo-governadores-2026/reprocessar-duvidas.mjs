#!/usr/bin/env node

// Driver pequeno e retomável para a fila de dúvidas reais. O processo que faz
// a ingestão continua sendo o CLI canônico. Este arquivo apenas isola cada
// candidatura, conserva checkpoints e fecha a fila quando a cota/autorização
// deixa de ser confiável.
import { createHash, randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const THIS_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO = resolve(THIS_DIR, "../../..")
const CANONICAL_CLI = "scripts/programas-governo-governadores-2026.ts"
const MAX_CONCURRENCY = 3
const DEFAULT_CONCURRENCY = 2
const MAX_LOG_BYTES = 8_192
const MAX_CAPTURE_BYTES = 64 * 1024
const STATES = new Set(["em_revisao", "perfil_local_ausente", "sem_documento_oficial", "falha_de_extracao"])
const UF = /^[A-Z]{2}$/u
const SQ = /^\d{11,12}$/u
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/u
const QUOTA = /(?:quota|rate[ -]?limit|usage[ -]?limit|token[ -]?limit|billing|insufficient(?:\s+funds|\s+credits?)?|credit(?:s)?\s+(?:exhausted|depleted)|\b(?:401|429)\b|unauthori[sz]ed|payment required)/iu
const progressWriteQueues = new Map()

function argument(argv, name) {
  const prefix = `${name}=`
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function requiredPath(argv, name) {
  const value = argument(argv, name)
  if (!value) throw new Error(`${name}= obrigatorio`)
  return resolve(value)
}

function executable(value) {
  return value.includes("/") ? resolve(value) : value
}

export function parseArgs(argv = process.argv.slice(2)) {
  const rawConcurrency = argument(argv, "--concurrency")
  const concurrency = rawConcurrency === undefined ? DEFAULT_CONCURRENCY : Number(rawConcurrency)
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`--concurrency deve ser um inteiro entre 1 e ${MAX_CONCURRENCY}`)
  }
  const casesPath = requiredPath(argv, "--cases")
  const outputDir = requiredPath(argv, "--output-dir")
  const options = {
    casesPath,
    repo: argument(argv, "--repo") ? resolve(argument(argv, "--repo")) : DEFAULT_REPO,
    outputDir,
    inventory: requiredPath(argv, "--inventory"),
    archiveDir: requiredPath(argv, "--archive-dir"),
    modelsConfig: argument(argv, "--models-config") ? resolve(argument(argv, "--models-config")) : undefined,
    cacheDir: argument(argv, "--cache-dir") ? resolve(argument(argv, "--cache-dir")) : undefined,
    extractCacheDir: argument(argv, "--extract-cache-dir") ? resolve(argument(argv, "--extract-cache-dir")) : undefined,
    faseDir: argument(argv, "--fase-dir") ? resolve(argument(argv, "--fase-dir")) : undefined,
    node: argument(argv, "--node") ? executable(argument(argv, "--node")) : process.execPath,
    concurrency,
  }
  return options
}

function identityOf(candidate) {
  return `2026:GOVERNADOR:${candidate.uf}:${candidate.sqCandidato}`
}

export function validateCases(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.cases)) {
    throw new Error("cases precisa conter um array cases")
  }
  const seen = new Set()
  return value.cases.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`cases[${index}] invalido`)
    const uf = String(candidate.uf ?? "").trim().toUpperCase()
    const slug = String(candidate.slug ?? "").trim()
    const sqCandidato = String(candidate.sqCandidato ?? "").trim()
    const strategy = candidate.strategy === undefined ? undefined : String(candidate.strategy).trim()
    const guidance = candidate.guidance === undefined ? undefined : String(candidate.guidance).trim()
    const factLimit = candidate.factLimit === undefined ? undefined : Number(candidate.factLimit)
    if (!UF.test(uf) || !SAFE_SLUG.test(slug) || !SQ.test(sqCandidato)) {
      throw new Error(`cases[${index}] exige uf, slug e sqCandidato validos`)
    }
    if (strategy !== undefined && strategy !== "fatos") {
      throw new Error(`cases[${index}].strategy deve ser fatos`)
    }
    if (guidance !== undefined && (
      guidance.length === 0
      || guidance.length > 2_000
      || /[\u0000-\u001f\u007f]/u.test(guidance)
    )) {
      throw new Error(`cases[${index}].guidance invalida`)
    }
    if (factLimit !== undefined && factLimit !== 6) {
      throw new Error(`cases[${index}].factLimit deve ser 6`)
    }
    const key = `${uf}:${sqCandidato}:${slug}`
    if (seen.has(key)) throw new Error(`cases duplicado: ${key}`)
    seen.add(key)
    return {
      uf,
      slug,
      sqCandidato,
      ...(strategy ? { strategy } : {}),
      ...(guidance ? { guidance } : {}),
      ...(factLimit ? { factLimit } : {}),
    }
  })
}

async function readCases(path) {
  return validateCases(JSON.parse(await readFile(path, "utf8")))
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function candidateKey(candidate) {
  return `${candidate.uf}:${candidate.sqCandidato}:${candidate.slug}`
}

function candidateFingerprint(candidate) {
  return createHash("sha256").update(JSON.stringify({
    strategy: candidate.strategy ?? null,
    guidance: candidate.guidance ?? null,
    factLimit: candidate.factLimit ?? null,
  })).digest("hex")
}

function candidateDir(options, candidate) {
  return join(options.outputDir, "candidatos", candidate.slug)
}

function expectedRecordPath(options, candidate) {
  return join(candidateDir(options, candidate), candidate.uf, `${candidate.slug}.json`)
}

function redact(value) {
  return String(value ?? "")
    .replace(/\b(?:sk|rk)-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]")
    .replace(/\b(?:ghp|github_pat|xoxb|xoxp)_[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/giu, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|secret|password|token)\s*[=:]\s*)[^\s,;]+/giu, "$1[REDACTED]")
}

export function truncateLog(value, maxBytes = MAX_LOG_BYTES) {
  const safe = redact(value)
  const bytes = Buffer.byteLength(safe, "utf8")
  if (bytes <= maxBytes) return safe
  let result = Buffer.from(safe, "utf8").subarray(0, maxBytes).toString("utf8")
  // Do not leave a partial UTF-8 replacement character in the checkpoint.
  result = result.replace(/\uFFFD$/u, "")
  return `${result}\n...[truncated]`
}

function validRecord(record, candidate) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false
  if (record.version !== 1 || !STATES.has(record.estado)) return false
  const fonte = record.fonte
  const ingestion = record.ingestao
  if (!fonte || typeof fonte !== "object" || fonte.ano !== 2026 || fonte.cargo !== "GOVERNADOR") return false
  if (fonte.uf !== candidate.uf || String(fonte.sqCandidato) !== candidate.sqCandidato || fonte.slug !== candidate.slug) return false
  if (!ingestion || typeof ingestion !== "object" || ingestion.identityKey !== identityOf(candidate)) return false
  if (!["ausencia", "extracao", "modelos", "concluida"].includes(ingestion.etapa)) return false
  if (!(ingestion.erro === null || typeof ingestion.erro === "string")) return false
  if (ingestion.eval !== null && (typeof ingestion.eval !== "object" || typeof ingestion.eval.completo !== "boolean" || !Number.isInteger(ingestion.eval.blockers) || ingestion.eval.blockers < 0)) return false
  return true
}

async function findJson(root, expectedName) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const child = join(root, entry.name)
    if (entry.isDirectory()) {
      const found = await findJson(child, expectedName)
      if (found) return found
    } else if (entry.isFile() && entry.name === expectedName) {
      return child
    }
  }
  return null
}

async function loadRecord(options, candidate) {
  const path = expectedRecordPath(options, candidate)
  const materialized = (await exists(path)) ? path : await findJson(candidateDir(options, candidate), `${candidate.slug}.json`)
  if (!materialized) return { path, record: null }
  try {
    const metadata = await stat(materialized)
    return { path: materialized, record: JSON.parse(await readFile(materialized, "utf8")), mtimeMs: metadata.mtimeMs }
  } catch { return { path: materialized, record: null } }
}

function isPass(record, candidate) {
  return validRecord(record, candidate)
    && record.ingestao.etapa === "concluida"
    && record.ingestao.erro === null
    && record.ingestao.eval?.completo === true
    && record.ingestao.eval.blockers === 0
}

function classifyArtifact(record, candidate) {
  if (!validRecord(record, candidate)) return { status: "failed", reason: "artefato ausente, invalido ou identidade divergente" }
  if (isPass(record, candidate)) return { status: "pass", reason: "Eval completo" }
  return { status: "blocked", reason: record.ingestao.eval
    ? `Eval incompleto (${record.ingestao.eval.blockers} blocker(s))`
    : "Eval incompleto" }
}

function initialProgress(cases) {
  return {
    version: 1,
    cases: cases.map((candidate) => ({
      ...candidate,
      key: candidateKey(candidate),
      caseFingerprint: candidateFingerprint(candidate),
      status: "pending",
      attempts: 0,
    })),
    quota: { frozen: false, reason: null },
    summary: { pass: 0, blocked: 0, failed: 0, pending: cases.length },
    updatedAt: new Date().toISOString(),
  }
}

function ensureProgressShape(progress, cases) {
  if (!progress || progress.version !== 1 || !Array.isArray(progress.cases)) throw new Error("progress.json invalido")
  const expected = cases.map(candidateKey).sort()
  const actual = progress.cases.map((item) => item?.key ?? candidateKey(item ?? {})).sort()
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new Error("progress.json nao corresponde a duvidas-reais.json")
  }
  if (!progress.quota || typeof progress.quota !== "object") progress.quota = { frozen: false, reason: null }
  return progress
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporary, path)
}

function summary(progress) {
  return progress.cases.reduce((counts, item) => {
    if (item.status in counts) counts[item.status] += 1
    return counts
  }, { pass: 0, blocked: 0, failed: 0, pending: 0 })
}

async function persist(progress, progressPath) {
  progress.summary = summary(progress)
  progress.updatedAt = new Date().toISOString()
  // Conclusões podem chegar juntas. Serializar e capturar o snapshot antes do
  // primeiro await impede que uma escrita velha sobrescreva a mais recente.
  const snapshot = JSON.parse(JSON.stringify(progress))
  const previous = progressWriteQueues.get(progressPath) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(() => writeAtomic(progressPath, snapshot))
  progressWriteQueues.set(progressPath, current)
  await current
  if (progressWriteQueues.get(progressPath) === current) progressWriteQueues.delete(progressPath)
}

function childArguments(options, candidate, output) {
  const args = [
    "--conditions", "react-server", "--import", "tsx", CANONICAL_CLI,
    `--ufs=${candidate.uf}`,
    `--sq-candidato=${candidate.sqCandidato}`,
    `--inventory=${options.inventory}`,
    `--archive-dir=${options.archiveDir}`,
    `--output-dir=${output}`,
  ]
  if (options.modelsConfig) args.push(`--models-config=${options.modelsConfig}`)
  // O CLI atual não precisa destes diretórios, mas recebê-los permite que uma
  // versão posterior do CLI e os fakes herméticos usem exatamente o mesmo
  // contrato sem alterar o driver.
  if (options.cacheDir) args.push(`--cache-dir=${options.cacheDir}`)
  if (options.extractCacheDir) args.push(`--extract-cache-dir=${options.extractCacheDir}`)
  if (options.faseDir) args.push(`--fase-dir=${options.faseDir}`)
  if (candidate.strategy === "fatos") args.push("--force-fatos")
  if (candidate.guidance) args.push(`--repair-guidance=${candidate.guidance}`)
  if (candidate.factLimit) args.push(`--repair-facts-limit=${candidate.factLimit}`)
  return args
}

function runChild(options, candidate) {
  const output = candidateDir(options, candidate)
  return new Promise((resolveResult) => {
    const child = spawn(options.node, childArguments(options, candidate, output), {
      cwd: options.repo,
      env: {
        ...process.env,
        ...(options.cacheDir ? { PF_PROGRAMAS_CACHE_DIR: options.cacheDir } : {}),
        ...(options.extractCacheDir ? { PF_PROGRAMAS_EXTRACT_CACHE_DIR: options.extractCacheDir } : {}),
        ...(options.faseDir ? { PF_PROGRAMAS_FASE_DIR: options.faseDir } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const append = (current, chunk) => current.length >= MAX_CAPTURE_BYTES
      ? current
      : `${current}${chunk.toString("utf8")}`.slice(0, MAX_CAPTURE_BYTES)
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk) })
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk) })
    child.on("error", (error) => resolveResult({ code: null, signal: null, error: String(error.message ?? error), stdout, stderr }))
    child.on("close", (code, signal) => resolveResult({ code, signal, error: null, stdout, stderr }))
  })
}

function quotaOutput(result) {
  return QUOTA.test(`${result.error ?? ""}\n${result.stdout}\n${result.stderr}`)
}

async function processOne(options, candidate, progress, progressPath) {
  const item = progress.cases.find((entry) => entry.key === candidateKey(candidate))
  item.attempts = Number(item.attempts ?? 0) + 1
  item.startedAt = new Date().toISOString()
  const output = candidateDir(options, candidate)
  await mkdir(output, { recursive: true })
  const beforeArtifact = await loadRecord(options, candidate)
  const result = await runChild(options, candidate)
  const artifact = await loadRecord(options, candidate)
  const freshArtifact = artifact.record && (!beforeArtifact.record
    || artifact.path !== beforeArtifact.path
    || artifact.mtimeMs > beforeArtifact.mtimeMs)
  const classification = freshArtifact
    ? classifyArtifact(artifact.record, candidate)
    : { status: "failed", reason: "artefato nao materializado nesta tentativa" }
  // A valid blocked record is useful terminal evidence even when the CLI
  // exits 1 because its own fail-closed gate reports blockers.
  item.status = classification.status
  item.caseFingerprint = candidateFingerprint(candidate)
  item.strategy = candidate.strategy
  item.guidance = candidate.guidance
  item.factLimit = candidate.factLimit
  item.reason = result.error || result.code !== 0
    ? `${classification.reason}; processo=${result.error ?? `exit ${result.code}`}`
    : classification.reason
  item.artifactPath = artifact.record ? artifact.path : null
  item.exitCode = result.code
  item.signal = result.signal
  item.stdout = truncateLog(result.stdout)
  item.stderr = truncateLog(result.stderr)
  item.finishedAt = new Date().toISOString()
  await persist(progress, progressPath)
  return { item, quota: quotaOutput(result) }
}

export async function runDriver(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const cases = await readCases(options.casesPath)
  if (cases.length === 0) throw new Error("cases vazio")
  const progressPath = join(options.outputDir, "progress.json")
  let progress
  if (await exists(progressPath)) progress = ensureProgressShape(JSON.parse(await readFile(progressPath, "utf8")), cases)
  else progress = initialProgress(cases)
  await persist(progress, progressPath)

  // O único skip permitido é uma prova nova do artefato completo. O estado
  // salvo no progress não é autoridade suficiente para pular uma dúvida.
  for (const candidate of cases) {
    const entry = progress.cases.find((item) => item.key === candidateKey(candidate))
    const artifact = await loadRecord(options, candidate)
    const currentFingerprint = candidateFingerprint(candidate)
    if (
      entry.status === "pass"
      && entry.caseFingerprint === currentFingerprint
      && entry.artifactPath === artifact.path
      && isPass(artifact.record, candidate)
    ) {
      entry.status = "pass"
      entry.reason = "Eval completo (retomado)"
      entry.artifactPath = artifact.path
    } else {
      // blocked e failed são reprocessáveis. O progress é histórico, não um
      // motivo para transformar uma dúvida numa conclusão permanente.
      const previousStatus = entry.status
      entry.status = "pending"
      entry.reason = previousStatus === "pass"
        ? "checkpoint ou artefato divergente; retomada fail-closed"
        : "retomada de caso nao concluido"
      entry.artifactPath = null
    }
  }
  await persist(progress, progressPath)

  const pending = cases.filter((candidate) => progress.cases.find((item) => item.key === candidateKey(candidate)).status === "pending")
  let cursor = 0
  let frozen = progress.quota.frozen === true
  const worker = async () => {
    while (!frozen) {
      const candidate = pending[cursor++]
      if (!candidate) return
      if (frozen) return
      const result = await processOne(options, candidate, progress, progressPath)
      if (result.quota) {
        frozen = true
        progress.quota = { frozen: true, reason: "quota/auth detectada", detectedAt: new Date().toISOString() }
        await persist(progress, progressPath)
      }
    }
  }
  const workers = Array.from({ length: Math.min(options.concurrency, pending.length) }, () => worker())
  await Promise.all(workers)
  if (frozen && progress.quota.frozen !== true) {
    progress.quota = { frozen: true, reason: "quota/auth detectada", detectedAt: new Date().toISOString() }
  }
  await persist(progress, progressPath)
  const counts = summary(progress)
  return { options, progress, counts, exitCode: counts.pending === 0 && counts.failed === 0 ? 0 : 1 }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runDriver().then((result) => {
    console.log(`REPROCESSAR_DUVIDAS ${JSON.stringify(result.counts)}`)
    process.exitCode = result.exitCode
  }).catch((error) => {
    console.error(redact(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  })
}
