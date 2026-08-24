import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolverAliasExato, type AliasExato, type EscopoAlias } from "@/lib/pesquisas-eleitorais"

const scope: EscopoAlias = {
  year: 2026,
  office: "Presidente",
  geography: "Brasil",
  turn: 1,
  scenarioId: "cenario-a",
}

describe("identidade exata e escopada de pesquisas eleitorais", () => {
  it("resolve somente igualdade literal, preservando acento, caixa e sufixo", () => {
    const aliases: AliasExato[] = [{ rawLabel: "Flávio Bolsonaro (PL)", candidateSlug: "flavio-bolsonaro" }]
    assert.deepEqual(resolverAliasExato("Flávio Bolsonaro (PL)", scope, aliases), {
      status: "exact_alias",
      candidateSlug: "flavio-bolsonaro",
    })
    assert.deepEqual(resolverAliasExato("Flavio Bolsonaro", scope, aliases), {
      status: "indeterminado",
      candidateSlug: null,
    })
  })

  it("mantém alias ausente como indeterminado", () => {
    assert.deepEqual(resolverAliasExato("Cabo Daciolo (Mobiliza)", scope, []), {
      status: "indeterminado",
      candidateSlug: null,
    })
  })

  it("mantém colisão entre slugs como indeterminado", () => {
    const aliases: AliasExato[] = [
      { rawLabel: "Nome publicado", candidateSlug: "slug-a" },
      { rawLabel: "Nome publicado", candidateSlug: "slug-b" },
    ]
    assert.deepEqual(resolverAliasExato("Nome publicado", scope, aliases), {
      status: "indeterminado",
      candidateSlug: null,
    })
  })

  it("não promove alias de outro turno, cenário, cargo, eleição ou geografia", () => {
    const aliases: AliasExato[] = [{
      rawLabel: "Nome publicado",
      candidateSlug: "slug-a",
      year: 2026,
      office: "Presidente",
      geography: "Brasil",
      turn: 2,
      scenarioId: "cenario-b",
    }]
    assert.deepEqual(resolverAliasExato("Nome publicado", scope, aliases), {
      status: "indeterminado",
      candidateSlug: null,
    })
  })
})
