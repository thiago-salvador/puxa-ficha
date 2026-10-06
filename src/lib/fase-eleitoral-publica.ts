import type { Candidato, FaseEleitoral2026 } from "@/lib/types"
import { mergeComparadorQueryString } from "@/lib/comparador-query"
import { COMPARADOR_EIXO_DEFAULT } from "@/lib/comparador-axis"

export const FONTE_RESULTADO_TSE_URL = "https://resultados.tse.jus.br"
export const FONTE_RESULTADO_TSE_ROTULO = "Fonte: TSE, resultado oficial do 1º turno"

export interface FaseEleitoralPublica extends FaseEleitoral2026 {
  candidato_id: string
  slug: string
  cargo_disputado: string
}

/** Count exato impede que o teto do PostgREST pareça um resultado completo. */
export function validarLeituraFases(data: unknown, count: number | null): FaseEleitoralPublica[] {
  if (!Array.isArray(data) || count === null || count !== data.length) return []
  const ids = new Set<string>()
  for (const value of data) {
    if (!value || typeof value !== "object") return []
    const r = value as Record<string, unknown>
    if (typeof r.candidato_id !== "string" || !r.candidato_id || ids.has(r.candidato_id)
      || typeof r.slug !== "string" || !r.slug
      || !["Presidente", "Governador", "Senador"].includes(String(r.cargo_disputado))
      || !["em_disputa", "segundo_turno", "eleito", "nao_eleito", "fora_da_disputa"].includes(String(r.fase_eleitoral))
      || ![1, 2].includes(Number(r.fase_turno)) || typeof r.fase_turno !== "number"
      || !(r.atualizacao_encerrada_em === null || (typeof r.atualizacao_encerrada_em === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.atualizacao_encerrada_em)))
      || (r.cargo_disputado === "Senador" && (r.fase_turno !== 1 || r.fase_eleitoral === "segundo_turno"))
      || (r.fase_eleitoral === "segundo_turno" && r.fase_turno !== 1)) return []
    ids.add(r.candidato_id)
  }
  return data as FaseEleitoralPublica[]
}

type CandidaturaPublica = {
  cargo_disputado: string | null
  fase_eleitoral_2026?: FaseEleitoral2026 | null
}

/** Ausência e resultado neutro do Senado não são resultado individual. */
export function rotuloFaseEleitoral(candidato: CandidaturaPublica): string | null {
  const fase = candidato.fase_eleitoral_2026
  if (!fase || fase.fase_eleitoral === "em_disputa") return null
  if (candidato.cargo_disputado === "Senador" && fase.fase_eleitoral === "fora_da_disputa") return null
  if (fase.fase_eleitoral === "segundo_turno") return "Vai ao 2º turno"
  if (fase.fase_eleitoral === "eleito") return fase.fase_turno === 2 ? "Venceu no 2º turno" : "Venceu no 1º turno"
  return candidato.cargo_disputado !== "Senador" && fase.fase_turno === 1 ? "Não foi ao 2º turno" : "Não se elegeu"
}

/** Mantém a ordem anterior quando não há resultado, inclusive nos empates. */
function prioridadeFaseEleitoral(candidato: CandidaturaPublica): number {
  const fase = candidato.fase_eleitoral_2026?.fase_eleitoral
  return fase === "segundo_turno" || fase === "eleito" ? 0 : 1
}

export function ordenarPorFaseEleitoral<T extends CandidaturaPublica>(candidatos: T[]): T[] {
  if (!candidatos.some(c => c.fase_eleitoral_2026)) return candidatos
  return [...candidatos].sort((a, b) => prioridadeFaseEleitoral(a) - prioridadeFaseEleitoral(b))
}

/** Nunca compõe confronto com apenas um finalista ou mistura cargos/UFs. */
export function linkCompararFinalistas(candidatos: Candidato[]): string | null {
  const finalistas = candidatos.filter(c => c.fase_eleitoral_2026?.fase_eleitoral === "segundo_turno")
  if (finalistas.length !== 2) return null
  const [a, b] = [...finalistas].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
  if (a.cargo_disputado !== b.cargo_disputado || (a.cargo_disputado !== "Presidente" && a.estado !== b.estado)) return null
  const cargo = a.cargo_disputado
  if (cargo !== "Presidente" && cargo !== "Governador") return null
  return `/comparar?${mergeComparadorQueryString("", [a.slug, b.slug], COMPARADOR_EIXO_DEFAULT, { cargo, uf: cargo === "Presidente" ? "BR" : a.estado ?? "" })}`
}

export interface SecoesPorFase<T> {
  destaque: T[]
  demais: T[]
  tituloDestaque: string
}

/**
 * Separa quem venceu ou foi ao 2º turno de quem ficou pelo caminho, preservando a ordem.
 * Sem os dois grupos não há seções (null): a lista segue inteira, como antes do resultado.
 */
export function separarSecoesPorFase<T extends CandidaturaPublica>(candidatos: T[]): SecoesPorFase<T> | null {
  const avancou = (c: T) => {
    const fase = c.fase_eleitoral_2026?.fase_eleitoral
    return fase === "eleito" || fase === "segundo_turno"
  }
  const destaque = candidatos.filter(avancou)
  const demais = candidatos.filter((c) => !avancou(c))
  if (destaque.length === 0 || demais.length === 0) return null
  const eleitos = destaque.filter((c) => c.fase_eleitoral_2026?.fase_eleitoral === "eleito").length
  const tituloDestaque =
    eleitos === destaque.length ? (eleitos > 1 ? "Eleitos no 1º turno" : "Eleito no 1º turno")
    : eleitos === 0 ? "No 2º turno"
    : "Eleitos e 2º turno"
  return { destaque, demais, tituloDestaque }
}

/** Rótulo curto da aba de quem segue na disputa (programas, pesquisas). */
export function rotuloAbaFinalistas(secoes: Pick<SecoesPorFase<unknown>, "tituloDestaque">): string {
  return secoes.tituloDestaque.startsWith("Eleito") ? (secoes.tituloDestaque.startsWith("Eleitos e") ? "Eleitos e 2º turno" : "Eleito") : "2º turno"
}
