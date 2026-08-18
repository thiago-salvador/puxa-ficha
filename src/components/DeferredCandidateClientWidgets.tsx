"use client"

import { Bell, ImageIcon } from "lucide-react"
import { useEffect, useState, type ComponentType } from "react"
import { Button } from "@/components/ui/button"

type ShareButtonsProps = {
  shareUrl: string
  title: string
  label?: string
  variant?: "card" | "compact"
  slug?: string
  candidateName?: string
}

type FollowCandidateButtonProps = {
  candidateName: string
  candidateSlug: string
  variant?: "card" | "compact"
}

type RecordVisitProps = {
  href: string
  title: string
  subtitle: string
  foto_url?: string | null
}

const MOBILE_DEFER_TIMEOUT_MS = 7000

const ALERTS_EMAIL_ENABLED = process.env.NEXT_PUBLIC_ALERTS_EMAIL_ENABLED === "true"

// Mesmas classes do botão pill do ShareButtons real: o placeholder precisa ter o
// tamanho exato do conteúdo final, senão a troca pós-hidratação causa layout shift
// (e um pill vazio visível por até 7s no mobile enquanto o defer segura o load).
const pillButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground"

function useDeferredClientWidgetLoad() {
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    if (!window.matchMedia("(max-width: 640px)").matches) {
      const frame = window.requestAnimationFrame(() => setShouldLoad(true))
      return () => window.cancelAnimationFrame(frame)
    }

    const timeout = window.setTimeout(() => setShouldLoad(true), MOBILE_DEFER_TIMEOUT_MS)
    const onIntent = () => setShouldLoad(true)
    window.addEventListener("scroll", onIntent, { once: true, passive: true })
    window.addEventListener("pointerdown", onIntent, { once: true, passive: true })
    window.addEventListener("keydown", onIntent, { once: true })
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener("scroll", onIntent)
      window.removeEventListener("pointerdown", onIntent)
      window.removeEventListener("keydown", onIntent)
    }
  }, [])

  return shouldLoad
}

export function DeferredShareButtons(props: ShareButtonsProps) {
  const shouldLoad = useDeferredClientWidgetLoad()
  const [ShareButtons, setShareButtons] = useState<ComponentType<ShareButtonsProps> | null>(null)

  useEffect(() => {
    if (!shouldLoad || ShareButtons) return
    let active = true
    void import("@/components/ShareButtons").then((mod) => {
      if (active) setShareButtons(() => mod.ShareButtons)
    })
    return () => {
      active = false
    }
  }, [ShareButtons, shouldLoad])

  if (ShareButtons) return <ShareButtons {...props} />

  // Placeholder com o mesmo markup visível do componente real (inerte até a
  // hidratação): nunca aparece como pill vazio nem muda de tamanho na troca.
  if (props.variant === "compact") {
    if (!props.slug) return null
    return (
      <span aria-hidden="true" className={pillButtonClass}>
        <ImageIcon className="size-4 shrink-0" />
        {props.label ?? "Compartilhar"}
      </span>
    )
  }

  return (
    <div aria-hidden="true" className="rounded-[20px] border border-border/60 bg-card p-4 sm:p-5">
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
        {props.label ?? "Compartilhar"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.slug && (
          <span className={pillButtonClass}>
            <ImageIcon className="size-4 shrink-0" />
            Gerar card
          </span>
        )}
        <span className={pillButtonClass}>Postar no X</span>
        <span className={pillButtonClass}>WhatsApp</span>
        <span className={pillButtonClass}>Copiar link</span>
      </div>
    </div>
  )
}

export function DeferredFollowCandidateButton(props: FollowCandidateButtonProps) {
  const shouldLoad = useDeferredClientWidgetLoad()
  const [FollowCandidateButton, setFollowCandidateButton] =
    useState<ComponentType<FollowCandidateButtonProps> | null>(null)

  useEffect(() => {
    if (!shouldLoad || FollowCandidateButton || !ALERTS_EMAIL_ENABLED) return
    let active = true
    void import("@/components/alerts/FollowCandidateButton").then((mod) => {
      if (active) setFollowCandidateButton(() => mod.FollowCandidateButton)
    })
    return () => {
      active = false
    }
  }, [FollowCandidateButton, shouldLoad])

  // Espelha o componente real com a flag desligada: no compact (único uso deferido
  // hoje, no header da ficha) ele não renderiza nada, então o placeholder também não
  // pode renderizar, senão vira um pill vazio que some depois e desloca o conteúdo.
  // O variant card usa FollowCandidateButton direto, sem passar por aqui.
  if (!ALERTS_EMAIL_ENABLED) return null

  if (FollowCandidateButton) return <FollowCandidateButton {...props} />

  // Mesmo markup do estado inicial do botão real (sessionLoading desabilita o
  // botão do mesmo jeito), garantindo tamanho idêntico antes e depois da troca.
  return (
    <Button
      type="button"
      size="lg"
      disabled
      aria-hidden="true"
      tabIndex={-1}
      className={props.variant === "compact" ? "rounded-full px-4" : "w-full sm:w-auto"}
    >
      <Bell className="size-4" />
      {props.variant === "compact" ? "Seguir candidato" : "Receber alertas"}
    </Button>
  )
}

export function DeferredRecordGlobalSearchRecentVisit({
  href,
  title,
  subtitle,
  foto_url,
}: RecordVisitProps) {
  const shouldLoad = useDeferredClientWidgetLoad()

  useEffect(() => {
    if (!shouldLoad) return
    let active = true
    void import("@/lib/global-search-recents").then((mod) => {
      if (!active) return
      mod.recordRecentCandidateVisit({ href, title, subtitle, foto_url })
    })
    return () => {
      active = false
    }
  }, [foto_url, href, shouldLoad, subtitle, title])

  return null
}
