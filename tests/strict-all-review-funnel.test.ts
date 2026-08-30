import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { createServer } from "node:net"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"

import { generateStrictAllSql, planStrictAllDecisions } from "../scripts/audit/apply-strict-all-review-decisions"
import { buildStrictAllQueue } from "../scripts/audit/generate-strict-all-review-funnel"
import { slugsSolicitados } from "../scripts/curadoria-processos-lote"

const ROOT = resolve(import.meta.dirname, "..")
const EVIDENCE = join(ROOT, "QA/evidencias/2026-08-30-strict-all-review-funnel")
const CANONICAL = join(ROOT, "QA/evidencias/2026-08-30-superficie-strict-all-human-review.json")
const SNAPSHOT = join(EVIDENCE, "coverage-snapshot-readonly.json")

function queue(): ReturnType<typeof buildStrictAllQueue> {
  const receipt = JSON.parse(readFileSync(join(EVIDENCE, "input-receipt.json"), "utf8"))
  return buildStrictAllQueue(
    JSON.parse(readFileSync(CANONICAL, "utf8")),
    JSON.parse(readFileSync(SNAPSHOT, "utf8")),
    {
      canonicalPath: CANONICAL,
      snapshotPath: SNAPSHOT,
      snapshotCheckedAt: receipt.snapshot.checked_at,
      generatedAt: "2026-08-30T18:00:00.000Z",
      outputDir: EVIDENCE,
    },
  )
}

test("fila preserva o universo e as prioridades sem duplicar fichas", () => {
  const result = queue()
  assert.deepEqual(result.counts, {
    occurrences: 459,
    profiles: 169,
    p0_profiles: 10,
    p1_cohort_profiles: 41,
    p1_queue_profiles: 37,
    p1_promoted_to_p0: 4,
    p2_profiles: 122,
    p2_r5_votes_only: 30,
    p2_r2_only: 7,
    r3_occurrences: 91,
  })
  assert.equal(new Set(result.profiles.map((profile) => profile.slug)).size, 169)
  assert.equal(result.profiles.reduce((sum, profile) => sum + profile.decisions.length, 0), 459)
  assert.deepEqual(
    result.profiles.filter((profile) => profile.priority === "P0").map((profile) => profile.slug).sort(),
    [
      "ciro-gomes-gov-ce",
      "dr-daniel",
      "felipe-camarao",
      "isael-munduruku",
      "leandro-grass",
      "pablo-marcal",
      "rico-pinheiro",
      "soldado-sampaio",
      "vera-lucia-ce",
      "well-macedo",
    ],
  )
})

test("lotes só incluem os dois recortes P2 autorizados e R3 fica por fonte", () => {
  const result = queue()
  assert.deepEqual(result.batches.map((batch) => [batch.batch_key, batch.count]), [
    ["P2:R5-votos-only", 30],
    ["P2:R2-only", 7],
  ])
  assert.equal(result.profiles.flatMap((profile) => profile.decisions).filter((item) =>
    item.category.startsWith("R3:") && item.batch_eligible,
  ).length, 0)
  assert.deepEqual(result.jobs.map((job) => [job.source, job.slugs.length, job.batch_commands.length]), [
    ["transparencia-sanctions", 42, 3],
    ["processos-curadoria", 49, 3],
  ])
  assert.ok(result.jobs.every((job) => job.writes_production === false))
  assert.ok(result.jobs.flatMap((job) => job.batch_commands).every((command) => {
    const match = command.match(/--slugs=([^ ]+)/)
    return Boolean(match && match[1].split(",").length <= 20)
  }))
})

test("HTML não seleciona decisão factual por default", () => {
  for (const page of ["p0.html", "p1.html", "p2.html"]) {
    const html = readFileSync(join(EVIDENCE, page), "utf8")
    assert.match(html, /<option value="">Pendente, sem default<\/option>/)
    assert.doesNotMatch(html, /<option[^>]+selected/)
    assert.match(html, /signal:AbortSignal\.timeout\(10_000\)/)
  }
  assert.equal((readFileSync(join(EVIDENCE, "p0.html"), "utf8").match(/<article class="card"/g) ?? []).length, 10)
})

