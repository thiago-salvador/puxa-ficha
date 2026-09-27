import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { downloadPolicyFromEnv, downloadToFile, retryDelayMs, verifyZip } from "../scripts/lib/download-to-file"

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

function fakeClock() {
  let t = 0
  const sleeps: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms },
    sleeps,
  }
}

test("downloadToFile tenta de novo depois de 403 intermitente dentro da janela", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "pacote.zip")
  const statuses = [403, 403, 200]
  const clock = fakeClock()
  const retries: number[] = []
  const httpErrors: number[] = []
  try {
    const ok = await downloadToFile("https://example.invalid/pacote", dest, {
      fetcher: async () => {
        const status = statuses.shift()!
        return status === 200 ? new Response("zip completo") : new Response("bloqueado", { status })
      },
      retry: { windowMs: 60_000, baseDelayMs: 1_000 },
      now: clock.now,
      sleep: clock.sleep,
      onRetry: (info) => retries.push(info.attempt),
      onHttpError: (status) => httpErrors.push(status),
    })
    assert.equal(ok, true)
    assert.equal(readFileSync(dest, "utf8"), "zip completo")
    assert.deepEqual(clock.sleeps, [1_000, 2_000])
    assert.deepEqual(retries, [1, 2])
    assert.deepEqual(httpErrors, [403, 403])
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile falha fechado quando a janela acaba e não deixa parcial", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "bloqueado.zip")
  const clock = fakeClock()
  let fetches = 0
  try {
    const ok = await downloadToFile("https://example.invalid/bloqueado", dest, {
      fetcher: async () => { fetches += 1; return new Response("bloqueado", { status: 403 }) },
      retry: { windowMs: 10_000, baseDelayMs: 1_000 },
      now: clock.now,
      sleep: clock.sleep,
    })
    assert.equal(ok, false)
    // 1 s + 2 s + 4 s = 7 s; a próxima espera (8 s) passaria da janela.
    assert.equal(fetches, 4)
    assert.equal(existsSync(dest), false)
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile não repete 404", async () => {
  const clock = fakeClock()
  let fetches = 0
  const ok = await downloadToFile("https://example.invalid/sumiu", "/nao-usado-404", {
    fetcher: async () => { fetches += 1; return new Response("nada", { status: 404 }) },
    retry: { windowMs: 60_000, baseDelayMs: 1_000 },
    now: clock.now,
    sleep: clock.sleep,
  })
  assert.equal(ok, false)
  assert.equal(fetches, 1)
  assert.deepEqual(clock.sleeps, [])
})

