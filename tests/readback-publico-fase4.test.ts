import assert from "node:assert/strict"
import { X509Certificate } from "node:crypto"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import test from "node:test"
import {
  compararAssinaturasDestaques,
  compararAssinaturasSuperficie,
} from "../scripts/audit/comparar-destaques-publicos"

const root = process.cwd()
const runnerPath = resolve(root, "scripts/audit/readback-publico-fase4.sh")
const releaseReadbackPath = resolve(root, "scripts/audit/readback-release-pf-ajustes.sh")
const publicoPath = resolve(root, "scripts/audit/readback-publico-fase4.ts")
const preloadPath = resolve(root, "tests/fixtures/readback-publico-fase4.preload.mjs")
const timeoutRunnerPath = resolve(root, "scripts/audit/lib/run-with-timeout.mjs")
const workflowPath = resolve(root, ".github/workflows/readback-fase4.yml")
const coverageDocPath = resolve(root, "docs/cobertura-de-dados.md")
const supabaseCaPath = resolve(root, "scripts/audit/certs/supabase-root-2021.crt")
const expectedSha = "0123456789abcdef0123456789abcdef01234567"
const canonicalDatabaseUrl =
  "postgresql://postgres:fixture@db.wskpzsobvqwhnbsdsmok.supabase.co:5432/postgres"

type RunResult = ReturnType<typeof spawnSync>

