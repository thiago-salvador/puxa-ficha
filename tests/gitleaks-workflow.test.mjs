import assert from "node:assert/strict"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

const root = process.cwd()
const configPath = path.join(root, ".gitleaks.toml")

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8")
}

function controlledValue() {
  return [
    "ghp_",
    "A1b2",
    "C3d4",
    "E5f6",
    "G7h8",
    "I9j0",
    "K1l2",
    "M3n4",
    "O5p6",
    "Q7r8S",
  ].join("")
}

function writeFixture(directory, relativePath, contents) {
  const destination = path.join(directory, relativePath)
  mkdirSync(path.dirname(destination), { recursive: true })
  writeFileSync(destination, contents, { mode: 0o600 })
}

function copyFixture(directory, relativePath) {
  const destination = path.join(directory, relativePath)
  mkdirSync(path.dirname(destination), { recursive: true })
  copyFileSync(path.join(root, relativePath), destination)
}

function scan(directory, exitCode = 17) {
  const reportPath = path.join(directory, "gitleaks-report.json")
  const result = spawnSync(
    "gitleaks",
    [
      "dir",
      ".",
      "--config",
      configPath,
      "--no-banner",
      "--redact=100",
      `--exit-code=${exitCode}`,
      "--report-format=json",
      `--report-path=${reportPath}`,
    ],
    { cwd: directory, encoding: "utf8" },
  )
  const report = readFileSync(reportPath, "utf8")

  return {
    ...result,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    report,
    findings: JSON.parse(report),
  }
}

function runGit(directory, args, expectedStatus = 0) {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" })
  assert.ifError(result.error)
  assert.equal(
    result.status,
    expectedStatus,
    `${result.stdout ?? ""}${result.stderr ?? ""}`,
  )
  return (result.stdout ?? "").trim()
}

function scanGit(directory, logOpts, reportName) {
  const reportPath = path.join(directory, reportName)
  const result = spawnSync(
    "gitleaks",
    [
      "git",
      "--config",
      configPath,
      "--no-banner",
      "--redact=100",
      "--exit-code=17",
      `--log-opts=${logOpts}`,
      "--report-format=json",
      `--report-path=${reportPath}`,
    ],
    { cwd: directory, encoding: "utf8" },
  )
  const report = readFileSync(reportPath, "utf8")

  return {
    ...result,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    report,
    findings: JSON.parse(report),
  }
}

function assertDetected(result, secret) {
  assert.ifError(result.error)
  assert.equal(result.status, 17, "controlled fixture must fail the scan")
  assert.match(result.output, /leaks found:\s*[1-9][0-9]*/i)
  assert.equal(
    result.findings.some((finding) => finding.RuleID === "github-pat"),
    true,
    "the synthetic GitHub token must be detected by its dedicated rule",
  )
  assert.equal(
    `${result.output}${result.report}`.includes(secret),
    false,
    "scanner output must redact the complete controlled value",
  )
}

function findingMetadata(findings) {
  return findings.map(({ RuleID, File, StartLine }) => ({ RuleID, File, StartLine }))
}

