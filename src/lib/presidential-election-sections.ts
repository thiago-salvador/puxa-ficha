import { getProgramaGovernoManifesto } from "@/lib/programa-governo-server"
import { carregarPesquisasEleitorais, type CatalogoPesquisasEleitorais } from "@/lib/pesquisas-eleitorais"
import type { StateProgram, StateProgramCandidate } from "@/lib/state-programs"
import type { StatePollScenario } from "@/lib/state-polls"

export async function loadPresidentialPrograms(
  candidates: StateProgramCandidate[],
  loadManifesto: typeof getProgramaGovernoManifesto = getProgramaGovernoManifesto,
): Promise<StateProgram[]> {
  return Promise.all([...candidates].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR")).map(async candidate => {
    const manifesto = await loadManifesto(candidate.slug)
    const valid = manifesto?.estado === "aprovado" && manifesto.resumo &&
      manifesto.fonte.ano === 2026 && manifesto.fonte.cargo === "PRESIDENTE" &&
      manifesto.fonte.uf === "BR" && manifesto.fonte.slug === candidate.slug &&
      (!candidate.sqCandidato || manifesto.fonte.sqCandidato === candidate.sqCandidato)
    return { ...candidate, manifesto: valid ? manifesto : null }
  }))
}

export function loadPresidentialPolls(catalog: CatalogoPesquisasEleitorais = carregarPesquisasEleitorais()): StatePollScenario[] {
  const scope = catalog.publicationScope
  if (catalog.electionScope.year !== 2026 || catalog.electionScope.office !== "Presidente" ||
    scope.electionYear !== 2026 || scope.office !== "Presidente" || scope.geographyCode !== "BR" ||
    !scope.comparabilityKey.startsWith(`2026|Presidente|BR|${scope.turn}|`)) return []
  return catalog.pesquisas.flatMap(({ cenarios, ...poll }) => {
    if (poll.sourceStatus !== "aprovado" || !catalog.preferredSourceIds.includes(poll.sourceId) ||
      poll.electionYear !== 2026 || poll.office !== "Presidente" || poll.geography.code !== "BR") return []
    return cenarios.filter(scenario => (scenario.turn === 1 || scenario.turn === 2) &&
      scenario.geography === poll.geography.label &&
      scenario.comparabilityKey.startsWith(`2026|Presidente|BR|${scenario.turn}|`))
      .map(scenario => ({ ...poll, scenario }))
  }).sort((a, b) => (b.publicationDate.value ?? "").localeCompare(a.publicationDate.value ?? "") ||
    catalog.preferredSourceIds.indexOf(a.sourceId) - catalog.preferredSourceIds.indexOf(b.sourceId) ||
    a.id.localeCompare(b.id) || a.scenario.id.localeCompare(b.scenario.id))
}
