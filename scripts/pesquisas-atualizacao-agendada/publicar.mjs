#!/usr/bin/env node
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { setTimeout as wait } from "node:timers/promises"
import { VercelAdapter } from "../merge-queue/adapters.mjs"
import { proveDeployment } from "../merge-queue/deployment-proof.mjs"
import { runReleaseSmokes } from "../merge-queue/run-release-smokes.mjs"

const execFileAsync = promisify(execFile)
const SHA = /^[0-9a-f]{40}$/
const REPOSITORY = /^[^/]+\/[A-Za-z0-9_.-]+$/
export const CATALOG_FILES = Object.freeze([
  "scripts/data/pesquisas-presidencia-2026.json",
  "scripts/data/pesquisas-governadores-2026.json",
])
export const POLL_BRANCH_PREFIX = "codex/pesquisas-refresh-"
export const POLL_AUTHOR = "thiago-salvador"
export const POLL_TIMEOUT_MS = 38 * 60 * 1000

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} inválido`)
  return value
}

function invariant(message) {
  const error = new Error(message)
  error.fatal = true
  throw error
}

export function buildBranchName(runId) {
  if (!/^[1-9][0-9]{0,19}$/.test(String(runId ?? ""))) invariant("GITHUB_RUN_ID inválido")
  return `${POLL_BRANCH_PREFIX}${runId}`
}

export function validateCatalogFiles(files) {
  if (!Array.isArray(files) || files.length === 0) invariant("nenhuma alteração de catálogo encontrada")
  const unique = [...new Set(files)]
  if (unique.length !== files.length || unique.some((file) => !CATALOG_FILES.includes(file))) {
    invariant("alteração fora da allowlist de catálogos")
  }
  return unique
}

export function validatePullRequest(pr, { branch, baseSha, repository, author = POLL_AUTHOR } = {}) {
  asObject(pr, "PR")
  if (pr.state !== "open" && pr.merged_at == null) invariant("PR de pesquisa não está aberto")
  if (pr.base?.ref !== "main" || pr.base?.repo?.full_name !== repository) invariant("PR de pesquisa tem base inválida")
  if (branch && pr.head?.ref !== branch) invariant("PR de pesquisa tem branch inesperada")
  if (baseSha && pr.base?.sha !== baseSha) invariant("base mudou desde o início da rodada")
  if (author && pr.user?.login !== author) invariant("PR de pesquisa tem autor inesperado")
  if (pr.head?.sha && !SHA.test(pr.head.sha)) invariant("SHA do PR inválido")
  return pr
}

export function validateChangedFiles(files) {
  return validateCatalogFiles(files.map((file) => typeof file === "string" ? file : file.filename))
}

export function requiredChecksSatisfied(checks, required, headSha) {
  if (!SHA.test(String(headSha ?? ""))) invariant("SHA do head inválido")
  if (!Array.isArray(required) || required.length === 0) return false
  return required.every((requirement) => {
    const name = typeof requirement === "string" ? requirement : requirement.name
    const appId = typeof requirement === "string" ? undefined : requirement.app_id
    return latestCheckResults(checks).some((check) => check?.name === name && check?.sha === headSha
    && (appId == null || check.app_id === appId)
    && (String(check.status).toLowerCase() === "completed" || String(check.conclusion).toLowerCase() === "success")
    && String(check.conclusion).toLowerCase() === "success")
  })
}

export function latestCheckResults(checks) {
  if (!Array.isArray(checks)) return []
  const latest = new Map()
  for (const check of checks) {
    const key = `${check?.name ?? ""}\u0000${check?.sha ?? ""}\u0000${check?.app_id ?? ""}`
    const timestamp = Date.parse(check?.completed_at ?? check?.updated_at ?? check?.started_at ?? "") || 0
    const previous = latest.get(key)
    if (!previous || timestamp >= previous.timestamp) latest.set(key, { ...check, timestamp })
  }
  return [...latest.values()].map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "timestamp")))
}

export function normalizeStatusChecks(statuses, sha) {
  return (Array.isArray(statuses) ? statuses : []).map((check) => ({
    name: check.context,
    sha,
    status: check.state === "success" ? "completed" : "pending",
    conclusion: check.state,
    updated_at: check.updated_at,
  }))
}

export function updateBranchRequest(repository, number, expectedHeadSha) {
  return ["api", "--method", "PUT", `repos/${repository}/pulls/${number}/update-branch`, "-f", `expected_head_sha=${expectedHeadSha}`, "-f", "update_method=merge"]
}

export function catalogContentsEndpoint(repository, file, ref) {
  return `repos/${repository}/contents/${file}?ref=${encodeURIComponent(ref)}`
}

export function validateDeployment(deployment, expectedSha) {
  asObject(deployment, "deployment")
  if (!deployment.id || deployment.sha !== expectedSha || deployment.target !== "production") invariant("deployment Vercel não corresponde ao SHA de publicação")
  if (String(deployment.readyState).toUpperCase() !== "READY") invariant("deployment Vercel ainda não está READY")
  let url
  try { url = new URL(String(deployment.url ?? "")) } catch { invariant("URL do deployment Vercel inválida") }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app") || url.pathname !== "/") invariant("URL do deployment Vercel inválida")
  return deployment
}

export function deploymentReadyForPromotion(deployment, expectedSha) {
  if (!deployment) return false
  const state = String(deployment.readyState ?? "").toUpperCase()
  if (["ERROR", "CANCELED"].includes(state)) {
    const error = new Error("deployment Vercel falhou antes da promoção")
    error.fatal = true
    throw error
  }
  return state === "READY" ? validateDeployment(deployment, expectedSha) : false
}

export function validatePublicationEnvironment(env) {
  const required = ["MERGE_QUEUE_GH_TOKEN", "VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_AUTOMATION_BYPASS_SECRET"]
  for (const name of required) if (!env[name]) throw new Error(`${name} é obrigatório para publicar`)
  if (!REPOSITORY.test(env.POLL_REPOSITORY)) invariant("POLL_REPOSITORY inválido")
  if (!SHA.test(env.POLL_BASE_SHA)) invariant("POLL_BASE_SHA inválido")
  buildBranchName(env.POLL_RUN_ID)
  if (env.POLL_AUTHOR_LOGIN !== POLL_AUTHOR) invariant("login de publicação inesperado")
  return true
}

export async function runPublicationStages({ authenticate, assertBase, recover, prepare, verify, openOrResumePr, merge, promote }) {
  await authenticate()
  await assertBase()
  await recover()
  const prepared = await prepare()
  if (prepared?.status === "no-op") return prepared
  await verify()
  const pr = await openOrResumePr()
  const mergeSha = await merge(pr)
  const deployment = await promote(mergeSha)
  return { pr, mergeSha, deployment }
}

function jsonOutput(stdout, label) {
  try { return JSON.parse(stdout) } catch { throw new Error(`${label} não retornou JSON válido`) }
}

function commandRunner(command, args, env) {
  return execFileAsync(command, args, { env, maxBuffer: 4 * 1024 * 1024 }).then(({ stdout }) => stdout.trim())
}

function ghApi(endpoint, env, args = []) {
  return commandRunner("gh", ["api", ...args, endpoint], { ...process.env, ...env, GH_TOKEN: env.MERGE_QUEUE_GH_TOKEN })
    .then((stdout) => jsonOutput(stdout, `gh api ${endpoint}`))
}

async function ghApiPages(endpoint, env) {
  const pages = await ghApi(endpoint, env, ["--paginate", "--slurp"])
  return pages.flatMap((page) => Array.isArray(page) ? page : [page])
}

async function git(args, env) {
  return commandRunner("git", args, { ...process.env, ...env, GH_TOKEN: env.MERGE_QUEUE_GH_TOKEN })
}

async function pollUntil(label, deadline, action, { intervalMs = 5000 } = {}) {
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await action()
      if (value) return value
    } catch (error) {
      if (error?.fatal) throw error
      lastError = error
    }
    await wait(Math.min(intervalMs, Math.max(1, deadline - Date.now())))
  }
  throw new Error(`${label} não concluiu no prazo${lastError ? `: ${lastError.message}` : ""}`)
}

async function checksForSha(repository, sha, env) {
  const [runs, statuses] = await Promise.all([
    ghApi(`repos/${repository}/commits/${sha}/check-runs?per_page=100`, env),
    ghApi(`repos/${repository}/commits/${sha}/statuses?per_page=100`, env),
  ])
  return latestCheckResults([
    ...(runs.check_runs ?? []).map((check) => ({ name: check.name, sha: check.head_sha, app_id: check.app?.id, status: check.status, conclusion: check.conclusion, started_at: check.started_at, completed_at: check.completed_at, updated_at: check.updated_at })),
    ...normalizeStatusChecks(statuses, sha),
  ])
}

async function requiredContexts(repository, env) {
  const protection = await ghApi(`repos/${repository}/branches/main/protection/required_status_checks`, env)
  const contexts = [
    ...(protection.contexts ?? []).map((name) => ({ name })),
    ...(protection.checks ?? []).map((check) => ({ name: check.context ?? check.name, app_id: check.app_id })),
  ].filter((check) => check.name)
  if (contexts.length === 0) throw new Error("main não expõe checks obrigatórios; publicação bloqueada")
  return contexts.filter((check, index, all) => all.findIndex((candidate) => candidate.name === check.name && candidate.app_id === check.app_id) === index)
}

async function findPollingPrs(repository, env) {
  return (await ghApiPages(`repos/${repository}/pulls?state=all&per_page=100`, env))
    .filter((pr) => String(pr.head?.ref ?? "").startsWith(POLL_BRANCH_PREFIX))
}

async function validatePrCatalogContent(repository, pr, env, referenceRef) {
  const files = await ghApiPages(`repos/${repository}/pulls/${pr.number}/files?per_page=100`, env)
  validateChangedFiles(files)
  for (const file of CATALOG_FILES) {
    const local = referenceRef
      ? await ghApi(catalogContentsEndpoint(repository, file, referenceRef), env)
      : { encoding: "base64", content: readFileSync(file).toString("base64") }
    const remote = await ghApi(catalogContentsEndpoint(repository, file, pr.head.sha), env)
    if (local?.encoding !== "base64" || remote?.encoding !== "base64"
      || Buffer.from(String(remote.content ?? "").replace(/\s/g, ""), "base64").compare(Buffer.from(String(local.content ?? "").replace(/\s/g, ""), "base64")) !== 0) {
      invariant("PR de pesquisas contém alteração manual divergente do catálogo validado")
    }
  }
}

async function updatePrBranch(repository, pr, baseSha, env, deadline) {
  const before = await ghApi(`repos/${repository}/compare/${baseSha}...${pr.head.sha}`, env)
  if (before.behind_by === 0 && pr.base?.sha === baseSha) return pr
  const previousHead = pr.head.sha
  await commandRunner("gh", updateBranchRequest(repository, pr.number, previousHead), { ...process.env, ...env, GH_TOKEN: env.MERGE_QUEUE_GH_TOKEN })
  return pollUntil("atualização segura da branch da PR", deadline, async () => {
    const current = await ghApi(`repos/${repository}/pulls/${pr.number}`, env)
    const comparison = await ghApi(`repos/${repository}/compare/${baseSha}...${current.head.sha}`, env)
    if (comparison.behind_by !== 0) return null
    if (before.behind_by > 0 && current.head.sha === previousHead) return null
    return current
  })
}

async function ensurePr({ repository, env, branch, baseSha, deadline }) {
  const candidates = await findPollingPrs(repository, env)
  const open = candidates.filter((pr) => pr.state === "open" && pr.merged_at == null)
  if (open.length > 1) invariant("há mais de uma PR de pesquisas aberta; rodada encerrada sem sobrescrever")
  if (open.length === 1) {
    let existing = open[0]
    validatePullRequest(existing, { branch: existing.head.ref, repository })
    await validatePrCatalogContent(repository, existing, env)
    existing = await updatePrBranch(repository, existing, baseSha, env, deadline)
    validatePullRequest(existing, { branch: existing.head.ref, repository })
    const comparison = await ghApi(`repos/${repository}/compare/${baseSha}...${existing.head.sha}`, env)
    if (comparison.behind_by !== 0) invariant("branch da PR continua atrás de main após update-branch")
    await validatePrCatalogContent(repository, existing, env)
    if (existing.draft) {
      await commandRunner("gh", ["pr", "ready", String(existing.number), "--repo", repository], { ...process.env, ...env, GH_TOKEN: env.MERGE_QUEUE_GH_TOKEN })
      return ghApi(`repos/${repository}/pulls/${existing.number}`, env)
    }
    return existing
  }

  const changed = (await git(["diff", "--name-only"], env)).split("\n").filter(Boolean)
  validateChangedFiles(changed)
  await git(["diff", "--check"], env)
  await git(["config", "user.name", "Thiago Salvador"], env)
  await git(["config", "user.email", "contato.thiagosalvador@gmail.com"], env)
  await git(["switch", "-c", branch], env)
  await git(["add", ...CATALOG_FILES], env)
  await git(["commit", "-m", "data: publicar atualização de pesquisas"], env)
  await commandRunner("gh", ["auth", "setup-git"], { ...process.env, ...env, GH_TOKEN: env.MERGE_QUEUE_GH_TOKEN })
  await git(["push", "origin", `HEAD:refs/heads/${branch}`], env)
  const body = (() => { try { return readFileSync("reports/consolidated/pr-body.md", "utf8") } catch { return "Publicação validada de pesquisas eleitorais." } })()
  const bodyFile = "/tmp/pesquisas-pr-body.md"
  await writeFile(bodyFile, body)
  await commandRunner("gh", ["pr", "create", "--repo", repository, "--base", "main", "--head", branch, "--title", "data: publicar atualização de pesquisas", "--body-file", bodyFile], { ...process.env, ...env, GH_TOKEN: env.MERGE_QUEUE_GH_TOKEN })
  const created = await pollUntil("criação da PR", deadline, async () => {
    const prs = await findPollingPrs(repository, env)
    return prs.find((pr) => pr.state === "open" && pr.head?.ref === branch) ?? null
  })
  validatePullRequest(created, { branch, repository })
  const comparison = await ghApi(`repos/${repository}/compare/${baseSha}...${created.head.sha}`, env)
  if (comparison.behind_by !== 0) invariant("PR recém-criada não está baseada no main atual")
  await validatePrCatalogContent(repository, created, env)
  return created
}

async function mergePullRequest({ repository, env, pr, baseSha, deadline }) {
  validatePullRequest(pr, { branch: pr.head.ref, repository })
  const initialHeadSha = pr.head.sha
  const required = await requiredContexts(repository, env)
  const ready = await pollUntil("checks obrigatórios", deadline, async () => {
    const current = (await ghApi(`repos/${repository}/pulls/${pr.number}`, env))
    validatePullRequest(current, { branch: pr.head.ref, repository })
    if (current.head.sha !== initialHeadSha) invariant("head da PR mudou durante a validação; rodada encerrada")
    const comparison = await ghApi(`repos/${repository}/compare/${baseSha}...${current.head.sha}`, env)
    if (comparison.behind_by !== 0) return null
    const checks = await checksForSha(repository, current.head.sha, env)
    return requiredChecksSatisfied(checks, required, current.head.sha) ? current : null
  })
  await validatePrCatalogContent(repository, ready, env)
  const currentBase = (await ghApi(`repos/${repository}/commits/main`, env)).sha
  if (currentBase !== baseSha) throw new Error("base mudou antes do merge; publicação abortada com segurança")
  await commandRunner("gh", ["pr", "merge", String(ready.number), "--repo", repository, "--squash", "--match-head-commit", ready.head.sha, "--delete-branch=false"], { ...process.env, ...env, GH_TOKEN: env.MERGE_QUEUE_GH_TOKEN })
  const merged = await pollUntil("merge da PR", deadline, async () => {
    const current = await ghApi(`repos/${repository}/pulls/${ready.number}`, env)
    return current.merged_at ? current : null
  })
  if (!SHA.test(merged.merge_commit_sha ?? "")) throw new Error("merge sem SHA completo")
  const mainSha = (await ghApi(`repos/${repository}/commits/main`, env)).sha
  if (mainSha !== merged.merge_commit_sha) throw new Error("main não aponta para o merge desta rodada")
  return merged.merge_commit_sha
}

async function promoteProduction(sha, env, deadline) {
  const vercel = new VercelAdapter({ token: env.VERCEL_TOKEN, teamId: env.VERCEL_TEAM_ID ?? env.VERCEL_ORG_ID, projectId: env.VERCEL_PROJECT_ID })
  const staged = await pollUntil("deployment Vercel de produção", deadline, async () => {
    const deployment = await vercel.deploymentForSha(sha, { target: "production" })
    return deploymentReadyForPromotion(deployment, sha) || null
  })
  await runReleaseSmokes({ env: { PF_BASE_URL: staged.url, PF_EXPECTED_DEPLOY_SHA: sha, VERCEL_AUTOMATION_BYPASS_SECRET: env.VERCEL_AUTOMATION_BYPASS_SECRET } })
  const currentBase = (await ghApi(`repos/${env.POLL_REPOSITORY}/commits/main`, env)).sha
  if (currentBase !== sha) throw new Error("main mudou depois dos smokes; promoção abortada com segurança")
  await vercel.promote(staged.id)
  const current = await pollUntil("promoção Vercel", deadline, async () => {
    const deployment = await vercel.currentProductionForDomain("puxaficha.com.br")
    return deployment.sha === sha ? deployment : null
  })
  await proveDeployment({ baseUrl: "https://puxaficha.com.br", expectedSha: sha, bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET })
  await runReleaseSmokes({ env: { PF_BASE_URL: "https://puxaficha.com.br", PF_EXPECTED_DEPLOY_SHA: sha, VERCEL_AUTOMATION_BYPASS_SECRET: env.VERCEL_AUTOMATION_BYPASS_SECRET } })
  return current
}

export async function publishValidatedPolls(input = {}) {
  const env = { ...process.env, ...(input.env ?? {}) }
  validatePublicationEnvironment(env)
  const deadline = Date.now() + (input.timeoutMs ?? POLL_TIMEOUT_MS)
  const repository = env.POLL_REPOSITORY
  const baseSha = env.POLL_BASE_SHA
  const branch = buildBranchName(env.POLL_RUN_ID)
  const result = await runPublicationStages({
    authenticate: async () => {
      const user = await ghApi("user", env)
      if (user.login !== POLL_AUTHOR) invariant("MERGE_QUEUE_GH_TOKEN não pertence a Thiago Salvador")
    },
    assertBase: async () => {
      if ((await ghApi(`repos/${repository}/commits/main`, env)).sha !== baseSha) invariant("base mudou antes do início; publicação abortada")
    },
    recover: async () => {
      for (const candidate of await findPollingPrs(repository, env)) {
        if (!candidate.merged_at || candidate.merge_commit_sha !== baseSha) continue
        validatePullRequest(candidate, { repository })
        await validatePrCatalogContent(repository, candidate, env, baseSha)
        try {
          await proveDeployment({ baseUrl: "https://puxaficha.com.br", expectedSha: baseSha, bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET })
        } catch {
          await promoteProduction(baseSha, env, deadline)
        }
      }
    },
    prepare: async () => {
      const diff = asObject(JSON.parse(readFileSync("reports/consolidated/diff.json", "utf8")), "diff")
      if (!Array.isArray(diff.operations) || diff.operations.length === 0) return { status: "no-op", reason: "nenhuma operação nova; recuperação concluída quando necessária" }
      await commandRunner("npm", ["run", "pesquisas:atualizacao:apply", "--", "--diff=reports/consolidated/diff.json", "--publish", "--status=reports/consolidated/status.json", "--proposal=reports/consolidated/proposal.json"], { ...process.env, ...env })
      const changed = (await git(["diff", "--name-only"], env)).split("\n").filter(Boolean)
      if (changed.length === 0) return { status: "no-op", reason: "operações já aplicadas no catálogo" }
      validateChangedFiles(changed)
      return { status: "prepared" }
    },
    verify: () => commandRunner("npm", ["run", "verify:pesquisas"], { ...process.env, ...env }),
    openOrResumePr: () => ensurePr({ repository, env, branch, baseSha, deadline }),
    merge: (pr) => pr.merged_at ? pr.merge_commit_sha : mergePullRequest({ repository, env, pr, baseSha, deadline }),
    promote: (sha) => promoteProduction(sha, env, deadline),
  })
  if (result.status === "no-op") return result
  return { branch, pr: result.pr.number, mergeSha: result.mergeSha, deployment: { id: result.deployment.id, url: result.deployment.url, sha: result.deployment.sha } }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  publishValidatedPolls().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`publicação de pesquisas falhou: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
