import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatPartyDisplayLabel,
  formatPartyPublicLabel,
  isUncertainParty,
  matchesPartySiglaFilter,
  resolveCanonicalPartySigla,
} from "@/lib/party-utils"
import {
  buildCandidateMetadataDescription,
  buildCandidateShareTitle,
} from "@/lib/ui-labels"

describe("isUncertainParty", () => {
  it("returns true for null/undefined/empty/whitespace", () => {
    assert.equal(isUncertainParty(null), true)
    assert.equal(isUncertainParty(undefined), true)
    assert.equal(isUncertainParty(""), true)
    assert.equal(isUncertainParty("   "), true)
  })

  it("returns true for incerto regardless of casing/punctuation", () => {
    assert.equal(isUncertainParty("incerto"), true)
    assert.equal(isUncertainParty("INCERTO"), true)
    assert.equal(isUncertainParty(" Incerto "), true)
  })

  it("returns true for sem-partido aliases", () => {
    assert.equal(isUncertainParty("SEMPARTIDO"), true)
    assert.equal(isUncertainParty("Sem partido"), true)
    assert.equal(isUncertainParty("Sem Partido"), true)
  })

  it("returns false for real party siglas", () => {
    assert.equal(isUncertainParty("PT"), false)
    assert.equal(isUncertainParty("PCdoB"), false)
    assert.equal(isUncertainParty("NOVO"), false)
    assert.equal(isUncertainParty("PL"), false)
    assert.equal(isUncertainParty("PSDB"), false)
    assert.equal(isUncertainParty("UNIAO"), false)
  })

  it("does not flip for unknown sigla that is not incerto", () => {
    assert.equal(isUncertainParty("XYZ"), false)
  })
})

describe("formatPartyPublicLabel", () => {
  it("returns empty string for uncertain values", () => {
    assert.equal(formatPartyPublicLabel("incerto"), "")
    assert.equal(formatPartyPublicLabel("INCERTO"), "")
    assert.equal(formatPartyPublicLabel("SEMPARTIDO"), "")
    assert.equal(formatPartyPublicLabel("Sem partido"), "")
    assert.equal(formatPartyPublicLabel(null), "")
    assert.equal(formatPartyPublicLabel(undefined), "")
    assert.equal(formatPartyPublicLabel(""), "")
  })

  it("preserves canonical casing for real parties", () => {
    assert.equal(formatPartyPublicLabel("PCdoB"), "PCdoB")
    assert.equal(formatPartyPublicLabel("PT"), "PT")
    assert.equal(formatPartyPublicLabel("NOVO"), "NOVO")
  })

  it("does not turn unknown sigla into 'incerto'", () => {
    assert.equal(formatPartyPublicLabel("XYZ"), "XYZ")
  })

  it("matches formatPartyDisplayLabel for non-uncertain values", () => {
    for (const sample of ["PT", "PCdoB", "NOVO", "PL", "PSDB"]) {
      assert.equal(formatPartyPublicLabel(sample), formatPartyDisplayLabel(sample))
    }
  })

  it("resolve e filtra pelas grafias oficiais e legadas", () => {
    const pairs = [
      ["UNIAO", "UNIÃO"],
      ["MISSAO", "MISSÃO"],
      ["PODEMOS", "PODE"],
    ] as const

    for (const [legacy, official] of pairs) {
      assert.equal(resolveCanonicalPartySigla(legacy), official)
      assert.equal(resolveCanonicalPartySigla(official), official)
      assert.equal(matchesPartySiglaFilter(legacy, official), true)
      assert.equal(matchesPartySiglaFilter(official, legacy), true)
    }
    assert.equal(matchesPartySiglaFilter("PARTIDO LOCAL", "partido-local"), true)
    assert.equal(matchesPartySiglaFilter("PARTIDO LOCAL", "PT"), false)
  })
})

describe("buildCandidateShareTitle / buildCandidateMetadataDescription", () => {
  it("includes party label when party is real", () => {
    assert.equal(
      buildCandidateShareTitle("Lula", "PT"),
      "Lula (PT) · Ficha pública no Puxa Ficha",
    )
    assert.match(
      buildCandidateMetadataDescription("Lula", "PT"),
      /Ficha pública de Lula \(PT\) com dados disponíveis/,
    )
  })

  it("drops parens entirely when party is incerto", () => {
    assert.equal(
      buildCandidateShareTitle("Marcelo Maranata", "incerto"),
      "Marcelo Maranata · Ficha pública no Puxa Ficha",
    )
    assert.doesNotMatch(
      buildCandidateShareTitle("Marcelo Maranata", "incerto"),
      /\(incerto\)/,
    )
  })

  it("drops parens when party is null/undefined/empty/SEMPARTIDO", () => {
    for (const value of ["", "  ", "SEMPARTIDO", "Sem partido"]) {
      assert.equal(
        buildCandidateShareTitle("Marcelo Maranata", value),
        "Marcelo Maranata · Ficha pública no Puxa Ficha",
      )
    }
    assert.equal(
      buildCandidateShareTitle("Marcelo Maranata", null),
      "Marcelo Maranata · Ficha pública no Puxa Ficha",
    )
    assert.equal(
      buildCandidateShareTitle("Marcelo Maranata", undefined),
      "Marcelo Maranata · Ficha pública no Puxa Ficha",
    )
  })

  it("metadata description omits parens when party is uncertain", () => {
    assert.equal(
      buildCandidateMetadataDescription("Marcelo Maranata", "incerto"),
      "Ficha pública de Marcelo Maranata com dados disponíveis sobre patrimônio, processos, votações e financiamento quando houver fonte estruturada.",
    )
    assert.doesNotMatch(
      buildCandidateMetadataDescription("Marcelo Maranata", "incerto"),
      /\(incerto\)/,
    )
  })
})
