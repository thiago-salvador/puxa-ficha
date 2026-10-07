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

test("retrato com dado inválido é recusado e o hero cai na foto da ficha", () => {
  const base = retratoHero("lula")!
  const casos: Record<string, Partial<typeof base>> = {
    "url fora do Wikimedia": { url: "https://exemplo.com/foto.jpg" },
    "url sem https": { url: "http://upload.wikimedia.org/foto.jpg" },
    "rosto_x fora de 0 a 1": { rosto_x: 1 },
    "escala abaixo de 1": { escala: 0.5 },
    "escala acima de 2": { escala: 2.5 },
    "rosto_largura zero": { rosto_largura: 0 },
    "largura zero": { largura: 0 },
    "sem crédito": { credito: "  " },
    "página sem https": { pagina: "commons.wikimedia.org/wiki/File:x.jpg" },
  }
  for (const [nome, troca] of Object.entries(casos)) {
    assert.equal(retratoHero("x", { x: { ...base, ...troca } }), null, nome)
  }
  assert.ok(retratoHero("x", { x: base }), "o próprio registro válido passa")
})
