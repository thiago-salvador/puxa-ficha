/**
 * Coorte de atualização: quais candidaturas as rotinas de coleta ainda
 * atualizam depois de cada turno de 2026.
 *
 * Um predicado só, usado por toda rotina que busca, coleta, audita ou mede
 * frescor de dado de candidato: `naCoorteAtualizacao`. A regra que decide quem
 * sai da coorte mora em `encerraAtualizacao` e só é aplicada quando o resultado
 * oficial do TSE é gravado por migration (`scripts/resultados-tse-fase.ts`).
 *
 * Sair da coorte NÃO despublica a ficha nem apaga dado: a ficha continua no ar
 * com o último dado coletado e com a nota de `notaAtualizacaoEncerrada`.
 *
 * Chave de segurança: enquanto a migration de resultado não é aplicada,
 * `atualizacao_encerrada_em` é nulo em todas as fichas e o predicado devolve
 * `true` para todas, isto é, tudo se comporta como antes desta mudança.
 */

export type FaseEleitoral = "em_disputa" | "segundo_turno" | "eleito" | "nao_eleito" | "fora_da_disputa"

export type TurnoEleitoral = 1 | 2

/** Datas oficiais dos turnos de 2026 (calendário do TSE). */
export const DATAS_TURNOS_2026: Readonly<Record<TurnoEleitoral, string>> = {
  1: "2026-10-04",
  2: "2026-10-25",
}

export interface CandidaturaFase {
  cargo_disputado: string | null
  fase_eleitoral?: string | null
  fase_eleitoral_turno?: number | null
  atualizacao_encerrada_em?: string | null
}

/**
 * O predicado único. Uma candidatura está na coorte de atualização enquanto
 * nenhuma migration de resultado encerrou a atualização dela. Linha sem a
 * coluna (banco antes da migration de schema) conta como dentro da coorte.
 */
export function naCoorteAtualizacao(candidatura: Pick<CandidaturaFase, "atualizacao_encerrada_em">): boolean {
  const encerrada = candidatura.atualizacao_encerrada_em
  return encerrada === null || encerrada === undefined || String(encerrada).trim() === ""
}

/**
 * Regra do dono (26/09/2026), genérica para os dois turnos:
 *  - Senado se decide no primeiro turno: toda candidatura a senador com
 *    resultado sai da coorte, eleita ou não.
 *  - Presidente e Governador: depois do primeiro turno, sai quem não segue
 *    para o segundo turno (inclusive quem já foi eleito no primeiro turno).
 *    Depois do segundo turno, saem os dois finalistas: a eleição terminou.
 *  - `fora_da_disputa` (candidatura anulada ou sem votos válidos no resultado
 *    oficial) sai em qualquer cargo.
 *  - `em_disputa` e `segundo_turno` nunca saem.
 */
export function encerraAtualizacao(cargo: string | null, fase: FaseEleitoral, turno: TurnoEleitoral | null): boolean {
  if (fase === "em_disputa" || fase === "segundo_turno") return false
  if (fase === "fora_da_disputa" || fase === "nao_eleito") return true
  // fase === "eleito": a eleição terminou para qualquer cargo e turno.
  return (cargo === "Senador" && turno === 1)
    || ((cargo === "Presidente" || cargo === "Governador") && (turno === 1 || turno === 2))
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/

function formatarDataBr(iso: string): string | null {
  const m = DATA_ISO.exec(iso.trim())
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/** Rótulo curto em DD/MM para matriz e relatórios: "atualização encerrada em 05/10". */
export function rotuloAtualizacaoEncerrada(iso: string): string {
  const data = formatarDataBr(iso)
  return data ? `atualização encerrada em ${data.slice(0, 5)}` : "atualização encerrada"
}

/**
 * Nota neutra da ficha pública. Sem juízo editorial: só a data e o fato
 * oficial (eleito ou fora da disputa). Devolve null para ficha na coorte.
 */
export function notaAtualizacaoEncerrada(candidatura: CandidaturaFase): string | null {
  if (naCoorteAtualizacao(candidatura)) return null
  const data = formatarDataBr(String(candidatura.atualizacao_encerrada_em))
  if (!data) return null
  if (candidatura.fase_eleitoral === "eleito") {
    const turno = candidatura.fase_eleitoral_turno === 2 ? "segundo" : "primeiro"
    return `Dados atualizados até ${data}; eleito(a) no ${turno} turno.`
  }
  return `Dados atualizados até ${data}; a candidatura não segue na disputa.`
}