test("argumento de curadoria aceita apenas lotes explícitos de até 20 slugs", () => {
  assert.deepEqual(slugsSolicitados(["--slugs=b,a,a"]), ["a", "b"])
  assert.throws(() => slugsSolicitados(["--slugs=a", "--lote=1"]), /não pode ser combinado/)
  assert.throws(() => slugsSolicitados([`--slugs=${Array.from({ length: 21 }, (_, index) => `s${index}`).join(",")}`]), /entre 1 e 20/)
})

test("aplicador mantém pendências, bloqueia dependência e faz R1 superseder a ficha", () => {
  const result = queue()
  const empty = planStrictAllDecisions(result, [])
  assert.equal(empty.actions.length, 0)
  assert.equal(empty.pending.length, 459)

  const profile = result.profiles.find((candidate) =>
    candidate.decisions.some((item) => item.category === "R3:processos-curadoria")
    && candidate.decisions.some((item) => item.category === "R5:votos"),
  )!
  const r5 = profile.decisions.find((item) => item.category === "R5:votos")!
  const base = {
    schema_version: 1,
    recebido_em: "2026-08-30T18:00:00Z",
    queue_id: result.queue_id,
    queue_sha256: result.queue_sha256,
    slug: profile.slug,
  }
  const blocked = planStrictAllDecisions(result, [{
    ...base,
    decisoes: [{
      item_id: r5.item_id,
      category: r5.category,
      decisao: "recibo_nao_aplicabilidade",
      evidence_url: "https://example.test/evidence",
      evidence_checked_at: "2026-08-30T18:00:00Z",
      evidence_sha256: "a".repeat(64),
      escopo: "identidade, fonte e período conferidos",
    }],
  }])
  assert.equal(blocked.actions.length, 0)
  assert.match(String(blocked.blocked[0]?.reason), /dependência sem ação factual/)

  const proofQueue = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/strict-all-proof-queue.json"), "utf8"))
  const proofRecord = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/strict-all-proof-decisions.jsonl"), "utf8").trim().split("\n")[1]!)
  proofRecord.decisoes.reverse()
  const resolvedOutOfOrder = planStrictAllDecisions(proofQueue, [proofRecord])
  assert.equal(resolvedOutOfOrder.blocked.length, 0)
  assert.deepEqual(resolvedOutOfOrder.actions.map((action) => action.item_id), [
    "teste-deps:R3:processos-curadoria",
    "teste-deps:R5:votos",
  ])

  const r1DependencyProfile = result.profiles.find((candidate) => {
    const candidateR5 = candidate.decisions.find((item) => item.category === "R5:votos")
    return candidateR5?.dependencies.length === 1 && candidateR5.dependencies[0]?.endsWith(":R1_selo")
  })!
  const dependencyR1 = r1DependencyProfile.decisions.find((item) => item.category === "R1_selo")!
  const dependentR5 = r1DependencyProfile.decisions.find((item) => item.category === "R5:votos")!
  const blockedByUnappliedPublication = planStrictAllDecisions(result, [{
    ...base,
    slug: r1DependencyProfile.slug,
    decisoes: [
      {
        item_id: dependencyR1.item_id,
        category: dependencyR1.category,
        decisao: "publicar_com_evidencia",
        evidence_url: "https://example.test/selo",
        evidence_checked_at: "2026-08-30T18:01:00Z",
        evidence_sha256: "d".repeat(64),
      },
      {
        item_id: dependentR5.item_id,
        category: dependentR5.category,
        decisao: "recibo_nao_aplicabilidade",
        evidence_url: "https://example.test/votos",
        evidence_checked_at: "2026-08-30T18:02:00Z",
        evidence_sha256: "e".repeat(64),
        escopo: "identidade, fonte e período conferidos",
      },
    ],
  }])
  assert.equal(blockedByUnappliedPublication.actions.length, 0)
  assert.equal(blockedByUnappliedPublication.blocked.length, 2)
  assert.ok(blockedByUnappliedPublication.blocked.some((item) => item.item_id === dependentR5.item_id))

  const r1Profile = result.profiles.find((candidate) =>
    candidate.decisions.some((item) => item.category === "R1_selo") && candidate.decisions.length > 1,
  )!
  const r1 = r1Profile.decisions.find((item) => item.category === "R1_selo")!
  const superseded = planStrictAllDecisions(result, [{
    ...base,
    slug: r1Profile.slug,
    decisoes: [
      { item_id: r1.item_id, category: r1.category, decisao: "despublicar_com_motivo_data", motivo: "evidência insuficiente", data_efetiva: "2026-08-30" },
    ],
  }])
  assert.equal(superseded.actions.length, 1)
  assert.deepEqual(
    superseded.superseded,
    r1Profile.decisions.filter((item) => item.category !== "R1_selo").map((item) => item.item_id).sort(),
  )
  assert.ok(superseded.superseded.every((itemId) => !superseded.pending.includes(itemId)))

  assert.throws(() => planStrictAllDecisions(result, [{
    ...base,
    decisoes: [{
      item_id: r5.item_id,
      category: r5.category,
      decisao: "recibo_nao_aplicabilidade",
      evidence_url: "http://example.test/inseguro",
      evidence_checked_at: "2026-08-30T18:00:00",
      evidence_sha256: "curto",
      escopo: "identidade, fonte e período conferidos",
    }],
  }]), /evidência HTTPS/)

  assert.throws(() => planStrictAllDecisions(result, [{
    ...base,
    recebido_em: "2026-08-30T18:00:00",
    decisoes: [],
  }]), /recebido_em deve ser um horário real com fuso/)
})

