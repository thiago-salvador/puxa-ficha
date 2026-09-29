import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

// Roda o script real com `gh` e `curl` falsos no PATH. Nunca fala com GitHub ou Vercel.
const SHA = "63b73ec97ab7fb7887254f3141dd1b2a4e62ffea"
const MERGE = "2026-09-28T20:48:42Z"
const MERGE_S = Date.parse(MERGE) / 1000

type Cenario = { agora: number; deploys: number; checks: number; carencia?: string }

function rodar({ agora, deploys, checks, carencia }: Cenario) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-vigia-"))
  try {
    writeFileSync(join(dir, "calls"), "")
    writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash
printf 'gh %s\\n' "$*" >> "$VIGIA_TEST_DIR/calls"
case "$*" in
  "api repos/example/puxa-ficha/commits/main --jq .sha") echo ${SHA} ;;
  "api repos/example/puxa-ficha/commits/${SHA} --jq .commit.committer.date") echo ${MERGE} ;;
  "run list"*) echo ${checks} ;;
  "workflow run"*) : ;;
  *) echo "gh inesperado: $*" >&2; exit 9 ;;
esac
`)
    writeFileSync(join(dir, "curl"), `#!/usr/bin/env bash
printf 'curl %s\\n' "$*" >> "$VIGIA_TEST_DIR/calls"
case "$*" in
  *"-X POST"*) echo '{"id":"dpl_novo"}' ;;
  *"/v6/deployments"*) echo '${JSON.stringify({ deployments: Array.from({ length: deploys }, () => ({})) })}' ;;
  *) echo "curl inesperado" >&2; exit 9 ;;
esac
`)
    chmodSync(join(dir, "gh"), 0o755)
    chmodSync(join(dir, "curl"), 0o755)
    const r = spawnSync("bash", ["scripts/deploy-vigia.sh"], {
      encoding: "utf8",
      env: {
        ...process.env, ...(carencia ? { VIGIA_CARENCIA_S: carencia } : {}), PATH: `${dir}:${process.env.PATH ?? ""}`, VIGIA_TEST_DIR: dir, VIGIA_AGORA: String(agora),
        GH_REPO: "example/puxa-ficha", VERCEL_TOKEN: "tok-teste-nao-imprimir", VERCEL_TEAM_ID: "team_x", VERCEL_PROJECT_ID: "prj_x",
      },
    })
    return { ...r, calls: readFileSync(join(dir, "calls"), "utf8") }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("vigia do deploy de produção", () => {
  it("dentro da carência não consulta a Vercel nem dispara nada", () => {
    const r = rodar({ agora: MERGE_S + 120, deploys: 0, checks: 0 })
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.calls, /curl|workflow run/)
  })

  it("merge sem deploy e sem smoke: cria o deploy do SHA e dispara o check", () => {
    const r = rodar({ agora: MERGE_S + 600, deploys: 0, checks: 0 })
    assert.equal(r.status, 0, r.stderr)
    const post = r.calls.split("\n").find((l) => l.includes("-X POST")) ?? ""
    assert.match(post, /v13\/deployments\?teamId=team_x/)
    assert.match(post, new RegExp(`"sha":"${SHA}"`))
    assert.match(post, /"target":"production"/)
    assert.match(r.calls, new RegExp(`gh workflow run production-deployment-check.yml --ref main -f sha=${SHA}`))
    assert.match(r.stdout, /2 acao\(oes\)/)
    assert.doesNotMatch(r.stdout + r.stderr, /tok-teste-nao-imprimir/)
  })

  it("deploy e smoke já existem: não age", () => {
    const r = rodar({ agora: MERGE_S + 600, deploys: 1, checks: 1 })
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.calls, /-X POST|workflow run/)
    assert.match(r.stdout, /0 acao\(oes\)/)
  })

  it("só o smoke faltando: dispara o check sem criar deploy novo", () => {
    const r = rodar({ agora: MERGE_S + 600, deploys: 1, checks: 0 })
    assert.equal(r.status, 0, r.stderr)
    assert.doesNotMatch(r.calls, /-X POST/)
    assert.match(r.calls, /workflow run production-deployment-check.yml/)
  })

  it("workflow: agendado, permissões mínimas e segredos só no passo", () => {
    const wf = readFileSync(".github/workflows/deploy-vigia.yml", "utf8")
    assert.match(wf, /cron: "\*\/15 \* \* \* \*"/)
    assert.match(wf, /permissions:\n  actions: write\n  contents: read\n\n/)
    assert.match(wf, /persist-credentials: false/)
    const antesDosSteps = wf.slice(0, wf.indexOf("steps:"))
    assert.doesNotMatch(antesDosSteps, /secrets\./)
  })

  it("workflow: roda também em PR com merge, sem cancelar execuções em andamento", () => {
    const wf = readFileSync(".github/workflows/deploy-vigia.yml", "utf8")
    assert.match(wf, /workflow_dispatch:/)
    assert.match(wf, /pull_request:\n    types: \[closed\]\n    branches: \[main\]/)
    assert.match(wf, /github\.event_name != 'pull_request' \|\|/)
    assert.match(wf, /github\.event\.pull_request\.merged == true/)
    assert.match(wf, /concurrency:\n  group: deploy-vigia\n  cancel-in-progress: false/)
    assert.match(wf, /if: github\.event_name == 'pull_request'\n        run: sleep 180/)
    assert.match(wf, /ref: \$\{\{ github\.event_name == 'pull_request' && 'main' \|\| github\.ref \}\}/)
    assert.match(wf, /VIGIA_CARENCIA_S: \$\{\{ github\.event_name == 'pull_request' && '120' \|\| '300' \}\}/)
    assert.doesNotMatch(wf, /pull_request\.head\.sha/)
  })

  it("após a espera de 180 s do caminho de PR, a carência de 120 s deixa o vigia agir", () => {
    const r = rodar({ agora: MERGE_S + 190, deploys: 1, checks: 1, carencia: "120" })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /0 acao\(oes\)/)
    assert.match(r.calls, /\/v6\/deployments/)
  })
})
