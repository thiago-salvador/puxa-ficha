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
export type ProgramaGovernoPendencia =
  | { motivo: "nao_coletado" }
  | { motivo: "registro_duplicado_tse"; fonteUrl: string; consultadoEm: string }

/**
 * Candidaturas cujo programa aparece no pacote oficial do TSE sob mais de um
 * SQ_CANDIDATO. Fonte e data vêm do inventário de 29/08/2026
 * (scripts/data/programas-governo-governadores-2026/inventario-2026-08-29.json,
 * documentos MT:110002553937:01 e MT:110002554073:01; ver
 * docs/operations/programas-governo-governadores-2026-inventario.md, seção
 * "Ambiguidade atual").
 */
const REGISTRO_DUPLICADO_TSE: ReadonlyMap<string, { fonteUrl: string; consultadoEm: string }> = new Map([
  ["laudicerio-aguiar", {
    fonteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_MT.zip",
    consultadoEm: "2026-08-29",
  }],
])

const CARGOS_COM_PROGRAMA: ReadonlySet<string> = new Set(["Presidente", "Governador"])

export function programaGovernoPendencia(input: {
  slug: string
  cargoDisputado: string | null | undefined
  /** O programa foi procurado nesta renderização e não existe registro. */
  semRegistro: boolean
}): ProgramaGovernoPendencia | null {
  if (!input.semRegistro || !CARGOS_COM_PROGRAMA.has(input.cargoDisputado ?? "")) return null
  const duplicado = REGISTRO_DUPLICADO_TSE.get(input.slug)
  return duplicado ? { motivo: "registro_duplicado_tse", ...duplicado } : { motivo: "nao_coletado" }
}
