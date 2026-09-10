import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import type { carregarPesquisasGovernadores as CarregarPesquisasGovernadores } from "@/lib/pesquisas-eleitorais"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { carregarPesquisasGovernadores } = require(
  "../src/lib/pesquisas-eleitorais",
) as { carregarPesquisasGovernadores: typeof CarregarPesquisasGovernadores }

const BRAZIL_UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]
const STATUS_VALUES = new Set([
  "publicada",
  "condicional",
  "sem resultado público verificável",
  "sem fonte qualificada",
])

interface InventoryState {
  uf: string
  status: string
  reason: string
  evidence_urls: string[]
  registration_ids: string[]
  candidate_source_ids: string[]
}

interface Inventory {
  scope: { ufs: string[]; search_ufs: string[] }
  summary: {
    published_ufs_in_scope: number
    published_profiles_in_scope: number
    total_catalog_ufs: number
    total_catalog_profiles: number
    additional_published_ufs: number
    additional_published_profiles: number
  }
  states: InventoryState[]
}

function readInventory() {
  return JSON.parse(
    readFileSync("scripts/data/pesquisas-governadores-cobertura-21-ufs.json", "utf8"),
  ) as Inventory
}

type GovernorData = ReturnType<typeof carregarPesquisasGovernadores> extends Map<string, infer V>
  ? V
  : never

function slugsIn(data: GovernorData) {
  const slugs = new Set<string>()
  for (const poll of data.pesquisas) {
    for (const scenario of poll.cenarios) {
      for (const result of scenario.resultados) {
        if (result.matchStatus === "exact_alias" && result.candidateSlug) {
          slugs.add(result.candidateSlug)
        }
      }
    }
  }
  return slugs
}

describe("cobertura de pesquisas para governos estaduais nas 27 UFs", () => {
  it("mantém inventário completo, derivado e fail-closed", () => {
    const inventory = readInventory()
    const states = [...inventory.states].sort((a, b) => a.uf.localeCompare(b.uf))
    assert.deepEqual([...inventory.scope.ufs].sort(), BRAZIL_UFS)
    assert.deepEqual([...inventory.scope.search_ufs].sort(), BRAZIL_UFS)
    assert.deepEqual(states.map((entry) => entry.uf), BRAZIL_UFS)
    assert.ok(states.every((entry) => STATUS_VALUES.has(entry.status)))
    assert.ok(states.every((entry) => entry.reason.trim().length > 0))
    assert.ok(states.every((entry) => entry.evidence_urls.length > 0))
    assert.ok(states.every((entry) => entry.evidence_urls.every((url) => url.startsWith("https://"))))
    console.log("cobertura estadual verificada")
  })

  it("publica apenas as UFs que passaram todos os gates e mantém as demais vazias", () => {
    const inventory = readInventory()
    const catalogs = carregarPesquisasGovernadores()
    const published = inventory.states
      .filter((entry) => entry.status === "publicada")
      .map((entry) => entry.uf)
      .sort()
    assert.deepEqual(published, BRAZIL_UFS)
    for (const state of inventory.states) {
      if (state.status === "publicada") {
        assert.ok(catalogs.get(state.uf)?.pesquisas.length)
      } else {
        assert.equal(catalogs.has(state.uf), false, `${state.uf} não pode vazar para a UI`)
      }
    }
  })

  it("mantém fontes condicionais fora da preferência e da saída pública", () => {
    const inventory = readInventory()
    const scorecard = JSON.parse(
      readFileSync("scripts/data/pesquisas-governadores-fontes.json", "utf8"),
    ) as {
      preferred_source_ids: string[]
      sources: Array<{ id: string; status: string }>
    }
    const sources = new Map(scorecard.sources.map((source) => [source.id, source]))
    const nonApprovedIds = scorecard.sources
      .filter((source) => source.status !== "aprovado")
      .map((source) => source.id)
    assert.ok(nonApprovedIds.length > 0, "scorecard perdeu as fontes reprovadas ou condicionais")
    assert.ok(nonApprovedIds.every((sourceId) => !scorecard.preferred_source_ids.includes(sourceId)))

    for (const state of inventory.states.filter((entry) => entry.status === "condicional")) {
      assert.ok(state.candidate_source_ids.length > 0, `${state.uf} perdeu a fonte candidata`)
      const stateConditionalIds = state.candidate_source_ids.filter(
        (sourceId) => sources.get(sourceId)?.status === "condicional",
      )
      assert.ok(stateConditionalIds.length > 0, `${state.uf} não preservou a condição concreta`)
      assert.ok(stateConditionalIds.every((sourceId) => !scorecard.preferred_source_ids.includes(sourceId)))
    }
  })

  it("preserva zero real e mantém cargo, UF e comparabilidade isolados", () => {
    const catalogs = carregarPesquisasGovernadores()
    const mt = catalogs.get("MT")
    const zero = mt?.pesquisas
      .flatMap((poll) => poll.cenarios)
      .flatMap((scenario) => scenario.resultados)
      .find((result) => result.candidateSlug === "mauricio-coelho")
    assert.equal(zero?.valuePercent, 0)
    assert.equal(zero?.matchStatus, "exact_alias")

    for (const [uf, catalog] of catalogs) {
      for (const poll of catalog.pesquisas) {
        assert.equal(poll.geography.code, uf)
        const scenarioIds = new Set<string>()
        const comparabilityKeys = new Set<string>()
        for (const scenario of poll.cenarios) {
          assert.ok(scenario.turn === 1 || scenario.turn === 2)
          assert.equal(scenario.geography, poll.geography.label)
          assert.match(scenario.comparabilityKey, new RegExp(`^2026\\|Governador\\|${uf}\\|${scenario.turn}\\|`))
          assert.equal(scenarioIds.has(scenario.id), false, `${poll.id}: cenário duplicado`)
          assert.equal(comparabilityKeys.has(scenario.comparabilityKey), false, `${poll.id}: escopo duplicado`)
          scenarioIds.add(scenario.id)
          comparabilityKeys.add(scenario.comparabilityKey)
        }
      }
    }

    assert.deepEqual([...catalogs.keys()].sort(), BRAZIL_UFS)
  })

  it("calcula as contagens finais a partir dos catálogos publicados", () => {
    const inventory = readInventory()
    const catalogs = carregarPesquisasGovernadores()
    const inScope = [...catalogs].filter(([uf]) => BRAZIL_UFS.includes(uf))
    const publishedProfilesInScope = inScope.reduce(
      (sum, [, data]) => sum + slugsIn(data).size,
      0,
    )
    const totalProfiles = [...catalogs.values()].reduce(
      (sum, data) => sum + slugsIn(data).size,
      0,
    )
    const additional = [...catalogs].filter(([uf]) => BRAZIL_UFS.includes(uf))
    const additionalProfiles = additional.reduce((sum, [, data]) => sum + slugsIn(data).size, 0)
    assert.deepEqual(inventory.summary, {
      published_ufs_in_scope: inScope.length,
      published_profiles_in_scope: publishedProfilesInScope,
      total_catalog_ufs: catalogs.size,
      total_catalog_profiles: totalProfiles,
      additional_published_ufs: additional.length,
      additional_published_profiles: additionalProfiles,
    })
    console.log("contagens finais verificadas")
  })
})
