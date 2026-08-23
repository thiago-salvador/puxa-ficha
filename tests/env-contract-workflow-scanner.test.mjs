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

  it("resolve alias de process, parênteses e wrappers TypeScript", () => {
    const result = scanJavaScriptSource(`
const processAlias = process
processAlias.env.PROCESS_ALIAS_ENV;
(process.env).PARENTHESIZED_ENV;
(process.env as NodeJS.ProcessEnv).AS_WRAPPED_ENV;
(process.env satisfies NodeJS.ProcessEnv).SATISFIES_WRAPPED_ENV;
process!.env.NON_NULL_PROCESS_ENV;
(<NodeJS.ProcessEnv>process.env).ASSERTED_ENV;
`)

    assert.deepEqual([...result.names].sort(), [
      "ASSERTED_ENV",
      "AS_WRAPPED_ENV",
      "NON_NULL_PROCESS_ENV",
      "PARENTHESIZED_ENV",
      "PROCESS_ALIAS_ENV",
      "SATISFIES_WRAPPED_ENV",
    ])
    assert.deepEqual(result.unresolved, [])
  })

  it("resolve import de process, globalThis, destructuring aninhado e wrappers estáticos", () => {
    const result = scanJavaScriptSource(`
import runtimeProcess from "node:process"
runtimeProcess.env.IMPORTED_PROCESS_ENV
globalThis.process.env.GLOBAL_THIS_PROCESS_ENV
const { env: { NESTED_DESTRUCTURED_ENV } } = process
const fallbackEnvironment = process.env || {}
fallbackEnvironment.FALLBACK_ENV
const spreadEnvironment = { ...process.env }
spreadEnvironment.SPREAD_ENV
`)

    assert.deepEqual([...result.names].sort(), [
      "FALLBACK_ENV",
      "GLOBAL_THIS_PROCESS_ENV",
      "IMPORTED_PROCESS_ENV",
      "NESTED_DESTRUCTURED_ENV",
      "SPREAD_ENV",
    ])
    assert.deepEqual(result.unresolved, [])
  })

  it("aplica a fronteira client/server às novas origens JS estruturais", () => {
    const result = scanJavaScriptSource(`
"use strict"
"use client"
import runtimeProcess from "node:process"
runtimeProcess.env.IMPORTED_CLIENT_SECRET
globalThis.process.env.GLOBAL_THIS_CLIENT_SECRET
const { env: { NESTED_CLIENT_SECRET } } = process
const fallbackEnvironment = process.env || {}
fallbackEnvironment.FALLBACK_CLIENT_SECRET
const spreadEnvironment = { ...process.env }
spreadEnvironment.SPREAD_CLIENT_SECRET
`, "client.tsx")

    assert.deepEqual(
      result.clientViolations.map((violation) => violation.split(":").at(-1)).sort(),
      [
        "FALLBACK_CLIENT_SECRET",
        "GLOBAL_THIS_CLIENT_SECRET",
        "IMPORTED_CLIENT_SECRET",
        "NESTED_CLIENT_SECRET",
        "SPREAD_CLIENT_SECRET",
      ],
    )
  })

  it("aplica escopo de função a var e não deixa aliases homônimos vazarem", () => {
    const result = scanJavaScriptSource(`
function readsEnvironment() {
  var processAlias = process
  var environment = processAlias.env
  environment.VAR_ALIAS_ENV
  {
    var environment = { NOT_AN_ENV: true }
  }
  environment.NOT_AN_ENV
}
function shadowsProcess() {
  process.env.NOT_GLOBAL_PROCESS
  var process = { env: {} }
}
try {
  throw new Error("fixture")
} catch (process) {
  process.env.NOT_GLOBAL_PROCESS_EITHER
}
process.env.AFTER_CATCH_ENV
`)

    assert.deepEqual([...result.names].sort(), ["AFTER_CATCH_ENV", "VAR_ALIAS_ENV"])
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

  it("resolve aliases estruturais de os, environ e getenv em Python", () => {
    const names = scanPythonSource(`
import os as operating_system
module_alias = operating_system
environment = module_alias.environ
environment_alias = environment
print(environment_alias["PYTHON_MODULE_ALIAS_ENV"])
getter = module_alias.getenv
getter_alias = getter
print(getter_alias("PYTHON_GETENV_ALIAS_ENV"))
mapping_getter = module_alias.environ.get
print(mapping_getter("PYTHON_ENVIRON_GET_ALIAS_ENV"))
`)

    assert.deepEqual([...names].sort(), [
      "PYTHON_ENVIRON_GET_ALIAS_ENV",
      "PYTHON_GETENV_ALIAS_ENV",
      "PYTHON_MODULE_ALIAS_ENV",
    ])
  })

  it("resolve NamedExpr e defaults de função ligados ao ambiente em Python", () => {
    const names = scanPythonSource(`
import os
print((environment := os.environ)["PYTHON_NAMED_EXPR_ENV"])
def read_mapping(environment=os.environ):
    return environment["PYTHON_DEFAULT_ENVIRON_ENV"]
def read_getter(getter=os.getenv):
    return getter("PYTHON_DEFAULT_GETENV_ENV")
`)

    assert.deepEqual([...names].sort(), [
      "PYTHON_DEFAULT_ENVIRON_ENV",
      "PYTHON_DEFAULT_GETENV_ENV",
      "PYTHON_NAMED_EXPR_ENV",
    ])
  })

  it("resolve helper Python somente quando todas as chaves são literais", () => {
    const names = scanPythonSource(`
import os
def config(name):
    return os.environ.get(name)
first = config("PYTHON_HELPER_FIRST_ENV")
second = config("PYTHON_HELPER_SECOND_ENV")
`)
    assert.deepEqual([...names].sort(), ["PYTHON_HELPER_FIRST_ENV", "PYTHON_HELPER_SECOND_ENV"])

    assert.throws(
      () =>
        scanPythonSource(`
import os
def config(name):
    return os.environ.get(name)
key = input()
value = config(key)
`),
      /Python.*sem resolução estática.*dynamic Python environment key/s,
    )
  })

  it("falha fechado em chave ou acessor Python dinâmico", () => {
    assert.throws(
      () => scanPythonSource('import os as operating_system\nprint(operating_system.environ[input()])\n'),
      /dynamic Python environment key/,
    )
    assert.throws(
      () => scanPythonSource('import os\nenvironment = getattr(os, "environ")\n'),
      /dynamic Python environment accessor/,
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
    assert.throws(() => scanShellSource('${!target_name}'), /expansão shell indireta.*target_name/)
    assert.throws(() => scanShellSource('${!Mixed_Case_Pointer}'), /expansão shell indireta/)
    assert.throws(() => scanShellSource('${!lowercase_prefix*}'), /expansão shell indireta/)
    assert.throws(() => scanShellSource('printenv "$TARGET_NAME"'), /printenv com chave dinâmica/)
  })

  it("falha fechado em reavaliação shell sem confundir opções de outras ferramentas", () => {
    assert.throws(() => scanShellSource('eval "$command"'), /reavaliação shell/)
    assert.throws(() => scanShellSource('command eval "$command"'), /reavaliação shell/)
    assert.throws(() => scanShellSource('if eval "$command"; then :; fi'), /reavaliação shell/)
    assert.throws(() => scanShellSource('bash -lc "$command"'), /reavaliação shell/)
    assert.throws(() => scanShellSource('printf "%s" "$command" | sh -c "$(cat)"'), /reavaliação shell/)
    assert.throws(() => scanShellSource('echo "$(eval \'$command\')"'), /reavaliação shell/)
    assert.doesNotThrow(() => scanShellSource("node --eval 'console.log(1)'"))
    assert.doesNotThrow(() => scanShellSource('${!versions[@]}'))
    assert.doesNotThrow(() => scanShellSource('bash -c instalar'))
  })

  it("registra todos os argumentos literais de printenv", () => {
    assert.deepEqual(
      [...scanShellSource('printenv PRINTENV_FIRST PRINTENV_SECOND "PRINTENV_THIRD"')].sort(),
      ["PRINTENV_FIRST", "PRINTENV_SECOND", "PRINTENV_THIRD"],
    )
    assert.throws(
      () => scanShellSource('printenv PRINTENV_STATIC "$dynamic_name"'),
      /printenv com chave dinâmica/,
    )
  })

  it("analisa backticks e process substitution com printenv literal", () => {
    assert.deepEqual(
      [...scanShellSource("echo `printenv BACKTICK_ENV`\ndiff <(printenv PROCESS_INPUT_ENV) >(printenv PROCESS_OUTPUT_ENV)")].sort(),
      ["BACKTICK_ENV", "PROCESS_INPUT_ENV", "PROCESS_OUTPUT_ENV"],
    )
    assert.throws(() => scanShellSource("echo `printenv DYNAMIC"), /backtick shell sem fechamento/)
    assert.throws(() => scanShellSource("diff <(printenv DYNAMIC"), /substituição shell sem fechamento/)
  })

  it("falha fechado em dump de env e resolve nameref literal", () => {
    assert.throws(() => scanShellSource("env"), /env sem comando expõe ambiente completo/)
    assert.throws(() => scanShellSource("env -i"), /env sem comando expõe ambiente completo/)
    assert.throws(() => scanShellSource("env LOCAL_ONLY=value"), /env sem comando expõe ambiente completo/)
    assert.deepEqual([...scanShellSource("env -i printenv ENV_COMMAND_KEY")], ["ENV_COMMAND_KEY"])
    assert.deepEqual(
      [...scanShellSource("declare -n reference=NAMEREF_ENV\nprintf '%s\\n' \"$reference\"")],
      ["NAMEREF_ENV"],
    )
    assert.throws(
      () => scanShellSource('local -n reference="$pointer"'),
      /nameref shell com alvo não resolvido/,
    )
    assert.throws(() => scanShellSource("typeset -n reference"), /nameref shell sem alvo literal/)
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

  it("aceita espaço YAML antes dos dois pontos em run", () => {
    const names = scanWorkflowSource(`
jobs:
  verify:
    steps:
      - run   : printenv RUN_SPACE_FIRST RUN_SPACE_SECOND
`)

    assert.deepEqual([...names].sort(), ["RUN_SPACE_FIRST", "RUN_SPACE_SECOND"])
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
      /acesso bare ou dinâmico de Actions.*secrets\[env\.NODE_ENV\]/,
    )
    assert.throws(
      () => scanWorkflowSource("jobs:\n  verify:\n    env:\n      VALUE: ${{ vars[matrix.key] }}\n"),
      /acesso bare ou dinâmico de Actions/,
    )
  })

  it("falha fechado em contextos Actions bare em qualquer expressão bruta", () => {
    assert.throws(
      () => scanWorkflowSource("not-even-yaml: ${{ toJSON(secrets) }}\n"),
      /acesso bare ou dinâmico de Actions.*toJSON\(secrets\)/,
    )
    assert.throws(
      () => scanWorkflowSource("value: ${{ contains(vars, 'x') }}\n"),
      /acesso bare ou dinâmico de Actions/,
    )
    assert.throws(
      () => scanWorkflowSource("value: ${{ env }}\n"),
      /acesso bare ou dinâmico de Actions/,
    )
    assert.doesNotThrow(() => scanWorkflowSource("value: ${{ format('{0}', 'secrets vars env') }}\n"))
    assert.deepEqual(
      [...scanWorkflowSource("value: ${{ format('}}', secrets['ACTION_AFTER_BRACES']) }}\n")],
      ["ACTION_AFTER_BRACES"],
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

  it("faz aliases de process e wrappers TypeScript reprovarem com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "tests/__env-contract-negative-structural.ts",
      'const runtime = process\nconst environment = (runtime.env as NodeJS.ProcessEnv)\nconsole.log(environment.UNCLASSIFIED_STRUCTURAL_SECRET)\n',
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_STRUCTURAL_SECRET/)
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
    assert.match(`${result.stdout}\n${result.stderr}`, /acesso bare ou dinâmico de Actions/)
  })

  it("faz contexto Actions bare reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      ".github/workflows/__env-contract-negative-bare-context.yml",
      "jobs:\n  verify:\n    env:\n      VALUE: ${{ toJSON(secrets) }}\n",
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /acesso bare ou dinâmico de Actions/)
  })

  it("faz environ importado em Python reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "scripts/__env-contract-negative-python.py",
      'from os import environ\nprint(environ["UNCLASSIFIED_PYTHON_SECRET"])\n',
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_PYTHON_SECRET/)
  })

  it("faz alias encadeado de os.environ reprovar com exit nonzero", () => {
    const result = runWithTemporaryFixture(
      "scripts/__env-contract-negative-python-alias.py",
      'import os as operating_system\nenvironment = operating_system.environ\nsecond = environment\nprint(second["UNCLASSIFIED_PYTHON_ALIAS_SECRET"])\n',
    )

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /UNCLASSIFIED_PYTHON_ALIAS_SECRET/)
  })

  it("faz indireção minúscula e eval shell reprovarem com exit nonzero", () => {
    const indirect = runWithTemporaryFixture(
      "scripts/__env-contract-negative-indirect.sh",
      'pointer="UNCLASSIFIED_INDIRECT_SECRET"\nprintf "%s\\n" "${!pointer}"\n',
    )
    assert.notEqual(indirect.status, 0)
    assert.match(`${indirect.stdout}\n${indirect.stderr}`, /expansão shell indireta/)

    const reevaluated = runWithTemporaryFixture(
      "scripts/__env-contract-negative-eval.sh",
      'command="printf %s \\\"$UNCLASSIFIED_EVAL_SECRET\\\""\neval "$command"\n',
    )
    assert.notEqual(reevaluated.status, 0)
    assert.match(`${reevaluated.stdout}\n${reevaluated.stderr}`, /reavaliação shell/)
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
