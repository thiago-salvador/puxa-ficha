import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, describe, it } from "node:test"

const root = process.cwd()
const workflow = readFileSync(join(root, ".github/workflows/cron-watchdog.yml"), "utf8")
const script = readFileSync(join(root, "scripts/cron-watchdog.sh"), "utf8")
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
  crons: Array<{ path: string; schedule: string }>
}

function executable(path: string, source: string) {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function runWatchdog(opts: {
  httpCode: string
  body: string
  cronSecret?: string
  origin?: string
}) {
  const fixture = mkdtempSync(join(tmpdir(), "pf-watchdog-"))
  const bin = join(fixture, "bin")
  const calls = join(fixture, "calls.log")
  spawnSync("mkdir", ["-p", bin], { encoding: "utf8" })
  writeFileSync(calls, "")

  executable(
    join(bin, "gh"),
    `#!/bin/bash
set -euo pipefail
printf 'gh:%s\\n' "$*" >> "$PF_FIXTURE_CALLS"
if [[ "$1" == "api" ]]; then
  if [[ "$*" == *"/issues"* ]]; then
    printf '%s\\n' '[]'
    exit 0
  fi
  if [[ "$*" == *"/runs"* ]]; then
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '{"workflow_runs":[{"conclusion":"success","id":99,"html_url":"https://example.test/run/99","updated_at":"%s","created_at":"%s"}]}\\n' "$now" "$now"
    exit 0
  fi
  if [[ "$*" == *"/actions/workflows/"* ]]; then
    printf '%s\\n' '{"name":"fake-workflow","created_at":"2026-01-01T00:00:00Z","html_url":"https://example.test/workflow"}'
    exit 0
  fi
fi
echo "unexpected gh: $*" >&2
exit 1
`,
  )

  executable(
    join(bin, "curl"),
    `#!/bin/bash
set -euo pipefail
printf 'curl:%s\\n' "$*" >> "$PF_FIXTURE_CALLS"
output=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    -w|--max-time) shift 2 ;;
    -H) shift 2 ;;
    -sS|-s|-S) shift ;;
    *) shift ;;
  esac
done
printf '%s\\n' "$PF_FAKE_CURL_BODY" > "$output"
printf '%s' "$PF_FAKE_CURL_CODE"
`,
  )

  const result = spawnSync("bash", [join(root, "scripts/cron-watchdog.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      PF_FIXTURE_CALLS: calls,
      PF_FAKE_CURL_BODY: opts.body,
      PF_FAKE_CURL_CODE: opts.httpCode,
      WATCHDOG_DRY_RUN: "1",
      CRON_SECRET: opts.cronSecret ?? "test-cron-secret",
      PF_RUNTIME_SMOKE_ORIGIN: opts.origin ?? "https://puxaficha.com.br",
      GH_REPO: "thiago-salvador/puxa-ficha",
    },
  })

  return {
    fixture,
    calls: readFileSync(calls, "utf8"),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  }
}

describe("watchdog de crons", () => {
  it("roda diariamente às 08:00 UTC e também manualmente", () => {
    assert.match(workflow, /cron: "0 8 \* \* \*"/)
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /timeout-minutes: 10/)
  })

  it("tem permissões mínimas para ler runs e escrever issues", () => {
    assert.match(workflow, /actions: read/)
    assert.match(workflow, /contents: read/)
    assert.match(workflow, /issues: write/)
  })

  it("documenta a limitação de inatividade de 60 dias", () => {
    assert.match(workflow, /60 dias de inatividade/)
    assert.match(workflow, /repositório deve assisti-lo/)
  })

  it("deduplica por workflow e inclui link da execução", () => {
    assert.match(script, /cron-watchdog-workflow:/)
    assert.match(script, /contains\(\$marker\)/)
    assert.match(script, /\[\$\{run_id\}\]\(\$\{run_url\}\)/)
    assert.match(script, /issues\/\$\{existing\}\/comments/)
  })

  it("aplica carência de oito dias e nunca denuncia a si próprio", () => {
    assert.match(script, /WATCHDOG_GRACE_DAYS:-8/)
    assert.match(script, /workflow_created_at/)
    assert.match(script, /run_completed_at/)
    assert.match(script, /run_age_days.*GRACE_DAYS/)
    assert.match(script, /SELF_FILE="cron-watchdog\.yml"/)
  })

  it("tem dry-run que não cria label, issue ou comentário", () => {
    assert.match(script, /WATCHDOG_DRY_RUN:-0/)
    assert.match(script, /if \[\[ "\$DRY_RUN" == "1" \]\]/)
  })

  it("rerun posterior em verde cancela o alarme do cron vermelho", () => {
    assert.match(script, /status=completed -f per_page=1/)
    assert.match(script, /cron \$\{conclusion\} mas rerun \$\{latest_id\} em verde/)
    assert.match(script, /latest_conclusion.*success/)
  })

  it("lê vercel.json e declara a mesma quantidade de crons", () => {
    assert.equal(vercel.crons.length, 6)
    assert.match(script, /vercel\.json/)
    assert.match(script, /vercel_crons_declarados=/)
    assert.match(script, /jq '\.crons \| length' vercel\.json/)
  })

  it("o workflow passa CRON_SECRET e o script sonda runtime-smoke com Bearer", () => {
    assert.ok(workflow.includes("CRON_SECRET: ${{ secrets.CRON_SECRET }}"))
    assert.match(script, /\/api\/internal\/runtime-smoke/)
    assert.match(script, /Authorization: Bearer \$\{CRON_SECRET\}/)
    assert.match(script, /PF_RUNTIME_SMOKE_ORIGIN/)
  })

  it("falha do runtime-smoke reusa publish_anomaly", () => {
    const probe = script.slice(script.indexOf("probe_runtime_smoke()"))
    assert.match(probe, /publish_anomaly "runtime-smoke"/)
    assert.match(probe, /vercel\.json/)
  })
})

