/**
 * Contrato único de ordenação e contagens públicas da trajetória na ficha
 * (overview + aba Trajetória + timeline), após `normalizeHistoricoPoliticoForDisplay`
 * em `src/lib/api.ts`.
 *
 * Ver `curadoria interna` (Fluxo 2; linhas vs trocas efetivas).
 */

import { normalizeHistoricoPoliticoForDisplay } from "@/lib/historico-dedupe"
import { removerDuplicatasComprovadas } from "@/lib/mandato-precedencia"
import { getCurrentPublicYear } from "@/lib/public-date"
import type { HistoricoPolitico, MudancaPartido } from "@/lib/types"

/** Ordenação-base decrescente por `periodo_inicio` (overview e lista completa na aba). */
function compareHistoricoPoliticoPublicDisplay(
  a: Pick<HistoricoPolitico, "periodo_inicio">,
  b: Pick<HistoricoPolitico, "periodo_inicio">,
): number {
  return (b.periodo_inicio ?? 0) - (a.periodo_inicio ?? 0)
}

/**
 * Lista já normalizada (`FichaCandidato.historico`) na ordem pública canónica:
 * candidaturas do pleito corrente primeiro e ordem-base intacta no restante,
 * sem o lado descartado das duplicatas comprovadas (C1 de
 * `mandato-precedencia.ts`).
 *
 * A eliminação mora AQUI, e não em `normalizeHistoricoPoliticoForDisplay`,
 * porque este é o ponto único por onde as três superfícies passam (overview,
 * aba Trajetória e timeline agregada): classificar a duplicata sem removê-la
 * deixava "Ministro" e "Ministro da Fazenda" lado a lado, com o mesmo período,
 * na ficha do Ciro Gomes.
 */
export function prepareHistoricoPoliticoPublicDisplayList(
  historicoNormalizado: HistoricoPolitico[],
): HistoricoPolitico[] {
  // CONTRATO ÚNICO. Qualquer lista normalizada entra aqui e sai pública: sem a
  // duplicata comprovada (C1) e na ordem canónica. Ter a remoção em outro lugar
  // criava dedupe paralelo, e foi assim que a API serviu 11 linhas do Ciro
  // Gomes enquanto a tela mostrava 10.
  const ordenado = removerDuplicatasComprovadas(historicoNormalizado).sort(
    compareHistoricoPoliticoPublicDisplay,
  )
  const currentYear = getCurrentPublicYear()
  const candidaturasCorrentes: HistoricoPolitico[] = []
  const restante: HistoricoPolitico[] = []

  for (const item of ordenado) {
    if (item.tipo_evento === "candidatura" && item.periodo_inicio === currentYear) {
      candidaturasCorrentes.push(item)
    } else {
      restante.push(item)
    }
  }

  return [...candidaturasCorrentes, ...restante]
}

/**
 * Pipeline completo para superfícies que podem receber dados crus (ex.: timeline agregada).
 */
export function buildPublicHistoricoPoliticoDisplayListFromRaw(
  historico: HistoricoPolitico[],
): HistoricoPolitico[] {
  // Só isto: normaliza e entrega ao contrato único. A remoção de C1 mora lá
  // dentro, e não aqui, para não existirem dois caminhos de dedupe.
  return prepareHistoricoPoliticoPublicDisplayList(normalizeHistoricoPoliticoForDisplay(historico))
}

/**
 * Contagem bruta de linhas na timeline partidária **após** normalização da API
 * (`normalizePartyTimelineForDisplay` + ordenação em `api.ts`), alinhada a
 * `mudancas_partido_linhas` nos snapshots factuais — **não** é `countPartySwitches`.
 */
export function mudancasPartidoLinhasPublicas(mudancasNormalizadas: readonly MudancaPartido[]): number {
  return mudancasNormalizadas.length
}

/**
 * Badge numérico do separador "Trajetória" no `ProfileTabs`: soma de registos de
 * cargos/mandatos (`historico`) e de linhas da timeline partidária (`mudancas`),
 * ambos já normalizados na `FichaCandidato`. Indica volume de conteúdo da aba;
 * é distinto de `mudancasPartidoLinhasPublicas` (só partidos) e de trocas efetivas.
 */
export function profileTrajetoriaTabBadgeCount(
  historicoNormalizado: readonly HistoricoPolitico[],
  mudancasNormalizadas: readonly MudancaPartido[],
): number {
  // Conta a lista PÚBLICA, a mesma que a aba mostra. Contar a normalizada crua
  // fazia o badge prometer uma linha a mais do que existe na tela.
  return (
    prepareHistoricoPoliticoPublicDisplayList([...historicoNormalizado]).length +
    mudancasNormalizadas.length
  )
}
