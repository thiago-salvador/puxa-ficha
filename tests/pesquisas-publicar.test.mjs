import assert from "node:assert/strict"
import test from "node:test"
import {
  buildBranchName,
  catalogContentsEndpoint,
  deploymentReadyForPromotion,
  latestCheckResults,
  normalizeStatusChecks,
  requiredChecksSatisfied,
  validateCatalogFiles,
  validateChangedFiles,
  validateDeployment,
  validatePublicationEnvironment,
  validatePullRequest,
  promoteProduction,
  runPublicationStages,
  updateBranchRequest,
} from "../scripts/pesquisas-atualizacao-agendada/publicar.mjs"

const sha = "a".repeat(40)
const catalog = "scripts/data/pesquisas-presidencia-2026.json"

test("guards formam branch única por rodada e rejeitam entradas fora do escopo", () => {
  assert.equal(buildBranchName("123"), "codex/pesquisas-refresh-123")
  assert.throws(() => buildBranchName("0"), /GITHUB_RUN_ID/)
  assert.deepEqual(validateCatalogFiles([catalog]), [catalog])
  assert.throws(() => validateCatalogFiles(["src/app/page.tsx"]), /allowlist/)
  assert.throws(() => validateChangedFiles([{ filename: catalog }, { filename: "package.json" }]), /allowlist/)
})

test("PR só é retomada quando autoria, base, branch e SHA conferem", () => {
  const pr = { state: "open", base: { ref: "main", sha, repo: { full_name: "thiago-salvador/puxa-ficha" } }, head: { ref: "codex/pesquisas-refresh-123", sha }, user: { login: "thiago-salvador" } }
  assert.equal(validatePullRequest(pr, { branch: pr.head.ref, baseSha: sha, repository: "thiago-salvador/puxa-ficha" }), pr)
  assert.throws(() => validatePullRequest({ ...pr, user: { login: "someone-else" } }, { branch: pr.head.ref, baseSha: sha, repository: "thiago-salvador/puxa-ficha" }), /autor/)
  assert.throws(() => validatePullRequest({ ...pr, base: { ...pr.base, sha: "b".repeat(40) } }, { branch: pr.head.ref, baseSha: sha, repository: "thiago-salvador/puxa-ficha" }), /base mudou/)
})

test("checks exigem o mesmo head e sucesso de todos os contextos", () => {
  const checks = [{ name: "CI", sha, status: "completed", conclusion: "success" }, { name: "Vercel", sha, status: "completed", conclusion: "success" }]
  assert.equal(requiredChecksSatisfied(checks, ["CI", "Vercel"], sha), true)
  assert.equal(requiredChecksSatisfied(checks, ["CI", "Missing"], sha), false)
  assert.equal(requiredChecksSatisfied([{ ...checks[0], sha: "b".repeat(40) }], ["CI"], sha), false)
  const reruns = latestCheckResults([
    { name: "CI", sha, status: "completed", conclusion: "success", updated_at: "2026-09-15T10:00:00Z" },
    { name: "CI", sha, status: "completed", conclusion: "failure", updated_at: "2026-09-15T10:01:00Z" },
  ])
  assert.equal(reruns.length, 1)
  assert.equal(reruns[0].conclusion, "failure")
  const normalized = normalizeStatusChecks([{ context: "CI", state: "success", updated_at: "2026-09-15T10:00:00Z" }], sha)
  assert.equal(normalized[0].sha, sha)
  assert.equal(normalized[0].app_id, undefined)
  const pending = normalizeStatusChecks([
    { context: "CI", state: "success", updated_at: "2026-09-15T10:00:00Z" },
    { context: "CI", state: "pending", updated_at: "2026-09-15T10:01:00Z" },
  ], sha)
  assert.equal(requiredChecksSatisfied(pending, ["CI"], sha), false)
})

test("orquestra callbacks de publicação em ordem e interrompe em erro", async () => {
  const events = []
  const result = await runPublicationStages({
    authenticate: async () => events.push("auth"),
    assertBase: async () => events.push("base"),
    recover: async () => events.push("recover"),
    prepare: async () => events.push("push"),
    verify: async () => events.push("ci"),
    openOrResumePr: async () => { events.push("pr"); return { number: 7 } },
    merge: async () => { events.push("merge"); return sha },
    promote: async () => { events.push("ready-smoke-promote"); return { id: "dpl", url: "https://x.vercel.app", sha } },
  })
  assert.deepEqual(events, ["auth", "base", "recover", "push", "ci", "pr", "merge", "ready-smoke-promote"])
  assert.equal(result.mergeSha, sha)
})

