import assert from "node:assert/strict"
import test from "node:test"
import { mergeLinkedNews, newsSummary, newsTitle } from "../src/lib/news/display"
import type { NoticiaCandidato } from "../src/lib/types"

test("link do email substitui ID público compacto sem duplicar a matéria", () => {
  const base = {url: "https://example.test/noticia", titulo: "Teste"} as NoticiaCandidato
  const local = {...base, id: "noticia-1-hash"}
  const linked = {...base, id: "uuid-do-registro"}
  const other = {...base, id: "outra", url: "https://example.test/outra"}
  const result = mergeLinkedNews([local, other], linked)
  assert.equal(result.length, 2)
  assert.equal(result.find(n => n.url === base.url)?.id, linked.id)
  assert.equal(local.id, "noticia-1-hash")
})

test("remove só o sufixo exato da fonte e preserva o título editorial", () => {
  assert.equal(newsTitle({ titulo: "Título de teste - G1", fonte: "G1" }), "Título de teste")
  assert.equal(newsTitle({ titulo: "Título de teste - outra fonte", fonte: "G1" }), "Título de teste - outra fonte")
})

test("não apresenta título, fonte ou vazio como resumo", () => {
  for (const snippet of [null, " ", "G1", "Título de teste", "Título de teste - G1"]) {
    assert.equal(newsSummary({ titulo: "Título de teste - G1", fonte: "G1", snippet }), null)
  }
  assert.equal(newsSummary({ titulo: "Título de teste", fonte: "G1", snippet: " Explicação fornecida pela fonte. " }), "Explicação fornecida pela fonte.")
})
