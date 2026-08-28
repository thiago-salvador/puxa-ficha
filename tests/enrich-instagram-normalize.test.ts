import assert from "node:assert/strict"
import test from "node:test"

import { normalizeInstagramUsername } from "../scripts/lib/enrich-instagram"

test("normaliza username simples, arroba e URL oficial", () => {
  assert.equal(normalizeInstagramUsername("Thiago.Salvador_"), "thiago.salvador_")
  assert.equal(normalizeInstagramUsername("@thiago_salvador"), "thiago_salvador")
  assert.equal(
    normalizeInstagramUsername("HTTPS://WWW.INSTAGRAM.COM/MARCUSPSTU?IGSH=token"),
    "marcuspstu",
  )
})

test("normaliza objeto legado e recusa domínio ou username inválido", () => {
  assert.equal(
    normalizeInstagramUsername({
      username: "HTTPS://WWW.INSTAGRAM.COM/PROF.AROLDOFELIX_UP/",
      url: "https://instagram.com/HTTPS://WWW.INSTAGRAM.COM/PROF.AROLDOFELIX_UP/",
    }),
    "prof.aroldofelix_up",
  )
  assert.equal(normalizeInstagramUsername("https://example.com/perfil"), null)
  assert.equal(normalizeInstagramUsername("nome/com/barra"), null)
  assert.equal(normalizeInstagramUsername(""), null)
})
