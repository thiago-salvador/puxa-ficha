/**
 * Ficha de Presidente ou Governador sem registro de programa de governo no
 * dataset. Antes, a ficha simplesmente não mostrava o cartão do programa, e o
 * leitor não tinha como saber se o programa não existe ou se não foi coletado.
 *
 * O motivo padrão é `nao_coletado`: não afirma nada sobre o TSE, só que a
 * coleta do projeto ainda não tem o documento. `registro_duplicado_tse` vale
 * para candidatura com dois registros oficiais ativos e nenhum canônico
 * (ver docs/operations/programas-governo-governadores-2026-inventario.md,
 * "Ambiguidade atual"): coletar seria escolher um dos dois sem base oficial.
 */
export type ProgramaGovernoPendencia = {
  motivo: "nao_coletado" | "registro_duplicado_tse"
}

const REGISTRO_DUPLICADO_TSE: ReadonlySet<string> = new Set(["laudicerio-aguiar"])

const CARGOS_COM_PROGRAMA: ReadonlySet<string> = new Set(["Presidente", "Governador"])

export function programaGovernoPendencia(input: {
  slug: string
  cargoDisputado: string | null | undefined
  /** O programa foi procurado nesta renderização e não existe registro. */
  semRegistro: boolean
}): ProgramaGovernoPendencia | null {
  if (!input.semRegistro || !CARGOS_COM_PROGRAMA.has(input.cargoDisputado ?? "")) return null
  return { motivo: REGISTRO_DUPLICADO_TSE.has(input.slug) ? "registro_duplicado_tse" : "nao_coletado" }
}
