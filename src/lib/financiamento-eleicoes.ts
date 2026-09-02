import { anosDePleitoDisputado, type LinhaDeTrajetoriaParaPleito } from "@/lib/pleitos-disputados"

/**
 * Estado público do financiamento de UMA eleição disputada.
 *
 * ## Por que este módulo existe
 *
 * Até 10/08/2026 a aba Dinheiro mostrava um cartão por linha de financiamento e
 * calava sobre todo pleito sem linha. Numa ficha com seis candidaturas e uma
 * linha, o leitor via um número e não tinha como saber se as outras cinco não
 * existem, não foram coletadas, ou nunca foram procuradas. A auditoria daquele
 * dia mediu o tamanho do silêncio: de 718 candidaturas disputadas nas 194 fichas
 * públicas, 295 não tinham linha nenhuma, e 153 delas têm prestação de contas
 * publicada pelo TSE.
 *
 * Ao lado disso, o estado vazio da seção afirmava "Não há registros de
 * financiamento de campanha para este candidato no TSE". Isso é uma afirmação
 * sobre a fonte oficial, e ela nunca foi consultada. Casos provados contra o
 * pacote oficial: `flavio-bolsonaro` tem R$ 5.988,00 em 2002 no
 * `ReceitaCandidato.csv`, e `cabo-daciolo` tem R$ 1.259,44 em 2006 e R$ 720,00
 * em 2008. A frase era falsa nas três.
 *
 * Patrimônio já tinha resolvido o mesmo problema com `buildPatrimonioEleicoes`.
 * Este módulo é a metade que faltava, com a mesma regra: ausência de coleta
 * nunca vira zero nem ficha limpa, e ausência só pode ser AFIRMADA quando foi
 * verificada na fonte, com fonte e data à vista.
 */
type FinanciamentoEleicaoEstado =
  /** Há linha de prestação de contas publicada nesta ficha. */
  | "publicado"
  /** Há linha oficial e o total declarado nela é exatamente zero. */
  | "zero_declarado"
  /** Identidade conferida no pacote oficial, sem receita publicada para o SQ. */
  | "ausencia_oficial"
  /** A verificação foi executada, mas terminou em falha explícita. */
  | "erro"
  /**
   * Ausência VERIFICADA na fonte: a série digital de prestação de contas do TSE
   * começa em 2002, e para pleito anterior não existe registro oficial nenhum.
   * Único estado que afirma ausência, e por isso carrega fonte e data.
   */
  | "fora_da_serie_oficial"
  /** O pleito ainda não ocorreu; a prestação de contas não é devida. */
  | "pleito_futuro"
  /** Nós não coletamos. Não diz nada sobre o que o TSE tem. */
  | "nao_coletado"

export interface FinanciamentoEleicaoPublico {
  ano: number
  estado: FinanciamentoEleicaoEstado
  fonte_url: string | null
  verificado_em: string | null
  detalhe?: string | null
}

export interface FinanciamentoVerificacaoPublica {
  ano_eleicao: number
  resultado: "ausencia_oficial" | "nao_coletado" | "erro"
  fonte_url: string | null
  verificado_em: string | null
  detalhe?: string | null
}

/**
 * Primeiro ano com prestação de contas eleitorais em meio digital no TSE.
 *
 * Frase do portal de dados abertos: a prestação de contas em meio digital está
 * disponível somente a partir de 2002. Conferido em 10/08/2026 pacote a pacote:
 * 1994, 1996, 1998 e 2000 devolvem 404 no dataset e no CDN, 2002 devolve 200.
 */
export const FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE = 2002

/**
 * Último pleito cuja prestação de contas já é devida. Eleição posterior a este
 * ano ainda não ocorreu, e cobrar prestação dela seria inventar pendência.
 * Constante, e não `new Date()`, para o estado da ficha não depender do relógio
 * de quem renderiza. Revisar depois do pleito de 2026.
 */
export const FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA = 2024

/** Página oficial da série, que é o que sustenta a afirmação de ausência. */
export const FINANCIAMENTO_SERIE_TSE_FONTE_URL =
  "https://dadosabertos.tse.jus.br/group/prestacao-de-contas-eleitorais"

/** Data em que a janela da série foi conferida contra o portal do TSE. */
export const FINANCIAMENTO_SERIE_TSE_VERIFICADO_EM = "2026-08-10"

