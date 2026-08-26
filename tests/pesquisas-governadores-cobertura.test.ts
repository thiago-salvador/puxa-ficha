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

const TARGET_UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "ES", "GO", "MA", "MS", "MT",
  "PA", "PB", "PR", "RN", "RO", "RR", "RS", "SC", "SE", "TO",
]
const SEARCH_UFS = [
  "AC", "AL", "AM", "AP", "BA", "ES", "GO", "MA", "MS", "MT",
  "PA", "PB", "PR", "RN", "RO", "RR", "SC", "SE", "TO",
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

describe("cobertura de pesquisas para governos estaduais em 21 UFs", () => {
  it("mantém inventário completo, derivado e fail-closed", () => {
    const inventory = readInventory()
    const states = [...inventory.states].sort((a, b) => a.uf.localeCompare(b.uf))
    assert.deepEqual(inventory.scope.ufs, TARGET_UFS)
    assert.deepEqual(inventory.scope.search_ufs, SEARCH_UFS)
    assert.deepEqual(states.map((entry) => entry.uf), TARGET_UFS)
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
    assert.deepEqual(published, ["AM", "BA", "CE", "MS", "MT", "PB", "PR", "RO", "RS", "SE"])
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

    for (const state of inventory.states.filter((entry) => entry.status === "condicional")) {
      assert.ok(state.candidate_source_ids.length > 0, `${state.uf} perdeu a fonte candidata`)
      const conditionalIds = state.candidate_source_ids.filter(
        (sourceId) => sources.get(sourceId)?.status === "condicional",
      )
      assert.ok(conditionalIds.length > 0, `${state.uf} não preservou a condição concreta`)
      assert.ok(conditionalIds.every((sourceId) => !scorecard.preferred_source_ids.includes(sourceId)))
    }
  })

  it("preserva zero real, aliases da mesma UF e ausência explícita", () => {
    const inventory = readInventory()
    const catalogs = carregarPesquisasGovernadores()
    const mt = catalogs.get("MT")
    const zero = mt?.pesquisas[0]?.cenarios[0]?.resultados.find(
      (result) => result.candidateSlug === "mauricio-coelho",
    )
    assert.equal(zero?.valuePercent, 0)
    assert.equal(zero?.matchStatus, "exact_alias")

    for (const [uf, catalog] of catalogs) {
      for (const poll of catalog.pesquisas) {
        assert.equal(poll.geography.code, uf)
        for (const scenario of poll.cenarios) {
          assert.equal(scenario.comparabilityKey, catalog.publicationScope.comparabilityKey)
        }
      }
    }

    for (const uf of ["AP", "TO"]) {
      const state = inventory.states.find((entry) => entry.uf === uf)
      assert.equal(state?.status, "sem resultado público verificável")
      assert.ok(state?.reason.length)
      assert.equal(catalogs.has(uf), false)
    }
    assert.match(inventory.states.find((entry) => entry.uf === "MA")?.reason ?? "", /omite Saulo Arcangeli/)
    assert.equal(catalogs.has("MA"), false)
  })

  it("calcula as contagens finais a partir dos catálogos publicados", () => {
    const inventory = readInventory()
    const catalogs = carregarPesquisasGovernadores()
    const inScope = [...catalogs].filter(([uf]) => TARGET_UFS.includes(uf))
    const publishedProfilesInScope = inScope.reduce(
      (sum, [, data]) => sum + slugsIn(data).size,
      0,
    )
    const totalProfiles = [...catalogs.values()].reduce(
      (sum, data) => sum + slugsIn(data).size,
      0,
    )
    const additional = [...catalogs].filter(([uf]) => SEARCH_UFS.includes(uf))
    const additionalProfiles = additional.reduce((sum, [, data]) => sum + slugsIn(data).size, 0)
    assert.deepEqual(inventory.summary, {
      published_ufs_in_scope: inScope.length,
      published_profiles_in_scope: publishedProfilesInScope,
      total_catalog_ufs: catalogs.size,
      total_catalog_profiles: totalProfiles,
      additional_published_ufs: additional.length,
      additional_published_profiles: additionalProfiles,
    })
    assert.deepEqual(inventory.summary, {
      published_ufs_in_scope: 10,
      published_profiles_in_scope: 46,
      total_catalog_ufs: 16,
      total_catalog_profiles: 97,
      additional_published_ufs: 8,
      additional_published_profiles: 37,
    })
    console.log("contagens finais verificadas")
  })
})
