import type { ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"

export type MetaBadgeTone = "neutral" | "muted" | "caution" | "positive" | "critical"
type MetaBadgeSurface = "default" | "onDark"

const META_BADGE_TONES: Record<MetaBadgeSurface, Record<MetaBadgeTone, string>> = {
  default: {
    neutral: "border-border/70 bg-background text-foreground",
    muted: "border-border/60 bg-secondary/55 text-muted-foreground",
    caution: "border-amber-400/55 bg-amber-50/40 text-amber-900",
    positive: "border-emerald-500/45 bg-emerald-50/35 text-emerald-900",
    critical: "border-red-400/55 bg-red-50/40 text-red-900",
  },
  onDark: {
    neutral: "border-white/20 bg-white/10 text-white",
    muted: "border-white/15 bg-white/5 text-white/80",
    caution: "border-amber-300/40 bg-amber-400/10 text-amber-50",
    positive: "border-emerald-300/40 bg-emerald-400/10 text-emerald-50",
    critical: "border-red-300/40 bg-red-400/10 text-red-50",
  },
}

interface MetaBadgeProps extends ComponentPropsWithoutRef<"span"> {
  tone?: MetaBadgeTone
  surface?: MetaBadgeSurface
}

export function MetaBadge({
  tone = "neutral",
  surface = "default",
  className,
  children,
  ...props
}: MetaBadgeProps) {
  return (
    <span
      data-pf-meta-badge=""
      data-pf-meta-tone={tone}
      className={cn(
        "inline-flex min-h-[28px] items-center rounded-full border px-2.5 py-1 text-[length:var(--text-caption)] font-bold uppercase leading-tight tracking-[0.05em]",
        META_BADGE_TONES[surface][tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