/**
 * Estado de financiamento por pleito disputado, mais recente primeiro.
 *
 * A âncora de "pleito disputado" é a compartilhada em `pleitos-disputados.ts`,
 * a mesma que patrimônio usa. Não há piso de ano aqui de propósito: um pleito de
 * 1998 precisa aparecer dizendo que o TSE não publica aquele ano, e não sumir.
 *
 * Os dois insumos (`financiamento` e `historico`) viajam inteiros no DTO
 * público, então esta composição é fiel quando roda sobre o payload que o
 * browser recebe. É a diferença para patrimônio, cuja série PRECISA viajar
 * composta porque `patrimonio_ausencias_oficiais` não é publicado.
 */
export function buildFinanciamentoEleicoes(
  financiamento: ReadonlyArray<{
    ano_eleicao: number
    total_arrecadado?: number | null
    fonte?: string | null
  }>,
  historico: ReadonlyArray<LinhaDeTrajetoriaParaPleito>,
  verificacoes: ReadonlyArray<FinanciamentoVerificacaoPublica> = [],
): FinanciamentoEleicaoPublico[] {
  const linhasPorAno = new Map(financiamento.map((row) => [row.ano_eleicao, row]))
  const verificacoesPorAno = new Map(verificacoes.map((row) => [row.ano_eleicao, row]))
  const anos = new Set<number>([
    ...linhasPorAno.keys(),
    ...anosDePleitoDisputado(historico),
    ...verificacoesPorAno.keys(),
  ])

  return [...anos]
    .sort((a, b) => b - a)
    .map((ano) => {
      const linha = linhasPorAno.get(ano)
      if (linha) {
        if (linha.total_arrecadado === 0) {
          return {
            ano,
            estado: "zero_declarado" as const,
            fonte_url: linha.fonte ?? null,
            verificado_em: null,
          }
        }
        return { ano, estado: "publicado" as const, fonte_url: null, verificado_em: null }
      }
      const verificacao = verificacoesPorAno.get(ano)
      if (verificacao?.resultado === "ausencia_oficial" || verificacao?.resultado === "erro") {
        return {
          ano,
          estado: verificacao.resultado,
          fonte_url: verificacao.fonte_url,
          verificado_em: verificacao.verificado_em,
          detalhe: verificacao.detalhe ?? null,
        }
      }
      if (ano > FINANCIAMENTO_ULTIMO_PLEITO_COM_PRESTACAO_DEVIDA) {
        return { ano, estado: "pleito_futuro" as const, fonte_url: null, verificado_em: null }
      }
      if (ano < FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE) {
        return {
          ano,
          estado: "fora_da_serie_oficial" as const,
          fonte_url: FINANCIAMENTO_SERIE_TSE_FONTE_URL,
          verificado_em: FINANCIAMENTO_SERIE_TSE_VERIFICADO_EM,
        }
      }
      return { ano, estado: "nao_coletado" as const, fonte_url: null, verificado_em: null }
    })
}

/** Texto da linha, por estado. Nenhum deles insinua ausência de arrecadação. */
export function descreverFinanciamentoEleicao(eleicao: FinanciamentoEleicaoPublico): string {
  switch (eleicao.estado) {
    case "publicado":
      return `Prestação de contas publicada nesta ficha para a eleição de ${eleicao.ano}.`
    case "zero_declarado":
      return `A prestação de contas oficial da eleição de ${eleicao.ano} registra zero declarado em receitas.`
    case "ausencia_oficial":
      return eleicao.detalhe ?? `A identidade foi conferida no pacote oficial de ${eleicao.ano}, sem receita publicada para esta candidatura.`
    case "erro":
      return eleicao.detalhe
        ? `Não foi possível concluir a verificação de ${eleicao.ano}: ${eleicao.detalhe}`
        : `Não foi possível concluir a verificação de financiamento da eleição de ${eleicao.ano}.`
    case "fora_da_serie_oficial":
      return `O TSE só publica prestação de contas eleitorais a partir de ${FINANCIAMENTO_ANO_INICIAL_DA_SERIE_TSE}, então não existe registro oficial de financiamento para a eleição de ${eleicao.ano}.`
    case "pleito_futuro":
      return `A eleição de ${eleicao.ano} ainda não foi realizada e a prestação de contas ainda não é devida.`
    case "nao_coletado":
      return `A coleta de financiamento da eleição de ${eleicao.ano} ainda não foi realizada. A ausência de valores aqui não significa que não houve arrecadação nem que o TSE não tenha o registro.`
  }
}
