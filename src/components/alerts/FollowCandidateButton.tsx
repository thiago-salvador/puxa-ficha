"use client"

import Link from "next/link"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Bell, BellRing, LoaderCircle, Mail } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  clearStoredAlertManageToken,
  clearStoredAlertState,
  setStoredCandidateFollowState,
  writeStoredFollowedCandidateSlugs,
} from "@/lib/alerts-client"
import { ALERT_SUBSCRIBE_HONEYPOT_FIELD } from "@/lib/alerts-shared"

const ALERTS_EMAIL_ENABLED = process.env.NEXT_PUBLIC_ALERTS_EMAIL_ENABLED === "true"

interface FollowCandidateButtonProps {
  candidateName: string
  candidateSlug: string
  variant?: "card" | "compact"
}

interface ApiResponse {
  error?: string
  /** Só o toggle informa estado; o subscribe responde neutro por desenho. */
  following?: boolean
}

export function FollowCandidateButton({
  candidateName,
  candidateSlug,
  variant = "card",
}: FollowCandidateButtonProps) {
  const [email, setEmail] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(ALERTS_EMAIL_ENABLED)
  const [following, setFollowing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "default" | "destructive"; title: string; description: string } | null>(null)

  useEffect(() => {
    if (!ALERTS_EMAIL_ENABLED) {
      return
    }

    let cancelled = false

    async function loadSession() {
      setSessionLoading(true)

      const response = await fetch("/api/alerts/me", {
        method: "GET",
        cache: "no-store",
      })
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; anonymous?: boolean; subscriptions?: Array<{ slug: string }> }
        | null

      if (cancelled) return

      if (!response.ok) {
        clearStoredAlertManageToken()
        setHasSession(false)
        setFollowing(false)
        setSessionLoading(false)
        return
      }

      if (data?.ok === false || data?.anonymous) {
        setHasSession(false)
        setFollowing(false)
        setSessionLoading(false)
        return
      }

      const slugs = (data?.subscriptions ?? []).map((item) => item.slug)
      clearStoredAlertManageToken()
      writeStoredFollowedCandidateSlugs(slugs)
      setHasSession(true)
      setFollowing(slugs.includes(candidateSlug))
      setSessionLoading(false)
    }

    void loadSession().catch(() => {
      if (cancelled) return
      clearStoredAlertManageToken()
      setHasSession(false)
      setFollowing(false)
      setSessionLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [candidateSlug])

  const helperText = useMemo(() => {
    if (sessionLoading) return "Estamos verificando se este navegador já tem acesso salvo."
    if (hasSession && following) return "Você já recebe alertas por email sobre esta ficha."
    if (hasSession) return "Seu acesso já está salvo neste navegador."
    return "Sem login. Você só precisa confirmar o email uma vez."
  }, [following, hasSession, sessionLoading])

  if (!ALERTS_EMAIL_ENABLED) {
    if (variant === "compact") return null

    return (
      <div className="mt-5 max-w-xl rounded-[18px] border border-border/60 bg-card/80 p-4 sm:mt-6 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
          Alertas da ficha
        </p>
        <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-foreground sm:text-[length:var(--text-body)]">
          Alertas por email estão em validação operacional e ficam indisponíveis até o envio real
          ser comprovado em caixa de teste.
        </p>
      </div>
    )
  }

  async function clearBrowserSession() {
    await fetch("/api/alerts/session", { method: "DELETE" }).catch(() => null)
    clearStoredAlertState()
    setHasSession(false)
    setFollowing(false)
  }

  async function handleToggleFollow() {
    if (sessionLoading) return
    if (!hasSession) {
      setExpanded(true)
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      const response = await fetch("/api/alerts/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateSlug }),
      })
      const data = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || typeof data?.following !== "boolean") {
        if (response.status === 403) {
          await clearBrowserSession()
          setExpanded(true)
          setFeedback({
            tone: "destructive",
            title: "Acesso expirado neste navegador",
            description: "Peça um novo link de gestão pelo email para continuar acompanhando esta ficha.",
          })
          return
        }

        throw new Error(data?.error || "Não foi possível atualizar o acompanhamento agora.")
      }

      setHasSession(true)
      setFollowing(data.following)
      setStoredCandidateFollowState(candidateSlug, data.following)
      setFeedback({
        tone: "default",
        title: data.following ? "Alerta ativado" : "Alerta pausado",
        description: data.following
          ? `Você vai receber um resumo por email quando houver atualização relevante sobre ${candidateName}.`
          : `Você parou de acompanhar ${candidateName} nesta ficha.`,
      })
    } catch (error) {
      setFeedback({
        tone: "destructive",
        title: "Falha ao atualizar o alerta",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)

    try {
      const honeypot = String(
        new FormData(event.currentTarget).get(ALERT_SUBSCRIBE_HONEYPOT_FIELD) ?? "",
      )
      const response = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          candidateSlug,
          [ALERT_SUBSCRIBE_HONEYPOT_FIELD]: honeypot,
        }),
      })
      const data = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível iniciar o alerta agora.")
      }

      // Mensagem única de propósito: o endpoint responde igual para email novo,
      // já cadastrado e já verificado, senão bastaria enviar um endereço para
      // descobrir se ele está na base. O texto cobre os três casos sem mentir.
      setFeedback({
        tone: "default",
        title: "Verifique seu email",
        description: `Se este endereço puder receber alertas, enviamos um link para concluir o acompanhamento de ${candidateName}. Confira também o spam, e o email mais recente caso já tenha pedido há pouco.`,
      })
    } catch (error) {
      setFeedback({
        tone: "destructive",
        title: "Não foi possível ativar o alerta",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const toggleButton = (
    <Button
      type="button"
      variant={following ? "outline" : "default"}
      size="lg"
      onClick={handleToggleFollow}
      disabled={sessionLoading || submitting}
      className={variant === "compact" ? "rounded-full px-4" : "w-full sm:w-auto"}
    >
      {sessionLoading || submitting ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : following ? (
        <BellRing className="size-4" />
      ) : (
        <Bell className="size-4" />
      )}
      {following ? "Seguindo por email" : variant === "compact" ? "Seguir candidato" : "Receber alertas"}
    </Button>
  )

  const subscribeForm = !hasSession && !sessionLoading && (expanded || Boolean(feedback)) && (
    <form
      onSubmit={handleSubscribe}
      className={variant === "compact"
        ? "basis-full mt-1 flex flex-col gap-2"
        : "mt-4 flex flex-col gap-2"}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="alert-subscribe-website">
          Website
        </label>
        <input
          id="alert-subscribe-website"
          type="text"
          name={ALERT_SUBSCRIBE_HONEYPOT_FIELD}
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          defaultValue=""
          className="sr-only"
        />
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-label="Seu email para receber alertas"
          placeholder="seuemail@exemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-10"
        />
        <Button type="submit" size="lg" disabled={submitting || email.trim().length === 0} className="w-full sm:w-auto">
          {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
          Confirmar por email
        </Button>
      </div>
      <p className="text-[length:var(--text-caption)] text-muted-foreground">
        Ao confirmar, você concorda em receber alertas por email sobre este candidato. Usamos seu
        email só para isso e você pode apagar quando quiser. Veja a{" "}
        <Link
          href="/privacidade"
          className="text-foreground underline decoration-border underline-offset-4"
        >
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  )

  const manageLink = hasSession && (
    <div
      className={variant === "compact"
        ? "basis-full mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground"
        : "mt-4 flex flex-col gap-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between"}
    >
      <span>Você pode revisar ou apagar seus alertas quando quiser.</span>
      <Link
        href="/alertas/gerenciar"
        className={variant === "compact"
          ? "ml-1 text-foreground underline decoration-border underline-offset-4"
          : "text-foreground underline decoration-border underline-offset-4"}
      >
        Gerenciar alertas
      </Link>
    </div>
  )

  const feedbackAlert = feedback && (
    <Alert
      variant={feedback.tone === "destructive" ? "destructive" : "default"}
      className={variant === "compact" ? "basis-full mt-1" : "mt-4"}
    >
      <AlertTitle>{feedback.title}</AlertTitle>
      <AlertDescription>{feedback.description}</AlertDescription>
    </Alert>
  )

  if (variant === "compact") {
    return (
      <>
        {toggleButton}
        {subscribeForm}
        {manageLink}
        {feedbackAlert}
      </>
    )
  }

  return (
    <div className="mt-5 max-w-xl rounded-[18px] border border-border/60 bg-card/80 p-4 sm:mt-6 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
            Alertas da ficha
          </p>
          <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-foreground sm:text-[length:var(--text-body)]">
            {helperText}
          </p>
        </div>

        {toggleButton}
      </div>

      {subscribeForm}
      {manageLink}
      {feedbackAlert}
    </div>
  )
}
