"use client"

import { ImageIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { SocialCardModal } from "@/components/SocialCardModal"

interface ShareButtonsProps {
  shareUrl: string
  title: string
  label?: string
  variant?: "card" | "compact"
  /** Slug do candidato — quando presente, exibe o botão "Gerar card" */
  slug?: string
  /** Nome do candidato para alt text do card */
  candidateName?: string
}

export function ShareButtons({
  shareUrl,
  title,
  label = "Compartilhar",
  variant = "card",
  slug,
  candidateName,
}: ShareButtonsProps) {
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Native share capability is only knowable after hydration.
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
  const btnClass =
    "rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted"

  if (variant === "compact") {
    return (
      <>
        {slug && (
          <button
            type="button"
            onClick={() => setCardModalOpen(true)}
            className={`${btnClass} inline-flex items-center gap-2`}
          >
            <ImageIcon className="size-4 shrink-0" aria-hidden />
            {label}
          </button>
        )}

        {slug && (
          <SocialCardModal
            slug={slug}
            candidateName={candidateName ?? slug}
            shareUrl={shareUrl}
            shareTitle={title}
            open={cardModalOpen}
            onClose={() => setCardModalOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <div className="rounded-[20px] border border-border/60 bg-card p-4 sm:p-5">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {slug && (
          <button
            type="button"
            onClick={() => setCardModalOpen(true)}
            className={`${btnClass} inline-flex items-center gap-2`}
            aria-label="Gerar card para redes sociais"
          >
            <ImageIcon className="size-4 shrink-0" aria-hidden />
            Gerar card
          </button>
        )}
        {canNativeShare ? (
          <button
            type="button"
            onClick={() => void nativeShare()}
            className={btnClass}
          >
            Compartilhar
          </button>
        ) : null}
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass}
        >
          Postar no X
        </a>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass}
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className={btnClass}
        >
          {copied ? "Copiado" : "Copiar link"}
        </button>
      </div>

      {slug && (
        <SocialCardModal
          slug={slug}
          candidateName={candidateName ?? slug}
          shareUrl={shareUrl}
          shareTitle={title}
          open={cardModalOpen}
          onClose={() => setCardModalOpen(false)}
        />
      )}
    </div>
  )
}
