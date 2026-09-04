/**
 * Julgamento do pedido de registro de 2026, lido do pacote
 * `consulta_cand_complementar` dos dados abertos do TSE.
 *
 * Por que existe um segundo pacote. `consulta_cand_2026` traz
 * `DS_SITUACAO_CANDIDATURA` = `#NE` em 20.456 de 20.456 linhas: a coluna existe
 * e nao distingue estado nenhum. O julgamento vive em outro arquivo do mesmo
 * conjunto, `consulta_cand_complementar`, na coluna `DS_SITUACAO_JULGAMENTO`.
 * O projeto ja baixava esse pacote para profissao e escolaridade; ninguem lia
 * a coluna de julgamento.
 *
 * Censo de 03/09/2026, cruzado por SQ_CANDIDATO com as 206 fichas publicaveis
 * que tinham SQ: 134 DEFERIDO, 66 AGUARDANDO JULGAMENTO, 3 INDEFERIDO EM PRAZO
 * RECURSAL OU COM RECURSO, 2 DEFERIDO EM PRAZO RECURSAL OU COM RECURSO, 1
 * INDEFERIDO.
 *
 * Modulo puro: sem rede, sem disco, sem Supabase. O download vive no ingest.
 */

import { SITUACAO_CANDIDATURA_DOMINIO } from "@/lib/situacao-candidatura"

/** Uma linha de julgamento, ja reduzida ao que interessa. */
export interface JulgamentoTse {
  sq: string
  codigo: string
  descricao: string
}

/**
 * `CD_SITUACAO_JULGAMENTO` -> valor do dominio de `situacao_candidatura`.
 *
 * Cada entrada e um codigo que a fonte REALMENTE emitiu para esta coorte em
 * 03/09/2026. Codigo novo nao entra por semelhanca: quem aparecer fora deste
 * mapa bloqueia a persistencia daquele candidato e espera uma PR deliberada,
 * que e a mesma fricção que o vocabulario fechado ja impunha.
 */
export const JULGAMENTO_POR_CODIGO: ReadonlyMap<string, string> = new Map([
  ["2", "deferido"],
  ["4", "indeferido com recurso"],
  ["8", "aguardando julgamento"],
  ["14", "indeferido"],
  ["16", "deferido com recurso"],
])

/** Colunas sem as quais a leitura nao pode continuar. */
export const COLUNAS_JULGAMENTO = ["SQ_CANDIDATO", "CD_SITUACAO_JULGAMENTO", "DS_SITUACAO_JULGAMENTO"] as const

/** Uniao discriminada de verdade: `ok` e o que estreita o tipo no consumidor. */
export type ResultadoMapeamento =
  | { ok: true; valor: string }
  | { ok: false; bloqueio: string }

/**
 * Traduz um julgamento para o dominio, ou devolve o motivo do bloqueio.
 *
 * O contrato e fail-closed de proposito: sem codigo, com codigo desconhecido ou
 * com valor que nao esta no dominio TypeScript, ninguem escreve nada. Foi
 * gravar o que a fonte mandava sem essa tradutora que produziu as onze grafias
 * que a migration 20260903100000 teve de limpar.
 */
export function mapearJulgamento(j: JulgamentoTse | null | undefined): ResultadoMapeamento {
  if (!j || !j.codigo.trim()) return { ok: false, bloqueio: "julgamento-ausente" }
  const codigo = j.codigo.trim()
  const valor = JULGAMENTO_POR_CODIGO.get(codigo)
  if (!valor) {
    const descricao = j.descricao.trim()
    return { ok: false, bloqueio: `julgamento-fora-do-vocabulario:${codigo}${descricao ? ` (${descricao})` : ""}` }
  }
  // Guarda de coerencia com o outro lado do dominio. Se alguem acrescentar uma
  // linha aqui e esquecer de `situacao-candidatura.ts`, o CHECK do banco
  // reprovaria a escrita; melhor bloquear antes de tentar.
  if (!(SITUACAO_CANDIDATURA_DOMINIO as readonly string[]).includes(valor)) {
    return { ok: false, bloqueio: `julgamento-mapeado-fora-do-dominio:${valor}` }
  }
  return { ok: true, valor }
}

/**
 * Indexa linhas ja parseadas do pacote complementar por SQ_CANDIDATO.
 *
 * Falha alto quando falta coluna. Uma versao anterior deste projeto conferia so
 * uma coluna e devolvia verde quando as demais sumiam do pacote; o modo de
 * falha e um resultado que parece medido e nao foi.
 */
export function indexarJulgamentoPorSq(
  linhas: Iterable<Record<string, string | undefined>>,
  colunasDoCabecalho: readonly string[],
): Map<string, JulgamentoTse> {
  const ausentes = COLUNAS_JULGAMENTO.filter((c) => !colunasDoCabecalho.includes(c))
  if (ausentes.length > 0) {
    throw new Error(
      `consulta_cand_complementar sem a(s) coluna(s) ${ausentes.join(", ")}. ` +
        "O pacote do TSE mudou de formato; a leitura nao pode continuar sem afirmar o que nao leu.",
    )
  }
  const porSq = new Map<string, JulgamentoTse>()
  for (const linha of linhas) {
    const sq = (linha.SQ_CANDIDATO ?? "").trim()
    if (!sq) continue
    porSq.set(sq, {
      sq,
      codigo: (linha.CD_SITUACAO_JULGAMENTO ?? "").trim(),
      descricao: (linha.DS_SITUACAO_JULGAMENTO ?? "").trim(),
    })
  }
  return porSq
}

/** Censo por descricao, para o recibo e para a reconciliacao. */
export function censoPorDescricao(porSq: ReadonlyMap<string, JulgamentoTse>): Record<string, number> {
  const censo: Record<string, number> = {}
  for (const j of porSq.values()) {
    const chave = j.descricao || `(codigo ${j.codigo})`
    censo[chave] = (censo[chave] ?? 0) + 1
  }
  return censo
}
