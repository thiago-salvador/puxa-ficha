import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { rotuloAbaFinalistas, separarSecoesPorFase } from "@/lib/fase-eleitoral-publica"
import { AbasFiltro } from "@/components/AbasFiltro"

const c = (slug: string, fase: string | null) => ({ slug, fase_eleitoral_2026: fase ? { fase_eleitoral: fase } : null }) as never

test("finalistas em cima e os demais embaixo, na ordem recebida", () => {
  const s = separarSecoesPorFase([c("a", "nao_eleito"), c("b", "segundo_turno"), c("d", null), c("e", "segundo_turno")])!
  assert.deepEqual(s.destaque.map((x: { slug: string }) => x.slug), ["b", "e"])
  assert.deepEqual(s.demais.map((x: { slug: string }) => x.slug), ["a", "d"])
  assert.equal(s.tituloDestaque, "No 2º turno")
  assert.equal(rotuloAbaFinalistas(s), "2º turno")
})

test("estado decidido no 1º turno: seção e aba de eleito", () => {
  const s = separarSecoesPorFase([c("a", "eleito"), c("b", "nao_eleito")])!
  assert.equal(s.tituloDestaque, "Eleito no 1º turno")
  assert.equal(rotuloAbaFinalistas(s), "Eleito")
})

test("sem resultado ou só finalistas: sem seções", () => {
  assert.equal(separarSecoesPorFase([c("a", null), c("b", null)]), null)
  assert.equal(separarSecoesPorFase([c("a", "segundo_turno"), c("b", "segundo_turno")]), null)
})

test("abas expõem tablist e a aba ativa", () => {
  const html = renderToStaticMarkup(
    <AbasFiltro rotulo="Turno" abas={[{ id: "1", label: "1º turno" }, { id: "2", label: "2º turno" }]} ativa="2" onChange={() => {}} painelId="p" />,
  )
  assert.match(html, /role="tablist"/)
  assert.match(html, /aria-selected="true"[^>]*>2º turno/)
  assert.match(html, /aria-selected="false"[^>]*>1º turno/)
})
