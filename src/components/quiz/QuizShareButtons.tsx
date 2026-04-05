"use client"

import { useCallback, useState } from "react"

interface QuizShareButtonsProps {
  shareUrl: string
  title?: string
}

export function QuizShareButtons({ shareUrl, title = "Meu resultado no quiz Puxa Ficha" }: QuizShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const [shortCopied, setShortCopied] = useState(false)
  const [shortBusy, setShortBusy] = useState(false)
  const [shortError, setShortError] = useState<string | null>(null)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [shareUrl])

  const copyShortLink = useCallback(async () => {
    setShortError(null)
    setShortBusy(true)
    try {
      const qs =
        typeof window !== "undefined"
          ? `${window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search}`
          : ""
      const res = await fetch("/api/quiz/short-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryString: qs }),
      })
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!res.ok || !data?.url) {
        setShortError(data?.error === "Too many requests" ? "Limite de links por hora. Tente mais tarde." : "Link curto indisponível.")
        return
      }
      await navigator.clipboard.writeText(data.url)
      setShortCopied(true)
      setTimeout(() => setShortCopied(false), 2000)
    } catch {
      setShortError("Não foi possível gerar o link curto.")
    } finally {
      setShortBusy(false)
    }
  }, [])

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
        <button
          type="button"
          onClick={() => void copyShortLink()}
          disabled={shortBusy}
          className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {shortBusy ? "Gerando…" : shortCopied ? "Link curto copiado" : "Link curto"}
        </button>
      </div>
      {shortError ? <p className="text-xs text-destructive">{shortError}</p> : null}
      <p className="text-xs text-muted-foreground">
        O link completo só codifica suas respostas no próprio URL. O link curto grava um redirecionamento no servidor (IP
        agregado para limite de abuso); veja a metodologia.
      </p>
    </div>
  )
}
