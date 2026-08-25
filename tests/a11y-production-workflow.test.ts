import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { parse } from "yaml"

const ROOT = process.cwd()
const workflowText = readFileSync(join(ROOT, ".github/workflows/a11y-producao.yml"), "utf8")
const workflow = parse(workflowText) as {
  on?: Record<string, unknown>
  concurrency?: unknown
  jobs?: {
    a11y?: {
      if?: string
      concurrency?: { group?: string; "cancel-in-progress"?: boolean }
      "timeout-minutes"?: number
      steps?: Array<Record<string, unknown>>
    }
  }
}

type EventCase = {
  id: string
  kind: "event"
  state: string
  environment: string
  expected: boolean
}

type StructureCase = {
  id: string
  kind: "structure"
  check:
    | "trigger"
    | "job-if"
    | "concurrency"
    | "job-timeout"
    | "readback-first"
    | "poll-curl"
    | "diagnostic-curl"
    | "jq-contract"
    | "checkout-ref"
    | "deadline"
  expected: boolean
}

const cases = readFileSync(join(ROOT, "tests/fixtures/a11y-production-workflow-cases.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as EventCase | StructureCase)

function eventAllowed(c: EventCase): boolean {
  return c.state === "success" && c.environment === "Production"
}

function readbackStep(): Record<string, unknown> {
  const first = workflow.jobs?.a11y?.steps?.[0]
  assert.ok(first)
  assert.equal(typeof first?.run, "string")
  return first
}

function readbackRun(): string {
  return readbackStep().run as string
}

function structurePass(check: StructureCase["check"]): boolean {
  const job = workflow.jobs?.a11y
  const steps = job?.steps ?? []
  const run = readbackRun()
  switch (check) {
    case "trigger":
      return JSON.stringify(Object.keys(workflow.on ?? {})) === JSON.stringify(["deployment_status"])
    case "job-if":
      return (
        job?.if?.includes("deployment_status.state == 'success'") === true &&
        job.if.includes("deployment.environment == 'Production'")
      )
    case "concurrency":
      return (
        workflow.concurrency == null &&
        job?.concurrency?.group === "a11y-prod" &&
        job.concurrency["cancel-in-progress"] === true
      )
    case "job-timeout":
      return job?.["timeout-minutes"] === 60
    case "readback-first":
      return (
        (readbackStep().env as { EXPECTED_SHA?: string } | undefined)?.EXPECTED_SHA ===
          "${{ github.event.deployment.sha }}" && run.includes("/api/deployment-info")
      )
    case "poll-curl":
      return /curl -fsS --connect-timeout "\$CONNECT_S" --max-time "\$CURL_MAX_S"/.test(run)
    case "diagnostic-curl":
      return (run.match(/--connect-timeout "\$CONNECT_S" --max-time "\$CURL_MAX_S"/g) ?? []).length === 2
    case "jq-contract":
      return (
        run.includes('.ok == true and .environment == "production" and .commitRef == "main" and .commitSha == $sha') &&
        (readbackStep().env as { EXPECTED_SHA?: string } | undefined)?.EXPECTED_SHA ===
          "${{ github.event.deployment.sha }}"
      )
    case "checkout-ref": {
      const checkout = steps.find((step) => String(step.uses ?? "").startsWith("actions/checkout@"))
      return (checkout?.with as { ref?: string } | undefined)?.ref === "${{ github.event.deployment.sha }}"
    }
    case "deadline":
      return (
        run.includes("readonly ORCAMENTO_S=570") &&
        run.includes("readonly RESERVA_DIAG_S=25") &&
        run.includes("SECONDS=0") &&
        run.includes("limite_poll=$(( ORCAMENTO_S - RESERVA_DIAG_S ))") &&
        run.includes("readonly INTERVALO_S=15") &&
        run.includes("readonly CURL_MAX_S=10") &&
        570 < 600 &&
        25 >= 15 + 10
      )
  }
}

describe("workflow de acessibilidade em produção", () => {
  assert.equal(cases.length, 20, "o golden set precisa manter 20 casos")

  for (const c of cases) {
    it(c.id, () => {
      const actual = c.kind === "event" ? eventAllowed(c) : structurePass(c.check)
      assert.equal(actual, c.expected)
    })
  }
})
