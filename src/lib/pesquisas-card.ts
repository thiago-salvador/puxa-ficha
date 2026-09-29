import type { PesquisaEleitoralDoCandidato } from "@/lib/pesquisas-eleitorais"

/**
 * Ordem do card "Intenção de voto" da visão geral: todas as pesquisas do
 * candidato (rodada recente, rodadas anteriores, segundo turno e pergunta
 * espontânea), da divulgação mais recente para a mais antiga. Na mesma data, o
 * 1º turno vem antes do 2º; o fim do campo desempata; o resto mantém a ordem
 * de `listarPesquisasDoCandidato` (recente, anterior, 2º turno, espontânea).
 */
export function ordenarPesquisasDoCard(
  pesquisas: readonly PesquisaEleitoralDoCandidato[],
): PesquisaEleitoralDoCandidato[] {
  return pesquisas
    .map((pesquisa, indice) => ({ pesquisa, indice }))
    .sort((a, b) =>
      (b.pesquisa.publicationDate.value ?? "").localeCompare(a.pesquisa.publicationDate.value ?? "") ||
      a.pesquisa.cenario.turn - b.pesquisa.cenario.turn ||
      (b.pesquisa.fieldwork.end.value ?? "").localeCompare(a.pesquisa.fieldwork.end.value ?? "") ||
      a.indice - b.indice,
    )
    .map(({ pesquisa }) => pesquisa)
}
