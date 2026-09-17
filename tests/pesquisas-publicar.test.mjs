import assert from "node:assert/strict"
import test from "node:test"
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildBranchName,
  catalogContentsEndpoint,
  deploymentReadyForPromotion,
  ghApiPages,
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
  runStreamed,
  updateBranchRequest,
} from "../scripts/pesquisas-atualizacao-agendada/publicar.mjs"

// Stands in for `gh`: ignores its real argv and just cats whatever fixture
// GH_STUB_FIXTURE points to, so tests can drive ghApiPages's NDJSON parsing
// and error wrapping without hitting the network or a real repository.
function withGhStub(fixtureContent, run) {
  const dir = mkdtempSync(join(tmpdir(), "gh-stub-"))
  const fixture = join(dir, "fixture.txt")
  writeFileSync(fixture, fixtureContent)
  const stub = join(dir, "gh")
  writeFileSync(stub, `#!/bin/sh\ncat "$GH_STUB_FIXTURE"\n`)
  chmodSync(stub, 0o755)
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GH_STUB_FIXTURE: fixture, MERGE_QUEUE_GH_TOKEN: "stub-token" }
  return run(env).finally(() => rmSync(dir, { recursive: true, force: true }))
}

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

test("runStreamed não trava em comandos verbosos que excederiam o maxBuffer do exec bufferizado", async () => {
  // Regressão: prepare/verify chamavam commandRunner (execFile bufferizado com
  // maxBuffer de 4 MiB) para o apply e para "npm run verify:pesquisas" — uma
  // suíte de teste/lint/typecheck que nenhum dos dois lê o stdout. Um deploy
  // real estourou o buffer com "stdout maxBuffer length exceeded" e derrubou a
  // publicação inteira. runStreamed usa stdio:'inherit', sem buffer nenhum.
  // stdio "ignore" instead of the real "inherit" default keeps this assertion
  // from flooding the test log with megabytes of filler; the property under
  // test (spawn never buffers stdout into a capped JS buffer, so it can't
  // reject on size) holds regardless of which stdio target discards it.
  const bytesAboveOldCap = 5 * 1024 * 1024
  await assert.doesNotReject(runStreamed(process.execPath, ["-e", `process.stdout.write("x".repeat(${bytesAboveOldCap}))`], process.env, { stdio: ["ignore", "ignore", "inherit"] }))
})

test("runStreamed rejeita com o código de saída quando o comando falha", async () => {
  await assert.rejects(runStreamed(process.execPath, ["-e", "process.exit(3)"], process.env, { stdio: ["ignore", "ignore", "inherit"] }), /falhou com código 3/)
})

test("ghApiPages lê NDJSON de múltiplas páginas já filtradas pelo --jq da gh", async () => {
  // Regressão: run 35179574815 falhou 3,5 s após o início de "Publicar
  // somente após validação independente" — cedo demais para apply/verify.
  // O culpado era findPollingPrs: `gh api ... --paginate --slurp` sobre
  // repos/.../pulls?state=all trafega o corpo inteiro de cada PR (~6 MiB
  // neste repositório) através do execFile bufferizado (cap de 4 MiB) de
  // commandRunner. --jq é incompatível com --slurp, então a correção troca
  // para --paginate sem --slurp (que a gh emite como NDJSON, um objeto por
  // linha, já reduzido ao --jq) e ghApiPages faz o parse linha a linha.
  const ndjson = [{ number: 1, state: "open" }, { number: 2, state: "closed" }, { number: 3, state: "open" }]
    .map((row) => JSON.stringify(row)).join("\n") + "\n"
  await withGhStub(ndjson, async (env) => {
    const rows = await ghApiPages("repos/x/y/pulls?state=all&per_page=100", env, ".[] | {number,state}")
    assert.deepEqual(rows, [{ number: 1, state: "open" }, { number: 2, state: "closed" }, { number: 3, state: "open" }])
  })
})

test("ghApiPages ainda estoura o buffer sem --jq, mas o erro agora nomeia o comando e os argumentos", async () => {
  // Prova, sem rede, o mesmo modo de falha do run real: uma resposta maior
  // que o cap de 4 MiB do commandRunner rejeita com "stdout maxBuffer length
  // exceeded" — e agora essa rejeição também carrega "gh api --paginate
  // --jq ..." (via commandRunner), então o próximo estouro já chega
  // autoexplicativo no log, sem precisar baixar artefatos para descobrir
  // qual chamada foi.
  const oversized = "x".repeat(5 * 1024 * 1024)
  await withGhStub(oversized, async (env) => {
    await assert.rejects(
      ghApiPages("repos/x/y/pulls?state=all&per_page=100", env, ".[] | {number}"),
      (error) => {
        assert.match(error.message, /gh api --paginate --jq/)
        assert.match(error.message, /repos\/x\/y\/pulls\?state=all&per_page=100/)
        assert.match(error.message, /maxBuffer/)
        return true
      },
    )
  })
})

test("publicação falha fechado sem token, SHA, autor ou repositório válidos", () => {
  const env = { MERGE_QUEUE_GH_TOKEN: "token", VERCEL_TOKEN: "token", VERCEL_PROJECT_ID: "project", VERCEL_AUTOMATION_BYPASS_SECRET: "secret", POLL_REPOSITORY: "thiago-salvador/puxa-ficha", POLL_BASE_SHA: sha, POLL_RUN_ID: "123", POLL_AUTHOR_LOGIN: "thiago-salvador" }
  assert.equal(validatePublicationEnvironment(env), true)
  assert.throws(() => validatePublicationEnvironment({ ...env, POLL_AUTHOR_LOGIN: "bot" }), /login/)
  assert.throws(() => validatePublicationEnvironment({ ...env, POLL_BASE_SHA: "short" }), /SHA/)
  assert.throws(() => validatePublicationEnvironment({ ...env, VERCEL_TOKEN: undefined }), /VERCEL_TOKEN/)
})

console.log("PESQUISAS_PUBLICAR_GUARDS_PASS")