function output(result: RunResult): string {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`
}

function executable(path: string, source: string): void {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function runRunner(overrides: Record<string, string | undefined> = {}): RunResult & { calls: string } {
  const fixture = mkdtempSync(join(tmpdir(), "pf-fase4-runner-"))
  const bin = join(fixture, "bin")
  const calls = join(fixture, "calls.log")
  spawnSync("mkdir", ["-p", bin], { encoding: "utf8" })
  writeFileSync(calls, "")

  executable(
    join(bin, "git"),
    `#!/bin/bash
set -euo pipefail
printf 'git:%s\n' "$*" >> "$PF_FIXTURE_CALLS"
if [[ "$1 $3 $4" == "-C rev-parse HEAD" ]]; then
  printf '%s\n' "$PF_FAKE_GIT_HEAD"
elif [[ "$1 $3" == "-C status" ]]; then
  [[ "${"${PF_FAKE_GIT_ERROR:-}"}" != "status" ]] || exit 128
  printf '%s' "${"${PF_FAKE_GIT_STATUS:-}"}"
elif [[ "$1 $3 $4" == "-C ls-files -v" ]]; then
  [[ "${"${PF_FAKE_GIT_ERROR:-}"}" != "ls-files" ]] || exit 128
  printf '%s' "${"${PF_FAKE_GIT_FLAGS:-}"}"
elif [[ "$*" == "-C / -c http.sslVerify=true -c http.followRedirects=false ls-remote https://github.com/thiago-salvador/puxa-ficha.git refs/heads/main" ]]; then
  [[ -z "${"${GIT_SSL_NO_VERIFY:-}"}" && -z "${"${GIT_SSL_CAINFO:-}"}" ]]
  [[ "${"${GIT_CONFIG_GLOBAL:-}"}" == "/dev/null" && "${"${GIT_CONFIG_SYSTEM:-}"}" == "/dev/null" ]]
  [[ "${"${GIT_CONFIG_COUNT:-}"}" == "0" && "${"${GIT_ALLOW_PROTOCOL:-}"}" == "https" ]]
  remote_calls="$(grep -c 'ls-remote https://github.com/thiago-salvador/puxa-ficha.git' "$PF_FIXTURE_CALLS")"
  if [[ "$remote_calls" -gt 1 && -n "${"${PF_FAKE_GIT_MAIN_FINAL:-}"}" ]]; then
    printf '%s\trefs/heads/main\n' "$PF_FAKE_GIT_MAIN_FINAL"
  else
    printf '%s\trefs/heads/main\n' "${"${PF_FAKE_GIT_MAIN:-$PF_FAKE_GIT_HEAD}"}"
  fi
else
  echo "unexpected git invocation: $*" >&2
  exit 91
fi
`,
  )
  executable(
    join(bin, "psql"),
    `#!/bin/bash
set -euo pipefail
printf 'psql:%s\n' "$*" >> "$PF_FIXTURE_CALLS"
[[ -z "${"${PGHOSTADDR:-}"}" && -z "${"${PGSERVICE:-}"}" && -z "${"${PGSERVICEFILE:-}"}" ]]
[[ "${"${PGHOST:-}"}" == "db.wskpzsobvqwhnbsdsmok.supabase.co" ]]
[[ "${"${PGPORT:-}"}" == "5432" && "${"${PGUSER:-}"}" == "postgres" ]]
[[ "${"${PGPASSWORD:-}"}" == "fixture" && "${"${PGDATABASE:-}"}" == "postgres" ]]
[[ "${"${PGOPTIONS:-}"}" == "-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000" ]]
[[ "${"${PGSSLMODE:-}"}" == "verify-full" && "${"${PGSSLROOTCERT:-}"}" == */scripts/audit/certs/supabase-root-2021.crt ]]
[[ "${"${PGCONNECT_TIMEOUT:-}"}" == "10" ]]
[[ -z "${"${SSL_CERT_FILE:-}"}" && -z "${"${SSL_CERT_DIR:-}"}" ]]
release=(
  20260809070000 20260810085000 20260810090000 20260810090100
  20260810090200 20260810093000 20260810094000 20260810120000
  20260810120500 20260810120600 20260810121000 20260810122000
  20260810123000 20260810124000 20260811100000 20260811100100
  20260811101000 20260811101100 20260811101200 20260811102000
  20260811102100
  20260812123000 20260812124000
  20260812125000
)
dummy=371
if [[ "$PF_FAKE_LEDGER_MODE" == "bad_total" ]]; then dummy=370; fi
if [[ "$PF_FAKE_LEDGER_MODE" == "bad_top" ]]; then dummy=370; fi
if [[ "$PF_FAKE_LEDGER_MODE" == "bad_count" ]]; then dummy=372; release=("${"${release[@]:1}"}"); fi
for ((i=1; i<=dummy; i++)); do printf '20200101%06d\n' "$i"; done
printf '%s\n' "${"${release[@]}"}"
if [[ "$PF_FAKE_LEDGER_MODE" == "bad_top" ]]; then printf '%s\n' 20260811102200; fi
`,
  )
  executable(
    join(bin, "node"),
    `#!/bin/bash
set -euo pipefail
printf 'node:%s\n' "$*" >> "$PF_FIXTURE_CALLS"
[[ -z "${"${NODE_TLS_REJECT_UNAUTHORIZED:-}"}" && -z "${"${NODE_EXTRA_CA_CERTS:-}"}" && -z "${"${NODE_OPTIONS:-}"}" ]]
[[ -z "${"${SSL_CERT_FILE:-}"}" && -z "${"${SSL_CERT_DIR:-}"}" ]]
if [[ "$#" == "0" ]]; then exec "$PF_REAL_NODE"; fi
if [[ "$1" == "scripts/audit/lib/run-with-timeout.mjs" ]]; then exec "$PF_REAL_NODE" "$@"; fi
if [[ "$*" == *"--input-type=module"* && "$*" == *"--import tsx"* ]]; then
  printf '%s' "$PF_FAKE_SUPABASE_REF"
fi
`,
  )
  executable(
    join(bin, "npm"),
    `#!/bin/bash
set -euo pipefail
printf 'npm:%s\n' "$*" >> "$PF_FIXTURE_CALLS"
`,
  )
  executable(
    join(bin, "bash"),
    `#!/bin/bash
set -euo pipefail
printf 'bash:%s\n' "$*" >> "$PF_FIXTURE_CALLS"
`,
  )

  const result = spawnSync("/bin/bash", [runnerPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      PF_DATABASE_URL: canonicalDatabaseUrl,
      PF_PUBLIC_SITE_URL: "https://puxaficha.com.br",
      PF_EXPECTED_DEPLOY_SHA: expectedSha,
      PF_DRY_RUN: "1",
      PF_OUTPUT_DIR: join(fixture, "output"),
      PF_FIXTURE_CALLS: calls,
      PF_FAKE_GIT_HEAD: expectedSha,
      PF_FAKE_GIT_STATUS: "",
      PF_FAKE_GIT_FLAGS: "",
      PF_FAKE_GIT_MAIN: expectedSha,
      PF_REAL_NODE: process.execPath,
      PF_FAKE_LEDGER_MODE: "ok",
      PF_FAKE_SUPABASE_REF: "wskpzsobvqwhnbsdsmok",
      ...overrides,
    },
  })
  const callLog = readFileSync(calls, "utf8")
  rmSync(fixture, { force: true, recursive: true })
  return Object.assign(result, { calls: callLog })
}

function runPublico(
  scenario = "ok",
  overrides: { publicUrl?: string; expected?: string } = {},
): RunResult {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      preloadPath,
      publicoPath,
      `--public-url=${overrides.publicUrl ?? "https://puxaficha.com.br"}`,
      `--expected-sha=${overrides.expected ?? expectedSha}`,
      "--expect-final",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PF_DRY_RUN: "1",
        PF_FIXTURE_SCENARIO: scenario,
        PF_FIXTURE_SHA: expectedSha,
      },
    },
  )
}

function runReleaseReadback(
  databaseUrl: string,
  overrides: Record<string, string | undefined> = {},
  trace = false,
): RunResult & { calls: string } {
  const fixture = mkdtempSync(join(tmpdir(), "pf-release-readback-"))
  const bin = join(fixture, "bin")
  const calls = join(fixture, "calls.log")
  spawnSync("mkdir", ["-p", bin], { encoding: "utf8" })
  writeFileSync(calls, "")
  executable(
    join(bin, "psql"),
    `#!/bin/bash
set -euo pipefail
printf 'psql:%s|host=%s|port=%s|user=%s|database=%s|pass_len=%s|hostaddr=%s|service=%s|ssl=%s|root=%s|options=%s\n' \
  "$*" "${"${PGHOST:-}"}" "${"${PGPORT:-}"}" "${"${PGUSER:-}"}" \
  "${"${PGDATABASE:-}"}" "${"${#PGPASSWORD}"}" \
  "${"${PGHOSTADDR:-}"}" "${"${PGSERVICE:-}"}" "${"${PGSSLMODE:-}"}" \
  "${"${PGSSLROOTCERT:-}"}" "${"${PGOPTIONS:-}"}" >> "$PF_FIXTURE_CALLS"
[[ -z "${"${SSL_CERT_FILE:-}"}" && -z "${"${SSL_CERT_DIR:-}"}" ]]
[[ "${"${PGPASSWORD:-}"}" == "$PF_EXPECTED_LIBPQ_PASSWORD" ]]
`,
  )
  const args = trace
    ? ["-x", releaseReadbackPath, "20260809070000"]
    : [releaseReadbackPath, "20260809070000"]
  const result = spawnSync("/bin/bash", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      PF_DATABASE_URL: databaseUrl,
      PF_EXPECTED_LIBPQ_PASSWORD: decodeURIComponent(new URL(databaseUrl).password),
      PF_FIXTURE_CALLS: calls,
      ...overrides,
    },
  })
  const callLog = readFileSync(calls, "utf8")
  rmSync(fixture, { force: true, recursive: true })
  return Object.assign(result, { calls: callLog })
}

test("runner executa a cadeia somente no checkout, SHA e ledger exatos", () => {
  const result = runRunner()
  assert.equal(result.status, 0, output(result))
  assert.equal((result.calls.match(/^node:--import .*scripts\/audit\/(?:gerar-fixture-cards-dinheiro|readback-|comparar-)/gm) ?? []).length, 6)
  assert.equal((result.calls.match(/^bash:scripts\/audit\/readback-release-pf-ajustes\.sh /gm) ?? []).length, 24)
  assert.match(result.calls, /^git:-C .* rev-parse HEAD$/m)
  assert.match(result.calls, /^git:-C .* status --porcelain=v1 --untracked-files=normal$/m)
  const psqlCall = result.calls.split("\n").find((line) => line.startsWith("psql:")) ?? ""
  assert.ok(psqlCall)
  assert.ok(!psqlCall.includes(canonicalDatabaseUrl), "a URL do banco não pode aparecer no argv")
  const mainChanged = runRunner({ PF_FAKE_GIT_MAIN_FINAL: "f".repeat(40) })
  assert.notEqual(mainChanged.status, 0, "mudança de main durante o readback passou")
})

test("workflow da Fase 4 está aposentado e a substituição está documentada", () => {
  assert.equal(existsSync(workflowPath), false)
  const docs = readFileSync(coverageDocPath, "utf8")
  assert.match(docs, /Readback público Fase 4 aposentado/)
  assert.match(docs, /QA de três camadas/)
  assert.match(docs, /readback por\s+estado da Onda G/)
  assert.match(docs, /universo extinto pela Onda P/)
})

test("runner fixa a CA oficial do Supabase por fingerprint", () => {
  const certificado = new X509Certificate(readFileSync(supabaseCaPath))
  assert.equal(
    certificado.fingerprint256,
    "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
  )
})

test("runner rejeita SHA curto, checkout em outro SHA e worktree sujo antes dos auditores", () => {
  for (const [label, env] of [
    ["SHA curto", { PF_EXPECTED_DEPLOY_SHA: "0123456" }],
    ["HEAD divergente", { PF_FAKE_GIT_HEAD: "f".repeat(40) }],
    ["worktree sujo", { PF_FAKE_GIT_STATUS: " M scripts/audit/readback-publico-fase4.ts\n" }],
    ["main divergente", { PF_FAKE_GIT_MAIN: "f".repeat(40) }],
    ["skip-worktree", { PF_FAKE_GIT_FLAGS: "S src/lib/api.ts\n" }],
    ["status ilegível", { PF_FAKE_GIT_ERROR: "status" }],
    ["índice ilegível", { PF_FAKE_GIT_ERROR: "ls-files" }],
  ] as const) {
    const result = runRunner(env)
    assert.notEqual(result.status, 0, `${label} passou:\n${output(result)}`)
    assert.doesNotMatch(result.calls, /^node:--import tsx scripts\/audit\//m, `${label} chegou aos auditores`)
  }
})

test("runner rejeita banco de outro projeto antes de consultar o ledger", () => {
  const result = runRunner({
    PF_DATABASE_URL: "postgresql://postgres:fixture@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres",
  })
  assert.notEqual(result.status, 0, output(result))
  assert.doesNotMatch(result.calls, /^psql:/m)
  assert.doesNotMatch(result.calls, /^node:--import tsx scripts\/audit\//m)
})

test("runner rejeita username de produção em host alheio", () => {
  const result = runRunner({
    PF_DATABASE_URL:
      "postgresql://postgres.wskpzsobvqwhnbsdsmok:fixture@localhost:5432/postgres",
  })
  assert.notEqual(result.status, 0, output(result))
  assert.doesNotMatch(result.calls, /^psql:/m)
})

test("runner rejeita parâmetros libpq de redirecionamento e limpa ambiente herdado", () => {
  const query = runRunner({ PF_DATABASE_URL: `${canonicalDatabaseUrl}?hostaddr=127.0.0.1` })
  assert.notEqual(query.status, 0, output(query))
  assert.doesNotMatch(query.calls, /^psql:/m)

  for (const url of [
    canonicalDatabaseUrl.replace(/\/postgres$/, "/shadow"),
    canonicalDatabaseUrl.replace(":5432/", ":9999/"),
  ]) {
    const invalidTarget = runRunner({ PF_DATABASE_URL: url })
    assert.notEqual(invalidTarget.status, 0, output(invalidTarget))
    assert.doesNotMatch(invalidTarget.calls, /^psql:/m)
  }

  const inherited = runRunner({
    PGHOSTADDR: "127.0.0.1",
    PGSERVICE: "hostil",
    PGSERVICEFILE: "/tmp/inexistente",
    PGOPTIONS: "-c default_transaction_read_only=off",
    PGSSLMODE: "disable",
    PGCONNECT_TIMEOUT: "999",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    NODE_EXTRA_CA_CERTS: "/tmp/ca-hostil.pem",
    NODE_OPTIONS: "--tls-min-v1.0",
    SSL_CERT_FILE: "/tmp/cert-hostil.pem",
    SSL_CERT_DIR: "/tmp/certs-hostis",
      GIT_SSL_NO_VERIFY: "1",
      GIT_SSL_CAINFO: "/tmp/git-ca-hostil.pem",
      GIT_DIR: "/tmp/git-dir-hostil",
      GIT_WORK_TREE: "/tmp/git-worktree-hostil",
      GIT_INDEX_FILE: "/tmp/git-index-hostil",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "url.file:///tmp/fork.insteadOf",
      GIT_CONFIG_VALUE_0: "https://github.com/thiago-salvador/puxa-ficha.git",
  })
  assert.equal(inherited.status, 0, output(inherited))
})

test("watchdog encerra o grupo inteiro sem deixar descendente", () => {
  const fixture = mkdtempSync(join(tmpdir(), "pf-fase4-timeout-"))
  const script = join(fixture, "parent.sh")
  const childPidPath = join(fixture, "child.pid")
  executable(
    script,
    `#!/bin/bash\nset -euo pipefail\ntrap '' TERM\nsleep 30 &\nprintf '%s' "$!" > "$PF_CHILD_PID_PATH"\nwait\n`,
  )
  const result = spawnSync(process.execPath, [timeoutRunnerPath, "1", script], {
    encoding: "utf8",
    env: { ...process.env, PF_CHILD_PID_PATH: childPidPath },
    timeout: 10_000,
  })
  assert.equal(result.status, 124, output(result))
  const childPid = Number(readFileSync(childPidPath, "utf8"))
  let alive = true
  try {
    process.kill(childPid, 0)
  } catch {
    alive = false
  }
  if (alive) process.kill(childPid, "SIGKILL")
  rmSync(fixture, { force: true, recursive: true })
  assert.equal(alive, false, `processo descendente ${childPid} sobreviveu ao timeout`)
})

