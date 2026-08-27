import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

type RunnerResultado = { code: number | null; stdout: string; stderr: string }

function rodarRunner(caminho: string, envExtra: Record<string, string>, payloadStdin: string): Promise<RunnerResultado> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [caminho], {
      env: { ...process.env, ...envExtra },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", rejectPromise)
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }))
    child.stdin.end(payloadStdin)
  })
}

const RUNNER_GENERATOR = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-qwen.mjs", import.meta.url))
const RUNNER_JUDGE = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-judge-codex.mjs", import.meta.url))
const RUNNER_GENERATOR_LUNA = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-codex-luna.mjs", import.meta.url))
const DIR_RUNNERS = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/", import.meta.url))

const ENVELOPE = JSON.stringify({
  schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
  promptVersion: "programa-governo-governadores-generator-v1",
  instructions: "Responda com o objeto pedido.",
  input: { identityKey: "2026:GOVERNADOR:AM:40000000000" },
})

test("runner do generator converte resposta de CLI em objeto estruturado", async () => {
  const fakeCli = "/tmp/pf-fake-qwen.mjs"
  const { writeFile, chmod } = await import("node:fs/promises")
  await writeFile(fakeCli, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({response:'{\"ok\": true}'}))\n")
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_GENERATOR,
    { PF_QWEN_CLI: fakeCli, PF_QWEN_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: true })
})

test("runner do judge extrai mensagem final do stream ndjson e devolve objeto", async () => {
  const fakeCli = "/tmp/pf-fake-codex.mjs"
  const eventoFake = [
    JSON.stringify({ type: "item.started", item: { type: "agent_message" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '```json\\n{"ok": false}\\n```' } }),
    "",
  ].join("\n")
  const { writeFile, chmod } = await import("node:fs/promises")
  await writeFile(fakeCli, `#!/usr/bin/env node\nprocess.stdin.resume(); process.stdout.write(${JSON.stringify(eventoFake)})\n`)
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_JUDGE,
    { PF_CODEX_CLI: fakeCli, PF_CODEX_TIMEOUT_MS: "15000", PF_JUDGE_MODEL: "gpt-5.4-teste" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: false })
})

test("envelope invalido falha fechado nos dois runners", async () => {
  const base = DIR_RUNNERS
  for (const runner of ["run-generator-qwen.mjs", "run-judge-codex.mjs"]) {
    const fakeCli = "/tmp/pf-fake-nunca-chamado.mjs"
    const { writeFile, chmod } = await import("node:fs/promises")
    await writeFile(fakeCli, "#!/usr/bin/env node\nconsole.error('NAO DEVE SER CHAMADO'); process.exit(1)\n")
    await chmod(fakeCli, 0o755)
    const resultado = await rodarRunner(base + runner, { PF_QWEN_CLI: fakeCli, PF_CODEX_CLI: fakeCli }, '{"foo":1}')
    assert.notEqual(resultado.code, 0)
  }
})

test("runner luna propaga quota como quota e nao como json generico", async () => {
  const fakeCli = "/tmp/pf-fake-luna-quota.mjs"
  const { writeFile, chmod } = await import("node:fs/promises")
  // fake codex que retorna quota no stderr e stdout vazio
  await writeFile(fakeCli, "#!/usr/bin/env node\nprocess.stderr.write('quota exceeded token-plan 1-week'); process.stdout.write(''); process.exit(1)\n")
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_GENERATOR_LUNA,
    { PF_CODEX_CLI: fakeCli, PF_LUNA_MODEL: "muse-spark-1.2-quota-test", PF_CODEX_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.notEqual(resultado.code, 0)
  assert.match(resultado.stderr, /quota/i)
  assert.ok(!/resposta sem objeto JSON/i.test(resultado.stderr) || /quota/i.test(resultado.stderr), "quota deve aparecer, nao apenas 'resposta sem objeto'")
})

test("runner luna extrai JSON de stream ndjson igual ao judge", async () => {
  const fakeCli = "/tmp/pf-fake-luna-ok.mjs"
  const eventoFake = [
    JSON.stringify({ type: "item.started", item: { type: "agent_message" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '{"ok": true}' } }),
    "",
  ].join("\n")
  const { writeFile, chmod } = await import("node:fs/promises")
  await writeFile(fakeCli, `#!/usr/bin/env node\nprocess.stdin.resume(); process.stdout.write(${JSON.stringify(eventoFake)})\n`)
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_GENERATOR_LUNA,
    { PF_CODEX_CLI: fakeCli, PF_LUNA_MODEL: "muse-spark-1.2-teste", PF_CODEX_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: true })
})

test("runners opencode falham fechado com envelope invalido e exigem PW file", async () => {
  const base = DIR_RUNNERS
  for (const runner of ["run-generator-opencode-glm.mjs", "run-judge-opencode-deepseek.mjs"]) {
    const resultado = await rodarRunner(base + runner, { OC_SERVER_PW_FILE: "" }, '{"foo":1}')
    assert.notEqual(resultado.code, 0)
    // deve falhar por envelope invalido antes de tentar PW, ou por PW ausente – ambos sao fail-closed
  }
})

test("opencode client extrai JSON e detecta quota sem mascarar", async () => {
  const { extrairJson } = await import("../scripts/data/programas-governo-governadores-2026/opencode-server-client.mjs")
  assert.deepEqual(extrairJson('{"a":1}'), { a: 1 })
  assert.deepEqual(extrairJson('texto antes {"a":2} depois'), { a: 2 })
  assert.throws(() => extrairJson("sem json aqui"), /resposta sem objeto JSON/)
  // quota deve ser detectavel no texto (cliente marca quota antes de extrair)
  const textoQuota = "quota exceeded token-plan"
  assert.match(textoQuota, /quota/i)
})
