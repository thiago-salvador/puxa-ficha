import { MetaBadge, type MetaBadgeTone } from "./MetaBadge"
import { formatGravityLabel } from "@/lib/ui-labels"

const GRAVITY_TONES: Record<string, MetaBadgeTone> = {
  critica: "critical",
  alta: "caution",
  media: "muted",
  baixa: "neutral",
}

export function GravityBadge({ gravidade, className = "" }: { gravidade: string; className?: string }) {
  const tone = GRAVITY_TONES[gravidade] ?? GRAVITY_TONES.media
  return (
    <MetaBadge tone={tone} className={className}>
      {formatGravityLabel(gravidade)}
    </MetaBadge>
  )
}
