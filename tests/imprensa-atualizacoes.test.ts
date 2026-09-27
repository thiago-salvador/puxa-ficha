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

test("carrega página e calcula próxima página pelo total", async () => {
  const loader = createImprensaAtualizacoesLoader(async (from, to, slugs) => {
    assert.equal(from, 20)
    assert.equal(to, 39)
    assert.deepEqual(slugs, ["ana-teste", "senado-teste"])
    return { data: [update], error: null, count: 21 }
  }, async () => [{ slug: "ana-teste" }, { slug: "senado-teste" }])
  const result = await loader(2)
  assert.equal(result.status, "available")
  assert.equal(result.page, 2)
  assert.equal(result.total, 21)
  assert.equal(result.hasNext, false)
  assert.deepEqual(result.updates, [update])
})

test("falha de consulta ou linha sem prova válida fica indisponível", async () => {
  const failed = createImprensaAtualizacoesLoader(async (_from, _to, slugs) => {
    assert.deepEqual(slugs, ["ana-teste"])
    return { data: null, error: { message: "timeout" }, count: null }
  }, async () => [{ slug: "ana-teste" }])
  assert.equal((await failed(1)).status, "unavailable")

  const malformed = createImprensaAtualizacoesLoader(async (_from, _to, slugs) => {
    assert.deepEqual(slugs, ["ana-teste"])
    return {
    data: [{ ...update, source_url: "https://example.com/noticia" }],
    error: null,
    count: 1,
    }
  }, async () => [{ slug: "ana-teste" }])
  assert.equal((await malformed(1)).status, "unavailable")
})

test("coorte vazia falha fechada sem consultar a tabela", async () => {
  let queried = false
  const loader = createImprensaAtualizacoesLoader(async () => {
    queried = true
    return { data: [], error: null, count: 0 }
  }, async () => [])
  assert.equal((await loader(1)).status, "unavailable")
  assert.equal(queried, false)
})
