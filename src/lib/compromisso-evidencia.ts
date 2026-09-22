/**
 * Vínculo público compromisso do programa x evidência. Só chega aqui o que a
 * view `compromisso_evidencia_publica` devolve (verificado, candidato público,
 * relação `relacionada` ou `sustenta`). Todo texto exibido vem da fonte.
 */
export const TIPOS_EVIDENCIA_PUBLICA = ["votacao_chave", "projeto_lei", "posicao_declarada", "fala", "contradicao"] as const
export type TipoEvidenciaPublica = (typeof TIPOS_EVIDENCIA_PUBLICA)[number]
export type RelacaoPublica = "relacionada" | "sustenta"

export type CompromissoEvidenciaPublica = {
  id: string
  temaId: string
  tipo: TipoEvidenciaPublica
  relacao: RelacaoPublica
  /** Identificação curta da fonte, montada de campos da fonte (ex.: "PL 1234/2020", "Voto: Sim"). */
  referencia: string
  /** Texto da fonte, sem edição: ementa, citação, título da votação ou do ponto. */
  texto: string
  data: string | null
  url: string | null
}

export type EvidenciasPorTema = Map<string, CompromissoEvidenciaPublica[]>

export function agruparEvidenciasPorTema(itens: ReadonlyArray<CompromissoEvidenciaPublica>): EvidenciasPorTema {
  const grupos: EvidenciasPorTema = new Map()
  const ordenados = [...itens].sort((a, b) =>
    (b.data ?? "").localeCompare(a.data ?? "") || a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id))
  for (const item of ordenados) grupos.set(item.temaId, [...(grupos.get(item.temaId) ?? []), item])
  return grupos
}

const CARGOS_CONGRESSO = new Set(["Deputado Federal", "Senador"])

export function teveMandatoNoCongresso(historico: ReadonlyArray<{ cargo_canonico?: string | null; tipo_evento?: string | null }>): boolean {
  return historico.some((h) => h.tipo_evento === "mandato" && CARGOS_CONGRESSO.has(h.cargo_canonico ?? ""))
}

/** Só URL http(s) vira link; qualquer outra coisa some. */
export function urlSeguraDeFonte(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  try {
    const url = new URL(valor.trim())
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}
