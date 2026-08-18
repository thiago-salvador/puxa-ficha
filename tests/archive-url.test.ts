import assert from "node:assert/strict"
import test from "node:test"

import { archiveFonteReferences, archiveUrl } from "../scripts/lib/archive-url"

test("archiveUrl devolve Content-Location do snapshot salvo", async () => {
  const chamadas: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    chamadas.push(String(input))
    return new Response("", {
      status: 200,
      headers: {
        "content-location": "/web/20260815123000/https://example.com/fonte",
      },
    })
  }) as typeof fetch

  const snapshot = await archiveUrl("https://example.com/fonte", { fetchImpl })

  assert.equal(
    snapshot,
    "https://web.archive.org/web/20260815123000/https://example.com/fonte",
  )
  assert.deepEqual(chamadas, ["https://web.archive.org/save/https://example.com/fonte"])
})

test("archiveUrl falha aberto em erro e timeout de rede", async () => {
  const falha = (async () => {
    throw new Error("network down")
  }) as typeof fetch
  const pendente = (() => new Promise<Response>(() => {})) as typeof fetch

  assert.equal(await archiveUrl("https://example.com/falha", { fetchImpl: falha }), null)
  assert.equal(
    await archiveUrl("https://example.com/lenta", { fetchImpl: pendente, timeoutMs: 5 }),
    null,
  )
})

test("archiveFonteReferences grava url_archive ao lado da URL quando disponível", async () => {
  const fetchImpl = (async () =>
    new Response("", {
      status: 200,
      headers: { location: "/web/20260815124500/https://example.com/original" },
    })) as typeof fetch

  const [fonte] = await archiveFonteReferences(
    [{ titulo: "Fonte", url: "https://example.com/original" }],
    { fetchImpl },
  )

  assert.deepEqual(fonte, {
    titulo: "Fonte",
    url: "https://example.com/original",
    url_archive: "https://web.archive.org/web/20260815124500/https://example.com/original",
  })
})
