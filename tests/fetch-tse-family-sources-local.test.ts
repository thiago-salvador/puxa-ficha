import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "node:test"

import { assertCompleteAssets, download, DownloadError, pendingFrom } from "../scripts/audit/fetch-tse-family-sources-local"

it("reprova download sem nenhum pacote apesar do manifesto ter sido escrito", () => {
  assert.throws(() => assertCompleteAssets([], [{ family: "historico_politico", year: 2026, catalog_url: "https://dadosabertos.tse.jus.br", reason: "HTTP 403" }]), /0 asset\(s\), 1 pendente/)
  assert.throws(() => assertCompleteAssets([], []), /0 asset\(s\), 0 pendente/)
})

it("aceita somente rodada sem pendências", () => {
  const asset = {
    family: "historico_politico" as const,
    year: 2026,
    path: "/tmp/consulta_cand_2026.zip",
    url: "https://cdn.tse.jus.br/consulta_cand_2026.zip",
    sha256: "a".repeat(64),
    bytes: 1,
    catalog_url: "https://dadosabertos.tse.jus.br",
    catalog_revision: null,
  }
  assert.doesNotThrow(() => assertCompleteAssets([asset], []))
  assert.throws(() => assertCompleteAssets([asset], [{ family: "historico_politico", year: 2024, catalog_url: asset.catalog_url, reason: "HTTP 403" }]), /1 pendente/)
})

it("nomeia a família e o ano que faltam no erro", () => {
  assert.throws(
    () => assertCompleteAssets([], [
      { family: "historico_politico", year: 2024, catalog_url: "https://dadosabertos.tse.jus.br", reason: "HTTP 403" },
      { family: "financiamento", year: 2018, catalog_url: "https://dadosabertos.tse.jus.br", reason: "catálogo oficial indisponível" },
    ]),
    /2 pendente\(s\): historico_politico\/2024 \(HTTP 403\); financiamento\/2018 \(catálogo oficial indisponível\)/,
  )
})

const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60, 1)])
const URL_2004 = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2004.zip"

function socketTerminated(): TypeError {
  const socket = Object.assign(new Error("other side closed"), { name: "SocketError", code: "UND_ERR_SOCKET" })
  return new TypeError("terminated", { cause: socket })
}

/** Resposta 200 que entrega `deliver` bytes e então falha como o undici falha. */
function interrupted(deliver: number, declared = ZIP.length): Response {
  const body = new ReadableStream<Uint8Array>({
    sent: false,
    pull(controller) {
      if (!this.sent) { this.sent = true; controller.enqueue(new Uint8Array(ZIP.subarray(0, deliver))); return }
      controller.error(socketTerminated())
    },
  } as UnderlyingDefaultSource<Uint8Array> & { sent: boolean })
  return new Response(body, { status: 200, headers: { "content-length": String(declared) } })
}

function complete(): Response {
  return new Response(new Uint8Array(ZIP), { status: 200, headers: { "content-length": String(ZIP.length) } })
}

function scripted(responses: Array<() => Response | Promise<Response>>): { fetchImpl: typeof fetch; calls: () => number } {
  let call = 0
  const fetchImpl = (async () => {
    const next = responses[Math.min(call, responses.length - 1)]!
    call++
    return next()
  }) as unknown as typeof fetch
  return { fetchImpl, calls: () => call }
}

function tempZipPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "tse-download-"))
  return { dir, path: join(dir, "consulta_cand_2004.zip.1.tmp") }
}

const quiet = { sleep: async () => {}, now: (() => { let t = 0; return () => (t += 1000) })() }

