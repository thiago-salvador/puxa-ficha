/**
 * Regras de exibição do comparador B v1: N/A nunca vira 0, e MAIOR só entre
 * valores reais. Totais de órgãos distintos não entram aqui.
 */

export const COMPARADOR_NAO_SE_APLICA = "Não se aplica"

export function maiorEntreNumerosReais(
  valor: number | null | undefined,
  todos: ReadonlyArray<number | null | undefined>,
): boolean {
  if (valor == null || !Number.isFinite(valor)) return false
  const reais = todos.filter((item): item is number => item != null && Number.isFinite(item))
  if (reais.length < 2) return false
  const max = Math.max(...reais)
  if (reais.every((item) => item === max)) return false
  return valor === max
}

export function deveMostrarBlocoCongresso(
  selecionados: ReadonlyArray<{
    total_gasto_parlamentar: number | null
    tem_historico_legislativo: boolean
  }>,
): boolean {
  return selecionados.some(
    (candidato) =>
      candidato.total_gasto_parlamentar != null || candidato.tem_historico_legislativo,
  )
}