test("watchdog propaga cancelamento externo ao grupo inteiro", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "pf-fase4-signal-"))
  const script = join(fixture, "parent.sh")
  const childPidPath = join(fixture, "child.pid")
  executable(
    script,
    `#!/bin/bash\nset -euo pipefail\ntrap '' TERM\nsleep 30 &\nprintf '%s' "$!" > "$PF_CHILD_PID_PATH"\nwait\n`,
  )
  const wrapper = spawn(process.execPath, [timeoutRunnerPath, "30", script], {
    stdio: "ignore",
    env: { ...process.env, PF_CHILD_PID_PATH: childPidPath },
  })
  for (let tentativa = 0; tentativa < 50 && !existsSync(childPidPath); tentativa += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.ok(existsSync(childPidPath), "fixture não iniciou o processo descendente")
  wrapper.kill("SIGTERM")
  await new Promise((resolve) => setTimeout(resolve, 100))
  wrapper.kill("SIGTERM")
  const exitCode = await new Promise<number | null>((resolve) => wrapper.once("close", resolve))
  assert.equal(exitCode, 143)
  const childPid = Number(readFileSync(childPidPath, "utf8"))
  let alive = true
  try {
    process.kill(childPid, 0)
  } catch {
    alive = false
  }
  if (alive) process.kill(childPid, "SIGKILL")
  rmSync(fixture, { force: true, recursive: true })
  assert.equal(alive, false, `processo descendente ${childPid} sobreviveu ao SIGTERM do wrapper`)
})

