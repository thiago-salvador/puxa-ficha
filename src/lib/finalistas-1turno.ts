import type { FaseEleitoral2026 } from "@/lib/types"
import { mesclarFaseComSnapshot } from "@/lib/resultados-1turno"

type ComFase = { fase_eleitoral_2026?: FaseEleitoral2026 | null }

export interface RecorteFinalistas<T> {
  candidatos: T[]
  /** true quando só finalistas ou vencedor ficaram na lista (há resultado publicado). */
  filtrado: boolean
}

function chegouAoFim(candidato: ComFase): boolean {
  const fase = candidato.fase_eleitoral_2026?.fase_eleitoral
  return fase === "segundo_turno" || fase === "eleito"
}

/**
 * Presidente e Governador: depois do 1º turno, as áreas de entrada mostram só
 * quem foi ao 2º turno ou quem venceu direto. Sem nenhum finalista ou vencedor
 * na lista (resultado ainda não publicado), devolve todos e `filtrado: false`,
 * para o site continuar igual antes da apuração.
 */
export function recortarFinalistas<T extends ComFase>(candidatos: T[]): RecorteFinalistas<T> {
  if (!candidatos.some(chegouAoFim)) return { candidatos, filtrado: false }
  return { candidatos: candidatos.filter(chegouAoFim), filtrado: true }
}

/**
 * Fase que as páginas de entrada leem: a do banco quando já saiu de
 * `em_disputa`; senão a do snapshot do TSE; senão a do banco. Evita que uma
 * linha `em_disputa` do banco apague o resultado já publicado no snapshot.
 */
export function comFaseEfetiva<T extends { slug: string; cargo_disputado: string | null }>(
  candidato: T,
  fasePorSlug: ReadonlyMap<string, FaseEleitoral2026>,
): T {
  const fase = mesclarFaseComSnapshot(candidato.slug, candidato.cargo_disputado, fasePorSlug.get(candidato.slug))
  return fase ? { ...candidato, fase_eleitoral_2026: fase } : candidato
}

export type StatusUf1Turno = "2º turno" | "Eleito no 1º turno"

/**
 * Selo do índice de governadores. Só aparece quando há resultado: vencedor
 * definido no 1º turno ou finalistas. Sem nenhum dos dois, não há selo.
 */
export function statusUf1Turno(fases: ReadonlyArray<string | null | undefined>): StatusUf1Turno | null {
  if (fases.includes("eleito")) return "Eleito no 1º turno"
  if (fases.includes("segundo_turno")) return "2º turno"
  return null
}
