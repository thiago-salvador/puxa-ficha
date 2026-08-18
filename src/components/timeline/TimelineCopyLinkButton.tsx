"use client"

import { Check, Link2 } from "lucide-react"
import { useState } from "react"
import { SITE_ORIGIN } from "@/lib/metadata"

export interface TimelineCopyLinkButtonProps {
  slug: string
}

/** URL canonica com OG dedicada (`/candidato/{slug}/timeline`). */
export function TimelineCopyLinkButton({ slug }: TimelineCopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)
  const url = `${SITE_ORIGIN}/candidato/${slug}/timeline`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-[length:var(--text-caption)] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-foreground/30"
    >
      {copied ? (
        <Check className="size-3.5 shrink-0 text-green-600" aria-hidden />
      ) : (
        <Link2 className="size-3.5 shrink-0" aria-hidden />
      )}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  )
}
