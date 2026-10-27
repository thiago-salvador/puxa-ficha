import assert from "node:assert/strict"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
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

test("imagem local normaliza a extensão e ignora a query", () => {
  const { arquivoImagemLocal } = carregarArquivo(true)
  assert.match(arquivoImagemLocal("https://fotos.exemplo.test/a/retrato.JPEG"), /^\/_img\/[a-z0-9]+\.jpg\?o=/)
  assert.match(arquivoImagemLocal("https://fotos.exemplo.test/a/retrato.png?w=640"), /^\/_img\/[a-z0-9]+\.png\?o=/)
  assert.match(arquivoImagemLocal("https://fotos.exemplo.test/a/retrato"), /^\/_img\/[a-z0-9]+\.img\?o=/)
  const href = arquivoImagemLocal("https://fotos.exemplo.test/a/retrato.webp?v=2")
  assert.equal(decodeURIComponent(href.split("?o=")[1]), "https://fotos.exemplo.test/a/retrato.webp?v=2")
})

test("download aceita formato em maiúsculas e cai em JSON sem formato", () => {
  const { arquivoDownloadHref } = carregarArquivo(true)
  assert.match(arquivoDownloadHref("/api/imprensa/export?format=CSV"), /\.csv$/)
  assert.match(arquivoDownloadHref("/api/imprensa/export/gastos"), /\.json$/)
})

// O crawler roda main() ao ser importado: a cópia das funções sai do texto do arquivo.
test("crawler e site geram o mesmo nome de imagem", () => {
  const { arquivoImagemLocal } = carregarArquivo(true)
  const fonte = fs.readFileSync(fileURLToPath(new URL("../scripts/arquivo/espelhar-paginas.mjs", import.meta.url)), "utf8")
  const inicio = fonte.indexOf("function hashImagem(")
  const fim = fonte.indexOf("\n}\n", fonte.indexOf("function arquivoImagemLocal(")) + 3
  assert.ok(inicio > 0 && fim > inicio, "funções de imagem não encontradas no crawler")
  const copia = new Function(`${fonte.slice(inicio, fim)}\nreturn arquivoImagemLocal`)() as (src: string) => string
  for (const url of [
    "https://fotos.exemplo.test/a/retrato.jpg",
    "https://fotos.exemplo.test/b/Foto_%28oficial%29.jpeg?w=960",
    "https://outro.exemplo.test/c/sem-extensao",
    "https://outro.exemplo.test/d/ação.png",
  ]) {
    assert.equal(copia(url), arquivoImagemLocal(url), url)
  }
})