test("workflow is pinned, read-only and fail-closed", () => {
  const workflow = read(".github/workflows/gitleaks.yml")

  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}\s+# v7\.0\.1/)
  assert.match(
    workflow,
    /gitleaks\/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e\s+# v3\.0\.0/,
  )
  assert.match(workflow, /GITLEAKS_VERSION:\s+"8\.30\.1"/)
  assert.match(workflow, /permissions:\n\s+contents: read\n\s+pull-requests: read/)
  assert.match(workflow, /fetch-depth:\s+0/)
  assert.match(workflow, /persist-credentials:\s+false/)
  assert.match(workflow, /GITLEAKS_ENABLE_COMMENTS:\s+"false"/)
  assert.match(workflow, /GITLEAKS_ENABLE_SUMMARY:\s+"false"/)
  assert.match(workflow, /GITLEAKS_ENABLE_UPLOAD_ARTIFACT:\s+"false"/)
  assert.match(
    workflow,
    /BASE_SHA:\s+\$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
  )
  assert.match(
    workflow,
    /HEAD_SHA:\s+\$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/,
  )
  assert.match(
    workflow,
    /gitleaks git .*--redact=100 .*--log-opts="-m \$\{BASE_SHA\}\.\.\$\{HEAD_SHA\}"/,
  )
  assert.doesNotMatch(workflow, /first-parent/)
  assert.match(workflow, /git archive "\$HEAD_SHA" \| tar -x -C "\$snapshot"/)
  assert.match(
    workflow,
    /gitleaks dir \. .*--redact=100 .*--exit-code=1/,
  )
  assert.match(
    workflow,
    /- name: Run all focused gitleaks regressions\n\s+run: node --test tests\/gitleaks-workflow\.test\.mjs/,
  )
  assert.doesNotMatch(workflow, /--test-name-pattern/)
  assert.doesNotMatch(workflow, /continue-on-error/)
})

test("concurrency isolates every push and only cancels superseded PR revisions", () => {
  const workflow = read(".github/workflows/gitleaks.yml")

  assert.match(
    workflow,
    /format\('push-\{0\}', github\.sha\)/,
    "every push must have a concurrency group unique to its commit SHA",
  )
  assert.match(
    workflow,
    /format\('pr-\{0\}-\{1\}', github\.event\.pull_request\.number, github\.head_ref\)/,
    "revisions of the same PR head must share a stable concurrency group",
  )
  assert.match(
    workflow,
    /cancel-in-progress:\s+\$\{\{ github\.event_name == 'pull_request' \}\}/,
  )
  assert.doesNotMatch(workflow, /cancel-in-progress:\s+true/)
  assert.doesNotMatch(workflow, /group:.*github\.ref/)
})

test("allowlists require exact public values and exact paths", () => {
  const config = read(".gitleaks.toml")

  assert.doesNotMatch(config, /^\[allowlist\]$/m)
  assert.doesNotMatch(config, /regexTarget\s*=\s*"line"/)
  assert.equal((config.match(/condition\s*=\s*"AND"/g) ?? []).length, 5)
  assert.equal((config.match(/regexTarget\s*=\s*"secret"/g) ?? []).length, 5)
  assert.match(config, /id\s*=\s*"generic-api-key"/)
})

