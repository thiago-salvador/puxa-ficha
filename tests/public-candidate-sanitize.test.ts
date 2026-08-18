import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  sanitizePublicPartyFields,
  sanitizePublicPartyFieldsList,
  sanitizePublicPartyValue,
} from "../src/lib/public-candidate-sanitize"

describe("sanitizePublicPartyValue", () => {
  it("retorna string vazia para variantes uncertain (back-compat com formatPartyPublicLabel)", () => {
    assert.equal(sanitizePublicPartyValue(null), "")
    assert.equal(sanitizePublicPartyValue(undefined), "")
    assert.equal(sanitizePublicPartyValue(""), "")
    assert.equal(sanitizePublicPartyValue("   "), "")
    assert.equal(sanitizePublicPartyValue("incerto"), "")
    assert.equal(sanitizePublicPartyValue("INCERTO"), "")
    assert.equal(sanitizePublicPartyValue("Incerto"), "")
    assert.equal(sanitizePublicPartyValue("SEMPARTIDO"), "")
    assert.equal(sanitizePublicPartyValue("Sem partido"), "")
  })

  it("preserva partidos reais com casing canonico", () => {
    assert.equal(sanitizePublicPartyValue("PT"), "PT")
    assert.equal(sanitizePublicPartyValue("NOVO"), "NOVO")
    assert.equal(sanitizePublicPartyValue("PSD"), "PSD")
    assert.equal(sanitizePublicPartyValue("PSDB"), "PSDB")
    // PCdoB tem casing especial em PARTY_DISPLAY_BY_TOKEN
    assert.equal(sanitizePublicPartyValue("PCdoB"), "PCdoB")
    assert.equal(sanitizePublicPartyValue("PCDOB"), "PCdoB")
  })

  it("canonicaliza aliases via formatPartyPublicLabel (mesma transformacao que CandidatoFichaView usa em data-pf-hero-party)", () => {
    assert.equal(sanitizePublicPartyValue("PODEMOS"), "PODE")
    assert.equal(sanitizePublicPartyValue("Podemos"), "PODE")
    assert.equal(sanitizePublicPartyValue("D35"), "DEMOCRATA")
    assert.equal(sanitizePublicPartyValue("DEMOCRATA"), "DEMOCRATA")
    assert.equal(sanitizePublicPartyValue("DEMOCRATAS"), "DEM")
  })

  it("exibe as siglas oficiais para valores legados e ja migrados", () => {
    const cases = [
      ["UNIAO", "UNIÃO"],
      ["UNIÃO", "UNIÃO"],
      ["MISSAO", "MISSÃO"],
      ["MISSÃO", "MISSÃO"],
      ["PODEMOS", "PODE"],
      ["PODE", "PODE"],
    ] as const

    for (const [input, expected] of cases) {
      assert.equal(sanitizePublicPartyValue(input), expected)
    }
  })
})

describe("sanitizePublicPartyFields", () => {
  it("sanitiza partido_sigla e partido_atual mantendo demais campos", () => {
    const input = {
      slug: "marcelo-maranata",
      nome_urna: "Marcelo Maranata",
      partido_sigla: "incerto",
      partido_atual: "incerto",
      cargo_disputado: "Governador",
      situacao_candidatura: "incerto",
    }
    const out = sanitizePublicPartyFields(input)
    assert.equal(out.partido_sigla, "")
    assert.equal(out.partido_atual, "")
    assert.equal(out.situacao_candidatura, "incerto", "situacao_candidatura nao deve ser tocada")
    assert.equal(out.slug, "marcelo-maranata")
    assert.equal(out.nome_urna, "Marcelo Maranata")
    assert.equal(out.cargo_disputado, "Governador")
  })

  it("preserva partido real e nao toca campos ausentes", () => {
    const input = { partido_sigla: "PT" }
    const out = sanitizePublicPartyFields(input)
    assert.equal(out.partido_sigla, "PT")
    assert.equal((out as Record<string, unknown>).partido_atual, undefined)
  })

  it("nao mutaciona o objeto original (shallow clone)", () => {
    const input = { partido_sigla: "incerto", partido_atual: "PT" }
    const out = sanitizePublicPartyFields(input)
    assert.notEqual(out, input, "deve retornar nova referencia")
    assert.equal(input.partido_sigla, "incerto", "input nao pode ter sido mutado")
    assert.equal(input.partido_atual, "PT")
    assert.equal(out.partido_sigla, "")
    assert.equal(out.partido_atual, "PT")
  })

  it("nao toca campos quando nenhum dos dois esta presente", () => {
    const input: { partido_sigla?: string | null } = {}
    const out = sanitizePublicPartyFields(input)
    assert.deepEqual(out, {})
  })
})

describe("sanitizePublicPartyFieldsList", () => {
  it("aplica sanitizacao em todos os rows", () => {
    const rows = [
      { slug: "a", partido_sigla: "incerto" },
      { slug: "b", partido_sigla: "PODEMOS" },
      { slug: "c", partido_sigla: "PT" },
    ]
    const out = sanitizePublicPartyFieldsList(rows)
    assert.equal(out[0].partido_sigla, "")
    assert.equal(out[1].partido_sigla, "PODE")
    assert.equal(out[2].partido_sigla, "PT")
  })

  it("retorna lista vazia para input vazio", () => {
    assert.deepEqual(sanitizePublicPartyFieldsList([]), [])
  })
})
