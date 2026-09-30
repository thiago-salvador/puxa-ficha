"use client"

import { Download, ImageIcon, Share2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { socialCardVersionToken } from "@/lib/social-card-version"
import { buildBoxCardUrl } from "@/lib/box-card-url"
import type { BoxCardModel, ComparatorBoxCardContext } from "@/lib/box-card-model"
import type { FaseEleitoral2026 } from "@/lib/types"

function subscribeToPortalReady() {
  return () => {}
}

function getPortalReadySnapshot() {
  return typeof document !== "undefined"
}

function getPortalReadyServerSnapshot() {
  return false
}

interface SocialCardModalProps {
  slug?: string
  candidateName?: string
  shareUrl: string
  shareTitle: string
  open: boolean
  onClose: () => void
  initialFormat?: "feed" | "story"
  /** `ultima_atualizacao` da ficha: muda a URL do card quando a ficha muda. */
  cardVersion?: string | null
  faseEleitoral?: FaseEleitoral2026 | null
  boxCard?: BoxCardModel
  boxCardScope?: Pick<ComparatorBoxCardContext, "axis" | "uf" | "cargo">
}

export function SocialCardModal({
  open,
  onClose,
  boxCard,
  boxCardScope,
  ...props
}: SocialCardModalProps) {
  const portalReady = useSyncExternalStore(
    subscribeToPortalReady,
    getPortalReadySnapshot,
    getPortalReadyServerSnapshot,
  )
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) {
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
      return
    }
    if (!portalReady) return

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialogRef.current?.querySelector<HTMLElement>("[data-pf-modal-initial-focus]")?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab") return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [open, portalReady])

  if (!open) return null

  const content = <SocialCardModalContent {...props} boxCard={boxCard} boxCardScope={boxCardScope} dialogRef={dialogRef} onClose={onClose} />
  return portalReady ? createPortal(content, document.body) : content
}

function SocialCardModalContent({
  slug,
  candidateName,
  shareUrl,
  shareTitle,
  onClose,
  initialFormat = "feed",
  cardVersion,
  faseEleitoral,
  boxCard,
  boxCardScope,
  dialogRef,
}: Omit<SocialCardModalProps, "open"> & { dialogRef: React.RefObject<HTMLDivElement | null> }) {
  const [format, setFormat] = useState<"feed" | "story">(initialFormat)
  const [imageStatus, setImageStatus] = useState({ src: "", loaded: false, error: false })
  const [downloading, setDownloading] = useState(false)
  const [copiedLink, setCopiedLink] = useState<"card" | "profile" | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const cardPath = boxCard
    ? buildBoxCardUrl(boxCard, format, boxCardScope)
    : `/api/card/${slug}?format=${format}&v=${socialCardVersionToken(cardVersion, faseEleitoral)}`
  const cardPreviewSrc = retryKey > 0 ? `${cardPath}&retry=${retryKey}` : cardPath
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
      a.download = `puxaficha-${slug ?? boxCard?.kind ?? "card"}-${format}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.open(cardShareUrl, "_blank")
    } finally {
      setDownloading(false)
    }
  }, [cardPath, cardShareUrl, slug, boxCard, format])

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
    "inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted"
  const btnActive = "inline-flex min-h-11 items-center justify-center rounded-full border border-foreground bg-foreground px-4 py-2 text-[length:var(--text-caption)] font-semibold text-background transition-colors"
  const previewSize = "min(70vh, 420px)"
  const previewStyle =
    boxCard && format === "feed"
      ? { width: `calc(${previewSize} * 0.8)`, maxWidth: "100%", aspectRatio: "4 / 5" }
      : format === "feed"
        ? { width: previewSize, maxWidth: "100%", aspectRatio: "1 / 1" }
      : { height: previewSize, maxWidth: "100%", aspectRatio: "9 / 16" }
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(cardShareUrl)}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${cardShareUrl}`)}`

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Gerar card para redes sociais"
        tabIndex={-1}
        className="relative w-full max-w-[480px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[20px] border border-border/60 bg-card p-5"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          aria-label="Fechar"
          data-pf-modal-initial-focus
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
              <div role="status" aria-live="polite" aria-busy="true" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted px-4 text-center">
                <ImageIcon className="size-8 text-muted-foreground motion-safe:animate-pulse" aria-hidden="true" />
                <span className="text-sm font-semibold text-foreground">Gerando prévia...</span>
                <span className="text-xs text-muted-foreground">Isso pode levar alguns segundos.</span>
              </div>
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
                key={`${format}-${retryKey}`}
                src={cardPreviewSrc}
                alt={`Card de ${candidateName ?? boxCard?.title ?? slug ?? "compartilhamento"} para redes sociais`}
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
            {boxCard
              ? copiedLink === "profile"
                ? "Link do box copiado"
                : "Copiar link do box"
              : copiedLink === "profile"
                ? "Perfil copiado"
                : "Compartilhar perfil"}
          </button>
        </div>
      </div>
    </div>
  )
}
