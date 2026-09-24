import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { consultarFichaPublica, consultarFichasPublicas } from "../scripts/lib/ficha-publica-representacoes"

describe("consulta pública de fichas para representações", () => {
  it("lê só slugs de candidatos_publico com a chave pública, sem escrita", async () => {
    const chamadas: Array<{ url: string; method: string | undefined }> = []
    const publicos = await consultarFichasPublicas(["ficha-publica", "ficha-oculta"], {
      url: "https://fixture.supabase.co",
      key: "chave-sintetica",
      fetchImpl: async (input, init) => {
        chamadas.push({ url: String(input), method: init?.method })
        assert.equal(new Headers(init?.headers).get("apikey"), "chave-sintetica")
        return new Response(JSON.stringify([{ slug: "ficha-publica" }]), { status: 200 })
      },
    })
    assert.deepEqual([...publicos], ["ficha-publica"])
    assert.equal(chamadas.length, 1)
    assert.match(chamadas[0]!.url, /\/rest\/v1\/candidatos_publico\?/)
    assert.equal(chamadas[0]!.method, "GET")
  })

  it("erro de rede e resposta inválida não viram ausência confirmada", async () => {
    await assert.rejects(
      consultarFichaPublica("ficha-publica", async () => { throw new Error("offline") }),
      /indisponível; aprovação recusada/,
    )
    await assert.rejects(
      consultarFichasPublicas(["ficha-publica"], {
        url: "https://fixture.supabase.co",
        key: "chave-sintetica",
        fetchImpl: async () => { throw new Error("offline") },
      }),
      /falha de rede/,
    )
    await assert.rejects(
      consultarFichasPublicas(["ficha-publica"], {
        url: "https://fixture.supabase.co",
        key: "chave-sintetica",
        fetchImpl: async () => new Response("{}", { status: 200 }),
      }),
      /resposta inválida/,
    )
  })
})
