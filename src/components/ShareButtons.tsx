"use client"

import { useCallback, useEffect, useState } from "react"

interface ShareButtonsProps {
  shareUrl: string
  title: string
  label?: string
}

export function ShareButtons({
  shareUrl,
  title,
  label = "Compartilhar",
}: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function")
  }, [])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [shareUrl])

  const nativeShare = useCallback(async () => {
    if (!navigator.share) return
    try {
      await navigator.share({ title, text: title, url: shareUrl })
    } catch {
      return
    }
  }, [shareUrl, title])

  if (!shareUrl) return null

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${title} ${shareUrl}`)}`

  return (
    <div className="rounded-[20px] border border-border/60 bg-card p-4 sm:p-5">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canNativeShare ? (
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Compartilhar
          </button>
        ) : null}
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Postar no X
        </a>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted"
        >
          {copied ? "Copiado" : "Copiar link"}
        </button>
      </div>
    </div>
  )
}
