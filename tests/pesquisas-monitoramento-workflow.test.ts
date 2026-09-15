import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")

function job(name: string, nextName?: string): string {
  const start = workflow.indexOf(`  ${name}:`)
  assert.notEqual(start, -1, `job ausente: ${name}`)
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length
  assert.notEqual(end, -1, `job seguinte ausente: ${nextName}`)
  return workflow.slice(start, end)
}

test("workflow publica por padrão no cron e permite diagnóstico manual", () => {
  assert.match(workflow, /^\s*workflow_dispatch:/m)
  assert.match(workflow, /publish:\n[\s\S]*?type: boolean\n\s+default: true[\s\S]*?^  schedule:/m)
  assert.equal((workflow.match(/^  schedule:/gm) ?? []).length, 1)
  assert.match(workflow, /cron:\s*"17 10 \* \* \*"/)
  assert.match(workflow, /github\.event_name == 'schedule' \|\| inputs\.publish == true/)
  assert.match(workflow, /concurrency:\n\s+group:\s*pesquisas-monitoramento-/)
  assert.match(workflow, /cancel-in-progress:\s*false/)
})

test("matriz cobre fonte e UF e consolida depois de todas as coletas", () => {
  const prepare = job("preparar-matriz", "coletar")
  const collect = job("coletar", "consolidar")
  const consolidate = job("consolidar", "promover")
  assert.match(prepare, /pesquisas:atualizacao:matrix/)
  assert.match(prepare, /monitor_source_id/)
  assert.match(prepare, /monitor_uf/)
  assert.match(collect, /needs:\s*preparar-matriz/)
  assert.match(collect, /fail-fast:\s*false/)
  assert.match(collect, /max-parallel:\s*4/)
  assert.match(collect, /fromJSON\(needs\.preparar-matriz\.outputs\.matrix\)\.include/)
  assert.match(consolidate, /if:\s*always\(\)/)
  assert.match(consolidate, /- preparar-matriz/)
  assert.match(consolidate, /- coletar/)
  assert.match(consolidate, /pesquisas:atualizacao:consolidate/)
})

test("coleta e consolidação não recebem credencial persistida ou permissão de escrita", () => {
  for (const name of ["preparar-matriz", "coletar", "consolidar"]) {
    const section = job(name, name === "preparar-matriz" ? "coletar" : name === "coletar" ? "consolidar" : "promover")
    assert.match(section, /permissions:\n\s+contents:\s*read/)
    assert.match(section, /persist-credentials:\s*false/)
    assert.doesNotMatch(section, /contents:\s*write|pull-requests:\s*write|GH_TOKEN|github\.token|secrets\./)
  }
})

test("publicação concentra os segredos e exige operação validada", () => {
  const promote = job("promover")
  assert.equal((workflow.match(/contents:\s*write/g) ?? []).length, 1)
  assert.equal((workflow.match(/pull-requests:\s*write/g) ?? []).length, 1)
  assert.match(promote, /needs\.consolidar\.outputs\.promotion_authorized == 'true'/)
  assert.match(promote, /needs\.consolidar\.outputs\.operation_status == 'no_changes'/)
  assert.match(promote, /MERGE_QUEUE_GH_TOKEN:\s*\$\{\{ secrets\.MERGE_QUEUE_GH_TOKEN \}\}/)
  assert.match(promote, /VERCEL_AUTOMATION_BYPASS_SECRET:/)
  assert.match(promote, /POLL_BASE_SHA:\s*\$\{\{ github\.sha \}\}/)
  assert.match(promote, /POLL_RUN_ID:\s*\$\{\{ github\.run_id \}\}/)
  assert.match(promote, /publicar\.mjs/)
  assert.doesNotMatch(promote, /PESQUISAS_DRAFT_PR_ENABLED|create_draft_pr|--draft/)
})

test("promoção segue escopo, autor, merge condicionado ao SHA e prova pública", () => {
  const promote = job("promover")
  assert.match(promote, /timeout-minutes:\s*40/)
  assert.match(promote, /npx playwright install --with-deps chromium chrome webkit/)
  assert.match(workflow, /contents:\s*write\n\s+pull-requests:\s*write/)
  const helper = readFileSync("scripts/pesquisas-atualizacao-agendada/publicar.mjs", "utf8")
  assert.match(helper, /POLL_BRANCH_PREFIX = "codex\/pesquisas-refresh-"/)
  assert.match(helper, /--match-head-commit/)
  assert.match(helper, /gh", \["auth", "setup-git"\]/)
  assert.match(helper, /update-branch/)
  assert.match(helper, /validatePrCatalogContent/)
  assert.match(helper, /latestCheckResults/)
  assert.match(helper, /main mudou depois dos smokes/)
  assert.match(helper, /runReleaseSmokes/)
  assert.match(helper, /proveDeployment/)
  assert.match(helper, /validateChangedFiles/)
  assert.doesNotMatch(workflow, /git\s+merge|--force(?:-with-lease)?/)
  assert.match(workflow, /upload-artifact@[a-f0-9]{40}/)
  assert.match(workflow, /download-artifact@[a-f0-9]{40}/)
})

test("descoberta preserva diagnóstico de cobertura sem bloquear operações válidas", () => {
  const prepare = job("preparar-matriz", "coletar")
  const consolidate = job("consolidar", "promover")
  assert.match(prepare, /monitor:pesquisas:descoberta/)
  assert.match(prepare, /name: pesquisas-descoberta-/)
  assert.match(consolidate, /--discovery=reports\/discovery\/discovery\.json/)
})

console.log("MONITORAMENTO_WORKFLOW_PASS")
