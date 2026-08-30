import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test, { after, before } from "node:test"

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
const RUNNER_CODEX_LUNA = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-codex-luna.mjs", import.meta.url))
const RUNNER_CLAUDE = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-judge-claude.mjs", import.meta.url))
const RUNNER_LUNA = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-opencode-luna.mjs", import.meta.url))
const RUNNER_DEEPSEEK = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-judge-opencode-deepseek.mjs", import.meta.url))
const RUNNER_GLM = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/run-generator-opencode-glm.mjs", import.meta.url))
const DIR_RUNNERS = fileURLToPath(new URL("../scripts/data/programas-governo-governadores-2026/", import.meta.url))
const DIR_REPO = fileURLToPath(new URL("../", import.meta.url))
let DIR_FIXTURES = ""

before(async () => {
  DIR_FIXTURES = await mkdtemp(join(DIR_REPO, ".tmp-pf-programa-governo-runners-"))
})

after(async () => {
  await rm(DIR_FIXTURES, { recursive: true, force: true })
})

function fixturePath(nome: string): string {
  return join(DIR_FIXTURES, nome)
}

const ENVELOPE = JSON.stringify({
  schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
  promptVersion: "programa-governo-governadores-generator-v1",
  instructions: "Responda com o objeto pedido.",
  input: { identityKey: "2026:GOVERNADOR:AM:40000000000" },
})

test("runner do generator qwen converte resposta de CLI em objeto estruturado", async () => {
  const fakeCli = fixturePath("pf-fake-qwen.mjs")
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
  const fakeCli = fixturePath("pf-fake-codex.mjs")
  const eventoFake = [
    JSON.stringify({ type: "item.started", item: { type: "agent_message" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '```json\\n{"ok": false}\\n```' } }),
    "",
  ].join("\n")
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

test("runner Codex rejeita NDJSON sem mensagem final", async () => {
  const fakeCli = fixturePath("pf-fake-codex-sem-mensagem.mjs")
  const eventoFake = `${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 2 } })}\n`
  await writeFile(fakeCli, `#!/usr/bin/env node\nprocess.stdin.resume(); process.stdout.write(${JSON.stringify(eventoFake)})\n`)
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(RUNNER_CODEX, { PF_CODEX_CLI: fakeCli, PF_CODEX_TIMEOUT_MS: "15000" }, ENVELOPE)
  assert.notEqual(resultado.code, 0)
  assert.match(resultado.stderr, /sem mensagem final/)
})

test("runner do generator Luna usa Codex limpo, modelo explícito e telemetria", async () => {
  const fakeCli = fixturePath("pf-fake-codex-luna.mjs")
  const script = `#!/usr/bin/env node
const args=process.argv.slice(2)
for (const esperado of ['--ephemeral','--ignore-user-config','--ignore-rules','gpt-5.6-luna','model_reasoning_effort="medium"']) {
  if (!args.includes(esperado)) { console.error('arg ausente: '+esperado); process.exit(2) }
}
process.stdin.resume()
process.stdout.write(${JSON.stringify([
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '{"ok":true}' } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 21, output_tokens: 4 } }),
    "",
  ].join("\n"))})
`
  await writeFile(fakeCli, script)
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_CODEX_LUNA,
    { PF_CODEX_CLI: fakeCli, PF_CODEX_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: true })
  assert.match(resultado.stderr, /PF_MODEL_USAGE=.*"input_tokens":21/u)
})

test("runner do generator Luna permite elevar o esforço sem trocar o modelo", async () => {
  const fakeCli = fixturePath("pf-fake-codex-luna-high.mjs")
  const script = `#!/usr/bin/env node
const args=process.argv.slice(2)
for (const esperado of ['gpt-5.6-luna','model_reasoning_effort="high"']) {
  if (!args.includes(esperado)) { console.error('arg ausente: '+esperado); process.exit(2) }
}
process.stdin.resume()
process.stdout.write(${JSON.stringify([
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '{"ok":true}' } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
    "",
  ].join("\n"))})
`
  await writeFile(fakeCli, script)
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_CODEX_LUNA,
    {
      PF_CODEX_CLI: fakeCli,
      PF_CODEX_TIMEOUT_MS: "15000",
      PF_CODEX_REASONING_EFFORT: "high",
    },
    ENVELOPE,
  )
  assert.equal(resultado.code, 0, resultado.stderr)
})

