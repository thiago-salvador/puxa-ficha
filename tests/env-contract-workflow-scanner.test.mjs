import assert from "node:assert/strict"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { describe, it } from "node:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  checkDocs,
  checkRunbookVercelInventory,
  scanWorkflowSource,
} from "../scripts/check-env-contract.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function runWithTemporaryFixture(relativePath, source) {
  const fixturePath = path.join(repoRoot, relativePath)
  writeFileSync(fixturePath, source)
  try {
    return spawnSync(process.execPath, ["scripts/check-env-contract.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
  } finally {
    rmSync(fixturePath, { force: true })
  }
}

describe("env contract workflow scanner", () => {
  it("encontra variáveis fornecidas pelo GitHub usadas diretamente em run", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: |
          echo "result=ok" >> "$GITHUB_OUTPUT"
          echo "## Resultado" >> "\${GITHUB_STEP_SUMMARY}"
          gh api "repos/\${GITHUB_REPOSITORY}/commits/main"
`)

    assert.deepEqual(
      [...names].filter((name) => name.startsWith("GITHUB_")).sort(),
      ["GITHUB_OUTPUT", "GITHUB_REPOSITORY", "GITHUB_STEP_SUMMARY"],
    )
  })

  it("mantém suporte a run inline e expansão com fallback", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: echo "\${GITHUB_ACTIONS:-false}"
`)

    assert.deepEqual([...names], ["GITHUB_ACTIONS"])
  })

  it("encontra bracket notation de secrets, vars e env", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    env:
      LOCAL_ENV: fixed
    steps:
      - run: echo "\${{ secrets['BRACKET_SECRET'] }} \${{ vars[\"BRACKET_VAR\"] }} \${{ env['LOCAL_ENV'] }}"
`)

    assert.deepEqual([...names].sort(), ["BRACKET_SECRET", "BRACKET_VAR", "LOCAL_ENV"])
  })

  it("não classifica variáveis locais do próprio bloco run", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: |
          LOCAL_VALUE="local"
          export EXPORTED_VALUE="exported"
          readonly IMMUTABLE_VALUE="fixed"
          declare -r DECLARED_VALUE="declared"
          LOCAL_VALUE+="-suffix"
          echo "$LOCAL_VALUE $EXPORTED_VALUE $IMMUTABLE_VALUE $DECLARED_VALUE"
          # $COMMENT_ONLY não é uma leitura
          echo '$SINGLE_QUOTED_VALUE também não é uma leitura'
          echo "## heading" >> "$GITHUB_STEP_SUMMARY"
`)

    assert.deepEqual([...names], ["GITHUB_STEP_SUMMARY"])
  })

  it("não mistura atribuições locais entre blocos run", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: |
          SHARED_NAME="local"
          echo "$SHARED_NAME"
      - run: echo "$SHARED_NAME"
`)

    assert.deepEqual([...names], ["SHARED_NAME"])
  })

  it("não suprime leitura externa usada no lado direito da atribuição", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: |
          UNCLASSIFIED_SHELL_SECRET="\${UNCLASSIFIED_SHELL_SECRET:-}"
          echo "$UNCLASSIFIED_SHELL_SECRET"
`)

    assert.deepEqual([...names], ["UNCLASSIFIED_SHELL_SECRET"])
  })

  it("faz uma referência nova e não classificada reprovar o contrato", () => {
    const block = [
      "Obrigatoriedade e fallback",
      "Responsável",
      "PF_ALERTS_REPLY_TO_EMAIL",
      "um único endereço simples",
      "sem fallback",
      "antes de qualquer chamada de rede",
    ].join("\n")

    assert.throws(
      () => checkDocs(new Set(["NEW_WORKFLOW_ENV"]), new Set(), block),
      /referências sem documentação: NEW_WORKFLOW_ENV/,
    )
  })

  it("faz o inventário Vercel do runbook reprovar sem Reply-To", () => {
    assert.throws(
      () => checkRunbookVercelInventory(new Set(), "| Vercel, runtime | painel | `RESEND_API_KEY` | dono |"),
      /PF_ALERTS_REPLY_TO_EMAIL/,
    )
  })

  it("mantém o guard ligado ao package script e ao job verify do CI", () => {
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"))
    const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8")

    assert.match(packageJson.scripts["check:env-contract"], /env-contract-workflow-scanner\.test\.mjs/)
    assert.match(packageJson.scripts["check:env-contract"], /check-env-contract\.mjs/)
    assert.match(workflow, /run: npm run check:env-contract/)
  })

  it("não sobrescreve o digest canônico do replay com tag móvel", () => {
    const example = readFileSync(path.join(repoRoot, ".env.example"), "utf8")
    assert.match(example, /^PF_REPLAY_POSTGRES_IMAGE=$/m)
    assert.doesNotMatch(example, /^PF_REPLAY_POSTGRES_IMAGE=postgres:17-alpine$/m)
  })

  it("faz alias destructuring de process.env reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "tests/__env-contract-negative-alias.ts",
      "const { env } = process\nconsole.log(env.UNCLASSIFIED_ALIAS_SECRET)\n",
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_ALIAS_SECRET/)
  })

  it("faz leitura shell externa autoatribuída reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "scripts/__env-contract-negative-shell.sh",
      'UNCLASSIFIED_SHELL_SECRET="${UNCLASSIFIED_SHELL_SECRET:-}"\nprintf "%s\\n" "$UNCLASSIFIED_SHELL_SECRET"\n',
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_SHELL_SECRET/)
  })

  it("faz bracket notation não classificada reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      ".github/workflows/__env-contract-negative.yml",
      "jobs:\n  verify:\n    steps:\n      - run: echo \"${{ secrets['UNCLASSIFIED_BRACKET_SECRET'] }}\"\n",
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_BRACKET_SECRET/)
  })

  it("faz env server-only em use client reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "src/__env-contract-negative-client.tsx",
      '"use client"\nconsole.log(process.env.SUPABASE_SERVICE_ROLE_KEY)\n',
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /server-only.*SUPABASE_SERVICE_ROLE_KEY/s)
  })

  it("aceita falsos alarmes de objeto local e env pública em use client", () => {
    const localAlias = runWithTemporaryFixture(
      "tests/__env-contract-positive-local-alias.ts",
      'const config = { env: { LOCAL_CONFIG: "ok" } }\nconst { env } = config\nconsole.log(env.LOCAL_CONFIG)\n',
    )
    assert.equal(localAlias.status, 0, `${localAlias.stdout}\n${localAlias.stderr}`)

    const publicClient = runWithTemporaryFixture(
      "src/__env-contract-positive-client.tsx",
      '"use client"\nconsole.log(process.env.NEXT_PUBLIC_SITE_URL)\n',
    )
    assert.equal(publicClient.status, 0, `${publicClient.stdout}\n${publicClient.stderr}`)
  })
})
