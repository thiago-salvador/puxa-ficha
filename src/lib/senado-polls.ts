import "server-only"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  ErroValidacaoPesquisasEleitorais,
  parsePesquisasEleitoraisJson,
  type CatalogoPesquisasEleitorais,
} from "@/lib/pesquisas-eleitorais"
import type { StatePollScenario } from "@/lib/state-polls"
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"

/** The 2026 Senate election has one round and two votes per state. */
const SENADO_UFS = getEstadoUFs().map((uf) => uf.toUpperCase())
const SENADO_POLL_MEASURES = ["primeiro-voto", "segundo-voto", "agregado"] as const
export type SenadoPollMeasure = (typeof SENADO_POLL_MEASURES)[number]

const SENADO_DATA_PATH = resolve(process.cwd(), "scripts/data/pesquisas-senado-2026.json")
const EMPTY_SOURCE_CATALOG = {
  schema_version: "1.0.0",
  scope: { election_year: 2026, office: "senador", purpose: "fontes aprovadas para pesquisas do Senado" },
  preferred_source_ids: [],
  sources: [],
}

type SenadoDatasetEntry = {
  uf: string
  state: string
  reason: string
  dataset: unknown
}

type SenadoRoot = {
  schema_version: string
  election: string
  scope: { year: number; office: string; geographies: string[] }
  source_catalog?: unknown
  datasets: SenadoDatasetEntry[]
}

let catalogCache: Map<string, CatalogoPesquisasEleitorais> | null = null

function invalid(issues: string[]): never {
  throw new ErroValidacaoPesquisasEleitorais(issues)
}

function parseRoot(raw: string): SenadoRoot {
  let root: unknown
  try {
    root = JSON.parse(raw) as unknown
  } catch (error) {
    invalid([`catálogo Senado não é JSON válido: ${error instanceof Error ? error.message : "erro desconhecido"}`])
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) invalid(["catálogo Senado deve ser objeto"])
  const parsed = root as SenadoRoot
  if (parsed.schema_version !== "1.0.0" || parsed.election !== "Eleições Gerais 2026") {
    invalid(["catálogo Senado possui versão ou eleição incompatível"])
  }
  if (!parsed.scope || parsed.scope.year !== 2026 || parsed.scope.office !== "Senador") {
    invalid(["catálogo Senado possui escopo incompatível"])
  }
  if (!Array.isArray(parsed.scope.geographies)) invalid(["catálogo Senado não possui lista de UFs"])
  if (!Array.isArray(parsed.datasets)) invalid(["catálogo Senado.datasets deve ser array"])
  const listed = parsed.scope.geographies.map((uf) => uf.toUpperCase())
  if (JSON.stringify([...new Set(listed)].sort()) !== JSON.stringify([...SENADO_UFS].sort())) {
    invalid(["catálogo Senado deve declarar exatamente as 27 UFs"])
  }
  const entries = parsed.datasets
  if (entries.length !== SENADO_UFS.length) invalid(["catálogo Senado deve possuir um dataset por UF"])
  const seen = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || !SENADO_UFS.includes(entry.uf?.toUpperCase())) {
      invalid([`catálogo Senado.datasets[${index}].uf inválida`])
    }
    const uf = entry.uf.toUpperCase()
    if (seen.has(uf)) invalid([`catálogo Senado possui UF duplicada: ${uf}`])
    seen.add(uf)
    if (!entry.state || !entry.reason || entry.dataset === undefined) invalid([`catálogo Senado.datasets[${index}] sem estado, razão ou dataset`])
  }
  return parsed
}

