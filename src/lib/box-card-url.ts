import type { BoxCardKind, BoxCardModel } from "@/lib/box-card-model"

export type BoxCardFormat = "feed" | "story"

export function buildBoxCardUrl(
  model: Pick<BoxCardModel, "kind" | "key" | "revision">,
  format: BoxCardFormat,
  scope: { axis?: "patrimonio" | "gastos"; uf?: string; cargo?: string } = {},
): string {
  const kind: BoxCardKind = model.kind
  const params = new URLSearchParams({ format, v: model.revision })
  if (kind === "comparador") {
    if (scope.axis) params.set("eixo", scope.axis)
    if (scope.uf) params.set("uf", scope.uf)
    if (scope.cargo) params.set("cargo", scope.cargo)
  }
  return `/api/card/box/${kind}/${encodeURIComponent(model.key)}?${params.toString()}`
}
