/**
 * Referência de 2022 para o hero da home: comparecimento, abstenção, brancos e
 * nulos do 1º turno para Presidente no Brasil, lidos do histórico de
 * totalização publicado pelo TSE no portal de dados abertos. O JSON de
 * resultados de 2022 (resultados.tse.jus.br/oficial/ele2022) saiu do ar; o
 * histórico é a fonte oficial viva.
 *
 * A última linha do CSV (100% das seções) traz os acumulados. Percentuais saem
 * dos inteiros, na mesma base do arquivo de 2026: comparecimento e abstenção
 * sobre o eleitorado apto, brancos e nulos sobre o comparecimento. A coluna de
 * percentual do próprio TSE serve de conferência.
 */
import type { Referencia2022Presidente } from "../../src/lib/referencia-2022"

export const REFERENCIA_2022_PAGINA = "https://dadosabertos.tse.jus.br/dataset/resultados-2022"
export const REFERENCIA_2022_URL = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/Historico_Totalizacao_Presidente_BR_1T_2022.zip"
export const REFERENCIA_2022_ARQUIVO = "Historico_Totalizacao_Presidente_BR_1T_2022.csv"

const COLUNAS = [
  "DT_TOTALIZACAO",
  "QT_SECOES_TOTAL",
  "QT_APTOS_TOTAL",
  "QT_SECOES_TOT_ACUMULADO",
  "PE_SECOES_TOT_ACUMULADO",
  "QT_VOTOS_TOTAL_ACUMULADO",
  "BRANCO_QT_VOTOS_TOT_ACUMULADO",
  "BRANCO_PE_VOTOS_TOT_ACUMULADO",
  "NULO_QT_VOTOS_TOT_ACUMULADO",
  "NULO_PE_VOTOS_TOT_ACUMULADO",
] as const

type Coluna = (typeof COLUNAS)[number]

function inteiro(valor: string | undefined, coluna: string): number {
  const t = (valor ?? "").trim()
  if (!/^\d+$/.test(t)) throw new Error(`${coluna} não é inteiro: "${t}"`)
  return Number(t)
}

/** Fração publicada com vírgula ("0,015886"). */
function fracao(valor: string | undefined, coluna: string): number {
  const t = (valor ?? "").trim().replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`${coluna} não é número: "${t}"`)
  return Number(t)
}

const pct = (parte: number, todo: number) => Math.round((parte / todo) * 100 * 1e9) / 1e9

/**
 * Lê o histórico de totalização (CSV com ";", cabeçalho com espaços de
 * preenchimento). Lança se faltar coluna, se a última linha não tiver 100% das
 * seções ou se o percentual do TSE divergir da conta em mais de 0,01 p.p.
 */
export function lerHistoricoTotalizacao2022(csv: string): Referencia2022Presidente["totais"] & { totalizacao_tse: string } {
  const linhas = csv.split(/\r?\n/).filter((l) => l.trim() !== "")
  if (linhas.length < 2) throw new Error("CSV sem linhas de dados")
  const cabecalho = linhas[0].split(";").map((c) => c.trim())
  const indice = Object.fromEntries(COLUNAS.map((c) => [c, cabecalho.indexOf(c)])) as Record<Coluna, number>
  const faltando = COLUNAS.filter((c) => indice[c] === -1)
  if (faltando.length) throw new Error(`colunas ausentes: ${faltando.join(", ")}`)
  const ultima = linhas[linhas.length - 1].split(";")
  const v = (c: Coluna) => ultima[indice[c]]
  const secoes = inteiro(v("QT_SECOES_TOTAL"), "QT_SECOES_TOTAL")
  const secoesTotalizadas = inteiro(v("QT_SECOES_TOT_ACUMULADO"), "QT_SECOES_TOT_ACUMULADO")
  if (secoesTotalizadas !== secoes || fracao(v("PE_SECOES_TOT_ACUMULADO"), "PE_SECOES_TOT_ACUMULADO") !== 1) {
    throw new Error(`última linha sem 100% das seções (${secoesTotalizadas} de ${secoes})`)
  }
  const eleitorado = inteiro(v("QT_APTOS_TOTAL"), "QT_APTOS_TOTAL")
  const comparecimento = inteiro(v("QT_VOTOS_TOTAL_ACUMULADO"), "QT_VOTOS_TOTAL_ACUMULADO")
  if (comparecimento > eleitorado) throw new Error("comparecimento maior que o eleitorado")
  const brancos = inteiro(v("BRANCO_QT_VOTOS_TOT_ACUMULADO"), "BRANCO_QT_VOTOS_TOT_ACUMULADO")
  const nulos = inteiro(v("NULO_QT_VOTOS_TOT_ACUMULADO"), "NULO_QT_VOTOS_TOT_ACUMULADO")
  const totais = {
    secoes,
    secoes_totalizadas: secoesTotalizadas,
    eleitorado,
    comparecimento,
    percentual_comparecimento: pct(comparecimento, eleitorado),
    abstencao: eleitorado - comparecimento,
    percentual_abstencao: pct(eleitorado - comparecimento, eleitorado),
    brancos,
    percentual_brancos: pct(brancos, comparecimento),
    nulos,
    percentual_nulos: pct(nulos, comparecimento),
  }
  for (const [coluna, calculado] of [
    ["BRANCO_PE_VOTOS_TOT_ACUMULADO", totais.percentual_brancos],
    ["NULO_PE_VOTOS_TOT_ACUMULADO", totais.percentual_nulos],
  ] as const) {
    const publicado = fracao(v(coluna), coluna) * 100
    if (Math.abs(publicado - calculado) > 0.01) throw new Error(`${coluna} ${publicado} diverge da conta ${calculado}`)
  }
  return { ...totais, totalizacao_tse: (v("DT_TOTALIZACAO") ?? "").trim() }
}
