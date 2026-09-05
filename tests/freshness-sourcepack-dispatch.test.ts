// Temporary branch-dispatch contract; remove with the diagnostic workflow job after artifact readback.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"

test("diagnóstico fechado no branch não recebe secrets nem executa auditoria remota", () => {
  const workflow = parse(readFileSync(".github/workflows/data-freshness-audit.yml", "utf8"))
  const job = workflow.jobs.sourcepack
  assert.ok(job, "job diagnóstico readonly deve existir")
  assert.equal(job.if, "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/codex/freshness-closeout'")
  assert.equal(workflow.jobs.auditar.if, "github.ref != 'refs/heads/codex/freshness-closeout'")
  assert.match(workflow.jobs.notificar.if, /github.ref == 'refs\/heads\/main'/)
  assert.deepEqual(job.permissions, { contents: "read" })
  assert.equal(job["timeout-minutes"], 20)
  assert.doesNotMatch(JSON.stringify(job), /secrets\.|SUPABASE|VERCEL|issues:|write|psql|revalidate/)
  const upload = job.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/upload-artifact@"))
  assert.equal(upload.if, "always()")
  assert.equal(upload.with.path, "reports/freshness-closeout-sourcepack/")
  assert.equal(upload.with["if-no-files-found"], "error")
  const collect = job.steps.findIndex((step: { run?: string }) => step.run === "node --import tsx scripts/audit/collect-freshness-closeout-sourcepack.ts")
  const tests = job.steps.findIndex((step: { run?: string }) => step.run === "node --import tsx --test tests/freshness-closeout-sourcepack.test.ts tests/freshness-sourcepack-dispatch.test.ts")
  assert.ok(tests >= 0 && collect > tests)
})
