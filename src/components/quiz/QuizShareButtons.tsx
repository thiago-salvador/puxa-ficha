"use client"

import { useCallback, useState } from "react"

interface QuizShareButtonsProps {
  shareUrl: string
  title?: string
}

export function QuizShareButtons({ shareUrl, title = "Meu resultado no quiz Puxa Ficha" }: QuizShareButtonsProps) {
  const [copied, setCopied] = useState(false)

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
      /* user cancel */
    }
  }, [shareUrl, title])

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(`${title} ${shareUrl}`)}`

  if (!shareUrl) return null

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">Compartilhar resultado</p>
      <div className="flex flex-wrap gap-2">
        {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
          <button
            type="button"
            onClick={() => void nativeShare()}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            Compartilhar
          </button>
        ) : null}
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          Postar no X
        </a>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          {copied ? "Copiado" : "Copiar link"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">O link leva suas respostas codificadas; nada é salvo no servidor.</p>
    </div>
  )
}
