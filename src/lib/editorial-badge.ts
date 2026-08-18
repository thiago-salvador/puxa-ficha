import type { PontoAtencao } from "@/lib/types"

/** Seis estados editoriais distintos na UI pública (ver testes de contrato). */
export type EditorialBadgeKind =
  | "curadoria_verified"
  | "curadoria_pending"
  | "ia_verified"
  | "ia_pending"
  | "automatico_verified"
  | "automatico_pending"

export const EDITORIAL_BADGE_LABELS: Record<EditorialBadgeKind, string> = {
  curadoria_verified: "Verificado por curadoria",
  curadoria_pending: "Curadoria · aguardando verificação",
  ia_verified: "IA verificada por curadoria",
  ia_pending: "IA · aguardando revisão",
  automatico_verified: "Gerado automaticamente · verificado por curadoria",
  automatico_pending: "Gerado automaticamente · aguardando revisão",
}

export function resolveEditorialBadgeKind(
  geradoPor: PontoAtencao["gerado_por"],
  verificado: boolean,
): EditorialBadgeKind {
  if (geradoPor === "curadoria" && verificado) return "curadoria_verified"
  if (geradoPor === "curadoria") return "curadoria_pending"
  if (geradoPor === "ia" && verificado) return "ia_verified"
  if (geradoPor === "ia") return "ia_pending"
  if (geradoPor === "automatico" && verificado) return "automatico_verified"
  return "automatico_pending"
}
