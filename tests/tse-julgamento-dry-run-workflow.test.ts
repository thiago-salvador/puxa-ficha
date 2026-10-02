import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const workflow = readFileSync(join(process.cwd(), ".github/workflows/tse-julgamento-dry-run.yml"), "utf8")

test("workflow de julgamento só despacha em main com SHA esperado ainda no topo remoto", () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /expected_sha:/)
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
  assert.match(workflow, /test "\$PF_EXPECTED_SHA" = "\$DISPATCH_SHA"/)
  assert.match(workflow, /git ls-remote origin refs\/heads\/main/)
  assert.match(workflow, /test "\$remote_sha" = "\$PF_EXPECTED_SHA"/)
  assert.match(workflow, /ref: \$\{\{ github\.event\.inputs\.expected_sha \}\}/)
  assert.doesNotMatch(workflow, /pull_request:|workflow_call:/)
})

test("workflow oferece coortes fechadas em modo somente leitura", () => {
  assert.match(workflow, /export PF_INGEST_SLUGS=tse-2026-100002553336/)
  assert.match(workflow, /cinco-issue646/)
  assert.match(workflow, /publicadas/)
  assert.doesNotMatch(workflow, /schedule:/)
  assert.match(workflow, /scripts\/ingest-tse-julgamento\.ts \\\n\s+--dry-run/)
  assert.match(workflow, /report\.persisted !== 0/)
  assert.match(workflow, /summary\.bloqueados > 0/)
  assert.doesNotMatch(workflow, /--apply|mode:\s*apply|supabase (?:db push|migration)|\.\/scripts\/audit\/apply-/i)
})

test("credenciais só aparecem depois da instalação e o resumo usa campos permitidos", () => {
  assert.equal((workflow.match(/secrets\.SUPABASE_URL/g) ?? []).length, 1)
  assert.equal((workflow.match(/secrets\.SUPABASE_SERVICE_ROLE_KEY/g) ?? []).length, 1)
  assert.ok(workflow.indexOf("secrets.SUPABASE_URL") > workflow.indexOf("npm ci --ignore-scripts"))
  assert.match(workflow, /umask 077/)
  assert.match(workflow, /chmod 700/)
  assert.match(workflow, /snapshot_sha:/)
  assert.match(workflow, /persisted: 0/)
  assert.doesNotMatch(workflow, /cpf|nome_completo|entries/)
})

const scriptMatch = workflow.match(/\n          node - "\$raw_output" "\$private_dir" <<'NODE'\n([\s\S]*?)\n          NODE/)
const embeddedScript = scriptMatch?.[1]
if (!embeddedScript) throw new Error("O validador embutido do resumo não foi encontrado")
const script = embeddedScript.split("\n").map((line) => line.slice(10)).join("\n")

type SummaryFixture = {
  outputCounts?: number[]
  reportCounts?: number[]
  persisted?: number
  outputSha?: string
  reportSha?: string
  expectedCount?: string
  envelopeSha?: string
}

function runSummaryFixture({ expectedCount = "1", outputCounts = [1, 0, 1, 0], reportCounts = outputCounts, persisted = 0, outputSha = "a".repeat(64), reportSha = outputSha, envelopeSha = reportSha }: SummaryFixture = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pf-julgamento-workflow-test-"))
  try {
    const snapshotDir = join(dir, "private")
    const summaryPath = join(dir, "step-summary.md")
    const outputPath = join(dir, "stdout.json")
    const scriptPath = join(dir, "summary.cjs")
    const fields = ["coorte", "conferem", "propostos", "bloqueados"]
    const reportSummary = Object.fromEntries(fields.map((key, i) => [key, reportCounts[i]]))
    const outputSummary = Object.fromEntries(fields.map((key, i) => [key, outputCounts[i]]))

    mkdirSync(snapshotDir)
    writeFileSync(summaryPath, "")
    writeFileSync(join(snapshotDir, "snapshot.json"), JSON.stringify({ sha256: envelopeSha, snapshot: { versao: 1, coorte: [{ cpf: "nao-publicar" }] } }))
    writeFileSync(join(snapshotDir, "dry-run.json"), JSON.stringify({ snapshot_sha256: reportSha, dry_run: true, persisted, summary: reportSummary, entries: [{ cpf: "nao-publicar" }] }))
    writeFileSync(outputPath, JSON.stringify({ dry_run: true, snapshot_sha256: outputSha, ...outputSummary }))
    writeFileSync(scriptPath, script)

    const result = spawnSync(process.execPath, [scriptPath, outputPath, snapshotDir], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath, PF_EXPECTED_COHORT_COUNT: expectedCount },
      encoding: "utf8",
    })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, stepSummary: readFileSync(summaryPath, "utf8") }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("validador aceita resultado conferido ou proposto e publica somente o resumo saneado", () => {
  for (const counts of [[1, 1, 0, 0], [1, 0, 1, 0]]) {
    const result = runSummaryFixture({ outputCounts: counts })
    assert.equal(result.status, 0, result.stderr)
    const summary = JSON.parse(result.stdout)
    assert.deepEqual(Object.keys(summary), ["versao", "snapshot_sha", "coorte", "conferem", "propostos", "bloqueados", "persisted"])
    assert.equal(summary.snapshot_sha, "a".repeat(64))
    assert.equal(summary.persisted, 0)
    assert.equal(result.stepSummary, `${JSON.stringify(summary)}\n`)
    assert.doesNotMatch(result.stdout, /cpf|nao-publicar|entries|\/private\//)
  }
})

test("validador falha fechado em persistência, bloqueio, escopo, contagens e hashes divergentes", () => {
  const failures = [
    { persisted: 1 },

    { outputCounts: [2, 0, 2, 0] },
    { outputCounts: [1, 0, 1.5, 0] },
    { outputCounts: [1, -1, 2, 0] },
    { outputCounts: [1, 0, 1, 0], reportCounts: [1, 1, 0, 0] },
    { outputCounts: [1, 0, 1, 0], envelopeSha: "b".repeat(64) },
  ]
  for (const fixture of failures) {
    const result = runSummaryFixture(fixture)
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout, "")
    assert.equal(result.stepSummary, "")
  }
})

test("coortes de cinco e completa conservam contagens e bloqueios deixam resumo revisável", () => {
  assert.equal(runSummaryFixture({ expectedCount: "5", outputCounts: [5, 0, 5, 0] }).status, 0)
  assert.equal(runSummaryFixture({ expectedCount: "all", outputCounts: [200, 198, 1, 1] }).status, 2)
  const blocked = runSummaryFixture({ outputCounts: [1, 0, 0, 1] })
  assert.equal(blocked.status, 2)
  assert.equal(JSON.parse(blocked.stdout).bloqueados, 1)
})
