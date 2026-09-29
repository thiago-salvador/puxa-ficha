// cspell:words representacoes etica camara

import { nivelFonteProcesso, processoForaPorPapelDeAutoridade, type FonteProcessoNivel } from "@/lib/djen-consulta-url"
import { getRepresentacoesEticaAprovadas, type RepresentacaoEticaAprovada } from "@/lib/representacoes-etica"
import { contarProcessosJustica, type ProcessosJusticaContagem } from "@/lib/processos-justica-total"

/**
 * Contagem única de processos. Toda superfície que mostra um total de
 * processos (KPI e aba da ficha, grade de candidatos, hero da home e da /uf,
 * comparador, embed, card social, pacote de imprensa) passa por este módulo:
 * a seleção de linhas é feita só pelos predicados do critério abaixo e a soma
 * só por `contarProcessosJustica`. Mudar o que conta é mudar o critério aqui,
 * nunca escrever um filtro paralelo numa superfície.
 */

/** Campos que o critério judicial pode ler de uma linha de `processos`. */
export interface ProcessoJudicialContavel {
  id?: string | null
  numero_processo?: string | null
  url_fonte?: string | null
}

/** Campos que o critério disciplinar pode ler de um item do Conselho de Ética. */
export interface ProcessoDisciplinarContavel {
  casa: "camara" | "senado"
}

/**
 * Ponto de extensão da contagem: um predicado de inclusão por processo, por
 * tipo. A mesma decisão vale para a lista pública e para o total, então a aba
 * e o número nunca divergem.
 */
export interface CriterioContagemProcessos {
  incluirJudicial: (processo: ProcessoJudicialContavel) => boolean
  incluirDisciplinar: (processo: ProcessoDisciplinarContavel) => boolean
}

/**
 * Critério judicial de hoje: entra a linha com fonte judicial específica
 * ("oficial") ou com página específica publicável ("Fonte em confirmação"),
 * segundo `nivelFonteProcesso`. Linha oculta por decisão editorial, sem fonte
 * ou com raiz de site fica fora e vira omitida.
 */
export function incluirProcessoJudicialPadrao(processo: ProcessoJudicialContavel): boolean {
  return nivelFonteProcesso({
    id: processo.id ?? null,
    numero_processo: processo.numero_processo ?? null,
    url_fonte: processo.url_fonte ?? null,
  }) !== null
}

/**
 * Critério disciplinar de hoje: todo item aprovado no dataset versionado do
 * Conselho de Ética (a validação e a revisão humana já filtraram na carga).
 */
export function incluirProcessoDisciplinarPadrao(processo: ProcessoDisciplinarContavel): boolean {
  return processo.casa === "camara" || processo.casa === "senado"
}

export const CRITERIO_CONTAGEM_PROCESSOS: CriterioContagemProcessos = {
  incluirJudicial: incluirProcessoJudicialPadrao,
  incluirDisciplinar: incluirProcessoDisciplinarPadrao,
}

/**
 * Linhas judiciais que a ficha lista e conta, com o selo de fonte. Linha que
 * um critério futuro admita sem nível reconhecido sai com o selo de
 * confirmação, o mais conservador.
 */
export function filtrarProcessosJudiciaisContaveis<T extends ProcessoJudicialContavel>(
  processos: readonly T[],
  criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS,
): (T & { fonte_nivel: FonteProcessoNivel })[] {
  return processos.flatMap((processo) => {
    if (!criterio.incluirJudicial(processo)) return []
    const fonte_nivel = nivelFonteProcesso({
      id: processo.id ?? null,
      numero_processo: processo.numero_processo ?? null,
      url_fonte: processo.url_fonte ?? null,
    }) ?? "em_confirmacao"
    return [{ ...processo, fonte_nivel }]
  })
}

/** Processos disciplinares de um candidato que o critério admite, na ordem do dataset. */
export function getProcessosDisciplinaresContaveis(
  slug: string,
  criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS,
): RepresentacaoEticaAprovada[] {
  const aprovados = getRepresentacoesEticaAprovadas(slug)
  return aprovados.every(criterio.incluirDisciplinar) ? aprovados : aprovados.filter(criterio.incluirDisciplinar)
}

