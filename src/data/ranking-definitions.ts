import type { RankingDefinition } from "@/lib/rankings"

export const rankingDefinitions: RankingDefinition[] = [
  {
    slug: "gastos-parlamentares",
    title: "Quem mais gastou verba parlamentar",
    eyebrow: "Gastos",
    description:
      "Lista publica por gasto parlamentar somado a partir dos registros disponiveis no banco do Puxa Ficha.",
    metricLabel: "Total gasto",
    metricUnit: "currency",
    contextExplanation:
      "A metrica soma os registros disponiveis de gasto parlamentar por candidato e serve como porta de entrada para consulta factual.",
    sortDirection: "desc",
    queryType: "aggregate-table",
    tableName: "gastos_parlamentares",
    aggregateField: "total_gasto",
    supportsUf: true,
  },
  {
    slug: "mudancas-partido",
    title: "Quem mais mudou de partido",
    eyebrow: "Trajetoria partidaria",
    description:
      "Lista publica por quantidade de mudancas de partido a partir da view de comparacao do Puxa Ficha.",
    metricLabel: "Mudancas de partido",
    metricUnit: "count",
    contextExplanation:
      "A metrica contabiliza trocas partidarias estruturadas para facilitar leitura comparativa da trajetoria politica.",
    sortDirection: "desc",
    queryType: "comparador-field",
    sourceField: "mudancas_partido",
    supportsUf: true,
  },
  {
    slug: "patrimonio-declarado",
    title: "Quem declarou mais patrimonio",
    eyebrow: "Patrimonio",
    description:
      "Lista publica pelo ultimo patrimonio declarado disponivel na view de comparacao do Puxa Ficha.",
    metricLabel: "Patrimonio declarado",
    metricUnit: "currency",
    contextExplanation:
      "A metrica usa o ultimo valor patrimonial estruturado disponivel para cada candidatura publicada.",
    sortDirection: "desc",
    queryType: "comparador-field",
    sourceField: "patrimonio_declarado",
    supportsUf: true,
  },
]

export function getRankingDefinitionBySlug(slug: string): RankingDefinition | null {
  return rankingDefinitions.find((definition) => definition.slug === slug) ?? null
}
