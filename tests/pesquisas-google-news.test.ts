import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { describe, it } from "node:test"
import {
  GOOGLE_NEWS_SCOPES,
  parseGoogleNewsDiscoveryRss,
  runGoogleNewsDiscovery,
} from "../scripts/pesquisas-atualizacao-agendada/google-news"

const scope = GOOGLE_NEWS_SCOPES[0]

function rss(items: string): string {
  return `<rss version="2.0"><channel><title>Google News</title>${items}</channel></rss>`
}

function item(input: { title: string; url?: string; date?: string; source?: string }): string {
  return `<item><title><![CDATA[${input.title}]]></title><link>${input.url ?? "https://example.com/article"}</link><pubDate>${input.date ?? "Thu, 17 Sep 2026 10:00:00 GMT"}</pubDate><source>${input.source ?? "Fonte"} &amp; parceiro</source></item>`
}

function tempRun() {
  const root = mkdtempSync(resolve(tmpdir(), "pf-google-news-"))
  const statePath = resolve(root, "state.json")
  const outDir = resolve(root, "out")
  return { root, statePath, outDir }
}

async function runFixture(xml: string, input: Partial<Parameters<typeof runGoogleNewsDiscovery>[0]> = {}) {
  const paths = tempRun()
  const fixture = resolve(paths.root, "fixture.xml")
  writeFileSync(fixture, xml)
  const result = await runGoogleNewsDiscovery({
    statePath: paths.statePath,
    outDir: paths.outDir,
    offlineFixturePath: fixture,
    now: "2026-09-17T12:00:00.000Z",
    scopes: [scope],
    ...input,
  })
  return { ...paths, result }
}