test("downloadToFile retoma por Range amarrado ao ETag depois de timeout no corpo", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "grande.zip")
  const clock = fakeClock()
  const requests: Array<Record<string, string>> = []
  const resumes: number[] = []
  const inteiro = "0123456789abcdefghij"
  let call = 0
  try {
    const ok = await downloadToFile("https://example.invalid/grande", dest, {
      timeoutMs: 50,
      retry: { windowMs: 60_000, baseDelayMs: 1_000 },
      now: clock.now,
      sleep: clock.sleep,
      onRetry: (info) => resumes.push(info.resumeFrom),
      fetcher: async (_input, init) => {
        requests.push({ ...(init?.headers as Record<string, string> | undefined) })
        call += 1
        if (call === 1) {
          // Primeira metade chega e o corpo trava: o timeout da tentativa corta.
          return new Response(new ReadableStream({
            start(c) { c.enqueue(new TextEncoder().encode(inteiro.slice(0, 10))) },
          }), { headers: { etag: '"v1"', "content-length": String(inteiro.length) } })
        }
        return new Response(inteiro.slice(10), {
          status: 206,
          headers: { etag: '"v1"', "content-range": `bytes 10-19/${inteiro.length}` },
        })
      },
    })
    assert.equal(ok, true)
    assert.equal(readFileSync(dest, "utf8"), inteiro)
    assert.deepEqual(resumes, [10])
    assert.deepEqual(requests[0], { "Accept-Encoding": "identity", "User-Agent": "PuxaFicha-Coletores/1.0" })
    assert.deepEqual(requests[1], { "Accept-Encoding": "identity", "User-Agent": "PuxaFicha-Coletores/1.0", Range: "bytes=10-", "If-Range": '"v1"' })
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile descarta o parcial quando o arquivo mudou no servidor (If-Range devolve 200)", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "mudou.zip")
  const clock = fakeClock()
  let call = 0
  try {
    const ok = await downloadToFile("https://example.invalid/mudou", dest, {
      timeoutMs: 50,
      retry: { windowMs: 60_000, baseDelayMs: 1_000 },
      now: clock.now,
      sleep: clock.sleep,
      fetcher: async () => {
        call += 1
        if (call === 1) {
          return new Response(new ReadableStream({
            start(c) { c.enqueue(new TextEncoder().encode("versao-antiga")) },
          }), { headers: { etag: '"v1"', "content-length": "40" } })
        }
        return new Response("versao-nova-inteira", { headers: { etag: '"v2"' } })
      },
    })
    assert.equal(ok, true)
    assert.equal(readFileSync(dest, "utf8"), "versao-nova-inteira")
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile não publica corpo menor que o Content-Length", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "truncado.zip")
  try {
    const ok = await downloadToFile("https://example.invalid/truncado", dest, {
      retry: { windowMs: 0 },
      fetcher: async () => new Response("curto", { headers: { "content-length": "100" } }),
    })
    assert.equal(ok, false)
    assert.equal(existsSync(dest), false)
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadPolicyFromEnv lê janela e timeout e recusa valor inválido", () => {
  assert.deepEqual(downloadPolicyFromEnv({}), {})
  assert.deepEqual(
    downloadPolicyFromEnv({
      PF_TSE_DOWNLOAD_TIMEOUT_MS: "1200000",
      PF_TSE_DOWNLOAD_RETRY_WINDOW_MS: "3600000",
      PF_TSE_DOWNLOAD_RETRY_BASE_MS: "60000",
      PF_TSE_DOWNLOAD_DEADLINE_MS: "5400000",
    }),
    { deadlineMs: 5_400_000, timeoutMs: 1_200_000, retry: { windowMs: 3_600_000, baseDelayMs: 60_000 } },
  )
  assert.throws(() => downloadPolicyFromEnv({ PF_TSE_DOWNLOAD_RETRY_WINDOW_MS: "1h" }), /PF_TSE_DOWNLOAD_RETRY_WINDOW_MS/)
  assert.equal(retryDelayMs(1, { windowMs: 1, baseDelayMs: 30_000 }), 30_000)
  assert.equal(retryDelayMs(10, { windowMs: 1, baseDelayMs: 30_000, maxDelayMs: 600_000 }), 600_000)
})

test("downloadToFile para no prazo do processo mesmo com janela por arquivo maior", async () => {
  const clock = fakeClock()
  let fetches = 0
  const errors: unknown[] = []
  const ok = await downloadToFile("https://example.invalid/prazo", "/nao-usado-prazo", {
    fetcher: async () => { fetches += 1; return new Response("bloqueado", { status: 403 }) },
    retry: { windowMs: 10_000_000, baseDelayMs: 1_000 },
    deadlineAt: 5_000,
    now: clock.now,
    sleep: clock.sleep,
    onError: (error) => errors.push(error),
  })
  assert.equal(ok, false)
  // t=0, 1 s, 3 s; a espera seguinte (4 s) chegaria em 7 s, depois do prazo de 5 s.
  assert.equal(fetches, 3)
  assert.deepEqual(clock.sleeps, [1_000, 2_000])

  let depoisDoPrazo = 0
  const expirado = await downloadToFile("https://example.invalid/prazo", "/nao-usado-prazo-2", {
    fetcher: async () => { depoisDoPrazo += 1; return new Response("ok") },
    deadlineAt: 0,
    now: () => 10,
    onError: (error) => errors.push(error),
  })
  assert.equal(expirado, false)
  assert.equal(depoisDoPrazo, 0)
  assert.match(String(errors.at(-1)), /prazo de download do processo esgotado/)
})

test("downloadToFile corta a tentativa no prazo do processo", async () => {
  const dir = makeTestDir()
  try {
    const started = Date.now()
    const ok = await downloadToFile("https://example.invalid/lento", join(dir, "lento.zip"), {
      timeoutMs: 60_000,
      deadlineAt: Date.now() + 50,
      fetcher: async () =>
        new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("metade")) } })),
    })
    assert.equal(ok, false)
    assert.ok(Date.now() - started < 5_000)
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile recomeça do zero quando o 206 vem de outra versão", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "versao.zip")
  const clock = fakeClock()
  const requests: Array<Record<string, string>> = []
  let call = 0
  try {
    const ok = await downloadToFile("https://example.invalid/versao", dest, {
      timeoutMs: 50,
      retry: { windowMs: 60_000, baseDelayMs: 1_000 },
      now: clock.now,
      sleep: clock.sleep,
      fetcher: async (_input, init) => {
        requests.push({ ...(init?.headers as Record<string, string>) })
        call += 1
        if (call === 1) {
          return new Response(new ReadableStream({
            start(c) { c.enqueue(new TextEncoder().encode("0123456789")) },
          }), { headers: { etag: '"v1"', "content-length": "20" } })
        }
        if (call === 2) {
          // Servidor ignorou o If-Range e mandou pedaço da versão nova.
          return new Response("XXXXXXXXXX", { status: 206, headers: { etag: '"v2"', "content-range": "bytes 10-19/20" } })
        }
        return new Response("versao-v2-inteira", { headers: { etag: '"v2"' } })
      },
    })
    assert.equal(ok, true)
    assert.equal(readFileSync(dest, "utf8"), "versao-v2-inteira")
    assert.equal(requests[2].Range, undefined)
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("downloadToFile confere o arquivo antes de publicar e tenta de novo quando reprova", async () => {
  const dir = makeTestDir()
  const dest = join(dir, "conferido.zip")
  const clock = fakeClock()
  const bodies = ["corrompido", "integro"]
  try {
    const ok = await downloadToFile("https://example.invalid/conferido", dest, {
      retry: { windowMs: 60_000, baseDelayMs: 1_000 },
      now: clock.now,
      sleep: clock.sleep,
      fetcher: async () => new Response(bodies.shift()!),
      verify: (path) => {
        if (readFileSync(path, "utf8") !== "integro") throw new Error("CRC")
      },
    })
    assert.equal(ok, true)
    assert.equal(readFileSync(dest, "utf8"), "integro")
    assert.deepEqual(clock.sleeps, [1_000])
    assertNoPartials(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("verifyZip recusa arquivo que não é ZIP íntegro", () => {
  const dir = makeTestDir()
  try {
    const falso = join(dir, "falso.zip")
    writeFileSync(falso, "não é zip")
    assert.throws(() => verifyZip(falso))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
