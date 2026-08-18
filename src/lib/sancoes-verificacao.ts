import type { SancoesVerificacao } from "./types"

/**
 * Estado de exibição do bloco de sanções na ficha.
 *
 * A regra de honestidade que este módulo garante: zero provado e zero presumido
 * não podem ter a mesma cara. Só a última tentativa de coleta com desfecho
 * `vazio_confirmado` (a fonte respondeu, e respondeu vazio, nos três cadastros)
 * autoriza a ficha a afirmar "nada encontrado". Qualquer outro desfecho
 * (`erro`, `indeterminado`, `nao_aplicavel`), a ausência de registro de
 * tentativa e até um `encontrado` inconsistente com a tabela vazia rendem o
 * estado neutro, que não afirma limpeza.
 */
export type EstadoSancoes = "com-registros" | "vazio-confirmado" | "nao-verificado"

export function resolverEstadoSancoes(
  totalSancoes: number,
  verificacao: SancoesVerificacao | null | undefined
): EstadoSancoes {
  if (totalSancoes > 0) return "com-registros"
  if (verificacao?.resultado === "vazio_confirmado" && verificacao.executado_em) {
    return "vazio-confirmado"
  }
  return "nao-verificado"
}
