import assert from "node:assert/strict"
import { test } from "node:test"
import { getEstadoUFs } from "../src/lib/br-uf"
import { getCanonicalStateRedirectPath, getStatePagePresentation } from "../src/lib/state-page-presentation"

test("uppercase UF redirect preserves shared party and text filters", () => {
  assert.equal(getCanonicalStateRedirectPath("SP", { partido: "PT", busca: "São Paulo" }), "/uf/sp?partido=PT&busca=S%C3%A3o+Paulo")
  assert.equal(getCanonicalStateRedirectPath("RJ", { partido: ["PT", "PSB"], vazio: undefined }), "/uf/rj?partido=PT&partido=PSB")
  assert.equal(getCanonicalStateRedirectPath("DF", {}), "/uf/df")
})

test("every state shares a canonical electoral title and source-aware description", () => {
  for (const uf of getEstadoUFs()) {
    const presentation = getStatePagePresentation(uf.toUpperCase())!
    assert.ok(presentation.title.includes("Eleições 2026"))
    assert.ok(presentation.title.includes(presentation.name))
    assert.match(presentation.description, /fontes, períodos e limites de cobertura/)
    assert.equal(presentation.path, `/uf/${uf}`)
    assert.equal(presentation.image, `/uf/${uf}/opengraph-image`)
  }
})

test("invalid states cannot produce an indexable state presentation", () => {
  assert.equal(getStatePagePresentation("zz"), null)
  assert.equal(getStatePagePresentation("<script>"), null)
  assert.match(getStatePagePresentation("DF")!.title, /Governo do Distrito Federal/)
})
