import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
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
