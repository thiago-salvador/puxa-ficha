import assert from "node:assert/strict"
import { it } from "node:test"
import { programaSecaoAnchor, resolveProgramaSectionTarget } from "../src/lib/programa-governo-navigation"
import type { ProgramaGovernoSecao } from "../src/lib/programa-governo"

const secoes: ProgramaGovernoSecao[] = Array.from({ length: 40 }, (_, i) => ({
  id: `pagina-${i + 1}`, titulo: `Página ${i + 1}`, nivel: 1,
  paginaInicial: i + 1, paginaFinal: i + 1, origem: "pdftotext", conteudo: "Saúde pública",
}))

it("revela uma seção após o primeiro lote apenas com hash correspondente", () => {
  const search = new URLSearchParams({ sourceSha256: "a".repeat(64), secao: "pagina-35" })
  assert.deepEqual(resolveProgramaSectionTarget(secoes, "a".repeat(64), search.toString()), { index: 34, stale: false })
})

it("uma versão nova não reutiliza a âncora nem revela o alvo da versão antiga", () => {
  const oldHash = "a".repeat(64), newHash = "b".repeat(64)
  assert.notEqual(programaSecaoAnchor(oldHash, "pagina-35"), programaSecaoAnchor(newHash, "pagina-35"))
  assert.deepEqual(resolveProgramaSectionTarget(secoes, newHash, new URLSearchParams({ sourceSha256: oldHash, secao: "pagina-35" }).toString()), { index: -1, stale: true })
  assert.deepEqual(resolveProgramaSectionTarget(secoes.slice(0, 2), newHash, new URLSearchParams({ sourceSha256: newHash, secao: "pagina-35" }).toString()), { index: -1, stale: true })
})

it("uma URL sem alvo preserva a leitura normal", () => {
  assert.deepEqual(resolveProgramaSectionTarget(secoes, undefined, "tab=programa"), { index: -1, stale: false })
})