/**
 * Contagem estruturada de um candidato (judicial, disciplinar por casa e
 * total). `judiciais` é a quantidade de linhas já selecionadas pelo mesmo
 * critério: o comprimento de `filtrarProcessosJudiciaisContaveis` na ficha ou
 * a contagem do resumo de lista.
 */
export function contarProcessosJusticaDoCandidato(
  slug: string,
  judiciais: number,
  criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS,
): ProcessosJusticaContagem {
  return contarProcessosJustica({ judiciais, disciplinares: getProcessosDisciplinaresContaveis(slug, criterio) })
}

/** Mesma contagem a partir das linhas brutas de `processos` do candidato. */
export function contarProcessosJusticaDasLinhas(
  slug: string,
  processosJudiciais: readonly ProcessoJudicialContavel[],
  criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS,
): ProcessosJusticaContagem {
  return contarProcessosJusticaDoCandidato(slug, filtrarProcessosJudiciaisContaveis(processosJudiciais, criterio).length, criterio)
}

/**
 * Linhas omitidas da ficha: as brutas que o critério não contou, sem as de
 * papel de autoridade pelo cargo, que não são processo da pessoa e não faltam
 * fonte. É o número que alimenta o aviso de "omitidos sem fonte oficial".
 */
export function contarProcessosOmitidos(
  brutos: readonly ProcessoJudicialContavel[],
  contaveis: number,
): number {
  const daPessoa = brutos.filter((processo) => !processoForaPorPapelDeAutoridade(processo.id)).length
  return Math.max(0, daPessoa - contaveis)
}

/** Quantidade de linhas judiciais contáveis por candidato (usada no resumo de lista e no comparador). */
export function contarProcessosJudiciaisPorCandidato(
  processos: readonly (ProcessoJudicialContavel & { candidato_id: string })[],
  criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS,
  counts: Map<string, number> = new Map(),
): Map<string, number> {
  for (const processo of processos) {
    if (!criterio.incluirJudicial(processo)) continue
    counts.set(processo.candidato_id, (counts.get(processo.candidato_id) ?? 0) + 1)
  }
  return counts
}

interface ResumoComProcessos {
  candidato: { slug: string }
  processos: number
  processos_ordenacao?: number | null
}

/**
 * Aplica a contagem única ao DTO de lista depois do cache. `processos` passa a
 * ser o total (judicial + disciplinar); as partes ficam em
 * `processos_contagem`. A ordenação soma os disciplinares só quando havia
 * contagem judicial para ordenar (null continua null).
 */
export function aplicarProcessosJusticaAosResumos<T extends ResumoComProcessos>(
  resumos: readonly T[],
  criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS,
): (T & { processos_contagem: ProcessosJusticaContagem })[] {
  return resumos.map((resumo) => {
    const contagem = contarProcessosJusticaDoCandidato(resumo.candidato.slug, resumo.processos, criterio)
    const ordenacao = resumo.processos_ordenacao
    return {
      ...resumo,
      processos: contagem.total,
      processos_contagem: contagem,
      processos_ordenacao: ordenacao == null ? ordenacao : ordenacao + contagem.disciplinares,
    }
  })
}

interface ComparavelComProcessos {
  slug: string
  total_processos: number
}

/**
 * Mesma regra no comparador: `total_processos` vira o total exibido e a parte
 * judicial e a disciplinar ficam em `processos_contagem`.
 */
export function aplicarProcessosJusticaAosComparaveis<T extends ComparavelComProcessos>(
  rows: readonly T[],
  criterio: CriterioContagemProcessos = CRITERIO_CONTAGEM_PROCESSOS,
): (T & { processos_contagem: ProcessosJusticaContagem })[] {
  return rows.map((row) => {
    const contagem = contarProcessosJusticaDoCandidato(row.slug, row.total_processos, criterio)
    return { ...row, total_processos: contagem.total, processos_contagem: contagem }
  })
}
