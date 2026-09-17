import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const allowedExact = new Set([
  ".github/workflows/ci.yml",
  ".github/workflows/pesquisas-descoberta-economica.yml",
  "docs/operations/pesquisas-economia.md",
  "tests/pesquisas-incremental.test.ts",
  "tests/pesquisas-google-news.test.ts",
  "tests/pesquisas-preflight.test.ts",
  ".github/workflows/pesquisas-monitoramento.yml",
  "GATES.md",
  "docs/operations/pesquisas-monitoramento-automatizado-eval.md",
  "Settings/AUTOMATIONS_AND_ENVIRONMENTS.md",
  "package.json",
  "scripts/audit/verify-pesquisas-atualizacao-agendada-scope.mjs",
  ".gitattributes",
  "scripts/smoke-lancamento.ts",
  "tests/pesquisas-atualizacao-agendada.test.ts",
  "tests/programa-governo-models.test.ts",
  "tests/pesquisas-consolidacao-parcial.test.ts",
  "tests/pesquisas-publicar.test.mjs",
  "tests/pesquisas-monitoramento-workflow.test.ts",
  "tests/pesquisas-monitoramento-golden.test.ts",
  "tests/a11y-production-workflow.test.ts",
  "tests/visual/pesquisas-eleitorais.spec.ts",
  "tests/visual/pesquisas-production-smoke.spec.ts",
  "scripts/audit/audit-pesquisas-monitoramento.ts",
  "scripts/data/pesquisas-presidencia-2026.json",
  "scripts/data/pesquisas-governadores-2026.json",
  "scripts/lib/pesquisas-monitoramento-adapters.ts",
  "scripts/lib/pesquisas-monitoramento-poderdata-pdf.ts",
  "scripts/lib/pesquisas-monitoramento-realtime-cenarios.ts",
  "scripts/lib/pesquisas-monitoramento.ts",
  "scripts/lib/pesquisas-monitoramento-realtime-pdf.ts",
  "scripts/lib/pesquisas-monitoramento-realtime-pa-pdf.ts",
  "scripts/pesquisas-monitoramento.ts",
  "src/lib/pesquisas-eleitorais.ts",
  "src/lib/poll-weeks.ts",
  "src/lib/presidential-election-sections.ts",
  "src/lib/state-polls.ts",
  "tests/pesquisas-integracao.test.ts",
  "tests/pesquisas-poderdata-atual.test.ts",
  "tests/pesquisas-realtime-cenarios.test.ts",
  "tests/pesquisas-monitoramento-comparability.test.ts",
  "tests/poll-weeks.test.ts",
  "tests/pesquisas-eleitorais-dados.test.ts",
  "tests/presidential-election-sections.test.ts",
  "tests/state-programs-polls.test.ts",
  "tests/pesquisas-busca-semanal.test.ts",
  "tests/pesquisas-eleitorais-ui.test.tsx",
])
const allowedPrefixes = [
  "scripts/pesquisas-atualizacao-agendada/",
  "tests/fixtures/pesquisas-atualizacao-agendada/",
  "tests/fixtures/pesquisas-distribuicao/documentos/",
]

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function gitText(args) {
  return execFileSync("git", args, { encoding: "utf8" })
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

const forkPoint = git(["merge-base", "HEAD", "origin/main"])[0]
if (!forkPoint) throw new Error("não foi possível resolver o fork point com origin/main")
const changed = new Set([
  ...git(["diff", "--name-only", forkPoint]),
  ...git(["ls-files", "--others", "--exclude-standard"]),
])
const unexpected = [...changed]
  .filter((path) => !path.startsWith("graft/.cache/") && !path.startsWith("graft/.graph/")
    && !allowedExact.has(path) && !allowedPrefixes.some((prefix) => path.startsWith(prefix)))
  .sort()
if (unexpected.length > 0) throw new Error(`arquivos fora do escopo: ${unexpected.join(", ")}`)
const allowedSourceFiles = new Set([
  "src/lib/pesquisas-eleitorais.ts",
  "src/lib/poll-weeks.ts",
  "src/lib/presidential-election-sections.ts",
  "src/lib/state-polls.ts",
])
if ([...changed].some((path) => (path.startsWith("src/") && !allowedSourceFiles.has(path)) || path.startsWith("supabase/") || path === "package-lock.json")) {
  throw new Error("escopo não permite runtime público, banco, migration ou dependência")
}

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
  "resolutions",
]
const basePackage = JSON.parse(gitText(["show", `${forkPoint}:package.json`]))
const currentPackage = JSON.parse(readFileSync("package.json", "utf8"))
for (const field of dependencyFields) {
  if (stable(basePackage[field] ?? null) !== stable(currentPackage[field] ?? null)) {
    throw new Error(`package.json não pode alterar ${field}`)
  }
}