function validateSenadoCatalog(catalog: CatalogoPesquisasEleitorais, expectedUf?: string): void {
  const uf = expectedUf?.toUpperCase() ?? catalog.publicationScope.geographyCode
  const issues: string[] = []
  if (catalog.electionScope.year !== 2026 || catalog.electionScope.office !== "Senador") issues.push("Senado exige eleição 2026 e cargo Senador")
  if (!SENADO_UFS.includes(catalog.publicationScope.geographyCode)) issues.push("Senado exige UF brasileira válida")
  if (catalog.publicationScope.geographyCode !== uf) issues.push("catálogo Senado possui UF incompatível")
  if (getEstadoNome(uf) !== catalog.electionScope.geography) issues.push("catálogo Senado possui estado incompatível com a UF")
  if (catalog.publicationScope.turn !== 1) issues.push("Senado não possui segundo turno")
  const expectedPrefix = `2026|Senador|${catalog.publicationScope.geographyCode}|1|`
  if (!catalog.publicationScope.comparabilityKey.startsWith(expectedPrefix)) issues.push("comparabilityKey do Senado possui escopo incompatível")
  for (const poll of catalog.pesquisas) {
    if (poll.electionYear !== 2026 || poll.office !== "Senador" || poll.geography.code !== uf) {
      issues.push(`${poll.id} possui eleição, cargo ou UF incompatível`)
      continue
    }
    for (const scenario of poll.cenarios) {
      if (scenario.turn !== 1) issues.push(`${scenario.id}: Senado rejeita segundo turno`)
      if (!scenario.comparabilityKey.startsWith(expectedPrefix)) issues.push(`${scenario.id}: comparabilityKey incompatível com UF/cargo/ano`)
      const measure = scenario.comparabilityKey.split("|")[4]
      if (!SENADO_POLL_MEASURES.includes(measure as SenadoPollMeasure)) issues.push(`${scenario.id}: medida Senado inválida`)
    }
  }
  if (issues.length) invalid(issues)
}

/** Parse and validate one Senate UF dataset using the shared electoral-polls contract. */
export function parseSenadoPesquisasJson(
  pesquisasJson: string,
  fontesJson = JSON.stringify(EMPTY_SOURCE_CATALOG),
  expectedUf?: string,
): CatalogoPesquisasEleitorais {
  const catalog = parsePesquisasEleitoraisJson(pesquisasJson, fontesJson)
  validateSenadoCatalog(catalog, expectedUf)
  return catalog
}

function loadCatalogs(): Map<string, CatalogoPesquisasEleitorais> {
  if (catalogCache) return catalogCache
  const root = parseRoot(readFileSync(SENADO_DATA_PATH, "utf8"))
  const fontes = JSON.stringify(root.source_catalog ?? EMPTY_SOURCE_CATALOG)
  const catalogs = new Map<string, CatalogoPesquisasEleitorais>()
  for (const entry of root.datasets) {
    const uf = entry.uf.toUpperCase()
    const catalog = parseSenadoPesquisasJson(JSON.stringify(entry.dataset), fontes, uf)
    catalogs.set(uf, catalog)
  }
  catalogCache = catalogs
  return catalogs
}

/** Returns only source-approved, provenance-complete, comparable Senate scenarios. */
export function selecionarSenadoPolls(
  catalog: CatalogoPesquisasEleitorais | undefined,
  uf: string,
): StatePollScenario[] {
  const normalizedUf = uf.toUpperCase()
  if (!catalog || !SENADO_UFS.includes(normalizedUf)) return []
  validateSenadoCatalog(catalog, normalizedUf)
  return catalog.pesquisas.flatMap(({ cenarios, ...poll }) => {
    if (
      poll.sourceStatus !== "aprovado" ||
      !catalog.preferredSourceIds.includes(poll.sourceId) ||
      poll.electionYear !== 2026 ||
      poll.office !== "Senador" ||
      poll.geography.code !== normalizedUf ||
      poll.provenance.resultUrl.length === 0 ||
      poll.registration.code.status !== "publicado" ||
      !poll.registration.code.value ||
      poll.registration.url.status !== "publicado" ||
      !poll.registration.url.value ||
      poll.method.status !== "publicado" ||
      !poll.method.value?.trim() ||
      poll.sample.population.status !== "publicado" ||
      !poll.sample.population.value?.trim()
    ) return []
    return cenarios
      .filter((scenario) => {
        const measure = scenario.comparabilityKey.split("|")[4]
        return scenario.turn === 1 && scenario.question.status === "publicado" && !!scenario.question.value?.trim() && SENADO_POLL_MEASURES.includes(measure as SenadoPollMeasure)
      })
      .map((scenario) => ({ ...poll, scenario }))
  }).sort((a, b) => (b.publicationDate.value ?? "").localeCompare(a.publicationDate.value ?? "") || a.id.localeCompare(b.id))
}

export function carregarPesquisasSenado(): Map<string, CatalogoPesquisasEleitorais> {
  return loadCatalogs()
}

export function loadSenadoPolls(uf: string): StatePollScenario[] {
  return selecionarSenadoPolls(loadCatalogs().get(uf.toUpperCase()), uf)
}
