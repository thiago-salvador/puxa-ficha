import type { PesquisaEleitoralDoCandidato } from "@/lib/pesquisas-eleitorais"
import { stripAccents } from "@/lib/strip-accents"

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

function normalizarNome(value: string): string {
  return stripAccents(value).toLocaleLowerCase("pt-BR")
}

/**
 * Rótulo de cada cenário no card, na mesma ordem da lista recebida. No 2º
 * turno, o adversário entra no rótulo ("vs. Lula") quando a fonte o identifica
 * e o rótulo ainda não o cita. Se dois cenários da mesma divulgação do mesmo
 * instituto ainda saírem com o mesmo texto, recebem "cenário 1/2", "cenário
 * 2/2": o card nunca mostra dois números diferentes sob o mesmo rótulo.
 */
export function rotulosDosCenariosDoCard(
  pesquisas: readonly PesquisaEleitoralDoCandidato[],
): string[] {
  const base = pesquisas.map((pesquisa) => {
    const rotulo = pesquisa.cenario.labelRaw
    if (pesquisa.cenario.turn !== 2) return rotulo
    const faltando = (pesquisa.adversarios ?? []).filter(
      (nome) => !normalizarNome(rotulo).includes(normalizarNome(nome)),
    )
    return faltando.length > 0 ? `${rotulo} · vs. ${faltando.join(" e ")}` : rotulo
  })
  const grupos = new Map<string, number[]>()
  pesquisas.forEach((pesquisa, indice) => {
    const chave = [
      pesquisa.instituto.value ?? pesquisa.sourceId,
      pesquisa.publicationDate.value ?? "",
      pesquisa.cenario.turn,
      base[indice],
    ].join("|")
    grupos.set(chave, [...(grupos.get(chave) ?? []), indice])
  })
  const rotulos = [...base]
  for (const indices of grupos.values()) {
    if (indices.length < 2) continue
    indices.forEach((indice, posicao) => {
      rotulos[indice] = `${base[indice]} · cenário ${posicao + 1}/${indices.length}`
    })
  }
  return rotulos
}