test("runner do judge Claude usa modo mínimo e devolve structured_output", async () => {
  const fakeCli = fixturePath("pf-fake-claude-judge.mjs")
  const script = `#!/usr/bin/env node
const args=process.argv.slice(2)
for (const esperado of ['--safe-mode','--no-session-persistence','--json-schema','sonnet']) {
  if (!args.includes(esperado)) { console.error('arg ausente: '+esperado); process.exit(2) }
}
const schema=JSON.parse(args[args.indexOf('--json-schema')+1])
if ('$schema' in schema) { console.error('meta-schema nao removido'); process.exit(3) }
process.stdin.resume()
process.stdout.write(JSON.stringify({structured_output:{ok:false},usage:{input_tokens:18,output_tokens:3},total_cost_usd:0.01}))
`
  await writeFile(fakeCli, script)
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_CLAUDE,
    { PF_CLAUDE_CLI: fakeCli, PF_CLAUDE_TIMEOUT_MS: "15000" },
    JSON.stringify({ ...JSON.parse(ENVELOPE), schema: { ...JSON.parse(ENVELOPE).schema, $schema: 'https://json-schema.org/draft/2020-12/schema' } }),
  )
  assert.equal(resultado.code, 0, resultado.stderr)
  assert.deepEqual(JSON.parse(resultado.stdout), { ok: false })
  assert.match(resultado.stderr, /PF_MODEL_USAGE=.*"cost_usd":0\.01/u)
})

test("envelope invalido falha fechado nos runners qwen/codex/claude", async () => {
  const base = DIR_RUNNERS
  for (const runner of ["run-generator-qwen.mjs", "run-judge-codex.mjs", "run-generator-codex-luna.mjs", "run-judge-claude.mjs"]) {
    const fakeCli = fixturePath(`pf-fake-nunca-chamado-${runner}`)
    await writeFile(fakeCli, "#!/usr/bin/env node\nconsole.error('NAO DEVE SER CHAMADO'); process.exit(1)\n")
    await chmod(fakeCli, 0o755)
    const resultado = await rodarRunner(base + runner, { PF_QWEN_CLI: fakeCli, PF_CODEX_CLI: fakeCli }, '{"foo":1}')
    assert.notEqual(resultado.code, 0)
  }
})

test("runners Qwen, Codex e Claude rejeitam exit 7 mesmo com JSON valido", async () => {
  const fakeCli = fixturePath("pf-fake-model-exit7.mjs")
  await writeFile(fakeCli, `#!/usr/bin/env node
process.stdin.resume()
const isClaude=process.argv.includes('--safe-mode')
process.stdout.write(isClaude
  ? JSON.stringify({structured_output:{ok:true}})
  : ${JSON.stringify(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: '{"ok":true}' } }) + "\n")})
process.stderr.write('transport error')
process.exit(7)
`)
  await chmod(fakeCli, 0o755)
  for (const [runner, env] of [
    [RUNNER_QWEN, { PF_QWEN_CLI: fakeCli, PF_QWEN_TIMEOUT_MS: "15000" }],
    [RUNNER_CODEX_LUNA, { PF_CODEX_CLI: fakeCli, PF_CODEX_TIMEOUT_MS: "15000" }],
    [RUNNER_CLAUDE, { PF_CLAUDE_CLI: fakeCli, PF_CLAUDE_TIMEOUT_MS: "15000" }],
  ] as const) {
    const resultado = await rodarRunner(runner, env, ENVELOPE)
    assert.notEqual(resultado.code, 0, `runner ${runner} deveria falhar com exit 7`)
    assert.match(resultado.stderr, /saiu com 7/u)
  }
})

test("runner Claude inclui diagnóstico estruturado sanitizado quando CLI sai com erro", async () => {
  const fakeCli = fixturePath("pf-fake-claude-judge-erro-estruturado.mjs")
  await writeFile(fakeCli, `#!/usr/bin/env node
process.stdin.resume()
process.stdout.write(JSON.stringify({
  is_error: true,
  result: 'limite mensal atingido' + 'x'.repeat(2000),
  session_id: 'NAO_DEVE_VAZAR_SESSION_ID',
  structured_output: { input: 'NAO_DEVE_VAZAR_PAYLOAD' },
}))
process.stderr.write('stderr preservado')
process.exit(7)
`)
  await chmod(fakeCli, 0o755)
  const resultado = await rodarRunner(
    RUNNER_CLAUDE,
    { PF_CLAUDE_CLI: fakeCli, PF_CLAUDE_TIMEOUT_MS: "15000" },
    ENVELOPE,
  )
  assert.notEqual(resultado.code, 0)
  assert.match(resultado.stderr, /saiu com 7/u)
  assert.match(resultado.stderr, /stderr preservado/u)
  assert.match(resultado.stderr, /limite mensal atingido/u)
  assert.doesNotMatch(resultado.stderr, /NAO_DEVE_VAZAR/u)
  assert.ok(resultado.stderr.length < 700, `diagnóstico não limitado: ${resultado.stderr.length}`)
})

