import assert from "node:assert/strict"
import { chmod, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import test from "node:test"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const DRIVER = join(ROOT, "scripts/data/programas-governo-governadores-2026/reprocessar-duvidas.mjs")
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
const slug = output.split("/").pop()
const mode = process.env.FAKE_MODE || "${mode}"
const delay = slug === "quota" ? 1 : Number(process.env.FAKE_DELAY || 30)
await appendFile(process.env.FAKE_EVENTS, JSON.stringify({ event: "start", slug, at: Date.now() }) + "\\n")
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
