import { supabase } from "./supabase"

/**
 * `gastos_parlamentares` tem chave única `(candidato_id, ano)`, e ela vale
 * também para linha despublicada. Coletor oficial que vai "inserir" um ano
 * cuja chave já está ocupada falha com violação de unicidade: é o caso do
 * ano despublicado por quarentena e da linha legada que o próprio coletor
 * acabou de despublicar por divergir do total oficial.
 *
 * Nesses casos a linha oficial substitui a ocupante no lugar (mesmo id),
 * desde que a ocupante seja da mesma Casa. Ocupante de outra fonte continua
 * em revisão: a tabela só guarda uma linha por ano e a troca de Casa exige
 * decisão, não coleta.
 */
export interface LinhaNaChave {
  id: string
  fonte: string | null
  total_gasto: number | null
  despublicado_em: string | null
}

export type DecisaoChaveOcupada =
  | { acao: "inserir" }
  | { acao: "substituir"; linha: LinhaNaChave }
  | { acao: "revisao"; motivo: string }

export function decidirChaveOcupada(
  ocupante: LinhaNaChave | null,
  mesmaCasa: (fonte: string | null) => boolean,
  opcoes: { aceitaPublicada: boolean },
): DecisaoChaveOcupada {
  if (!ocupante) return { acao: "inserir" }
  if (!mesmaCasa(ocupante.fonte)) {
    return { acao: "revisao", motivo: `chave anual ocupada por linha de outra fonte (${ocupante.fonte ?? "sem fonte"})` }
  }
  if (ocupante.despublicado_em == null && !opcoes.aceitaPublicada) {
    return { acao: "revisao", motivo: "chave anual ocupada por linha publicada que não é o alvo da coleta" }
  }
  return { acao: "substituir", linha: ocupante }
}

export async function lerLinhaNaChave(candidatoId: string, ano: number): Promise<LinhaNaChave | null> {
  const { data, error } = await supabase
    .from("gastos_parlamentares")
    .select("id,fonte,total_gasto,despublicado_em")
    .eq("candidato_id", candidatoId)
    .eq("ano", ano)
    .limit(2)
  if (error) throw new Error(`leitura da chave anual falhou (${ano}): ${error.message}`)
  const rows = (data ?? []) as LinhaNaChave[]
  if (rows.length > 1) throw new Error(`chave anual (${ano}) com mais de uma linha, contra o índice único`)
  return rows[0] ?? null
}
