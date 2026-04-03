import type { PontoAtencao } from "./types"

const GRAVITY_ORDER: Record<PontoAtencao["gravidade"], number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
}

type AttentionPointCategoryShape = Pick<PontoAtencao, "categoria">
type AttentionPointGravityShape = Pick<PontoAtencao, "gravidade">
type AttentionPointClassificationShape = Pick<PontoAtencao, "categoria" | "gravidade">

export function isPositiveAttentionPoint<T extends AttentionPointCategoryShape>(ponto: T): boolean {
  return ponto.categoria === "feito_positivo"
}

export function isNegativeCriticalAttentionPoint<T extends AttentionPointClassificationShape>(ponto: T): boolean {
  return !isPositiveAttentionPoint(ponto) && (ponto.gravidade === "critica" || ponto.gravidade === "alta")
}

export function isNegativeHighestSeverityAttentionPoint<T extends AttentionPointClassificationShape>(ponto: T): boolean {
  return !isPositiveAttentionPoint(ponto) && ponto.gravidade === "critica"
}

export function sortAttentionPointsByGravity<T extends AttentionPointGravityShape>(pontos: T[]): T[] {
  return [...pontos].sort((a, b) => {
    return (GRAVITY_ORDER[a.gravidade] ?? 2) - (GRAVITY_ORDER[b.gravidade] ?? 2)
  })
}

export function classifyAttentionPoints<T extends AttentionPointClassificationShape>(pontos: T[]) {
  const pontosPositivos = sortAttentionPointsByGravity(
    pontos.filter((ponto) => isPositiveAttentionPoint(ponto))
  )
  const alertasNaoPositivos = sortAttentionPointsByGravity(
    pontos.filter((ponto) => !isPositiveAttentionPoint(ponto))
  )
  const alertasGraves = alertasNaoPositivos.filter((ponto) => isNegativeCriticalAttentionPoint(ponto))

  return {
    pontosPositivos,
    alertasNaoPositivos,
    alertasGraves,
  }
}
