import type { PatrimonioAnoValor } from "@/lib/evolucao-patrimonial"

/**
 * Patrimônio declarado atípico: regra genérica, sem nome de candidato.
 *
 * Quando o total declarado em 2026 é pelo menos 100 vezes o último total
 * anterior maior que zero do mesmo candidato, o valor recebe o aviso
 * "valor declarado atípico em relação a eleições anteriores". O valor oficial e
 * a fonte continuam exibidos como vieram do TSE; o aviso não afirma erro nem
 * causa. Na grade, o DTO de lista (`CandidatoResumo.patrimonio_atipico`) traz
 * só o booleano calculado no servidor; `buildCandidatoGridMaps` o repassa como
 * `patrimoniosAtipicos` na home, em /uf/[uf] e em /uf/[uf]/senado, e
 * `ordenarCandidatosGrid` manda o candidato marcado para o fim da ordenação por
 * patrimônio. A ficha não fala de ordenação, que é assunto da grade.
 */
const PATRIMONIO_ATIPICO_ANO_ALVO = 2026
export const PATRIMONIO_ATIPICO_FATOR = 100
export const PATRIMONIO_ATIPICO_ROTULO = "valor declarado atípico em relação a eleições anteriores"

export type PatrimonioAtipico = {
  anoAnterior: number
  valorAnterior: number
  anoAlvo: number
  valorAlvo: number
  fator: number
}

export function patrimonioDeclaradoAtipico(
  series: readonly PatrimonioAnoValor[],
): PatrimonioAtipico | null {
  const porAno = new Map<number, number>()
  for (const row of series) {
    if (!Number.isFinite(row.ano_eleicao)) continue
    if (row.valor_total == null || !Number.isFinite(row.valor_total)) continue
    porAno.set(row.ano_eleicao, row.valor_total)
  }

  const valorAlvo = porAno.get(PATRIMONIO_ATIPICO_ANO_ALVO)
  if (valorAlvo == null || valorAlvo <= 0) return null

  // Último ano anterior com total positivo: zero declarado não serve de base
  // (qualquer valor seria "infinitas vezes" maior) e nulo não é declaração.
  const anosAnterioresPositivos = [...porAno.entries()]
    .filter(([ano, valor]) => ano < PATRIMONIO_ATIPICO_ANO_ALVO && valor > 0)
    .map(([ano]) => ano)
  if (anosAnterioresPositivos.length === 0) return null

  const anoAnterior = Math.max(...anosAnterioresPositivos)
  const valorAnterior = porAno.get(anoAnterior)!
  if (valorAlvo < valorAnterior * PATRIMONIO_ATIPICO_FATOR) return null

  return {
    anoAnterior,
    valorAnterior,
    anoAlvo: PATRIMONIO_ATIPICO_ANO_ALVO,
    valorAlvo,
    fator: valorAlvo / valorAnterior,
  }
}
