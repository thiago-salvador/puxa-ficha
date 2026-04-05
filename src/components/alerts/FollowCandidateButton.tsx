"use client"

import Link from "next/link"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Bell, BellRing, LoaderCircle, Mail } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  clearStoredAlertState,
  readStoredAlertManageToken,
  readStoredFollowedCandidateSlugs,
  setStoredCandidateFollowState,
} from "@/lib/alerts-client"

interface FollowCandidateButtonProps {
  candidateName: string
  candidateSlug: string
}

interface ApiResponse {
  error?: string
  requiresVerification?: boolean
  manageLinkSent?: boolean
  cooldownActive?: boolean
  following?: boolean
}

export function FollowCandidateButton({ candidateName, candidateSlug }: FollowCandidateButtonProps) {
  const [email, setEmail] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [manageToken, setManageToken] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "default" | "destructive"; title: string; description: string } | null>(null)

  useEffect(() => {
    const storedToken = readStoredAlertManageToken()
    setManageToken(storedToken)
    if (storedToken) {
      setFollowing(readStoredFollowedCandidateSlugs().includes(candidateSlug))
    }
  }, [candidateSlug])

  const helperText = useMemo(() => {
    if (manageToken && following) return "Você já recebe alertas por email sobre esta ficha."
    if (manageToken) return "Seu acesso já está salvo neste navegador."
    return "Sem login. Você só precisa confirmar o email uma vez."
  }, [following, manageToken])

  async function handleToggleFollow() {
    if (!manageToken) {
      setExpanded(true)
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      const response = await fetch("/api/alerts/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manageToken, candidateSlug }),
      })
      const data = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok || typeof data?.following !== "boolean") {
        if (response.status === 403) {
          clearStoredAlertState()
          setManageToken(null)
          setFollowing(false)
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
      const response = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, candidateSlug }),
      })
      const data = (await response.json().catch(() => null)) as ApiResponse | null

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível iniciar o alerta agora.")
      }

      if (data?.manageLinkSent) {
        setFeedback({
          tone: "default",
          title: data.cooldownActive ? "Link já enviado há pouco" : "Novo link enviado",
          description: data.cooldownActive
            ? "Confira o email mais recente que já mandamos com o link de gestão deste navegador."
            : "Te mandamos por email um novo link para gerenciar seus alertas neste navegador.",
        })
      } else {
        setFeedback({
          tone: "default",
          title: data?.cooldownActive ? "Confirmação já enviada há pouco" : "Confirme seu email",
          description: data?.cooldownActive
            ? `Confira o email mais recente para concluir o acompanhamento de ${candidateName}.`
            : `Enviamos um link para você confirmar o acompanhamento de ${candidateName}.`,
        })
      }
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

        <Button
          type="button"
          variant={following ? "outline" : "default"}
          size="lg"
          onClick={handleToggleFollow}
          disabled={submitting}
          className="w-full sm:w-auto"
        >
          {submitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : following ? (
            <BellRing className="size-4" />
          ) : (
            <Bell className="size-4" />
          )}
          {following ? "Seguindo por email" : "Receber alertas"}
        </Button>
      </div>

      {!manageToken && (expanded || Boolean(feedback)) && (
        <form onSubmit={handleSubscribe} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
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
        </form>
      )}

      {manageToken && (
        <div className="mt-4 flex flex-col gap-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Você pode revisar ou apagar seus alertas quando quiser.</span>
          <Link href="/alertas/gerenciar" className="text-foreground underline decoration-border underline-offset-4">
            Gerenciar alertas
          </Link>
        </div>
      )}

      {feedback && (
        <Alert variant={feedback.tone === "destructive" ? "destructive" : "default"} className="mt-4">
          <AlertTitle>{feedback.title}</AlertTitle>
          <AlertDescription>{feedback.description}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
