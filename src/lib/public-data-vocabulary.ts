import type { EstadoDaFonte } from "@/lib/destaques-ficha"
import type { PatrimonioEleicaoPublico } from "@/lib/types"

/** Public labels describe the evidence, never the candidate. */
export const PUBLIC_DATA_VOCABULARY = {
  published: { label: "Dado publicado", description: "Há conteúdo disponível. Consulte o período e as fontes de cada registro." },
  confirmedEmpty: { label: "Ausência confirmada no escopo", description: "A consulta foi concluída sem registros no recorte informado. Isso não afirma ausência fora desse recorte." },
  notApplicable: { label: "Não se aplica", description: "Esta fonte não se aplica ao recorte informado; consulte o motivo." },
  notLocated: { label: "Não localizado no escopo", description: "A busca limitada não localizou o dado; isso não confirma que ele não exista." },
  underReview: { label: "Em revisão", description: "A consulta não permitiu uma conclusão segura." },
  unavailable: { label: "Fonte indisponível", description: "Não foi possível concluir a consulta à fonte. Isso não significa resultado zero." },
  unverified: { label: "Ainda não verificado", description: "Não há verificação disponível que permita concluir sobre este dado." },
  noEditorialReview: { label: "Sem curadoria publicada", description: "Não há destaque editorial publicado. Isso não mede a cobertura das fontes." },
} as const

/** Sem valor numérico, preserve o estado do pleito mais recente conhecido. */
export function patrimonioWithoutValueLabel(eleicoes: readonly PatrimonioEleicaoPublico[]): string {
  const latest = [...eleicoes].sort((a, b) => b.ano - a.ano)[0]
  return latest?.estado === "vazio_confirmado"
    ? `Sem bens declarados ao TSE em ${latest.ano}`
    : PUBLIC_DATA_VOCABULARY.unverified.label
}

export function publicDataState(estado: EstadoDaFonte): keyof typeof PUBLIC_DATA_VOCABULARY {
  switch (estado.tipo) {
    case "tem_conteudo": return "published"
    case "vazio_confirmado": return "confirmedEmpty"
    case "nao_aplicavel": return "notApplicable"
    case "curadoria_limitada": return "notLocated"
    case "nao_foi_possivel_verificar": return estado.motivo === "erro" ? "unavailable" : "underReview"
    case "nunca_verificado": return "unverified"
    case "sem_curadoria_editorial": return "noEditorialReview"
  }
}