test("runners Qwen e Codex encerram por timeout com erro controlado", async () => {
  const fakeCli = fixturePath("pf-fake-model-timeout.mjs")
  await writeFile(fakeCli, "#!/usr/bin/env node\nprocess.on('SIGTERM',()=>process.exit(0)); process.stdin.resume(); setInterval(()=>{},1000)\n")
  await chmod(fakeCli, 0o755)
  for (const [runner, env] of [
    [RUNNER_QWEN, { PF_QWEN_CLI: fakeCli, PF_QWEN_TIMEOUT_MS: "50" }],
    [RUNNER_CODEX_LUNA, { PF_CODEX_CLI: fakeCli, PF_CODEX_TIMEOUT_MS: "50" }],
  ] as const) {
    const resultado = await rodarRunner(runner, env, ENVELOPE)
    assert.notEqual(resultado.code, 0)
    assert.match(resultado.stderr, /timeout apos 50ms/u)
  }
})

test("opencode runners falham fechado com envelope invalido (sem chamada ao go)", async () => {
  const base = DIR_RUNNERS
  for (const runner of ["run-generator-opencode-luna.mjs", "run-judge-opencode-deepseek.mjs", "run-generator-opencode-glm.mjs"]) {
    const resultado = await rodarRunner(base + runner, {}, '{"foo":1}')
    assert.notEqual(resultado.code, 0)
  }
})

test("runners opencode abortam sem PF_OPENCODE_GO, sem chamar modelo", async () => {
  // O default era "/Users/thiagosalvador/.codex/skills/opencode/scripts/opencode-go.mjs",
  // caminho pessoal de uma maquina especifica commitado num repositorio publico.
  // Em qualquer outro ambiente ele falhava so depois de montar o prompt, ou pior,
  // executava o que estivesse naquele caminho. Env vazia cobre tambem a ausente.
  for (const runner of [RUNNER_LUNA, RUNNER_DEEPSEEK, RUNNER_GLM]) {
    const resultado = await rodarRunner(runner, { PF_OPENCODE_GO: "" }, ENVELOPE)
    assert.notEqual(resultado.code, 0, `${runner} deveria abortar sem PF_OPENCODE_GO`)
    assert.match(
      resultado.stderr,
      /PF_OPENCODE_GO obrigatorio para runners OpenCode/u,
      `${runner} deveria dizer qual env falta; stderr: ${resultado.stderr}`,
    )
    assert.equal(resultado.stdout.trim(), "", "nao pode materializar saida de modelo")
  }
})

test("nenhum runner carrega caminho absoluto pessoal como default", async () => {
  const { readFile, readdir } = await import("node:fs/promises")
  const arquivos = (await readdir(DIR_RUNNERS)).filter((f) => f.endsWith(".mjs"))
  const libs = ["../scripts/lib/programas-governo-opencode-runner.mjs"]
  const alvos = [
    ...arquivos.map((f) => DIR_RUNNERS + f),
    ...libs.map((l) => fileURLToPath(new URL(l, import.meta.url))),
  ]
  for (const alvo of alvos) {
    const src = await readFile(alvo, "utf-8")
    const linhas = src
      .split("\n")
      .filter((linha) => !linha.trim().startsWith("//"))
      .join("\n")
    assert.doesNotMatch(
      linhas,
      /\/Users\/[a-z]/iu,
      `${alvo} tem caminho absoluto de maquina pessoal fora de comentario`,
    )
  }
})

test("runner opencode luna converte resposta do go em JSON valido", async () => {
  const fakeGo = fixturePath("pf-fake-opencode-luna-ok.mjs")
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

test("runner opencode falha quando telemetria configurada não pode ser gravada", async () => {
  const fakeGo = fixturePath("pf-fake-opencode-telemetria.mjs")
  const bloqueio = fixturePath("arquivo-no-lugar-do-diretorio")
  await writeFile(fakeGo, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({modelo:'gpt-5.6-luna', formato:'responses', uso:{}, texto:'{\"ok\": true}'}))\n")
  await writeFile(bloqueio, "bloqueio")
  await chmod(fakeGo, 0o755)
  const resultado = await rodarRunner(
    RUNNER_LUNA,
    { PF_OPENCODE_GO: fakeGo, PF_OPENCODE_TIMEOUT_MS: "15000", PF_MODEL_TELEMETRY_PATH: join(bloqueio, "tentativas.ndjson") },
    ENVELOPE,
  )
  assert.notEqual(resultado.code, 0)
  assert.match(resultado.stderr, /EEXIST|ENOTDIR|not a directory/iu)
})

test("runner opencode deepseek converte resposta do go em JSON valido", async () => {
  const fakeGo = fixturePath("pf-fake-opencode-deepseek-ok.mjs")
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
  const fakeGo = fixturePath("pf-fake-opencode-exit7.mjs")
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
  const fakeGo = fixturePath("pf-fake-opencode-glm-ok.mjs")
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