describe("watchdog dry-run com curl mockado", () => {
  const fixtures: string[] = []

  after(() => {
    for (const dir of fixtures) rmSync(dir, { recursive: true, force: true })
  })

  it("HTTP 500 com ok false gera issue via machinery existente", () => {
    const run = runWatchdog({
      httpCode: "500",
      body: JSON.stringify({ ok: false, failed: [{ name: "home" }], total: 1 }),
    })
    fixtures.push(run.fixture)
    const output = `${run.stdout}\n${run.stderr}`
    assert.equal(run.status, 0, output)
    assert.match(output, /vercel_crons_declarados=6/)
    assert.match(output, /vercel-cron: \/api\/internal\/runtime-smoke/)
    assert.match(output, /WATCHDOG DRY-RUN/)
    assert.match(output, /ação: criar issue/)
    assert.match(output, /\[cron-failure\] runtime-smoke/)
    assert.match(output, /HTTP 500, ok=false/)
    assert.match(output, /cron-watchdog-workflow:runtime-smoke/)
    assert.match(output, /anomalias_detectadas=1/)
    assert.match(run.calls, /\/api\/internal\/runtime-smoke/)
    assert.match(run.calls, /Authorization: Bearer test-cron-secret/)
    assert.doesNotMatch(output, /test-cron-secret/)
  })

  it("HTTP 200 com ok true não abre issue de runtime-smoke", () => {
    const run = runWatchdog({
      httpCode: "200",
      body: JSON.stringify({ ok: true, total: 6, results: [] }),
    })
    fixtures.push(run.fixture)
    const output = `${run.stdout}\n${run.stderr}`
    assert.equal(run.status, 0, output)
    assert.match(output, /ok: runtime-smoke/)
    assert.doesNotMatch(output, /\[cron-failure\] runtime-smoke/)
    assert.match(output, /anomalias_detectadas=0/)
  })

  it("HTTP 200 com ok false também abre issue", () => {
    const run = runWatchdog({
      httpCode: "200",
      body: JSON.stringify({ ok: false, failed: [{ name: "candidate" }], total: 6 }),
    })
    fixtures.push(run.fixture)
    const output = `${run.stdout}\n${run.stderr}`
    assert.equal(run.status, 0, output)
    assert.match(output, /ação: criar issue/)
    assert.match(output, /HTTP 200, ok=false/)
  })

  it("CRON_SECRET ausente abre issue sem chamar curl", () => {
    const run = runWatchdog({
      httpCode: "200",
      body: JSON.stringify({ ok: true, total: 6 }),
      cronSecret: "",
    })
    fixtures.push(run.fixture)
    const output = `${run.stdout}\n${run.stderr}`
    assert.equal(run.status, 0, output)
    assert.match(output, /ação: criar issue/)
    assert.match(output, /CRON_SECRET ausente/)
    assert.doesNotMatch(run.calls, /^curl:/m)
  })
})
