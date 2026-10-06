// cspell:ignore Inacio
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fotoOgComoDataUri, urlFotoParaOg, USER_AGENT_OG } from "../src/lib/og-foto"

const WIKI = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Foto_oficial_de_Luiz_In%C3%A1cio_Lula.jpg/960px-Foto_oficial_de_Luiz_In%C3%A1cio_Lula.jpg"

function resposta(status: number, tipo = "image/jpeg", corpo: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3]), extra: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : corpo, { status, headers: { "content-type": tipo, ...extra } })
}

describe("foto do card do duelo (og)", () => {
  it("pede a miniatura de 330 px do Wikimedia e deixa outras URLs iguais", () => {
    assert.equal(urlFotoParaOg(WIKI), WIKI.replace("/960px-", "/330px-"))
    const pequena = WIKI.replace("/960px-", "/250px-")
    assert.equal(urlFotoParaOg(pequena), pequena)
    assert.equal(urlFotoParaOg("https://exemplo.org/foto.jpg"), "https://exemplo.org/foto.jpg")
  })

  it("manda User-Agent descritivo e devolve data URI", async () => {
    const pedidos: Array<{ url: string; ua: string | null }> = []
    const uri = await fotoOgComoDataUri(WIKI, {
      buscar: async (url, init) => {
        pedidos.push({ url, ua: new Headers(init.headers).get("user-agent") })
        return resposta(200)
      },
    })
    assert.equal(uri, `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`)
    assert.deepEqual(pedidos, [{ url: WIKI.replace("/960px-", "/330px-"), ua: USER_AGENT_OG }])
  })

  it("429 do Wikimedia: espera e tenta de novo uma vez (a causa da foto do Lula sumir)", async () => {
    let n = 0
    const esperas: number[] = []
    const uri = await fotoOgComoDataUri(WIKI, {
      buscar: async () => (++n === 1 ? resposta(429, "text/html", new Uint8Array([60]), { "retry-after": "1" }) : resposta(200, "image/png")),
      esperar: async (ms) => { esperas.push(ms) },
    })
    assert.equal(n, 2)
    assert.deepEqual(esperas, [1000])
    assert.match(uri ?? "", /^data:image\/png;base64,/)
  })

  it("cai nas iniciais (null) só quando a foto falha de verdade", async () => {
    const sempre = (r: () => Response) => ({ buscar: async () => r(), esperar: async () => {} })
    assert.equal(await fotoOgComoDataUri(WIKI, sempre(() => resposta(429, "text/html"))), null, "429 duas vezes")
    assert.equal(await fotoOgComoDataUri(WIKI, sempre(() => resposta(404))), null)
    assert.equal(await fotoOgComoDataUri(WIKI, sempre(() => resposta(200, "image/webp"))), null, "next/og não lê webp")
    assert.equal(await fotoOgComoDataUri(WIKI, sempre(() => resposta(200, "image/jpeg", new Uint8Array(1_500_001)))), null)
    let chamadas = 0
    assert.equal(await fotoOgComoDataUri(WIKI, { buscar: async () => { chamadas += 1; throw new Error("rede") }, esperar: async () => {} }), null)
    assert.equal(chamadas, 2)
    assert.equal(await fotoOgComoDataUri(null), null)
    assert.equal(await fotoOgComoDataUri("http://inseguro.org/a.jpg"), null)
  })

  it("a rota do card usa este baixador", async () => {
    const { readFileSync } = await import("node:fs")
    const rota = readFileSync("src/app/(site)/og/segundo-turno/route.tsx", "utf8")
    assert.match(rota, /fotoOgComoDataUri\(fotoDe\(fotos, c\.slug\)\)/)
  })
})