test("runner rejeita cliente Supabase ligado a outro projeto", () => {
  const result = runRunner({ PF_FAKE_SUPABASE_REF: "aaaaaaaaaaaaaaaaaaaa" })
  assert.notEqual(result.status, 0, output(result))
  assert.doesNotMatch(result.calls, /^psql:/m)
})

test("readback unitário fixa produção, TLS e read-only sem vazar a URL", () => {
  const sentinel = "senha-sentinela-nao-logar"
  const wrong = runReleaseReadback(
    "postgresql://postgres:fixture@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres",
  )
  assert.notEqual(wrong.status, 0, output(wrong))
  assert.equal(wrong.calls, "")
  for (const url of [
    canonicalDatabaseUrl.replace(/\/postgres$/, "/shadow"),
    canonicalDatabaseUrl.replace(":5432/", ":9999/"),
  ]) {
    const invalidTarget = runReleaseReadback(url)
    assert.notEqual(invalidTarget.status, 0, output(invalidTarget))
    assert.equal(invalidTarget.calls, "")
  }

  const canonical = canonicalDatabaseUrl.replace("fixture", sentinel)
  const hostile = runReleaseReadback(
    canonical,
    {
      PGHOSTADDR: "127.0.0.1",
      PGSERVICE: "hostil",
      PGSSLMODE: "disable",
      PGOPTIONS: "-c default_transaction_read_only=off",
      NODE_OPTIONS: "--tls-min-v1.0",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      NODE_EXTRA_CA_CERTS: "/tmp/ca-hostil.pem",
      SSL_CERT_FILE: "/tmp/cert-hostil.pem",
      SSL_CERT_DIR: "/tmp/certs-hostis",
    },
    true,
  )
  assert.equal(hostile.status, 0, output(hostile))
  assert.doesNotMatch(output(hostile), new RegExp(sentinel))
  assert.doesNotMatch(hostile.calls, new RegExp(sentinel))
  assert.match(hostile.calls, /host=db\.wskpzsobvqwhnbsdsmok\.supabase\.co\|port=5432\|user=postgres\|database=postgres\|pass_len=[1-9][0-9]*/)
  assert.match(hostile.calls, /hostaddr=\|service=\|ssl=verify-full\|root=.*scripts\/audit\/certs\/supabase-root-2021\.crt/)
  assert.match(hostile.calls, /default_transaction_read_only=on/)
})

