import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { truncateOnWordBoundary } from "../src/lib/text-truncate"

describe("truncateOnWordBoundary", () => {
  it("devolve texto curto sem reticência", () => {
    assert.equal(truncateOnWordBoundary("Prefeito do Rio.", 155), "Prefeito do Rio.")
    // limite exato também não trunca
    assert.equal(truncateOnWordBoundary("abcde", 5), "abcde")
  })

  it("não corta no meio da palavra", () => {
    // O caso do OG image: produção terminava em "ministro do Tur".
    const bio =
      "Eduardo Paes é prefeito do Rio de Janeiro e foi ministro do Turismo no governo federal."
    const out = truncateOnWordBoundary(bio, 40)
    assert.ok(out.length <= 40, `passou do limite: ${out.length}`)
    assert.ok(out.endsWith("…"), out)
    const semReticencia = out.slice(0, -1)
    assert.ok(
      bio.startsWith(semReticencia),
      "o prefixo tem que continuar sendo o texto original",
    )
    assert.ok(
      bio[semReticencia.length] === " " || bio[semReticencia.length] === undefined,
      `cortou no meio da palavra: ${JSON.stringify(out)}`,
    )
    assert.doesNotMatch(out, /Tur…$/)
  })

  it("não duplica pontuação no corte", () => {
    assert.equal(truncateOnWordBoundary("Foi ministro do Turismo. Depois disso.", 26), "Foi ministro do Turismo…")
    assert.equal(truncateOnWordBoundary("Um, dois, três, quatro cinco", 16), "Um, dois, três…")
  })

  it("palavra única maior que o limite ainda respeita o limite", () => {
    const out = truncateOnWordBoundary("A".repeat(300), 10)
    assert.equal(out.length, 10)
    assert.ok(out.endsWith("…"))
  })

  it("entrada degenerada não explode", () => {
    assert.equal(truncateOnWordBoundary("   texto   ", 155), "texto")
    assert.equal(truncateOnWordBoundary("qualquer", 0), "")
  })
})