test("controlled fixture survives every former allowlist bypass and stays redacted", () => {
  const secret = controlledValue()
  const cases = [
    {
      path: "src/components/CloudflareWebAnalytics.tsx",
      contents: `CLOUDFLARE_WEB_ANALYTICS_TOKEN=${secret}\n`,
    },
    {
      path: "supabase/migrations/20260510183000_seed_projetos_lei_amelio_soldado_sapl_completo.sql",
      contents: `proposicao_id_api=${secret}\n`,
    },
    {
      path: "supabase/rollback/20260811100000_votacoes_senado_chave_exata.rollback.sql",
      contents: `joao-capiberibe=${secret}\n`,
    },
    {
      path: "src/lib/remote-image-hosts.ts",
      contents: `api_key=${secret}\n`,
    },
    {
      path: "supabase/migrations/20260905150000_corrigir_textos_julgamento.sql",
      contents: `chave=${secret}\n`,
    },
  ]

  for (const fixture of cases) {
    const directory = mkdtempSync(path.join(tmpdir(), "puxa-ficha-gitleaks-"))
    try {
      writeFixture(directory, fixture.path, fixture.contents)
      assertDetected(scan(directory), secret)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

test("merge resolution secret is found only when the range includes parent diffs", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "puxa-ficha-gitleaks-merge-"))
  const secret = controlledValue()

  try {
    runGit(directory, ["init", "-b", "main"])
    runGit(directory, ["config", "user.name", "Controlled Fixture"])
    runGit(directory, ["config", "user.email", "fixture@example.invalid"])

    writeFixture(directory, "resolution.env", "state=base\n")
    runGit(directory, ["add", "resolution.env"])
    runGit(directory, ["commit", "-m", "base"])
    const baseSha = runGit(directory, ["rev-parse", "HEAD"])

    runGit(directory, ["checkout", "-b", "side"])
    writeFixture(directory, "resolution.env", "state=side\n")
    runGit(directory, ["commit", "-am", "side"])

    runGit(directory, ["checkout", "main"])
    writeFixture(directory, "resolution.env", "state=main\n")
    runGit(directory, ["commit", "-am", "main"])
    runGit(directory, ["merge", "--no-edit", "side"], 1)

    writeFixture(directory, "resolution.env", `CONTROLLED_TEST_VALUE=${secret}\n`)
    runGit(directory, ["add", "resolution.env"])
    runGit(directory, ["commit", "-m", "resolve merge"])
    const mergeParents = runGit(directory, ["rev-list", "--parents", "-n", "1", "HEAD"])
    assert.equal(mergeParents.split(" ").length, 3, "fixture must contain a real merge commit")

    writeFixture(directory, "resolution.env", "state=clean\n")
    runGit(directory, ["commit", "-am", "remove controlled value"])
    const headSha = runGit(directory, ["rev-parse", "HEAD"])

    const withoutParents = scanGit(
      directory,
      `${baseSha}..${headSha}`,
      "without-parent-diffs.json",
    )
    assert.ifError(withoutParents.error)
    assert.equal(withoutParents.status, 0, withoutParents.output)
    assert.deepEqual(withoutParents.findings, [])

    const withParents = scanGit(
      directory,
      `-m ${baseSha}..${headSha}`,
      "with-parent-diffs.json",
    )
    assertDetected(withParents, secret)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("only exact known false positives at their exact paths are allowed", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "puxa-ficha-gitleaks-"))
  const publicFiles = [
    "src/components/CloudflareWebAnalytics.tsx",
    "src/lib/remote-image-hosts.ts",
    "supabase/migrations/20260510183000_seed_projetos_lei_amelio_soldado_sapl_completo.sql",
    "supabase/rollback/20260811100000_votacoes_senado_chave_exata.rollback.sql",
    "supabase/migrations/20260905150000_corrigir_textos_julgamento.sql",
  ]

  try {
    for (const relativePath of publicFiles) copyFixture(directory, relativePath)
    const result = scan(directory)
    assert.ifError(result.error)
    assert.equal(
      result.status,
      0,
      `${result.output}${JSON.stringify(findingMetadata(result.findings))}`,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("an allowed public value is detected outside its exact path", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "puxa-ficha-gitleaks-"))
  const publicValue = ["f47e", "df88", "9574", "44dc", "8360", "0ce3", "7295", "5b50"].join("")

  try {
    writeFixture(
      directory,
      "wrong-path.env",
      `api_key=${publicValue}\n`,
    )
    const result = scan(directory)
    assert.ifError(result.error)
    assert.equal(result.status, 17, "the public value must fail outside its allowed path")
    assert.equal(
      result.findings.some((finding) => finding.RuleID === "generic-api-key"),
      true,
    )
    assert.equal(
      `${result.output}${result.report}`.includes(publicValue),
      false,
      "scanner output and report must redact the public value",
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("the public event UUID remains detected outside its migration", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "puxa-ficha-gitleaks-"))
  try {
    writeFixture(directory, "wrong-path.env", "-- @write tabela=historico_politico slug=ariel-capistrano chave=2c3f7577-3ed9-44ff-9360-c1740191e043 campos=observacoes\n")
    const result = scan(directory)
    assert.ifError(result.error)
    assert.equal(result.status, 17)
    assert.ok(result.findings.some((finding) => finding.RuleID === "generic-api-key"))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