test("comparação banco/API rejeita conteúdo antigo com os mesmos slugs", () => {
  const hash = "a".repeat(64)
  const linhas = Array.from({ length: 194 }, (_, index) => ({
    slug: `slug-${index}`,
    assinaturaConteudo: hash,
  }))
  const local = { resumo: { fichasDetalhe: linhas } }
  const publico = { destaquesPorFicha: linhas.map((linha) => ({ ...linha })) }
  assert.doesNotThrow(() => compararAssinaturasDestaques(local, publico))
  publico.destaquesPorFicha[17]!.assinaturaConteudo = "b".repeat(64)
  assert.throws(() => compararAssinaturasDestaques(local, publico), /diverge do banco canônico/)

  const superficie = linhas.map((linha) => ({
    slug: linha.slug,
    assinaturas: { dinheiro: hash, perfilCompleto: hash },
  }))
  const superficiePublica = superficie.map(({ slug, assinaturas }) => ({ slug, ...assinaturas }))
  assert.doesNotThrow(() =>
    compararAssinaturasSuperficie({ universo: superficie }, { superficiePorFicha: superficiePublica }),
  )
  superficiePublica[31]!.dinheiro = "b".repeat(64)
  assert.throws(
    () => compararAssinaturasSuperficie({ universo: superficie }, { superficiePorFicha: superficiePublica }),
    /divergem do banco canônico/,
  )
})

