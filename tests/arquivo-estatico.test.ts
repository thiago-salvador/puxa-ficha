import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)

function carregarArquivo(estatico: boolean) {
  const caminho = require.resolve("../src/lib/arquivo")
  delete require.cache[caminho]
  const anterior = process.env.NEXT_PUBLIC_ARQUIVO_ESTATICO
  if (estatico) process.env.NEXT_PUBLIC_ARQUIVO_ESTATICO = "1"
  else delete process.env.NEXT_PUBLIC_ARQUIVO_ESTATICO
  try {
    return require("../src/lib/arquivo") as typeof import("../src/lib/arquivo")
  } finally {
    if (anterior === undefined) delete process.env.NEXT_PUBLIC_ARQUIVO_ESTATICO
    else process.env.NEXT_PUBLIC_ARQUIVO_ESTATICO = anterior
    delete require.cache[caminho]
  }
}

test("fora do espelho estático o link de download fica igual", () => {
  const { arquivoDownloadHref, ARQUIVO_ESTATICO } = carregarArquivo(false)
  assert.equal(ARQUIVO_ESTATICO, false)
  assert.equal(arquivoDownloadHref("/api/dados-abertos?format=csv"), "/api/dados-abertos?format=csv")
})

test("no espelho estático o link vira arquivo que guarda a URL original", () => {
  const { arquivoDownloadHref } = carregarArquivo(true)
  const original = "/api/imprensa/export?format=csv&turno=2"
  const href = arquivoDownloadHref(original)
  assert.match(href, /^\/arquivo-dados\/[A-Za-z0-9_-]+\.csv$/)
  const codificado = href.slice("/arquivo-dados/".length, -".csv".length)
  assert.equal(Buffer.from(codificado, "base64url").toString("utf8"), original)
  assert.match(arquivoDownloadHref("/api/dados-abertos?format=json"), /\.json$/)
})

test("documento do programa usa o id codificado no caminho", () => {
  const { arquivoProgramaDocumentoHref } = carregarArquivo(true)
  const href = arquivoProgramaDocumentoHref("fulano", "SP:250002412345:01")
  const codificado = href.split("/").pop()!.replace(/\.json$/, "")
  assert.equal(Buffer.from(codificado, "base64url").toString("utf8"), "SP:250002412345:01")
  assert.match(href, /^\/api\/candidato-profile\/fulano\/programa-documento\//)
})
