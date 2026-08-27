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

const RUNNER_QWEN = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-qwen.mjs", import.meta.url))
const RUNNER_CODEX = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-judge-codex.mjs", import.meta.url))
const RUNNER_LUNA = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-opencode-luna.mjs", import.meta.url))
const RUNNER_DEEPSEEK = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-judge-opencode-deepseek.mjs", import.meta.url))
const RUNNER_GLM = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-opencode-glm.mjs", import.meta.url))
const DIR_RUNNERS = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/", import.meta.url))

const ENVELOPE = JSON.stringify({
  schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
  promptVersion: "programa-governo-governadores-generator-v1",
  instructions: "Responda com o objeto pedido.",
  input: { identityKey: "2026:GOVERNADOR:AM:40000000000" },
})

test("runner do generator qwen converte resposta de CLI em objeto estruturado", async () => {
  const fakeCli = "/tmp/pf-fake-qwen.mjs"
  const { writeFile, chmod } = await import("node:fs/promises")
  await writeFile(fakeCli, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({response:'{\"ok\": true}'}))\n")
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_QWEN,
    { PF_QWEN_CLI: fakeCli, PF_QWEN_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: true })
})

test("runner do judge codex extrai mensagem final do stream ndjson e devolve objeto", async () => {
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
    RUNNER_CODEX,
    { PF_CODEX_CLI: fakeCli, PF_CODEX_TIMEOUT_MS: "15000", PF_JUDGE_MODEL: "gpt-5.4-teste" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: false })
})

test("envelope invalido falha fechado nos runners qwen/codex", async () => {
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

test("opencode runners falham fechado com envelope invalido (sem chamada ao go)", async () => {
  const base = DIR_RUNNERS
  for (const runner of ["run-generator-opencode-luna.mjs", "run-judge-opencode-deepseek.mjs", "run-generator-opencode-glm.mjs"]) {
    const resultado = await rodarRunner(base + runner, {}, '{"foo":1}')
    assert.notEqual(resultado.code, 0)
  }
})

test("runner opencode luna converte resposta do go em JSON valido", async () => {
  const fakeGo = "/tmp/pf-fake-opencode-luna-ok.mjs"
  const { writeFile, chmod } = await import("node:fs/promises")
  // fake opencode-go que responde com --json wrapper {texto: '{"ok": true}'}
  await writeFile(fakeGo, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({modelo:'gpt-5.6-luna', formato:'responses', uso:{}, texto:'{\"ok\": true}'}))\n")
  await chmod(fakeGo, 0o755)
  const resultado = await rodarRunner(
    RUNNER_LUNA,
    { PF_OPENCODE_GO: fakeGo, PF_OPENCODE_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: true })
})

test("runner opencode deepseek converte resposta do go em JSON valido", async () => {
  const fakeGo = "/tmp/pf-fake-opencode-deepseek-ok.mjs"
  const { writeFile, chmod } = await import("node:fs/promises")
  await writeFile(fakeGo, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({modelo:'deepseek-v4-flash', formato:'chat', uso:{}, texto:'{\"ok\": false}'}))\n")
  await chmod(fakeGo, 0o755)
  const resultado = await rodarRunner(
    RUNNER_DEEPSEEK,
    { PF_OPENCODE_GO: fakeGo, PF_OPENCODE_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: false })
})

test("runner rejeita subprocesso com exit 7 mesmo se stdout tem JSON valido", async () => {
  const fakeGo = "/tmp/pf-fake-opencode-exit7.mjs"
  const { writeFile, chmod } = await import("node:fs/promises")
  // stdout com JSON valido, stderr com erro de transporte, exit 7
  await writeFile(fakeGo, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({modelo:'gpt-5.6-luna', formato:'responses', uso:{}, texto:'{\"ok\": true}'})); process.stderr.write('transport error: connection reset'); process.exit(7)\n")
  await chmod(fakeGo, 0o755)
  for (const runner of [RUNNER_LUNA, RUNNER_DEEPSEEK, RUNNER_GLM]) {
    const resultado = await rodarRunner(
      runner,
      { PF_OPENCODE_GO: fakeGo, PF_OPENCODE_TIMEOUT_MS: "15000" },
      ENVELOPE,
    )
    assert.notEqual(resultado.code, 0, `runner ${runner} deveria falhar com exit 7`)
    // Nenhum JSON deve ser materializado em stdout quando exit !=0; runner deve falhar fechado
    // Se por acaso stdout contem JSON, o runner nao deve considera-lo sucesso
    assert.ok(resultado.stderr.includes("saiu com 7") || resultado.stderr.includes("opencode-go"), "erro deve mencionar exit 7")
  }
})

test("runner opencode glm usa api chat explicitamente e converte resposta", async () => {
  const fakeGo = "/tmp/pf-fake-opencode-glm-ok.mjs"
  const { writeFile, chmod } = await import("node:fs/promises")
  // verifica que args contem --api chat
  await writeFile(fakeGo, "#!/usr/bin/env node\nconst args=process.argv.join(' '); if(!args.includes('--api') || !args.includes('chat')){console.error('sem --api chat'); process.exit(2)}; process.stdout.write(JSON.stringify({modelo:'glm-5.3', formato:'chat', uso:{}, texto:'{\"ok\": true}'}))\n")
  await chmod(fakeGo, 0o755)
  const resultado = await rodarRunner(
    RUNNER_GLM,
    { PF_OPENCODE_GO: fakeGo, PF_OPENCODE_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: true })
})