it("repete a leitura interrompida e aceita a segunda tentativa completa", async (t) => {
  t.mock.method(console, "error", () => {})
  const { dir, path } = tempZipPath()
  try {
    const net = scripted([() => interrupted(20), complete])
    const result = await download(URL_2004, path, { ...quiet, fetchImpl: net.fetchImpl })
    assert.equal(result.tentativas, 2)
    assert.equal(result.bytes, ZIP.length)
    assert.equal(net.calls(), 2)
    assert.deepEqual(readFileSync(path), ZIP)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it("preserva causa, status e bytes recebidos quando todas as tentativas são interrompidas", async (t) => {
  t.mock.method(console, "error", () => {})
  const { dir, path } = tempZipPath()
  try {
    const net = scripted([() => interrupted(20)])
    const error = await download(URL_2004, path, { ...quiet, fetchImpl: net.fetchImpl, attempts: 3 }).then(() => null, (e: unknown) => e)
    assert.ok(error instanceof DownloadError)
    assert.equal(net.calls(), 3)
    assert.equal(existsSync(path), false, "arquivo parcial removido")
    const last = error.diagnostic.tentativas.at(-1)!
    assert.equal(error.diagnostic.tentativas.length, 3)
    assert.equal(last.etapa, "corpo")
    assert.equal(last.http_status, 200)
    assert.equal(last.bytes_recebidos, 20)
    assert.equal(last.content_length, ZIP.length)
    assert.equal(last.erro, "TypeError: terminated")
    assert.deepEqual(last.causa, [{ name: "SocketError", code: "UND_ERR_SOCKET", message: "other side closed" }])
    assert.match(error.message, /terminated na etapa corpo \(HTTP 200, 20 de 64 bytes, 1 s, causa: UND_ERR_SOCKET other side closed; 3 tentativa\(s\)\)/)
    // Nada no diagnóstico chama a interrupção de timeout, corrupção ou indisponibilidade.
    assert.doesNotMatch(JSON.stringify(error.diagnostic), /timeout|corromp|indispon/i)
    const pending = pendingFrom("historico_politico", 2004, "https://dadosabertos.tse.jus.br", error)
    assert.equal(pending.reason, error.message)
    assert.deepEqual(pending.diagnostic, error.diagnostic)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it("trata corpo menor que o content-length como leitura incompleta e repete", async (t) => {
  t.mock.method(console, "error", () => {})
  const { dir, path } = tempZipPath()
  try {
    const short = () => new Response(new Uint8Array(ZIP.subarray(0, 30)), { status: 200, headers: { "content-length": String(ZIP.length) } })
    const net = scripted([short, complete])
    const result = await download(URL_2004, path, { ...quiet, fetchImpl: net.fetchImpl })
    assert.equal(result.tentativas, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it("repete falha de conexão e 5xx, mas não repete 404 nem arquivo que não é ZIP", async (t) => {
  t.mock.method(console, "error", () => {})
  const { dir, path } = tempZipPath()
  try {
    const flaky = scripted([() => { throw socketTerminated() }, () => new Response("x", { status: 503 }), complete])
    assert.equal((await download(URL_2004, path, { ...quiet, fetchImpl: flaky.fetchImpl })).tentativas, 3)
    rmSync(path, { force: true })

    const missing = scripted([() => new Response("não", { status: 404 })])
    const notFound = await download(URL_2004, path, { ...quiet, fetchImpl: missing.fetchImpl }).then(() => null, (e: unknown) => e)
    assert.ok(notFound instanceof DownloadError)
    assert.equal(missing.calls(), 1)
    assert.equal(notFound.diagnostic.tentativas[0]!.etapa, "status")
    assert.equal(notFound.diagnostic.tentativas[0]!.http_status, 404)

    const html = scripted([() => new Response("<html>erro</html>", { status: 200 })])
    const notZip = await download(URL_2004, path, { ...quiet, fetchImpl: html.fetchImpl }).then(() => null, (e: unknown) => e)
    assert.ok(notZip instanceof DownloadError)
    assert.equal(html.calls(), 1)
    assert.equal(notZip.diagnostic.tentativas[0]!.etapa, "validacao")
    assert.equal(existsSync(path), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it("registra falha antes da resposta sem status nem bytes", async (t) => {
  t.mock.method(console, "error", () => {})
  const { dir, path } = tempZipPath()
  try {
    const down = scripted([() => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) }) }])
    const error = await download(URL_2004, path, { ...quiet, fetchImpl: down.fetchImpl, attempts: 2 }).then(() => null, (e: unknown) => e)
    assert.ok(error instanceof DownloadError)
    const first = error.diagnostic.tentativas[0]!
    assert.equal(first.etapa, "resposta")
    assert.equal(first.http_status, null)
    assert.equal(first.bytes_recebidos, 0)
    assert.equal(first.causa[0]!.code, "ECONNREFUSED")
    assert.match(error.message, /sem resposta HTTP/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it("respeita o prazo total da etapa: não repete nem começa download sem tempo", async (t) => {
  t.mock.method(console, "error", () => {})
  const { dir, path } = tempZipPath()
  try {
    let clock = 0
    const now = () => clock
    const net = scripted([() => { clock += 60_000; return interrupted(20) }])
    // 100 s de prazo: a 1ª tentativa consome 60 s; a 2ª exigiria 15 s de espera + 30 s mínimos.
    const cut = await download(URL_2004, path, { sleep: async () => {}, now, fetchImpl: net.fetchImpl, deadline: 100_000 }).then(() => null, (e: unknown) => e)
    assert.ok(cut instanceof DownloadError)
    assert.equal(net.calls(), 1)
    assert.equal(cut.diagnostic.prazo_esgotado, true)
    assert.match(cut.message, /1 tentativa\(s\); prazo total da etapa esgotado/)

    const none = scripted([complete])
    const late = await download(URL_2004, path, { sleep: async () => {}, now: () => 90_000, fetchImpl: none.fetchImpl, deadline: 100_000 }).then(() => null, (e: unknown) => e)
    assert.ok(late instanceof DownloadError)
    assert.equal(none.calls(), 0)
    assert.equal(late.message, "prazo total da etapa esgotado antes do download")
    assert.equal(pendingFrom("historico_politico", 2004, "https://dadosabertos.tse.jus.br", late).diagnostic?.prazo_esgotado, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