test("SQL usa horários reais, guards exatos e rollback com readback próprio", () => {
  const proofQueue = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/strict-all-proof-queue.json"), "utf8"))
  const proofRecords = readFileSync(join(ROOT, "tests/fixtures/strict-all-proof-decisions.jsonl"), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line))
  const plan = planStrictAllDecisions(proofQueue, proofRecords)
  const generated = generateStrictAllSql(proofQueue, plan.actions, "20260830170000", "strict-all-proof")

  assert.doesNotMatch(generated.migration, /T12:00:00Z/)
  assert.match(generated.migration, /2026-08-30T18:00:00Z/)
  assert.match(generated.readback, /l\.executado_em='2026-08-30T18:00:00Z'::timestamptz/)
  assert.match(generated.rollback, /CREATE TEMP TABLE _strict_all_expected/)
  assert.match(generated.rollback, /c\.nome_urna=e\.nome_urna/)
  assert.match(generated.rollbackReadback, /SET default_transaction_read_only=on/)
  assert.match(generated.rollbackReadback, /ledger<>0 OR receipts<>0/)
})

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") return reject(new Error("porta não alocada"))
      server.close(() => resolvePort(address.port))
    })
  })
}

test("servidor rejeita payload inválido e acumula decisão válida em JSONL", async (context) => {
  const port = await freePort()
  const output = join(mkdtempSync(join(tmpdir(), "strict-all-server-")), "decisions.jsonl")
  const server = spawn("python3", [join(ROOT, "scripts/audit/review-server.py"), String(port), EVIDENCE, output], {
    stdio: "ignore",
  })
  context.after(() => server.kill("SIGTERM"))
  const endpoint = `http://127.0.0.1:${port}/revisao`
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/index.html`)
      break
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 25))
    }
  }
  const invalid = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schema_version: 1, slug: "invalido" }),
  })
  assert.equal(invalid.status, 400)

  const result = queue()
  const profile = result.profiles.find((candidate) => candidate.decisions.some((item) => item.valid_decisions.includes("coletar")))!
  const item = profile.decisions.find((candidate) => candidate.valid_decisions.includes("coletar"))!
  const valid = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schema_version: 1,
      queue_id: result.queue_id,
      queue_sha256: result.queue_sha256,
      slug: profile.slug,
      decisoes: [{ item_id: item.item_id, category: item.category, decisao: "coletar" }],
    }),
  })
  assert.equal(valid.status, 200)
  const lines = readFileSync(output, "utf8").trim().split("\n")
  assert.equal(lines.length, 1)
  assert.equal(JSON.parse(lines[0]).decisoes[0].decisao, "coletar")
})
