import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"

const workflowPath = ".github/workflows/apply-master-review-remediation-production.yml"

function loadWorkflow() {
  assert.ok(existsSync(workflowPath), "workflow guardado do master review deve existir")
  return parse(readFileSync(workflowPath, "utf8"))
}

test("master review só admite dispatch manual, SHA fechado e modos limitados, sem rollback", () => {
  const workflow = loadWorkflow()
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"])
  const inputs = workflow.on.workflow_dispatch.inputs
  assert.deepEqual(Object.keys(inputs).sort(), ["expected_sha", "mode"])
  assert.equal(inputs.expected_sha.required, true)
  assert.equal(inputs.expected_sha.type, "string")
  assert.equal(inputs.mode.type, "choice")
  assert.equal(inputs.mode.required, true)
  assert.equal(inputs.mode.default, "dry-run")
  assert.deepEqual(inputs.mode.options, ["dry-run", "apply", "verify"])
  assert.deepEqual(workflow.permissions, { contents: "read" })
  assert.deepEqual(workflow.concurrency, { group: "production-db-migrations", "cancel-in-progress": false })
  assert.deepEqual(Object.keys(workflow.jobs), ["apply"])
  const job = workflow.jobs.apply
  assert.equal(job.if, "github.ref == 'refs/heads/main'")
  assert.equal(job.environment, "production")
  assert.equal(job["runs-on"], "ubuntu-latest")
  assert.equal(job["timeout-minutes"], 25)
  assert.equal(job.env.PF_EXPECTED_SHA, "${{ inputs.expected_sha }}")
  assert.equal(job.env.GITHUB_REF, "${{ github.ref }}")
})

test("guardas executadas rejeitam SHA diferente, ref diferente, SHA malformado e rollback", () => {
  const steps = loadWorkflow().jobs.apply.steps
  const guard = steps[0]
  assert.equal(guard.env.DISPATCH_SHA, "${{ github.sha }}")
  assert.equal(guard.env.REMEDIATION_MODE, "${{ inputs.mode }}")
  const sha = "a".repeat(40)
  const context = { GITHUB_REF: "refs/heads/main", PF_EXPECTED_SHA: sha, DISPATCH_SHA: sha, REMEDIATION_MODE: "dry-run" }
  for (const mode of ["dry-run", "apply", "verify"]) {
    const result = spawnSync("bash", ["-c", guard.run], { env: { ...process.env, ...context, REMEDIATION_MODE: mode }, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
  }
  for (const changed of [
    { GITHUB_REF: "refs/heads/feature" },
    { DISPATCH_SHA: "b".repeat(40) },
    { PF_EXPECTED_SHA: "a".repeat(7) },
    { REMEDIATION_MODE: "rollback" },
    { REMEDIATION_MODE: "apply; echo unsafe" },
    { REMEDIATION_MODE: "" },
  ]) {
    const result = spawnSync("bash", ["-c", guard.run], { env: { ...process.env, ...context, ...changed }, encoding: "utf8" })
    assert.notEqual(result.status, 0, JSON.stringify(changed))
  }
})

test("PG17 canônico prova o pacote antes do único passo com secret e driver remoto", () => {
  const workflow = loadWorkflow()
  const steps = workflow.jobs.apply.steps
  const checkout = steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/checkout@"))
  assert.match(checkout.uses, /^actions\/checkout@[a-f0-9]{40}$/)
  assert.deepEqual(checkout.with, { ref: "${{ inputs.expected_sha }}", "persist-credentials": false })
  const node = steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/setup-node@"))
  assert.match(node.uses, /^actions\/setup-node@[a-f0-9]{40}$/)
  assert.equal(node.with["node-version"], 24)
  const install = steps.findIndex((step: { run?: string }) => step.run === "npm ci")
  const pg = steps.findIndex((step: { uses?: string }) => step.uses === "./.github/actions/install-postgresql-client-17")
  const proof = steps.findIndex((step: { run?: string }) => step.run === "bash scripts/audit/provar-master-review-remediation-pg17.sh")
  const remote = steps.findIndex((step: { run?: string }) => step.run === 'bash scripts/audit/apply-master-review-remediation-production.sh "$REMEDIATION_MODE"')
  assert.ok(install >= 0 && pg > install && proof > pg && remote > proof)
  assert.equal(remote, steps.length - 1)
  assert.equal(steps[remote].env.PF_DATABASE_URL, "${{ secrets.SUPABASE_DB_URL }}")
  assert.equal(steps[remote].env.REMEDIATION_MODE, "${{ inputs.mode }}")
  assert.equal((JSON.stringify(workflow).match(/secrets\./g) ?? []).length, 1)
  assert.equal((JSON.stringify(workflow).match(/SUPABASE_DB_URL/g) ?? []).length, 1)
  assert.doesNotMatch(JSON.stringify(workflow), /continue-on-error|always\(\)|supabase db push|apply_migration/)
})