test("runner rejeita independentemente total, topo e cardinalidade da allowlist do ledger", () => {
  for (const mode of ["bad_total", "bad_top", "bad_count"]) {
    const result = runRunner({ PF_FAKE_LEDGER_MODE: mode })
    assert.notEqual(result.status, 0, `ledger ${mode} passou:\n${output(result)}`)
    assert.doesNotMatch(result.calls, /^node:--import tsx scripts\/audit\//m)
  }
})

test("readback público executa API e DOM das 194 fichas nos dois viewports", () => {
  const result = runPublico()
  assert.equal(result.status, 0, output(result))
  const parsed = JSON.parse(String(result.stdout)) as {
    universo: number
    porViewport: Record<string, number>
    defeitos: unknown[]
  }
  assert.equal(parsed.universo, 194)
  assert.deepEqual(parsed.porViewport, { desktop: 194, mobile: 194 })
  assert.deepEqual(parsed.defeitos, [])
})

test("readback público rejeita host não canônico, ambiente não produtivo e SHA inválido", () => {
  const invalidRuns = [
    runPublico("ok", { publicUrl: "https://preview.example.test" }),
    runPublico("preview"),
    runPublico("ok", { expected: "0123456" }),
    runPublico("sha_mismatch"),
    runPublico("deployment_changed"),
  ]
  for (const result of invalidRuns) assert.notEqual(result.status, 0, output(result))
})

test("readback público falha para universo incompleto, cache impróprio e defeito DOM", () => {
  for (const scenario of [
    "universe_193",
    "cacheable_profile",
    "dom_defect",
    "dom_content_mismatch",
    "money_content_mismatch",
    "trajectory_content_mismatch",
    "href_mismatch",
    "justice_content_mismatch",
    "timeline_content_mismatch",
    "votes_content_mismatch",
    "legislation_content_mismatch",
    "redirected_api",
    "redirected_dom",
    "delayed_redirect_dom",
    "legislation_api_failed",
    "legislation_incomplete",
    "legislation_subtab_mismatch",
    "legislation_page2_mismatch",
    "legislation_next_broken",
    "legislation_page2_hidden",
    "legislation_page2_text_mismatch",
    "legislation_page2_href_mismatch",
  ]) {
    const result = runPublico(scenario)
    assert.notEqual(result.status, 0, `${scenario} passou:\n${output(result)}`)
  }
})

test("API legislativa usa desempate único antes de paginar", () => {
  const source = readFileSync(join(root, "src/lib/api.ts"), "utf8")
  assert.match(
    source,
    /\.order\("ano", \{ ascending: false \}\)\s*\.order\("numero", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.range\(/,
  )
})

test("readback público exige 970 células por viewport e zero estados silenciosos", () => {
  for (const scenario of ["missing_highlight_cell", "silent_state"]) {
    const result = runPublico(scenario)
    assert.notEqual(result.status, 0, `${scenario} passou:\n${output(result)}`)
  }
})

test("readback público rejeita IDs extras da trajetória e processo sem url_fonte", () => {
  for (const scenario of [
    "extra_trajectory",
    "process_without_source",
    "process_private_source",
    "process_trailing_dot_source",
  ]) {
    const result = runPublico(scenario)
    assert.notEqual(result.status, 0, `${scenario} passou:\n${output(result)}`)
  }
})
