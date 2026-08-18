import { formatStateIndicatorFonteLabel } from "@/lib/ui-labels"

/**
 * Fontes dos indicadores estaduais (hub por UF, mapa de governadores, bloco “O estado” na ficha de governador).
 * Mantém Sobre, rodapé e copy institucional alinhados ao ingest em `scripts/lib/ingest-*.ts`.
 */
export const STATE_INDICATOR_FONTES_DOC: readonly {
  sourceKey: string
  href: string
  description: string
  footerLabel: string
}[] = [
  {
    sourceKey: "ibge_sidra",
    href: "https://servicodados.ibge.gov.br",
    description:
      "População estimada e PIB total por UF (séries dos agregados SIDRA usados no Puxa Ficha).",
    footerLabel: "IBGE SIDRA",
  },
  {
    sourceKey: "ipeadata",
    href: "https://www.ipeadata.gov.br",
    description: "Taxa de desemprego, taxa de pobreza e índice de Gini por UF (PNAD Contínua, séries estaduais).",
    footerLabel: "Ipeadata",
  },
  {
    sourceKey: "atlas_violencia",
    href: "https://www.ipea.gov.br/atlasviolencia/",
    description: "Homicídios e indicadores de violência letal por 100 mil habitantes (API do Atlas).",
    footerLabel: "Atlas Violência",
  },
  {
    sourceKey: "inep_ideb",
    href: "https://www.gov.br/inep/pt-br",
    description: "IDEB do ensino médio por UF, quando disponível na base.",
    footerLabel: "INEP",
  },
  {
    sourceKey: "capag",
    href: "https://www.tesourotransparente.gov.br",
    description: "Notas e indicadores da CAPAG (capacidade de pagamento), quando publicados no acervo aberto.",
    footerLabel: "CAPAG",
  },
  {
    sourceKey: "siconfi",
    href: "https://apidatalake.tesouro.gov.br/docs/siconfi/",
    description: "Receita, despesa, resultado primário e relação pessoal/RCL (RREO/RGF via Data Lake do Tesouro).",
    footerLabel: "Siconfi",
  },
] as const

export function formatStateIndicatorFonte(fonte: string): string {
  return formatStateIndicatorFonteLabel(fonte)
}
