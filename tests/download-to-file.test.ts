import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { downloadToFile } from "../scripts/lib/download-to-file"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

function makeTestDir(): string {
  return mkdtempSync(join(repoRoot, ".tmp-download-to-file-"))
}

function assertNoPartials(dir: string): void {
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".part")), [])
}

test("downloadToFile faz streaming e reutiliza cache", async () => {
  const dir = makeTestDir()
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
  const dir = makeTestDir()
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
  const dir = makeTestDir()
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
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile apaga o parcial quando o stream falha e não gera cache hit falso", async () => {
  const dir = makeTestDir()
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
    assertNoPartials(dir)

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

test("downloadToFile captura falha ao abrir o arquivo e chama onError uma vez", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "diretorio-inexistente", "arquivo.txt")
  const errors: unknown[] = []

  try {
    const ok = await downloadToFile("https://example.invalid/abertura", dest, {
      fetcher: async () => new Response("conteúdo"),
      onError: (error) => errors.push(error),
    })
    assert.equal(ok, false)
    assert.equal(errors.length, 1)
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile publica um conteúdo completo em chamadas concorrentes", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "concorrente.txt")
  const payloads = [
    ["A".repeat(1024 * 1024), "a".repeat(1024 * 1024), "1".repeat(1024 * 1024)],
    ["B".repeat(1024 * 1024), "b".repeat(1024 * 1024), "2".repeat(1024 * 1024)],
  ]
  let fetches = 0
  let chunkOneRequests = 0
  let releaseChunkOne!: () => void
  const bothStreamsReadyForChunkOne = new Promise<void>((resolve) => { releaseChunkOne = resolve })
  let chunkTwoRequests = 0
  let releaseChunkTwo!: () => void
  const bothStreamsReadyForChunkTwo = new Promise<void>((resolve) => { releaseChunkTwo = resolve })

  const fetcher: typeof fetch = async () => {
    const fetchIndex = fetches++
    const chunks = payloads[fetchIndex]
    let nextChunk = 1
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunks[0]))
      },
      async pull(controller) {
        if (nextChunk === 1) {
          chunkOneRequests += 1
          if (chunkOneRequests === 2) releaseChunkOne()
          await bothStreamsReadyForChunkOne
          if (fetchIndex === 0) await new Promise((resolve) => setTimeout(resolve, 100))
          controller.enqueue(new TextEncoder().encode(chunks[nextChunk++])); return
        }
        chunkTwoRequests += 1
        if (chunkTwoRequests === 2) releaseChunkTwo()
        await bothStreamsReadyForChunkTwo
        controller.enqueue(new TextEncoder().encode(chunks[nextChunk++])); controller.close()
      },
    }))
  }

  try {
    const results = await Promise.all([
      downloadToFile("https://example.invalid/concorrente-a", dest, { fetcher }),
      downloadToFile("https://example.invalid/concorrente-b", dest, { fetcher }),
    ])
    assert.deepEqual(results, [true, true])
    assert.ok([payloads[0].join(""), payloads[1].join("")].includes(readFileSync(dest, "utf8")))
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile aborta enquanto a escrita ainda está pendente", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "escrita-lenta.bin")
  const payload = new Uint8Array(64 * 1024 * 1024)
  payload.fill(7)

  try {
    const ok = await downloadToFile("https://example.invalid/escrita-lenta", dest, {
      timeoutMs: 10,
      fetcher: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(payload)
          controller.close()
        },
      })),
    })
    assert.equal(ok, false)
    assert.equal(existsSync(dest), false)
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
