import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { downloadToFile } from "../scripts/lib/download-to-file"

test("downloadToFile faz streaming e reutiliza cache", async () => {
  const dir = mkdtempSync(join(tmpdir(), "puxa-ficha-download-"))
  const dest = join(dir, "arquivo.txt")
  let fetches = 0
  let cacheHits = 0
  const fetcher: typeof fetch = async () => {
    fetches += 1
    return new Response("conteúdo")
  }

  try {
    assert.equal(await downloadToFile("https://example.invalid/arquivo", dest, { fetcher }), true)
    assert.equal(readFileSync(dest, "utf8"), "conteúdo")
    assert.equal(
      await downloadToFile("https://example.invalid/arquivo", dest, {
        fetcher,
        onCacheHit: () => { cacheHits += 1 },
      }),
      true,
    )
    assert.equal(fetches, 1)
    assert.equal(cacheHits, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile falha fechado em resposta HTTP inválida", async () => {
  const fetcher: typeof fetch = async () => new Response("erro", { status: 503 })
  assert.equal(await downloadToFile("https://example.invalid/arquivo", "/nao-usado", { fetcher }), false)
})

test("downloadToFile repassa um signal com timeout ao fetcher", async () => {
  const dir = mkdtempSync(join(tmpdir(), "puxa-ficha-download-"))
  let signal: AbortSignal | null | undefined
  const fetcher: typeof fetch = async (_input, init) => {
    signal = init?.signal
    return new Response("ok")
  }
  try {
    assert.equal(await downloadToFile("https://example.invalid/a", join(dir, "a.txt"), { fetcher }), true)
    assert.ok(signal instanceof AbortSignal)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile aborta corpo parado no timeout e não deixa parcial", async () => {
  const dir = mkdtempSync(join(tmpdir(), "puxa-ficha-download-"))
  const dest = join(dir, "lento.zip")
  const errors: unknown[] = []
  // Fetcher que ignora o signal: manda um pedaço e nunca fecha o stream.
  const fetcher: typeof fetch = async () =>
    new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("metade")) } }))
  try {
    const started = Date.now()
    const ok = await downloadToFile("https://example.invalid/lento", dest, {
      fetcher,
      timeoutMs: 50,
      onError: (e) => errors.push(e),
    })
    assert.equal(ok, false)
    assert.ok(Date.now() - started < 5_000)
    assert.equal(errors.length, 1)
    assert.equal(existsSync(dest), false)
    assert.equal(existsSync(`${dest}.part`), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile apaga o parcial quando o stream falha e não gera cache hit falso", async () => {
  const dir = mkdtempSync(join(tmpdir(), "puxa-ficha-download-"))
  const dest = join(dir, "quebrado.zip")
  const broken: typeof fetch = async () =>
    new Response(new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("parcial"))
        setTimeout(() => c.error(new Error("conexão caiu")), 10)
      },
    }))
  let cacheHits = 0
  try {
    assert.equal(await downloadToFile("https://example.invalid/q", dest, { fetcher: broken }), false)
    assert.equal(existsSync(dest), false)
    assert.equal(existsSync(`${dest}.part`), false)

    const ok = await downloadToFile("https://example.invalid/q", dest, {
      fetcher: async () => new Response("completo"),
      onCacheHit: () => { cacheHits += 1 },
    })
    assert.equal(ok, true)
    assert.equal(cacheHits, 0)
    assert.equal(readFileSync(dest, "utf8"), "completo")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
