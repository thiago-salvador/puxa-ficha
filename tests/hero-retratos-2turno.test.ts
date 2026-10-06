import assert from "node:assert/strict"
import { test } from "node:test"
import { retratoHero } from "@/lib/hero-retratos-2turno"

test("retratos largos dos finalistas com crédito, página e medidas válidas", () => {
  for (const slug of ["flavio-bolsonaro", "lula"]) {
    const r = retratoHero(slug)
    assert.ok(r, slug)
    assert.match(r.url, /^https:\/\/upload\.wikimedia\.org\//)
    assert.match(r.pagina, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    assert.ok(r.credito && r.licenca)
    assert.ok(r.largura / r.altura > 0.9, `${slug}: retrato largo, não o recorte 3:4`)
  }
})

test("sem retrato cadastrado, o hero cai na foto da ficha", () => {
  assert.equal(retratoHero("outro-candidato"), null)
  assert.equal(retratoHero(null), null)
})
