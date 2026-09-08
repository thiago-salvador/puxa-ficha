import { carregarPesquisasGovernadores, type CatalogoPesquisasEleitorais } from "@/lib/pesquisas-eleitorais"

export type StatePollScenario = Omit<CatalogoPesquisasEleitorais["pesquisas"][number], "cenarios"> & {
  scenario: CatalogoPesquisasEleitorais["pesquisas"][number]["cenarios"][number]
}

function selectStatePolls(catalog: CatalogoPesquisasEleitorais | undefined, uf: string): StatePollScenario[] {
  if (!catalog || catalog.electionScope.year !== 2026 || catalog.electionScope.office !== "Governador" || catalog.publicationScope.geographyCode !== uf.toUpperCase()) return []
  return catalog.pesquisas.flatMap(({ cenarios, ...poll }) => {
    if (poll.sourceStatus !== "aprovado" || !catalog.preferredSourceIds.includes(poll.sourceId) || poll.electionYear !== 2026 || poll.office !== "Governador" || poll.geography.code !== uf.toUpperCase()) return []
    return cenarios.filter(scenario => scenario.comparabilityKey.startsWith(`2026|Governador|${uf.toUpperCase()}|${scenario.turn}|`)).map(scenario => ({ ...poll, scenario }))
  }).sort((a, b) => (b.publicationDate.value ?? "").localeCompare(a.publicationDate.value ?? "") || a.id.localeCompare(b.id))
}

export function loadStatePolls(uf: string, catalog = carregarPesquisasGovernadores().get(uf.toUpperCase())): StatePollScenario[] {
  return selectStatePolls(catalog, uf)
}
