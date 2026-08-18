/**
 * Natureza de uma proposição autoral, derivada da `siglaTipo` da Câmara.
 *
 * Existe por causa da issue #138. `GET /proposicoes?idDeputadoAutor=` devolve
 * TODA proposição autoral, não só projeto de lei: entram requerimento (REQ),
 * requerimento de informação (RIC), indicação (INC) e emenda (EMC, EMP). O
 * ingest persiste esse acervo inteiro em `projetos_lei`, e a curadoria nominal
 * já vinha fazendo o mesmo desde 2026-05: das 339 linhas do `eduardo-paes` na
 * migration `20260507130000`, só 81 são PL, e 93 são RIC.
 *
 * Duas saídas eram possíveis, e a escolha está registrada em
 * `Settings/SOURCES_AND_DATA.md`: descartar o que não é projeto de lei na
 * ingestão encolheria fichas já publicadas e criaria dois acervos incompatíveis
 * (o curado, com REQ e RIC, e o ingerido, sem). A saída adotada é persistir o
 * acervo autoral inteiro e classificar aqui, para que a ficha possa contar
 * projeto de lei como projeto de lei e o resto como o que é.
 *
 * Por isso este módulo NÃO descarta nada. Ele rotula. Quem quiser só o
 * normativo filtra por `natureza === "projeto_lei"`.
 */

export type ProposicaoNatureza = "projeto_lei" | "outra_proposicao"

/**
 * Siglas que propõem norma: viram lei, emenda constitucional, decreto
 * legislativo ou resolução se aprovadas.
 *
 * Inclui siglas do Senado (PLS, PLC) porque `projetos_lei` mistura as duas
 * casas na coluna `fonte`, e um acervo curado de senador usa a nomenclatura de
 * lá. `MPV` entra por ser proposta normativa em tramitação, ainda que a autoria
 * seja do Executivo: quando aparece como autoral de um parlamentar, é
 * reapresentação ou projeto de lei de conversão associado.
 */
export const SIGLAS_PROJETO_LEI: ReadonlySet<string> = new Set([
  "PL", // Projeto de Lei
  "PLP", // Projeto de Lei Complementar
  "PLC", // Projeto de Lei da Câmara (nomenclatura do Senado)
  "PLS", // Projeto de Lei do Senado
  "PLN", // Projeto de Lei do Congresso Nacional
  "PLV", // Projeto de Lei de Conversão
  "PEC", // Proposta de Emenda à Constituição
  "PDL", // Projeto de Decreto Legislativo
  "PDC", // Projeto de Decreto Legislativo (sigla antiga da Câmara)
  "PDS", // Projeto de Decreto Legislativo (sigla do Senado)
  "PRC", // Projeto de Resolução da Câmara
  "PRS", // Projeto de Resolução do Senado
  "MPV", // Medida Provisória
])

/**
 * Siglas de atividade parlamentar que não propõem norma: fiscalização, pedido
 * de informação, sugestão ao Executivo e emenda a texto de terceiro.
 *
 * Esta lista não precisa ser exaustiva para o classificador funcionar (o
 * default já é `outra_proposicao`), mas serve de documentação viva do que a
 * API devolve na prática. `tests/proposicao-natureza.test.ts` confere que
 * nenhuma sigla aparece nas duas listas.
 */
export const SIGLAS_OUTRA_PROPOSICAO: ReadonlySet<string> = new Set([
  "REQ", // Requerimento
  "RIC", // Requerimento de Informação
  "RCP", // Requerimento de CPI
  "INC", // Indicação
  "EMC", // Emenda na Comissão
  "EMP", // Emenda de Plenário
  "EMD", // Emenda
  "ERD", // Emenda de Redação
  "SBT", // Substitutivo
  "PFC", // Proposta de Fiscalização e Controle
  "SUG", // Sugestão
  "MSC", // Mensagem
  "TVR", // Tomada de Contas / ato de outorga
  "VTS", // Voto em Separado
  "APJ", // Apoiamento a Projeto
  "CON", // Consulta
  // Medidas na API em 08/08/2026, na amostra de `efraim-filho` e `cabo-daciolo`.
  // Já caíam certo pelo default; ficam listadas porque foram observadas.
  "PRL", // Parecer do Relator
  "RAT", // Requerimento de Audiência / ratificação
  "DOC", // Documento anexo
  "EMA", // Emenda Aglutinativa
  "REC", // Recurso
])

export function normalizeSiglaTipo(tipo: string | null | undefined): string {
  return (tipo ?? "").trim().toUpperCase()
}

/**
 * Classifica uma proposição pela sigla. Sigla desconhecida ou vazia cai em
 * `outra_proposicao` de propósito: contar como projeto de lei o que não se sabe
 * o que é infla exatamente o número que a ficha promete.
 */
export function naturezaDaProposicao(tipo: string | null | undefined): ProposicaoNatureza {
  return SIGLAS_PROJETO_LEI.has(normalizeSiglaTipo(tipo)) ? "projeto_lei" : "outra_proposicao"
}

export function isProjetoLei(tipo: string | null | undefined): boolean {
  return naturezaDaProposicao(tipo) === "projeto_lei"
}

/**
 * Rótulo honesto para um acervo de proposições (vistoria dos PRs #141/#142).
 *
 * "Projetos de lei" só quando TODO o acervo é projeto de lei. Qualquer
 * requerimento, indicação ou emenda no meio muda o rótulo para "Proposições de
 * autoria", que é verdadeiro para os dois casos. Acervo vazio fica no rótulo
 * padrão: não há mistura a denunciar.
 */
export function rotuloDoAcervo(tipos: Iterable<string | null | undefined>): string {
  const contagem = contarPorNatureza(tipos)
  return contagem.outrasProposicoes > 0 ? "Proposições de autoria" : "Projetos de lei"
}

export interface ContagemPorNatureza {
  total: number
  projetosLei: number
  outrasProposicoes: number
}

export function contarPorNatureza(
  tipos: Iterable<string | null | undefined>
): ContagemPorNatureza {
  let projetosLei = 0
  let total = 0
  for (const tipo of tipos) {
    total++
    if (isProjetoLei(tipo)) projetosLei++
  }
  return { total, projetosLei, outrasProposicoes: total - projetosLei }
}