test("wire de update-branch usa PUT com CAS e conteúdo usa SHA imutável", () => {
  assert.deepEqual(updateBranchRequest("thiago-salvador/puxa-ficha", 17, sha), [
    "api", "--method", "PUT", "repos/thiago-salvador/puxa-ficha/pulls/17/update-branch",
    "-f", `expected_head_sha=${sha}`, "-f", "update_method=merge",
  ])
  assert.equal(catalogContentsEndpoint("thiago-salvador/puxa-ficha", "scripts/data/pesquisas-presidencia-2026.json", sha), "repos/thiago-salvador/puxa-ficha/contents/scripts/data/pesquisas-presidencia-2026.json?ref=" + sha)
})

test("falha de uma etapa interrompe a publicação antes de qualquer etapa posterior", async () => {
  const events = []
  await assert.rejects(() => runPublicationStages({
    authenticate: async () => events.push("auth"),
    assertBase: async () => { events.push("base"); throw new Error("base mudou") },
    recover: async () => events.push("recover"),
    prepare: async () => events.push("push"),
    verify: async () => events.push("ci"),
    openOrResumePr: async () => events.push("pr"),
    merge: async () => events.push("merge"),
    promote: async () => events.push("promote"),
  }), /base mudou/)
  assert.deepEqual(events, ["auth", "base"])
})

test("deployment exige SHA exato, produção READY e URL Vercel HTTPS", () => {
  const deployment = { id: "dpl_123", sha, target: "production", readyState: "READY", url: "https://poll-preview.vercel.app/" }
  assert.equal(validateDeployment(deployment, sha), deployment)
  assert.equal(deploymentReadyForPromotion({ ...deployment, readyState: "BUILDING" }, sha), false)
  assert.equal(deploymentReadyForPromotion(null, sha), false)
  assert.throws(() => deploymentReadyForPromotion({ ...deployment, readyState: "ERROR" }, sha), /falhou/)
  assert.throws(() => validateDeployment({ ...deployment, sha: "b".repeat(40) }, sha), /não corresponde/)
  assert.throws(() => validateDeployment({ ...deployment, url: "http://poll-preview.vercel.app/" }, sha), /URL/)
})

test("promoção mantém bypass só no staged e limpa segredo nos checks públicos", async () => {
  const smokeEnvs = []
  const proofs = []
  const staged = { id: "dpl_staged", sha, target: "production", readyState: "READY", url: "https://poll-preview.vercel.app/" }
  const vercel = {
    deploymentForSha: async () => staged,
    promote: async (id) => assert.equal(id, staged.id),
    currentProductionForDomain: async () => ({ id: "dpl_public", sha }),
  }
  const env = {
    POLL_REPOSITORY: "thiago-salvador/puxa-ficha",
    VERCEL_AUTOMATION_BYPASS_SECRET: "inherited-secret",
  }

  await promoteProduction(sha, env, Date.now() + 1_000, {
    vercel,
    ghApi: async () => ({ sha }),
    runReleaseSmokes: async ({ env: smokeEnv }) => smokeEnvs.push(smokeEnv),
    proveDeployment: async (proof) => proofs.push(proof),
  })

  assert.deepEqual(smokeEnvs.map((smokeEnv) => smokeEnv.VERCEL_AUTOMATION_BYPASS_SECRET), ["inherited-secret", ""])
  assert.equal(smokeEnvs[0].PF_BASE_URL, staged.url)
  assert.equal(smokeEnvs[1].PF_BASE_URL, "https://puxaficha.com.br")
  assert.equal(proofs.length, 1)
  assert.equal(proofs[0].bypassSecret, "")
})

test("publicação falha fechado sem token, SHA, autor ou repositório válidos", () => {
  const env = { MERGE_QUEUE_GH_TOKEN: "token", VERCEL_TOKEN: "token", VERCEL_PROJECT_ID: "project", VERCEL_AUTOMATION_BYPASS_SECRET: "secret", POLL_REPOSITORY: "thiago-salvador/puxa-ficha", POLL_BASE_SHA: sha, POLL_RUN_ID: "123", POLL_AUTHOR_LOGIN: "thiago-salvador" }
  assert.equal(validatePublicationEnvironment(env), true)
  assert.throws(() => validatePublicationEnvironment({ ...env, POLL_AUTHOR_LOGIN: "bot" }), /login/)
  assert.throws(() => validatePublicationEnvironment({ ...env, POLL_BASE_SHA: "short" }), /SHA/)
  assert.throws(() => validatePublicationEnvironment({ ...env, VERCEL_TOKEN: undefined }), /VERCEL_TOKEN/)
})

console.log("PESQUISAS_PUBLICAR_GUARDS_PASS")
