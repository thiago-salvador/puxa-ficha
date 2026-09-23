import { COMPARADOR_EIXO_DEFAULT, type ComparadorEixo } from "@/lib/comparador-axis"

const COMPARADOR_KEYS = ["c1", "c2", "c3", "c4", "eixo", "cargo", "uf"] as const

/** Atualiza só os parâmetros do comparador, preservando filtros da página. */
export function mergeComparadorQueryString(
  currentSearch: string,
  selectedSlugs: string[],
  eixo: ComparadorEixo,
  scope: { cargo: string; uf: string } | null,
): string {
  const params = new URLSearchParams(currentSearch)
  for (const key of COMPARADOR_KEYS) params.delete(key)
  if (selectedSlugs.length === 0) return params.toString()

  selectedSlugs.slice(0, 4).forEach((slug, index) => params.set(`c${index + 1}`, slug))
  if (eixo !== COMPARADOR_EIXO_DEFAULT) params.set("eixo", eixo)
  if (scope) {
    params.set("cargo", scope.cargo)
    params.set("uf", scope.uf)
  }
  return params.toString()
}