const workflow = readFileSync(".github/workflows/pesquisas-monitoramento.yml", "utf8")
if (!/^\s*workflow_dispatch:/m.test(workflow)) throw new Error("workflow_dispatch ausente")
const scheduleCount = (workflow.match(/^  schedule:/gm) ?? []).length
const cronExpressions = [...workflow.matchAll(/^\s+- cron:\s*"([^"]+)"\s*$/gm)].map((match) => match[1])
if (scheduleCount !== 1 || cronExpressions.length !== 1 || cronExpressions[0] !== "17 10 * * *") {
  throw new Error("workflow deve conter exatamente um cron diário aprovado")
}
if (/SUPABASE|SERVICE_ROLE|revalidate|git\s+merge|--force(?:-with-lease)?/i.test(workflow)) {
  throw new Error("workflow contém caminho proibido de banco, revalidate, merge ou force-push")
}
if (!/^permissions:\n  contents: read$/m.test(workflow)) throw new Error("permissão global deve ser contents: read")

const workflowLines = workflow.split("\n")
const jobsIndex = workflowLines.findIndex((line) => line === "jobs:")
if (jobsIndex < 0) throw new Error("jobs ausente")
const jobBlocks = new Map()
for (let index = jobsIndex + 1; index < workflowLines.length; index += 1) {
  const match = workflowLines[index].match(/^  ([a-z0-9-]+):\s*$/)
  if (!match) continue
  const next = workflowLines.findIndex((line, candidate) => candidate > index && /^  [a-z0-9-]+:\s*$/.test(line))
  jobBlocks.set(match[1], workflowLines.slice(index, next < 0 ? workflowLines.length : next).join("\n"))
}
if (!jobBlocks.has("promover")) throw new Error("job promover ausente")
for (const [name, block] of jobBlocks) {
  if (name === "promover") {
    if (!/permissions:\n      contents: write\n      pull-requests: write/m.test(block)) {
      throw new Error("job promover deve concentrar as duas permissões de escrita")
    }
  } else {
    if (!/permissions:\n      contents: read/m.test(block)) throw new Error(`job ${name} deve declarar contents: read`)
    if (/contents:\s*write|pull-requests:\s*write/.test(block)) throw new Error(`job ${name} não pode receber escrita`)
  }
}
if ((workflow.match(/contents:\s*write/g) ?? []).length !== 1) throw new Error("contents: write deve existir uma única vez")
if ((workflow.match(/pull-requests:\s*write/g) ?? []).length !== 1) throw new Error("pull-requests: write deve existir uma única vez")
if (!/publicar\.mjs/.test(workflow) || /PESQUISAS_DRAFT_PR_ENABLED|create_draft_pr|--draft/.test(workflow)) {
  throw new Error("workflow deve chamar a publicação validada e não o fluxo draft")
}

console.log(`PESQUISAS_ATUALIZACAO_SCOPE_PASS: ${changed.size} arquivos permitidos; cron=enabled; permissions=isolated`)