describe("Google News RSS discovery", () => {
  it("parses CDATA and entities while rejecting an empty feed", () => {
    const parsed = parseGoogleNewsDiscoveryRss(rss(item({ title: "Pesquisa de João" })))
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].title, "Pesquisa de João")
    assert.equal(parsed[0].source, "Fonte & parceiro")
    assert.deepEqual(parseGoogleNewsDiscoveryRss(rss("")), [])
    assert.throws(() => parseGoogleNewsDiscoveryRss(""), /invalidfeed: corpo vazio/)
    assert.throws(() => parseGoogleNewsDiscoveryRss("<rss><channel>"), /invalidfeed/)
  })

  it("bounds concurrent collection at three scopes", async () => {
    const paths = tempRun()
    const active = { value: 0, max: 0 }
    const scopes = GOOGLE_NEWS_SCOPES.slice(0, 5)
    const result = await runGoogleNewsDiscovery({
      statePath: paths.statePath,
      outDir: paths.outDir,
      now: "2026-09-17T12:00:00.000Z",
      scopes,
      concurrency: 3,
      fetchImpl: async () => {
        active.value += 1
        active.max = Math.max(active.max, active.value)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active.value -= 1
        return new Response(rss(item({ title: "Teste" })), { status: 200 })
      },
    })
    assert.equal(active.max, 3)
    assert.equal(result.queue.scopes.length, 5)
    assert.deepEqual(Object.values(result.state.known)[0].scopes, scopes.map((candidate) => candidate.code).sort())
    rmSync(paths.root, { recursive: true, force: true })
  })

  it("keeps a valid RSS empty result distinct from an invalid feed", async () => {
    const result = await runFixture(rss(""))
    assert.equal(result.result.queue.scopes[0].status, "ok")
    assert.equal(result.result.queue.scopes[0].rss_items, 0)
    assert.equal(result.result.queue.scopes[0].error, null)
    assert.equal(result.result.state.checkpoints.BR, "2026-09-17T12:00:00.000Z")
    rmSync(result.root, { recursive: true, force: true })
  })

  it("does not rediscover a known pending item and keeps it pending", async () => {
    const first = await runFixture(rss(item({ title: "Primeira" })))
    assert.equal(first.result.queue.summary.new_count, 1)
    assert.equal(first.result.queue.summary.pending_count, 1)
    const second = await runFixture(rss(item({ title: "Primeira" })), { statePath: first.statePath, outDir: first.outDir })
    assert.equal(second.result.queue.summary.new_count, 0)
    assert.equal(second.result.queue.summary.changed_count, 0)
    assert.equal(second.result.queue.summary.pending_unchanged_count, 1)
    assert.equal(second.result.queue.queue.pending[0].status, "pending")
    assert.ok(readFileSync(resolve(first.outDir, "discovery-queue.json"), "utf8").includes("pending_unchanged"))
    rmSync(first.root, { recursive: true, force: true })
  })

  it("advances only successful scope checkpoints", async () => {
    const paths = tempRun()
    const fixture = resolve(paths.root, "fixture.json")
    writeFileSync(fixture, JSON.stringify({ BR: rss(item({ title: "Brasil" })), AC: "<rss><channel>" }))
    const ac = GOOGLE_NEWS_SCOPES.find((candidate) => candidate.code === "AC")!
    const oldCursor = "2026-09-10T00:00:00.000Z"
    writeFileSync(paths.statePath, JSON.stringify({ schema_version: "google-news-discovery-v1", checkpoints: { AC: oldCursor }, known: {}, latest_by_url: {} }))
    const result = await runGoogleNewsDiscovery({ statePath: paths.statePath, outDir: paths.outDir, offlineFixturePath: fixture, now: "2026-09-17T12:00:00.000Z", scopes: [scope, ac] })
    assert.equal(result.queue.scopes.find((candidate) => candidate.scope === "BR")?.status, "ok")
    assert.equal(result.queue.scopes.find((candidate) => candidate.scope === "AC")?.status, "error")
    assert.equal(result.state.checkpoints.BR, "2026-09-17T12:00:00.000Z")
    assert.equal(result.state.checkpoints.AC, oldCursor)
    rmSync(paths.root, { recursive: true, force: true })
  })

  it("uses the two day overlap and emits a revision for the same URL", async () => {
    const first = await runFixture(rss(item({ title: "Versão original", date: "Thu, 17 Sep 2026 10:00:00 GMT" })))
    const secondFixture = resolve(first.root, "second.xml")
    writeFileSync(secondFixture, rss(`${item({ title: "Versão revisada", date: "Tue, 15 Sep 2026 10:00:00 GMT" })}${item({ title: "Fora da janela", url: "https://example.com/old", date: "Mon, 14 Sep 2026 10:00:00 GMT" })}`))
    const second = await runGoogleNewsDiscovery({ statePath: first.statePath, outDir: first.outDir, offlineFixturePath: secondFixture, now: "2026-09-19T12:00:00.000Z", scopes: [scope] })
    assert.equal(second.queue.summary.changed_count, 1)
    assert.equal(second.queue.queue.changed[0].title, "Versão revisada")
    assert.equal(second.queue.queue.new.some((entry) => entry.url.endsWith("/old")), false)
    assert.match(second.queue.scopes[0].query_url, /after%3A2026-09-15/)
    rmSync(first.root, { recursive: true, force: true })
  })

  it("marks invalid XML as an error and leaves the cursor unchanged", async () => {
    const first = await runFixture(rss(item({ title: "Primeira" })))
    const invalid = resolve(first.root, "invalid.xml")
    writeFileSync(invalid, "<rss><channel><item><title>truncado")
    const result = await runGoogleNewsDiscovery({ statePath: first.statePath, outDir: first.outDir, offlineFixturePath: invalid, now: "2026-09-18T12:00:00.000Z", scopes: [scope] })
    assert.equal(result.queue.scopes[0].status, "error")
    assert.match(result.queue.scopes[0].error ?? "", /invalidfeed/)
    assert.equal(result.state.checkpoints.BR, "2026-09-17T12:00:00.000Z")
    rmSync(first.root, { recursive: true, force: true })
  })

  it("ignores a future checkpoint instead of skipping the initial window", async () => {
    const paths = tempRun()
    const fixture = resolve(paths.root, "fixture.xml")
    writeFileSync(fixture, rss(item({ title: "Recuperada", date: "Mon, 08 Sep 2026 10:00:00 GMT" })))
    writeFileSync(paths.statePath, JSON.stringify({ schema_version: "google-news-discovery-v1", checkpoints: { BR: "2026-09-20T00:00:00.000Z" }, known: {}, latest_by_url: {} }))
    const result = await runGoogleNewsDiscovery({ statePath: paths.statePath, outDir: paths.outDir, offlineFixturePath: fixture, now: "2026-09-17T12:00:00.000Z", scopes: [scope] })
    assert.equal(result.queue.scopes[0].window, "initial14days")
    assert.equal(result.queue.summary.new_count, 1)
    assert.equal(result.state.checkpoints.BR, "2026-09-17T12:00:00.000Z")
    rmSync(paths.root, { recursive: true, force: true })
  })

  it("rejects an incompatible state schema", async () => {
    const paths = tempRun()
    writeFileSync(paths.statePath, JSON.stringify({ schema_version: "old", checkpoints: {}, known: {}, latest_by_url: {} }))
    await assert.rejects(() => runGoogleNewsDiscovery({ statePath: paths.statePath, outDir: paths.outDir, scopes: [scope] }), /estado Google News inválido/)
    rmSync(paths.root, { recursive: true, force: true })
  })

  it("reports a bounded network timeout as a scope error", async () => {
    const paths = tempRun()
    const result = await runGoogleNewsDiscovery({
      statePath: paths.statePath,
      outDir: paths.outDir,
      now: "2026-09-17T12:00:00.000Z",
      scopes: [scope],
      timeoutMs: 5,
      fetchImpl: async () => new Promise<Response>(() => {}),
    })
    assert.equal(result.queue.scopes[0].status, "error")
    assert.equal(result.queue.scopes[0].error, "timeout")
    rmSync(paths.root, { recursive: true, force: true })
  })
})
