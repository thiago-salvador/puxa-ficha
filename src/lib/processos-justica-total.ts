// cspell:words representacoes etica camara

/**
 * Contagem única da aba Justiça: processos judiciais listados na aba mais
 * processos disciplinares (Conselho de Ética). Sanções administrativas ficam
 * fora. O KPI do topo, o badge da aba e o card da visão geral leem daqui, para
 * que os três mostrem sempre o mesmo número.
 */
export interface ProcessosJusticaContagem {
  judiciais: number
  disciplinaresSenado: number
  disciplinaresCamara: number
  disciplinares: number
  total: number
}

export function contarProcessosJustica({
  judiciais,
  disciplinares,
}: {
  judiciais: number
  disciplinares: ReadonlyArray<{ casa: "camara" | "senado" }>
}): ProcessosJusticaContagem {
  const disciplinaresSenado = disciplinares.filter((item) => item.casa === "senado").length
  const disciplinaresCamara = disciplinares.filter((item) => item.casa === "camara").length
  const total = judiciais + disciplinaresSenado + disciplinaresCamara
  return {
    judiciais,
    disciplinaresSenado,
    disciplinaresCamara,
    disciplinares: disciplinaresSenado + disciplinaresCamara,
    total,
  }
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

function juntarEmProsa(partes: string[]): string {
  if (partes.length <= 1) return partes.join("")
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`
}

/** Legenda curta do KPI: "1 judicial · 6 disciplinares no Senado". Partes zeradas somem. */
export function legendaProcessosJustica(contagem: ProcessosJusticaContagem): string | undefined {
  if (contagem.disciplinares === 0) return undefined
  const partes = [
    contagem.judiciais > 0 ? plural(contagem.judiciais, "judicial", "judiciais") : null,
    contagem.disciplinaresSenado > 0
      ? `${plural(contagem.disciplinaresSenado, "disciplinar", "disciplinares")} no Senado`
      : null,
    contagem.disciplinaresCamara > 0
      ? `${plural(contagem.disciplinaresCamara, "disciplinar", "disciplinares")} na Câmara`
      : null,
  ].filter((parte): parte is string => parte !== null)
  return partes.join(" · ")
}

/**
 * Legenda compacta para a grade de candidatos: "1 judicial · 6 disc.".
 * A versão por extenso (`legendaProcessosJustica`) vai no title e no leitor de tela.
 */
export function legendaCurtaProcessosJustica(contagem: ProcessosJusticaContagem): string | undefined {
  if (contagem.disciplinares === 0) return undefined
  const partes = [
    contagem.judiciais > 0 ? plural(contagem.judiciais, "judicial", "judiciais") : null,
    `${contagem.disciplinares} disc.`,
  ].filter((parte): parte is string => parte !== null)
  return partes.join(" · ")
}

interface ProcessosExibicao {
  value: number | string
  sub?: string
}

/**
 * Número e legenda que toda superfície mostra para o total de processos. Sem
 * processo disciplinar, vale a régua judicial (`processosOverviewDisplay`,
 * com "—" e recibo de busca); com disciplinar, o total é a soma e a legenda
 * separa as partes, como no KPI da ficha.
 */
export function exibicaoProcessosJustica(
  judicial: ProcessosExibicao,
  contagem: ProcessosJusticaContagem,
): ProcessosExibicao {
  if (contagem.disciplinares === 0) return judicial
  return { value: contagem.total, sub: legendaProcessosJustica(contagem) }
}

export const PROCESSO_DISCIPLINAR_AVISO = "Processo disciplinar não é processo judicial nem condenação."

/**
 * Recorte usado no card de processos e na abertura da aba Justiça:
 * "1 judicial e 6 disciplinares no Conselho de Ética do Senado."
 * Só existe quando há processo disciplinar.
 */
export function recorteProcessosJustica(contagem: ProcessosJusticaContagem): string | null {
  if (contagem.disciplinares === 0) return null
  const partes = [
    contagem.judiciais > 0 ? plural(contagem.judiciais, "judicial", "judiciais") : null,
    contagem.disciplinaresSenado > 0
      ? `${plural(contagem.disciplinaresSenado, "disciplinar", "disciplinares")} no Conselho de Ética do Senado`
      : null,
    contagem.disciplinaresCamara > 0
      ? `${plural(contagem.disciplinaresCamara, "disciplinar", "disciplinares")} no Conselho de Ética da Câmara`
      : null,
  ].filter((parte): parte is string => parte !== null)
  return `${juntarEmProsa(partes)}.`
}

/** Abertura da aba Justiça: "7 processos: 1 judicial e 6 disciplinares no Conselho de Ética do Senado." */
export function aberturaAbaJustica(contagem: ProcessosJusticaContagem): string | null {
  const recorte = recorteProcessosJustica(contagem)
  if (!recorte) return null
  return `${plural(contagem.total, "processo", "processos")}: ${recorte}`
}
