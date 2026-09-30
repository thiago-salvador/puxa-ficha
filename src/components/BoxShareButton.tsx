"use client"

import { ShareButtons } from "@/components/ShareButtons"
import { SITE_ORIGIN } from "@/lib/metadata"
import type { BoxCardModel, ComparatorBoxCardContext } from "@/lib/box-card-model"

export function BoxShareButton({
  model,
  scope,
}: {
  model: BoxCardModel | null
  scope?: Pick<ComparatorBoxCardContext, "axis" | "uf" | "cargo">
}) {
  if (!model) return null

  const shareUrl = new URL(model.deepLink, SITE_ORIGIN).toString()
  return (
    <ShareButtons
      shareUrl={shareUrl}
      title={model.title}
      label="Compartilhar"
      variant="compact"
      boxCard={model}
      boxCardScope={scope}
    />
  )
}
