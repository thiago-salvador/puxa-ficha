import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, chmodSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { Readable } from "node:stream"
import { test } from "node:test"
import { withVisibleTseChrome } from "../scripts/tse-local/chrome-fetch"

type Listener = (...args: unknown[]) => void
type FakeRoute = {
  request: () => { headers: () => Record<string, string> }
  continue: (options: { headers: Record<string, string> }) => Promise<void>
}

class FakeResponse {
  constructor(private readonly code: number, private readonly body: string, private readonly target: string, private readonly contentType = "application/json", private readonly extraHeaders: Record<string, string> = {}) {}
  status() { return this.code }
  url() { return this.target }
  headers() { return { "content-type": this.contentType, "content-length": String(Buffer.byteLength(this.body)), ...this.extraHeaders } }
  async text() { return this.body }
}

class FakeDownload {
  constructor(private readonly bytes: Buffer, private readonly failStream = false) {}
  async failure() { return null }
  async cancel() {}
  async createReadStream() {
    if (!this.failStream) return Readable.from([this.bytes])
    const firstHalf = this.bytes.subarray(0, Math.max(1, Math.floor(this.bytes.length / 2)))
    return Readable.from((async function* () { yield firstHalf; throw new Error("simulated range stream interruption") })())
  }
}

class FakePage {
  readonly listeners = new Map<string, Set<Listener>>()
  readonly responses: FakeResponse[] = []
  readonly rangeHeaders: string[] = []
  readonly fullDownloadStarts = new Set<number>()
  downloadBytes: Buffer | null = null
  failNextStream = false
  private routeHandler: ((route: FakeRoute) => Promise<void>) | null = null
  calls = 0
  on(name: string, listener: Listener) {
    const items = this.listeners.get(name) ?? new Set<Listener>()
    items.add(listener)
    this.listeners.set(name, items)
    return this
  }
  off(name: string, listener: Listener) { this.listeners.get(name)?.delete(listener); return this }
  async route(_url: string, handler: (route: FakeRoute) => Promise<void>) { this.routeHandler = handler }
  async unroute() { this.routeHandler = null }
  async goto(target: string) {
    this.calls += 1
    if (this.downloadBytes && this.routeHandler) {
      let headers: Record<string, string> = {}
      await this.routeHandler({
        request: () => ({ headers: () => ({}) }),
        continue: async (options: { headers: Record<string, string> }) => { headers = options.headers },
      })
      const range = /^bytes=(\d+)-(\d+)$/.exec(headers.Range ?? "")
      assert.ok(range, "download should request a concrete Range")
      const start = Number(range[1])
      const requestedEnd = Number(range[2])
      this.rangeHeaders.push(headers.Range!)
      const chunk = this.downloadBytes.subarray(start, requestedEnd + 1)
      const response = this.responses.shift() ?? new FakeResponse(206, "", target, "application/zip", {
        "content-range": `bytes ${start}-${start + chunk.length - 1}/${this.downloadBytes.length}`,
        "content-length": String(chunk.length),
      })
      for (const listener of this.listeners.get("response") ?? []) listener(response)
      if (response.status() < 400) {
        const fullDownload = response.status() === 200 || this.fullDownloadStarts.has(start)
        this.fullDownloadStarts.delete(start)
        const event = new FakeDownload(fullDownload ? this.downloadBytes : chunk, this.failNextStream)
        this.failNextStream = false
        for (const listener of this.listeners.get("download") ?? []) listener(event)
      }
      return response as never
    }
    const response = this.responses.shift() ?? new FakeResponse(200, "{}", target)
    if (this.downloadBytes && response.status() < 400) {
      const event = new FakeDownload(this.downloadBytes)
      for (const listener of this.listeners.get("download") ?? []) listener(event)
    }
    return response as never
  }
}

function fakeLauncher(page: FakePage) {
  let closes = 0
  let contexts = 0
  const launch = async () => ({
    newContext: async () => {
      contexts += 1
      return { newPage: async () => page, close: async () => { closes += 1 } }
    },
    close: async () => { closes += 1 },
  })
  return { launch: launch as never, stats: () => ({ closes, contexts }) }
}

function privateTemp(): string {
  const root = mkdtempSync(join(tmpdir(), "tse-chrome-fetch-"))
  chmodSync(root, 0o700)
  return root
}

function chunkedZip(root: string): Buffer {
  const input = join(root, "fixture.bin")
  const output = join(root, "fixture.zip")
  writeFileSync(input, Buffer.alloc(4 * 1024 * 1024 + 257, 0x61))
  execFileSync("zip", ["-0", "-q", output, "fixture.bin"], { cwd: root })
  return readFileSync(output)
}

test("getJson retries 503, parses JSON, and reuses one visible client context", async () => {
  const page = new FakePage()
  const url = "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=candidatos-2026"
  page.responses.push(new FakeResponse(403, "Access Denied", url, "text/html"))
  page.responses.push(new FakeResponse(503, "temporarily unavailable", url, "text/plain"))
  page.responses.push(new FakeResponse(200, '{"success":true}', url))
  const fake = fakeLauncher(page)
  const sleeps: number[] = []
  const result = await withVisibleTseChrome(async (client) => client.getJson(url), {
    launch: fake.launch, minIntervalMs: 0, retryDelayMs: 1, sleep: async (ms) => { sleeps.push(ms) },
  })
  assert.deepEqual(result, { success: true })
  assert.equal(page.calls, 3)
  assert.deepEqual(sleeps, [1, 2])
  assert.deepEqual(fake.stats(), { closes: 2, contexts: 1 })
})

