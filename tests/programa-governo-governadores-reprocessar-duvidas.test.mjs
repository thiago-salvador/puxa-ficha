import assert from "node:assert/strict"
import { chmod, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import test from "node:test"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const DRIVER = join(ROOT, "scripts/data/programas-governo-governadores-2026/reprocessar-duvidas.mjs")
const FINAL_REPAIRS = join(ROOT, "scripts/data/programas-governo-governadores-2026/reparos-duvidas-finais.json")
const NODE = process.execPath

async function fixture(cases, mode = "pass") {
  const root = await mkdtemp(join(tmpdir(), "pf-reprocessar-duvidas-"))
  const casesPath = join(root, "duvidas-reais.json")
  const fakeNode = join(root, "fake-node.mjs")
  const events = join(root, "events.log")
  await writeFile(casesPath, JSON.stringify({ cases }))
  await writeFile(fakeNode, `#!${NODE}
import { appendFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
const args = process.argv.slice(2)
const get = (prefix) => args.find((item) => item.startsWith(prefix))?.slice(prefix.length)
const output = get("--output-dir=")
const uf = get("--ufs=")
const sqCandidato = get("--sq-candidato=")
const inventory = get("--inventory=")
const repairGuidance = get("--repair-guidance=")
const repairFactsLimit = get("--repair-facts-limit=")
const forceFacts = args.includes("--force-fatos")
const slug = output.split("/").pop()
const mode = process.env.FAKE_MODE || "${mode}"
const delay = slug === "quota" ? 1 : Number(process.env.FAKE_DELAY || 30)
await appendFile(process.env.FAKE_EVENTS, JSON.stringify({ event: "start", slug, at: Date.now(), repairGuidance, repairFactsLimit, forceFacts }) + "\\n")
await new Promise((resolve) => setTimeout(resolve, delay))
const blocked = mode === "blocked" || (mode === "mixed" && slug === "blocked")
const quota = mode === "quota" && slug === "quota"
if (!sqCandidato) throw new Error("--sq-candidato ausente")
const record = { version: 1, estado: "em_revisao", fonte: { ano: 2026, cargo: "GOVERNADOR", uf, sqCandidato, slug }, ingestao: { identityKey: "2026:GOVERNADOR:" + uf + ":" + sqCandidato, etapa: blocked ? "modelos" : "concluida", erro: blocked ? "Eval bloqueado" : null, eval: { completo: !blocked, blockers: blocked ? 1 : 0 } } }
await mkdir(join(output, uf), { recursive: true })
await writeFile(join(output, uf, slug + ".json"), JSON.stringify(record))
await appendFile(process.env.FAKE_EVENTS, JSON.stringify({ event: "end", slug, at: Date.now() }) + "\\n")
if (quota) { console.error("429 usage limit reached; token=sk-test-secret"); process.exit(7) }
if (blocked) process.exit(1)
`, "utf8")
  await chmod(fakeNode, 0o755)
  const run = (extra = [], env = {}) => new Promise((resolve) => {
    const child = spawn(NODE, [DRIVER,
      `--cases=${casesPath}`, `--repo=${root}`, `--output-dir=${join(root, "output")}`,
      `--inventory=${join(root, "inventory.json")}`, `--archive-dir=${join(root, "archives")}`,
      `--node=${fakeNode}`, "--concurrency=2", ...extra,
    ], { cwd: undefined, env: { ...process.env, FAKE_MODE: mode, FAKE_EVENTS: events, ...env } })
    let stdout = ""; let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
  return { root, casesPath, events, run }
}

async function progress(root) {
  return JSON.parse(await readFile(join(root, "output/progress.json"), "utf8"))
}

function statusMap(snapshot) {
  return new Map(snapshot.cases.map((item) => [item.slug, item.status]))
}

test("respeita concorrencia, retoma apenas Eval completo e preserva blocked", async () => {
  const f = await fixture([
    { uf: "SP", slug: "first", sqCandidato: "10000000001" },
    { uf: "SP", slug: "blocked", sqCandidato: "10000000002" },
    { uf: "SP", slug: "third", sqCandidato: "10000000003" },
  ], "mixed")
  const first = await f.run(["--concurrency=2"], { FAKE_DELAY: "80" })
  assert.equal(first.code, 0)
  const before = (await readFile(f.events, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse)
  const starts = before.filter((event) => event.event === "start").map((event) => event.at).sort((a, b) => a - b)
  const ends = before.filter((event) => event.event === "end").map((event) => event.at).sort((a, b) => a - b)
  assert.equal(starts.length, 3)
  assert.equal(ends.length, 3)
  assert.ok(starts[1] - starts[0] < 70, "deveria iniciar dois casos antes da primeira conclusão")
  const snapshot = await progress(f.root)
  assert.deepEqual(Object.fromEntries(statusMap(snapshot)), { first: "pass", blocked: "blocked", third: "pass" })

  await f.run([], { FAKE_DELAY: "1" })
  const after = (await readFile(f.events, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(after.filter((event) => event.event === "start").length, 4, "pass não pode ser reprocessado")
  assert.equal((await progress(f.root)).cases.find((item) => item.slug === "blocked").status, "blocked")
})

test("congela novos disparos em quota e deixa pendentes intactos", async () => {
  const f = await fixture([
    { uf: "SP", slug: "quota", sqCandidato: "10000000001" },
    { uf: "SP", slug: "second", sqCandidato: "10000000002" },
    { uf: "SP", slug: "third", sqCandidato: "10000000003" },
  ], "quota")
  const result = await f.run([], { FAKE_DELAY: "40" })
  assert.equal(result.code, 1)
  const snapshot = await progress(f.root)
  assert.equal(snapshot.quota.frozen, true)
  assert.equal(snapshot.cases.find((item) => item.slug === "third").status, "pending")
  assert.match(snapshot.cases.find((item) => item.slug === "quota").stderr, /REDACTED/)
  assert.doesNotMatch(snapshot.cases.find((item) => item.slug === "quota").stderr, /sk-test-secret/)
  const starts = (await readFile(f.events, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse).filter((event) => event.event === "start")
  assert.ok(starts.length <= 2)
})

test("checkpoint final é JSON válido e não deixa temporário de escrita atômica", async () => {
  const f = await fixture([{ uf: "SP", slug: "first", sqCandidato: "10000000001" }])
  assert.equal((await f.run([], { FAKE_DELAY: "1" })).code, 0)
  const snapshot = await progress(f.root)
  assert.equal(snapshot.cases[0].status, "pass")
  const files = await readdir(join(f.root, "output"))
  assert.equal(files.some((name) => name.endsWith(".tmp")), false)
})

test("propaga estratégia por fatos e orientação específica para o CLI canônico", async () => {
  const guidance = "Use o verbo combater e não aumente a intensidade da proposta."
  const f = await fixture([{
    uf: "AM",
    slug: "gilberto-vasconcelos",
    sqCandidato: "40002535267",
    strategy: "fatos",
    guidance,
    factLimit: 6,
  }])
  assert.equal((await f.run([], { FAKE_DELAY: "1" })).code, 0)
  const events = (await readFile(f.events, "utf8")).trim().split("\n").map(JSON.parse)
  const start = events.find((event) => event.event === "start")
  assert.equal(start.forceFacts, true)
  assert.equal(start.repairGuidance, guidance)
  assert.equal(start.repairFactsLimit, "6")
})

test("mudança de orientação invalida checkpoint aprovado e reprocessa fail-closed", async () => {
  const firstGuidance = "Use somente o trecho literal da primeira revisão."
  const secondGuidance = "Use a orientação corrigida da segunda revisão."
  const candidate = {
    uf: "RN",
    slug: "alysson-bezerra",
    sqCandidato: "200002535255",
    strategy: "fatos",
    guidance: firstGuidance,
  }
  const f = await fixture([candidate])
  assert.equal((await f.run([], { FAKE_DELAY: "1" })).code, 0)
  const first = await progress(f.root)
  const firstFingerprint = first.cases[0].caseFingerprint

  await writeFile(f.casesPath, JSON.stringify({
    cases: [{ ...candidate, guidance: secondGuidance }],
  }))
  assert.equal((await f.run([], { FAKE_DELAY: "1" })).code, 0)

  const events = (await readFile(f.events, "utf8")).trim().split("\n").map(JSON.parse)
  const starts = events.filter((event) => event.event === "start")
  assert.equal(starts.length, 2)
  assert.equal(starts[1].repairGuidance, secondGuidance)
  const second = await progress(f.root)
  assert.equal(second.cases[0].attempts, 2)
  assert.notEqual(second.cases[0].caseFingerprint, firstFingerprint)
})

test("plano final materializa exatamente as 17 orientações aprovadas", async () => {
  const { validateCases } = await import(DRIVER)
  const source = JSON.parse(await readFile(FINAL_REPAIRS, "utf8"))
  const cases = validateCases(source)
  assert.equal(cases.length, 17)
  assert.equal(new Set(cases.map(({ slug }) => slug)).size, 17)
  assert.ok(cases.every(({ strategy, guidance }) => strategy === "fatos" && guidance.length > 30))
  assert.deepEqual(cases.filter(({ factLimit }) => factLimit === 6).map(({ slug }) => slug).sort(), [
    "otaviano-pivetta", "samuel-de-mattos",
  ])
})
