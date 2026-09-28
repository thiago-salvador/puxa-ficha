import assert from "node:assert/strict"
import { test } from "node:test"
import { getEstadoComPreposicao, getEstadoUFs } from "../src/lib/br-uf"
import { getCanonicalUfPathname, getStatePagePresentation } from "../src/lib/state-page-presentation"

test("uppercase and mixed-case UF paths resolve to the lowercase canonical path", () => {
  assert.equal(getCanonicalUfPathname("/uf/BA"), "/uf/ba")
  assert.equal(getCanonicalUfPathname("/uf/Ba"), "/uf/ba")
  assert.equal(getCanonicalUfPathname("/uf/bA/senado"), "/uf/ba/senado")
  assert.equal(getCanonicalUfPathname("/uf/SP/opengraph-image"), "/uf/sp/opengraph-image")
  assert.equal(getCanonicalUfPathname("/uf/%42A"), "/uf/ba")
})

test("canonical, unknown and non-UF paths are left alone", () => {
  assert.equal(getCanonicalUfPathname("/uf/ba"), null)
  assert.equal(getCanonicalUfPathname("/uf/ba/senado"), null)
  assert.equal(getCanonicalUfPathname("/uf/XX"), null)
  assert.equal(getCanonicalUfPathname("/uf/Bahia"), null)
  assert.equal(getCanonicalUfPathname("/uf/%E0%A4%A"), null)
  assert.equal(getCanonicalUfPathname("/uf"), null)
  assert.equal(getCanonicalUfPathname("/candidato/BA"), null)
})

test("every state shares a canonical electoral title and source-aware description", () => {
  for (const uf of getEstadoUFs()) {
    const presentation = getStatePagePresentation(uf.toUpperCase())!
    assert.ok(presentation.title.includes("Eleições 2026"))
    assert.ok(presentation.title.includes(presentation.name))
    assert.match(presentation.description, /fontes, períodos e limites de cobertura/)
    assert.equal(presentation.path, `/uf/${uf}`)
    assert.equal(presentation.image, `/uf/${uf}/opengraph-image`)
    assert.match(presentation.ofState, /^(do|da|de) /)
    assert.match(presentation.inState, /^(no|na|em) /)
  }
})

test("state titles use the preposition each state takes", () => {
  assert.equal(getStatePagePresentation("ba")!.title, "Eleições 2026: Governo da Bahia (BA) | Puxa Ficha")
  assert.equal(getStatePagePresentation("rj")!.title, "Eleições 2026: Governo do Rio de Janeiro (RJ) | Puxa Ficha")
  assert.equal(getStatePagePresentation("sp")!.title, "Eleições 2026: Governo de São Paulo (SP) | Puxa Ficha")
  assert.equal(getStatePagePresentation("DF")!.title, "Eleições 2026: Governo do Distrito Federal (DF) | Puxa Ficha")
  assert.match(getStatePagePresentation("ba")!.description, /indicadores da Bahia,/)

  const expected: Record<string, [string, string]> = {
    ac: ["do Acre", "no Acre"],
    al: ["de Alagoas", "em Alagoas"],
    am: ["do Amazonas", "no Amazonas"],
    ap: ["do Amapá", "no Amapá"],
    ba: ["da Bahia", "na Bahia"],
    ce: ["do Ceará", "no Ceará"],
    df: ["do Distrito Federal", "no Distrito Federal"],
    es: ["do Espírito Santo", "no Espírito Santo"],
    go: ["de Goiás", "em Goiás"],
    ma: ["do Maranhão", "no Maranhão"],
    mg: ["de Minas Gerais", "em Minas Gerais"],
    ms: ["de Mato Grosso do Sul", "em Mato Grosso do Sul"],
    mt: ["de Mato Grosso", "em Mato Grosso"],
    pa: ["do Pará", "no Pará"],
    pb: ["da Paraíba", "na Paraíba"],
    pe: ["de Pernambuco", "em Pernambuco"],
    pi: ["do Piauí", "no Piauí"],
    pr: ["do Paraná", "no Paraná"],
    rj: ["do Rio de Janeiro", "no Rio de Janeiro"],
    rn: ["do Rio Grande do Norte", "no Rio Grande do Norte"],
    ro: ["de Rondônia", "em Rondônia"],
    rr: ["de Roraima", "em Roraima"],
    rs: ["do Rio Grande do Sul", "no Rio Grande do Sul"],
    sc: ["de Santa Catarina", "em Santa Catarina"],
    se: ["de Sergipe", "em Sergipe"],
    sp: ["de São Paulo", "em São Paulo"],
    to: ["do Tocantins", "no Tocantins"],
  }
  assert.deepEqual(Object.keys(expected).sort(), [...getEstadoUFs()].sort())
  for (const [uf, [de, em]] of Object.entries(expected)) {
    assert.equal(getEstadoComPreposicao(uf, "de"), de, uf)
    assert.equal(getEstadoComPreposicao(uf.toUpperCase(), "em"), em, uf)
  }
  assert.equal(getEstadoComPreposicao("zz", "de"), null)
})

test("invalid states cannot produce an indexable state presentation", () => {
  assert.equal(getStatePagePresentation("zz"), null)
  assert.equal(getStatePagePresentation("<script>"), null)
})
