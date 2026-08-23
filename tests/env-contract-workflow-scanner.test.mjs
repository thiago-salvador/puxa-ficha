import assert from "node:assert/strict"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { describe, it } from "node:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  checkDocs,
  checkRunbookVercelInventory,
  scanJavaScriptSource,
  scanPythonSource,
  scanShellSource,
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
  it("propaga aliases JS encadeados, computados e bracket notation direta", () => {
    const result = scanJavaScriptSource(`
const first = process.env
const second = first
second.CHAINED_ENV
const processKey = "env"
const computed = process[processKey]
computed.COMPUTED_ENV
process["env"]["DIRECT_ENV"]
`)

    assert.deepEqual([...result.names].sort(), ["CHAINED_ENV", "COMPUTED_ENV", "DIRECT_ENV"])
    assert.deepEqual(result.unresolved, [])
  })

  it("respeita ordem e escopo de constantes homônimas em JS", () => {
    const result = scanJavaScriptSource(`
const key = "OUTER_ENV"
process.env[key]
{
  const key = "INNER_ENV"
  process.env[key]
}
process.env[key]
`)

    assert.deepEqual([...result.names].sort(), ["INNER_ENV", "OUTER_ENV"])
  })

  it("não promove aliases locais homônimos a process.env", () => {
    const result = scanJavaScriptSource(`
const source = { value: "local" }
const alias = source
alias.NOT_AN_ENV
{
  const source = process.env
  source.REAL_ENV
}
alias.STILL_NOT_AN_ENV
`)

    assert.deepEqual([...result.names], ["REAL_ENV"])
  })

  it("percorre todo o directive prologue para a fronteira client/server", () => {
    const blocked = scanJavaScriptSource(`
"use strict"
"use client"
process.env.SUPABASE_SERVICE_ROLE_KEY
`, "client.tsx")
    assert.match(blocked.clientViolations[0], /SUPABASE_SERVICE_ROLE_KEY/)

    const allowed = scanJavaScriptSource(`
"use strict"
"use client"
process.env.NEXT_PUBLIC_SITE_URL
process.env.NODE_ENV
`, "client.tsx")
    assert.deepEqual(allowed.clientViolations, [])
  })

  it("inclui from os import environ no scanner Python", () => {
    assert.deepEqual(
      [...scanPythonSource('from os import environ\nprint(environ["PYTHON_IMPORTED_ENV"])\n')],
      ["PYTHON_IMPORTED_ENV"],
    )
  })

  it("detecta atribuição com igual e printenv literal no shell", () => {
    assert.deepEqual(
      [...scanShellSource('${ASSIGN_DEFAULT_ENV=default}\nprintenv PRINTENV_LITERAL_ENV\n')].sort(),
      ["ASSIGN_DEFAULT_ENV", "PRINTENV_LITERAL_ENV"],
    )
  })

  it("falha fechado em expansão indireta e printenv dinâmico", () => {
    assert.throws(() => scanShellSource('${!TARGET_NAME}'), /expansão shell indireta/)
    assert.throws(() => scanShellSource('printenv "$TARGET_NAME"'), /printenv com chave dinâmica/)
  })

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

  it("remove aspas YAML de run inline antes de interpretar shell", () => {
    const singleQuoted = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: 'echo "$SINGLE_QUOTED_YAML_ENV"'
`)
    const doubleQuoted = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: "echo \\"$DOUBLE_QUOTED_YAML_ENV\\""
`)

    assert.deepEqual([...singleQuoted], ["SINGLE_QUOTED_YAML_ENV"])
    assert.deepEqual([...doubleQuoted], ["DOUBLE_QUOTED_YAML_ENV"])
  })

  it("interpreta bloco YAML dobrado como um único comando shell", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run: >-
          FOLDED_ENV="\${FOLDED_ENV:-fallback}"
          printenv FOLDED_PRINTENV
`)

    assert.deepEqual([...names].sort(), ["FOLDED_ENV", "FOLDED_PRINTENV"])
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

  it("falha fechado em bracket notation dinâmica de Actions", () => {
    assert.throws(
      () => scanWorkflowSource("jobs:\n  verify:\n    env:\n      VALUE: ${{ secrets[env.NODE_ENV] }}\n"),
      /acesso dinâmico de Actions.*secrets\[env\.NODE_ENV\]/,
    )
    assert.throws(
      () => scanWorkflowSource("jobs:\n  verify:\n    env:\n      VALUE: ${{ vars[matrix.key] }}\n"),
      /acesso dinâmico de Actions/,
    )
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

  it("faz alias JS encadeado e computado reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "tests/__env-contract-negative-chain.ts",
      'const key = "env"\nconst first = process[key]\nconst second = first\nconsole.log(second.UNCLASSIFIED_CHAIN_SECRET)\n',
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_CHAIN_SECRET/)
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

  it("faz bracket notation dinâmica de Actions reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      ".github/workflows/__env-contract-negative-dynamic.yml",
      "jobs:\n  verify:\n    env:\n      VALUE: ${{ secrets[env.NODE_ENV] }}\n",
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /acesso dinâmico de Actions/)
  })

  it("faz environ importado em Python reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "scripts/__env-contract-negative-python.py",
      'from os import environ\nprint(environ["UNCLASSIFIED_PYTHON_SECRET"])\n',
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_PYTHON_SECRET/)
  })

  it("faz env server-only em use client reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "src/__env-contract-negative-client.tsx",
      '"use strict"\n"use client"\nconsole.log(process.env.SUPABASE_SERVICE_ROLE_KEY)\n',
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
