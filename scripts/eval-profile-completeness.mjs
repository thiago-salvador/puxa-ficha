import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CASES_PATH = resolve(ROOT, "evals/profile-completeness/cases.jsonl")
const REFERENCE_PATH = resolve(ROOT, "evals/profile-completeness/reference-results.jsonl")
const EVIDENCE_KINDS = new Set(["api", "dom", "email", "git", "github", "screenshot", "source", "sql", "vercel"])

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`${path}:${index + 1}: JSON inválido: ${error.message}`)
      }
    })
}

function validateCases(cases) {
  const failures = []
  const ids = new Set()

  if (cases.length < 20 || cases.length > 50) {
    failures.push(`golden set deve ter entre 20 e 50 casos; recebeu ${cases.length}`)
  }

  for (const item of cases) {
    if (!item.id || ids.has(item.id)) failures.push(`id ausente ou duplicado: ${item.id ?? "<vazio>"}`)
    ids.add(item.id)
    if (!item.source_ref || /synthetic|sintetic/i.test(item.source_ref)) {
      failures.push(`${item.id}: source_ref real obrigatório`)
    }
    if (!item.owner) failures.push(`${item.id}: owner obrigatório`)
    if (!Array.isArray(item.required_assertions) || item.required_assertions.length === 0) {
      failures.push(`${item.id}: required_assertions obrigatório`)
    }
    if (!Array.isArray(item.required_evidence) || item.required_evidence.length === 0) {
      failures.push(`${item.id}: required_evidence obrigatório`)
    } else {
      for (const kind of item.required_evidence) {
        if (!EVIDENCE_KINDS.has(kind)) failures.push(`${item.id}: evidence kind inválido: ${kind}`)
      }
    }
  }

  return failures
}

function grade(cases, results, { allowReference = false } = {}) {
  const failures = []
  const resultById = new Map()

  for (const result of results) {
    if (!result.case_id || resultById.has(result.case_id)) {
      failures.push(`resultado ausente ou duplicado: ${result.case_id ?? "<vazio>"}`)
      continue
    }
    resultById.set(result.case_id, result)
  }

  for (const item of cases) {
    const result = resultById.get(item.id)
    if (!result) {
      failures.push(`${item.id}: resultado ausente`)
      continue
    }
    if (result.owner !== item.owner) failures.push(`${item.id}: owner esperado ${item.owner}, recebeu ${result.owner}`)
    if (result.verdict !== "pass") failures.push(`${item.id}: verdict precisa ser pass, recebeu ${result.verdict}`)

    const assertions = new Set(Array.isArray(result.assertions) ? result.assertions : [])
    for (const assertion of item.required_assertions) {
      if (!assertions.has(assertion)) failures.push(`${item.id}: asserção ausente ${assertion}`)
    }

    const evidence = Array.isArray(result.evidence) ? result.evidence : []
    const evidenceKinds = new Set(evidence.map((entry) => entry?.kind))
    for (const kind of item.required_evidence) {
      if (!evidenceKinds.has(kind)) failures.push(`${item.id}: evidência ausente ${kind}`)
    }
    for (const entry of evidence) {
      if (!EVIDENCE_KINDS.has(entry?.kind)) failures.push(`${item.id}: evidência inválida ${entry?.kind}`)
      if (typeof entry?.locator !== "string" || entry.locator.length === 0) {
        failures.push(`${item.id}: locator de evidência obrigatório`)
      }
      if (!allowReference && entry?.locator?.startsWith("reference://")) {
        failures.push(`${item.id}: evidência de referência não vale em execução real`)
      }
      if (!allowReference && typeof entry?.locator === "string" && !entry.locator.startsWith("reference://")) {
        if (!entry.locator.startsWith("/")) {
          failures.push(`${item.id}: locator real precisa ser caminho absoluto`)
        } else if (!existsSync(entry.locator)) {
          failures.push(`${item.id}: artefato de evidência não existe: ${entry.locator}`)
        } else if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
          failures.push(`${item.id}: sha256 obrigatório para evidência real`)
        } else {
          const actualHash = createHash("sha256").update(readFileSync(entry.locator)).digest("hex")
          if (actualHash !== entry.sha256) failures.push(`${item.id}: sha256 diverge para ${entry.locator}`)
        }
      }
    }
  }

  for (const id of resultById.keys()) {
    if (!cases.some((item) => item.id === id)) failures.push(`${id}: caso extra nos resultados`)
  }

  return failures
}

function printVerdict(label, failures) {
  if (failures.length === 0) {
    console.log(`PASS ${label}`)
    return
  }
  console.error(`FAIL ${label}`)
  for (const failure of failures) console.error(`  ${failure}`)
}

const cases = readJsonl(CASES_PATH)
const caseFailures = validateCases(cases)
if (caseFailures.length > 0) {
  printVerdict("schema do golden set", caseFailures)
  process.exit(1)
}

if (process.argv.includes("--self-test")) {
  const reference = readJsonl(REFERENCE_PATH)
  const referenceFailures = grade(cases, reference, { allowReference: true })
  printVerdict("solução de referência", referenceFailures)
  if (referenceFailures.length > 0) process.exit(1)

  const referenceAsRealFailures = grade(cases, reference)
  if (referenceAsRealFailures.length === 0) {
    console.error("FAIL evidência de referência foi aceita como evidência real")
    process.exit(1)
  }
  console.log(`PASS evidência de referência rejeitada no modo real (${referenceAsRealFailures.length} falhas esperadas)`)

  const tempDir = mkdtempSync(resolve(tmpdir(), "puxaficha-eval-"))
  try {
    const evidencePath = resolve(tempDir, "evidence.json")
    writeFileSync(evidencePath, JSON.stringify({ reference: true }))
    const evidenceHash = createHash("sha256").update(readFileSync(evidencePath)).digest("hex")
    const materialized = structuredClone(reference)
    for (const result of materialized) {
      for (const entry of result.evidence) {
        entry.locator = evidencePath
        entry.sha256 = evidenceHash
      }
    }
    const materializedFailures = grade(cases, materialized)
    printVerdict("solução de referência materializada", materializedFailures)
    if (materializedFailures.length > 0) process.exit(1)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }

  const perturbed = structuredClone(reference)
  perturbed[0].verdict = "fail"
  const perturbationFailures = grade(cases, perturbed, { allowReference: true })
  if (perturbationFailures.length === 0) {
    console.error("FAIL perturbação deliberada não foi detectada")
    process.exit(1)
  }
  console.log(`PASS perturbação detectada (${perturbationFailures.length} falha esperada)`)
  console.log(`PASS self-test ${cases.length}/${cases.length} casos`)
  process.exit(0)
}

const resultsArg = process.argv.find((arg) => arg.startsWith("--results="))
if (!resultsArg) {
  console.error("Uso: node scripts/eval-profile-completeness.mjs --results=/caminho/resultados.jsonl")
  process.exit(1)
}

const resultsPath = resolve(resultsArg.slice("--results=".length))
const failures = grade(cases, readJsonl(resultsPath))
printVerdict(`${cases.length} casos do golden set`, failures)
process.exit(failures.length === 0 ? 0 : 1)