test("downloadZip streams to a private file and returns byte count and SHA-256", async () => {
  const root = privateTemp()
  try {
    const zip = chunkedZip(root)
    assert.ok(zip.length > 4 * 1024 * 1024)
    const page = new FakePage()
    page.downloadBytes = zip
    page.responses.push(new FakeResponse(429, "rate limited", "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip", "text/plain", { "retry-after": "0" }))
    const fake = fakeLauncher(page)
    const destination = join(root, "download.zip")
    const sleeps: number[] = []
    page.failNextStream = true
    const receipt = await withVisibleTseChrome((client) => client.downloadZip(
      "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip", destination,
    ), { launch: fake.launch, minIntervalMs: 1, retryDelayMs: 1, sleep: async (ms) => { sleeps.push(ms) } })
    assert.deepEqual(receipt, { bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") })
    assert.deepEqual(readFileSync(destination), zip)
    assert.equal(page.calls, 4)
    assert.deepEqual(page.rangeHeaders, [
      "bytes=0-4194303",
      "bytes=0-4194303",
      "bytes=0-4194303",
      `bytes=4194304-${zip.length - 1}`,
    ])
    assert.deepEqual(sleeps, [1, 2, 1])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("downloadZip accepts a bounded full 200 response when the CDN ignores Range", async () => {
  const root = privateTemp()
  try {
    const zip = chunkedZip(root)
    const page = new FakePage()
    page.downloadBytes = zip
    page.responses.push(new FakeResponse(200, "", "https://cdn.tse.jus.br/consulta_cand_2024.zip", "application/zip", {
      "content-length": String(zip.length),
    }))
    const destination = join(root, "full-response.zip")
    const receipt = await withVisibleTseChrome((client) => client.downloadZip(
      "https://cdn.tse.jus.br/consulta_cand_2024.zip", destination,
    ), { launch: fakeLauncher(page).launch, minIntervalMs: 0 })
    assert.deepEqual(receipt, { bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") })
    assert.deepEqual(readFileSync(destination), zip)
    assert.deepEqual(page.rangeHeaders, ["bytes=0-4194303"])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("downloadZip verifies and accepts the complete archive emitted for a later 206 range", async () => {
  const root = privateTemp()
  try {
    const zip = chunkedZip(root)
    const page = new FakePage()
    page.downloadBytes = zip
    page.fullDownloadStarts.add(4 * 1024 * 1024)
    const target = "https://cdn.tse.jus.br/consulta_cand_2024.zip"
    page.responses.push(
      new FakeResponse(206, "", target, "application/zip", {
        "content-range": `bytes 0-${4 * 1024 * 1024 - 1}/${zip.length}`,
        "content-length": String(4 * 1024 * 1024),
      }),
      new FakeResponse(206, "", target, "application/zip", {
        "content-range": `bytes ${4 * 1024 * 1024}-${zip.length - 1}/${zip.length}`,
        "content-length": String(zip.length - 4 * 1024 * 1024),
      }),
    )
    const destination = join(root, "mismatched-range-body.zip")
    const receipt = await withVisibleTseChrome((client) => client.downloadZip(target, destination), {
      launch: fakeLauncher(page).launch, minIntervalMs: 0,
    })
    assert.deepEqual(receipt, { bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") })
    assert.deepEqual(readFileSync(destination), zip)
    assert.deepEqual(page.rangeHeaders, ["bytes=0-4194303", `bytes=4194304-${zip.length - 1}`])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("rejects full 200 ZIP responses with invalid type or declared size and removes partials", async () => {
  const root = privateTemp()
  try {
    const zip = chunkedZip(root)
    for (const [name, type, length] of [
      ["bad-type", "text/html", String(zip.length)],
      ["bad-length", "application/zip", String(zip.length + 1)],
    ]) {
      const page = new FakePage()
      page.downloadBytes = zip
      page.responses.push(new FakeResponse(200, "", "https://cdn.tse.jus.br/consulta_cand_2024.zip", type, { "content-length": length }))
      const destination = join(root, `${name}.zip`)
      await assert.rejects(withVisibleTseChrome((client) => client.downloadZip(
        "https://cdn.tse.jus.br/consulta_cand_2024.zip", destination,
      ), { launch: fakeLauncher(page).launch, minIntervalMs: 0 }), /Cabeçalhos|Content-Length/)
      assert.equal(existsSync(join(root, `${name}.zip.part`)), false)
      assert.equal(page.listeners.get("download")?.size ?? 0, 0)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("rejects nonofficial URLs and corrupt ZIP content without exposing response payload", async () => {
  const root = privateTemp()
  try {
    const page = new FakePage()
    const fake = fakeLauncher(page)
    await assert.rejects(withVisibleTseChrome((client) => client.getJson("https://example.org/private"), { launch: fake.launch }), /endpoints oficiais/)
    const destination = join(root, "bad.zip")
    page.downloadBytes = Buffer.from("PK\x03\x04not-a-valid-zip-long-enough-for-structure-check")
    await assert.rejects(withVisibleTseChrome((client) => client.downloadZip(
      "https://cdn.tse.jus.br/arquivo.zip", destination,
    ), { launch: fake.launch, minIntervalMs: 0 }), /integridade/)
    assert.equal(page.listeners.get("download")?.size ?? 0, 0)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
