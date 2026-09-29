import "./helpers/server-only"
import assert from "node:assert/strict"
import test from "node:test"
import { createImprensaAtualizacoesLoader } from "../src/lib/imprensa-atualizacoes"

const update = {
  id: "00000000-0000-0000-0000-000000000001",
  candidate_slug: "ana-teste",
  candidate_name: "Ana Teste",
  field: "situacao" as const,
  year: 2026,
  before_value: "aguardando julgamento",
  after_value: "deferido",
  source_url: "https://www.tse.jus.br/eleicoes/consultas/candidatos",
  detected_at: "2026-09-22T12:00:00.000Z",
}

test("carrega a lista inteira da coorte, até o teto, com o total do banco", async () => {
  const loader = createImprensaAtualizacoesLoader(async (limit, slugs) => {
    assert.equal(limit, 1000)
    assert.deepEqual(slugs, ["ana-teste", "senado-teste"])
    return { data: [update], error: null, count: 1 }
  }, async () => [{ slug: "ana-teste" }, { slug: "senado-teste" }, { slug: "ana-teste" }])
  const result = await loader()
  assert.equal(result.status, "available")
  assert.equal(result.total, 1)
  assert.deepEqual(result.updates, [update])
})

test("falha de consulta ou linha sem prova válida fica indisponível", async () => {
  const failed = createImprensaAtualizacoesLoader(
    async () => ({ data: null, error: { message: "timeout" }, count: null }),
    async () => [{ slug: "ana-teste" }],
  )
  assert.equal((await failed()).status, "unavailable")

  const malformed = createImprensaAtualizacoesLoader(
    async () => ({ data: [{ ...update, source_url: "https://example.com/noticia" }], error: null, count: 1 }),
    async () => [{ slug: "ana-teste" }],
  )
  const result = await malformed()
  assert.equal(result.status, "unavailable")
  assert.equal(result.total, null)
})

test("coorte vazia falha fechada sem consultar a tabela", async () => {
  let queried = false
  const loader = createImprensaAtualizacoesLoader(async () => {
    queried = true
    return { data: [], error: null, count: 0 }
  }, async () => [])
  assert.equal((await loader()).status, "unavailable")
  assert.equal(queried, false)
})
