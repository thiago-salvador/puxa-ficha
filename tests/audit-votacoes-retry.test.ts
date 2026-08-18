import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fetchJSON, janelas } from "../scripts/audit/levantar-votacoes-nominais-camara"
import { resolverProposicao } from "../scripts/audit/montar-proposta-votacoes"

const semEspera = async () => undefined

describe("auditorias de votações: falhas da API não viram lacuna factual", () => {
  it("repete rejeições de rede e devolve o sucesso posterior", async () => {
    let chamadas = 0
    const fetchFn = (async () => {
      chamadas++
      if (chamadas < 3) throw new Error("connection reset")
      return new Response(JSON.stringify({ dados: [{ id: "v-1" }] }), { status: 200 })
    }) as typeof fetch

    const resultado = await fetchJSON<{ dados: Array<{ id: string }> }>(
      "https://example.test/votacoes",
      fetchFn,
      semEspera,
    )
    assert.equal(chamadas, 3)
    assert.equal(resultado.dados[0]?.id, "v-1")
  })

  it("distingue resposta válida sem proposição de falha repetida da API", async () => {
    const semProposicao = (async () =>
      new Response(JSON.stringify({ dados: { proposicoesAfetadas: [] } }), {
        status: 200,
      })) as typeof fetch
    assert.equal(await resolverProposicao("123-1", semProposicao, semEspera), null)

    let chamadas = 0
    const sempreFalha = (async () => {
      chamadas++
      return new Response("indisponível", { status: 503 })
    }) as typeof fetch
    await assert.rejects(
      resolverProposicao("123-2", sempreFalha, semEspera),
      /123-2.*3 tentativas.*HTTP 503/,
    )
    assert.equal(chamadas, 3)
  })

  it("inclui intervalos de um único dia e rejeita ordem invertida", () => {
    assert.deepEqual(janelas("2026-08-10", "2026-08-10"), [["2026-08-10", "2026-08-10"]])
    assert.deepEqual(janelas("2026-08-01", "2026-08-08"), [
      ["2026-08-01", "2026-08-07"],
      ["2026-08-08", "2026-08-08"],
    ])
    assert.throws(() => janelas("2026-08-11", "2026-08-10"), /posterior/)
  })
})
