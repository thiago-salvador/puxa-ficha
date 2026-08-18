import type { PontoAtencao } from "@/lib/types"
import {
  EDITORIAL_BADGE_LABELS,
  type EditorialBadgeKind,
  resolveEditorialBadgeKind,
} from "@/lib/editorial-badge"
import { MetaBadge } from "@/components/MetaBadge"

export type EditorialBadgeSurface = "default" | "onDark"

const SURFACE_TONES: Record<
  EditorialBadgeKind,
  Record<EditorialBadgeSurface, "neutral" | "muted" | "caution" | "positive">
> = {
  curadoria_verified: {
    default: "neutral",
    onDark: "neutral",
  },
  curadoria_pending: {
    default: "muted",
    onDark: "muted",
  },
  ia_verified: {
    default: "neutral",
    onDark: "neutral",
  },
  ia_pending: {
    default: "caution",
    onDark: "caution",
  },
  automatico_verified: {
    default: "positive",
    onDark: "positive",
  },
  automatico_pending: {
    default: "caution",
    onDark: "caution",
  },
}

export function EditorialBadge({
  geradoPor,
  verificado,
  surface = "default",
}: {
  geradoPor: PontoAtencao["gerado_por"]
  verificado: boolean
  surface?: EditorialBadgeSurface
}) {
  const kind = resolveEditorialBadgeKind(geradoPor, verificado)
  const tone = SURFACE_TONES[kind][surface]

  return (
    <MetaBadge
      tone={tone}
      surface={surface}
      data-pf-editorial-badge=""
      data-pf-editorial-kind={kind}
      data-pf-editorial-label={EDITORIAL_BADGE_LABELS[kind]}
      data-pf-curation-verified={verificado ? "true" : "false"}
    >
      {EDITORIAL_BADGE_LABELS[kind]}
    </MetaBadge>
  )
}
