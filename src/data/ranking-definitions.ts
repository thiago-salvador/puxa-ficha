import type { RankingDefinition } from "@/lib/rankings"

export const rankingDefinitions: RankingDefinition[] = [
  {
    slug: "gastos-parlamentares",
    title: "Lista por gasto parlamentar",
    eyebrow: "Gastos",
    description:
      "Recorte público por gasto parlamentar somado a partir dos registros disponíveis no banco do Puxa Ficha.",
    metricLabel: "Total gasto",
    metricUnit: "currency",
    contextExplanation:
      "A métrica soma os registros disponíveis de gasto parlamentar por candidato e serve como porta de entrada para consulta factual.",
    sortDirection: "desc",
    queryType: "aggregate-table",
    tableName: "gastos_parlamentares",
    aggregateField: "total_gasto",
    supportsUf: true,
  },
  {
    slug: "mudancas-partido",
    title: "Lista por mudanças de partido",
    eyebrow: "Trajetória partidária",
    description:
      "Recorte público por quantidade de mudanças de partido a partir da view de comparação do Puxa Ficha.",
    metricLabel: "Mudanças de partido",
    metricUnit: "count",
    contextExplanation:
      "A métrica contabiliza trocas partidárias estruturadas para facilitar leitura comparativa da trajetória política.",
    sortDirection: "desc",
    queryType: "comparador-field",
    sourceField: "mudancas_partido",
    supportsUf: true,
  },
  {
    slug: "patrimonio-declarado",
    title: "Lista por patrimônio declarado",
    eyebrow: "Patrimônio",
    description:
      "Recorte público pelo último patrimônio declarado disponível na view de comparação do Puxa Ficha.",
    metricLabel: "Patrimônio declarado",
    metricUnit: "currency",
    contextExplanation:
      "A métrica usa o último valor patrimonial estruturado disponível para cada candidatura publicada.",
    sortDirection: "desc",
    queryType: "comparador-field",
    sourceField: "patrimonio_declarado",
    supportsUf: true,
  },
]

export function getRankingDefinitionBySlug(slug: string): RankingDefinition | null {
  return rankingDefinitions.find((definition) => definition.slug === slug) ?? null
}
