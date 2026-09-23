import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  auditPhotos,
  collectPhotos,
  isBelowSlot,
  MIN_HEIGHT,
  MIN_WIDTH,
  TSE_OFFICIAL_FILE_PATTERN,
  TSE_OFFICIAL_MANIFEST_PATH,
  type BaselineEntry,
  type PhotoInfo,
  type TseOfficialEntry,
} from "../scripts/check-candidate-photo-resolution"

/**
 * Gate do G5-02 (master review 2026-08-04): 34 de 71 fotos em
 * public/candidates têm resolução de origem abaixo do slot em 2x (562x750)
 * e saem borradas na grade. As legadas ficam toleradas via baseline por
 * hash; foto nova ou reposição precisa cumprir o slot.
 */
describe("gate de resolução de fotos de candidato", () => {
  it("miniatura sem ZIP oficial não ganha exceção pelo nome", () => {
    const photo: PhotoInfo = {
      file: "tse-2026-123-thumb.jpg",
      width: 161,
      height: 225,
      sha256: "hash-espelho",
    }
    assert.equal(TSE_OFFICIAL_FILE_PATTERN.test(photo.file), false)
    const result = auditPhotos([photo], [], [])
    assert.equal(result.ok, false)
    assert.equal(result.tseOfficial.length, 0)
  })

  it("o repositório atual passa no gate (legadas toleradas pela baseline)", () => {
    const baseline = JSON.parse(
      readFileSync("scripts/data/candidate-photo-baseline.json", "utf8")
    ) as BaselineEntry[]
    const tseManifest = JSON.parse(
      readFileSync(TSE_OFFICIAL_MANIFEST_PATH, "utf8")
    ) as TseOfficialEntry[]
    const { photos, unreadable } = collectPhotos("public/candidates")
    assert.equal(unreadable.length, 0, `ilegíveis: ${unreadable.join(", ")}`)
    const result = auditPhotos(photos, baseline, tseManifest)
    assert.deepEqual(result.violations, [])
    assert.equal(
      baseline.some((entry) => TSE_OFFICIAL_FILE_PATTERN.test(entry.file)),
      false,
      "fotos oficiais do TSE não entram na baseline legada"
    )
  })

  describe("categoria foto oficial do registro TSE", () => {
    const tsePhoto: PhotoInfo = {
      file: "tse-2026-100002536212.jpg",
      width: 161,
      height: 225,
      sha256: "hash-tse",
    }
    const manifest: TseOfficialEntry[] = [
      { ...tsePhoto, source: "TSE foto_cand2026_<UF>_div.zip" },
    ]

    it("foto listada no manifesto com mesmo hash e dimensões passa", () => {
      const result = auditPhotos([tsePhoto], [], manifest)
      assert.equal(result.ok, true)
      assert.deepEqual(result.violations, [])
      assert.equal(result.tseOfficial.length, 1)
      assert.equal(result.belowSlot.length, 0)
    })

    it("mesmo nome com hash diferente é violação", () => {
      const result = auditPhotos([{ ...tsePhoto, sha256: "hash-trocado" }], [], manifest)
      assert.equal(result.ok, false)
      assert.match(result.violations[0], /tse-2026-100002536212\.jpg/)
      assert.match(result.violations[0], /sha256 difere/)
    })

    it("dimensão diferente da registrada é violação, mesmo abaixo do máximo do TSE", () => {
      const result = auditPhotos([{ ...tsePhoto, width: 150, height: 200 }], [], [
        { ...manifest[0], sha256: "hash-tse" },
      ])
      assert.equal(result.ok, false)
      assert.match(result.violations[0], /150x200, diferente dos 161x225/)
    })

    it("manifesto adulterado acima do máximo do TSE não libera a foto", () => {
      const grande: PhotoInfo = { ...tsePhoto, width: 300, height: 400 }
      const result = auditPhotos([grande], [], [{ ...manifest[0], width: 300, height: 400 }])
      assert.equal(result.ok, false)
      assert.match(result.violations[0], /acima do máximo entregue pelo TSE/)
    })

    it("foto nova abaixo do slot fora do padrão TSE continua violação", () => {
      const result = auditPhotos(
        [{ file: "senador-novo.jpg", width: 161, height: 225, sha256: "hash-tse" }],
        [],
        manifest
      )
      assert.equal(result.ok, false)
      assert.match(result.violations[0], /senador-novo\.jpg.*foto nova precisa cumprir o slot/)
    })

    it("arquivo tse-2026 fora do manifesto segue a regra normal do slot", () => {
      const result = auditPhotos([tsePhoto], [], [])
      assert.equal(result.ok, false)
      assert.match(result.violations[0], /foto nova precisa cumprir o slot/)
    })

    it("foto do TSE substituída por uma que cumpre o slot passa e pede limpeza do manifesto", () => {
      const result = auditPhotos(
        [{ ...tsePhoto, width: 800, height: 1000, sha256: "hash-melhor" }],
        [],
        manifest
      )
      assert.equal(result.ok, true)
      assert.match(result.warnings[0], /remover do manifesto TSE/)
    })

    it("entrada do manifesto sem arquivo é reportada", () => {
      const result = auditPhotos([], [], manifest)
      assert.equal(result.ok, true)
      assert.equal(result.warnings.length, 1)
      assert.match(result.warnings[0], /tse-2026-100002536212\.jpg está no manifesto.*não existe mais/)
    })
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
