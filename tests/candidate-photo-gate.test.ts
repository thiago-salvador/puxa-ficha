import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  auditPhotos,
  collectPhotos,
  isBelowSlot,
  MIN_HEIGHT,
  MIN_WIDTH,
  type BaselineEntry,
  type PhotoInfo,
} from "../scripts/check-candidate-photo-resolution"

/**
 * Gate do G5-02 (master review 2026-08-04): 34 de 71 fotos em
 * public/candidates têm resolução de origem abaixo do slot em 2x (562x750)
 * e saem borradas na grade. As legadas ficam toleradas via baseline por
 * hash; foto nova ou reposição precisa cumprir o slot.
 */
describe("gate de resolução de fotos de candidato", () => {
  it("o repositório atual passa no gate (legadas toleradas pela baseline)", () => {
    const baseline = JSON.parse(
      readFileSync("scripts/data/candidate-photo-baseline.json", "utf8")
    ) as BaselineEntry[]
    const { photos, unreadable } = collectPhotos("public/candidates")
    assert.equal(unreadable.length, 0, `ilegíveis: ${unreadable.join(", ")}`)
    const result = auditPhotos(photos, baseline)
    assert.deepEqual(result.violations, [])
  })

  it("foto nova abaixo do slot é violação", () => {
    const result = auditPhotos(
      [{ file: "novo-candidato.jpg", width: 400, height: 500, sha256: "abc" }],
      []
    )
    assert.equal(result.ok, false)
    assert.match(result.violations[0], /novo-candidato\.jpg/)
  })

  it("legada intocada é tolerada, mas reposição ainda pequena é violação", () => {
    const baseline: BaselineEntry[] = [
      { file: "legada.jpg", width: 161, height: 225, sha256: "hash-original" },
    ]
    const intocada: PhotoInfo[] = [
      { file: "legada.jpg", width: 161, height: 225, sha256: "hash-original" },
    ]
    assert.equal(auditPhotos(intocada, baseline).ok, true)

    const substituida: PhotoInfo[] = [
      { file: "legada.jpg", width: 300, height: 400, sha256: "hash-novo" },
    ]
    const result = auditPhotos(substituida, baseline)
    assert.equal(result.ok, false)
    assert.match(result.violations[0], /substituído/)
  })

  it("legada curada acima do slot vira aviso para sair da baseline", () => {
    const baseline: BaselineEntry[] = [
      { file: "curada.jpg", width: 161, height: 225, sha256: "hash-antigo" },
    ]
    const result = auditPhotos(
      [{ file: "curada.jpg", width: 800, height: 1000, sha256: "hash-novo" }],
      baseline
    )
    assert.equal(result.ok, true)
    assert.match(result.warnings[0], /remover da baseline/)
  })

  it("o limiar é o slot do card da home em 2x", () => {
    assert.equal(MIN_WIDTH, 562)
    assert.equal(MIN_HEIGHT, 750)
    assert.equal(isBelowSlot(562, 750), false)
    assert.equal(isBelowSlot(561, 750), true)
    assert.equal(isBelowSlot(562, 749), true)
  })
})
