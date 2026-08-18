import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildDbUnavailableFailureMessage,
  resolveReleaseVerifyDbPolicy,
} from "../scripts/lib/release-verify-db-policy"

test("release-verify fail-closed em modo full mesmo com opt-in de degraded", () => {
  const policy = resolveReleaseVerifyDbPolicy({
    mode: "full",
    baseUrl: "http://localhost:3000",
    allowDbDegradedEnv: "1",
  })

  assert.equal(policy.isReleaseGradeRun, true)
  assert.equal(policy.allowDbDegradedRequested, true)
  assert.equal(policy.allowDbDegraded, false)

  const message = buildDbUnavailableFailureMessage("connect ETIMEDOUT", policy)
  assert.match(message, /Fail-closed/)
  assert.match(message, /ignorado/)
})

test("release-verify fail-closed em URL remota mesmo em modo partial", () => {
  const policy = resolveReleaseVerifyDbPolicy({
    mode: "partial",
    baseUrl: "https://puxaficha.com.br",
    allowDbDegradedEnv: "1",
  })

  assert.equal(policy.isReleaseGradeRun, true)
  assert.equal(policy.allowDbDegraded, false)
})

test("release-verify só permite degraded com opt-in explícito em partial local", () => {
  const policy = resolveReleaseVerifyDbPolicy({
    mode: "partial",
    baseUrl: "http://127.0.0.1:3000",
    allowDbDegradedEnv: "1",
  })

  assert.equal(policy.isReleaseGradeRun, false)
  assert.equal(policy.allowDbDegradedRequested, true)
  assert.equal(policy.allowDbDegraded, true)
})
