"use client"

import { Download, Share2, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

interface SocialCardModalProps {
  slug: string
  candidateName: string
  shareUrl: string
  shareTitle: string
  open: boolean
  onClose: () => void
  initialFormat?: "feed" | "story"
}

export function SocialCardModal({
  open,
  onClose,
  ...props
}: SocialCardModalProps) {
  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return <SocialCardModalContent {...props} onClose={onClose} />
}

function SocialCardModalContent({
  slug,
  candidateName,
  shareUrl,
  shareTitle,
  onClose,
  initialFormat = "feed",
}: Omit<SocialCardModalProps, "open">) {
  const [format, setFormat] = useState<"feed" | "story">(initialFormat)
  const [imageStatus, setImageStatus] = useState({ src: "", loaded: false, error: false })
  const [downloading, setDownloading] = useState(false)
  const [copiedLink, setCopiedLink] = useState<"card" | "profile" | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [previewKey] = useState(() => Date.now())

  const cardPath = `/api/card/${slug}?format=${format}`
  const cardPreviewSrc = `${cardPath}&v=${previewKey}-${retryKey}`
  const cardShareUrl = new URL(cardPath, shareUrl).toString()
  const imgLoaded = imageStatus.src === cardPreviewSrc && imageStatus.loaded
  const imgError = imageStatus.src === cardPreviewSrc && imageStatus.error

  const handleDownload = useCallback(async () => {
    setDownloading(true)
    try {
      const res = await fetch(cardPath)
      if (!res.ok) throw new Error("fetch failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `puxaficha-${slug}-${format}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.open(cardShareUrl, "_blank")
    } finally {
      setDownloading(false)
    }
  }, [cardPath, cardShareUrl, slug, format])

  const copyToClipboard = useCallback(async (value: string, target: "card" | "profile") => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedLink(target)
      setTimeout(() => setCopiedLink((current) => (current === target ? null : current)), 2000)
    } catch {
      setCopiedLink(null)
    }
  }, [])

  const btnBase =
    "rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted"
  const btnActive = "rounded-full border border-foreground bg-foreground px-4 py-2 text-[length:var(--text-caption)] font-semibold text-background transition-colors"
  const previewSize = "min(70vh, 420px)"
  const previewStyle =
    format === "feed"
      ? { width: previewSize, maxWidth: "100%", aspectRatio: "1 / 1" }
      : { height: previewSize, maxWidth: "100%", aspectRatio: "9 / 16" }
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(cardShareUrl)}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${cardShareUrl}`)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gerar card para redes sociais"
        className="relative w-full max-w-[480px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[20px] border border-border/60 bg-card p-5"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-foreground transition-colors hover:bg-muted"
          aria-label="Fechar"
        >
          <X className="size-5" />
        </button>

        {/* Format toggle */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setFormat("feed")}
            className={format === "feed" ? btnActive : btnBase}
          >
            Feed
          </button>
          <button
            type="button"
            onClick={() => setFormat("story")}
            className={format === "story" ? btnActive : btnBase}
          >
            Story
          </button>
        </div>

        {/* Preview area */}
        <div className="flex justify-center">
          <div
            className="relative overflow-hidden rounded-xl bg-muted"
            style={previewStyle}
          >
            {!imgLoaded && !imgError && (
              <div className="absolute inset-0 animate-pulse bg-muted" />
            )}

            {imgError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <p className="text-[length:var(--text-caption)] text-foreground">
                  Não foi possível gerar o card
                </p>
                <button
                  type="button"
                  onClick={() => setRetryKey((k) => k + 1)}
                  className={btnBase}
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- Preview uses a generated card endpoint with dynamic aspect ratio.
              <img
                key={`${format}-${previewKey}-${retryKey}`}
                src={cardPreviewSrc}
                alt={`Card de ${candidateName} para redes sociais`}
                className={`h-full w-full object-contain transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImageStatus({ src: cardPreviewSrc, loaded: true, error: false })}
                onError={() => setImageStatus({ src: cardPreviewSrc, loaded: false, error: true })}
              />
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={btnBase}
          >
            X
          </a>
          <button
            type="button"
            onClick={() => setFormat("story")}
            className={format === "story" ? btnActive : btnBase}
          >
            Instagram
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={btnBase}
          >
            WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void copyToClipboard(cardShareUrl, "card")}
            className={btnBase}
          >
            {copiedLink === "card" ? "Card copiado" : "Card Link"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            className={`${btnBase} inline-flex items-center gap-2 disabled:opacity-50`}
          >
            <Download className="size-4 shrink-0" aria-hidden />
            {downloading ? "Baixando…" : "Baixar imagem"}
          </button>
          <button
            type="button"
            onClick={() => void copyToClipboard(shareUrl, "profile")}
            className={`${btnBase} inline-flex items-center gap-2`}
          >
            <Share2 className="size-4 shrink-0" aria-hidden />
            {copiedLink === "profile" ? "Perfil copiado" : "Compartilhar perfil"}
          </button>
        </div>
      </div>
    </div>
  )
}
