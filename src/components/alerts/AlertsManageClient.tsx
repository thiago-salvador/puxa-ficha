"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { LoaderCircle, Mail, Trash2, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  clearStoredAlertState,
  readStoredAlertManageToken,
  setStoredCandidateFollowState,
  writeStoredAlertManageToken,
  writeStoredFollowedCandidateSlugs,
} from "@/lib/alerts-client"

interface AlertsManageClientProps {
  initialToken: string | null
}

interface SubscriptionItem {
  id: string
  slug: string
  nome_urna: string
  partido_sigla: string
  cargo_disputado: string
}

interface LoadState {
  emailMasked: string
  canalEmail: boolean
  verified: boolean
  lastDigestSentAt: string | null
}

function formatDateTime(value: string | null): string {
  if (!value) return "Nenhum envio ainda"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Nenhum envio ainda"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export function AlertsManageClient({ initialToken }: AlertsManageClientProps) {
  const [manageToken, setManageToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submittingSlug, setSubmittingSlug] = useState<string | null>(null)
  const [cancellingAll, setCancellingAll] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscriber, setSubscriber] = useState<LoadState | null>(null)
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([])

  const syncSubscriptions = useCallback((items: SubscriptionItem[]) => {
    setSubscriptions(items)
    writeStoredFollowedCandidateSlugs(items.map((item) => item.slug))
  }, [])

  const load = useCallback(async (token: string) => {
    setLoading(true)
    setError(null)

    const response = await fetch(`/api/alerts/me?token=${encodeURIComponent(token)}`, { cache: "no-store" })
    const data = (await response.json().catch(() => null)) as
      | {
          error?: string
          subscriber?: LoadState
          subscriptions?: SubscriptionItem[]
        }
      | null

    if (!response.ok || !data?.subscriber) {
      throw new Error(data?.error || "Não foi possível carregar sua gestão de alertas.")
    }

    setSubscriber(data.subscriber)
    syncSubscriptions(data.subscriptions ?? [])
    setLoading(false)
  }, [syncSubscriptions])

  useEffect(() => {
    const token = initialToken || readStoredAlertManageToken()
    if (!token) {
      setManageToken(null)
      setLoading(false)
      return
    }

    writeStoredAlertManageToken(token)
    setManageToken(token)

    if (typeof window !== "undefined" && initialToken) {
      window.history.replaceState({}, document.title, "/alertas/gerenciar")
    }

    void load(token).catch((cause) => {
      clearStoredAlertState()
      setManageToken(null)
      setLoading(false)
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar sua gestão de alertas.")
    })
  }, [initialToken, load])

  const summaryText = useMemo(() => {
    if (!subscriber) return null
    return subscriber.lastDigestSentAt
      ? `Último digest enviado em ${formatDateTime(subscriber.lastDigestSentAt)}.`
      : "Seu primeiro digest será enviado quando houver atualização relevante nas fichas acompanhadas."
  }, [subscriber])

  function handleForgetBrowser() {
    clearStoredAlertState()
    setManageToken(null)
    setSubscriber(null)
    setSubscriptions([])
    setError(null)
  }

  async function handleUnfollow(candidateSlug: string) {
    if (!manageToken) return
    setSubmittingSlug(candidateSlug)
    setError(null)

    try {
      const response = await fetch("/api/alerts/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manageToken, candidateSlug }),
      })
      const data = (await response.json().catch(() => null)) as { error?: string; following?: boolean } | null

      if (!response.ok || data?.following !== false) {
        throw new Error(data?.error || "Não foi possível remover este alerta agora.")
      }

      const next = subscriptions.filter((item) => item.slug !== candidateSlug)
      syncSubscriptions(next)
      setStoredCandidateFollowState(candidateSlug, false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover este alerta agora.")
    } finally {
      setSubmittingSlug(null)
    }
  }

  async function handleDeleteData() {
    if (!manageToken || deleting) return
    if (!window.confirm("Isso vai apagar seu cadastro de alertas e todas as assinaturas. Deseja continuar?")) {
      return
    }

    setDeleting(true)
    setError(null)

    try {
      const response = await fetch("/api/alerts/delete-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manageToken }),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível apagar seus dados agora.")
      }

      clearStoredAlertState()
      setManageToken(null)
      setSubscriber(null)
      setSubscriptions([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível apagar seus dados agora.")
    } finally {
      setDeleting(false)
    }
  }

  async function handleCancelAll() {
    if (!manageToken || cancellingAll) return
    if (!window.confirm("Isso vai cancelar todos os alertas ativos, mas manter seu cadastro para reativação futura. Deseja continuar?")) {
      return
    }

    setCancellingAll(true)
    setError(null)

    try {
      const response = await fetch("/api/alerts/unsubscribe-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manageToken }),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível cancelar todos os alertas agora.")
      }

      syncSubscriptions([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cancelar todos os alertas agora.")
    } finally {
      setCancellingAll(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <Alert>
          <LoaderCircle className="size-4 animate-spin" />
          <AlertTitle>Carregando seus alertas</AlertTitle>
          <AlertDescription>Estamos validando o acesso deste navegador.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!manageToken || !subscriber) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <Alert variant={error ? "destructive" : "default"}>
          <TriangleAlert className="size-4" />
          <AlertTitle>{error ? "Acesso indisponível" : "Abra o link enviado por email"}</AlertTitle>
          <AlertDescription>
            {error || "Para gerenciar seus alertas, use o link de gestão que o Puxa Ficha envia por email."}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="rounded-[20px] border border-border/60 bg-card p-5 sm:p-6">
        <div id="cancelar-tudo" className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
              Gestão dos alertas
            </p>
            <h1 className="mt-1 font-heading text-3xl uppercase leading-none text-foreground sm:text-4xl">
              Seus acompanhamentos
            </h1>
            <p className="mt-3 flex items-center gap-2 text-[length:var(--text-body-sm)] font-medium text-foreground">
              <Mail className="size-4 text-muted-foreground" />
              {subscriber.emailMasked}
            </p>
            <p className="mt-2 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
              {summaryText}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <Button type="button" variant="outline" size="lg" onClick={handleForgetBrowser}>
              Esquecer este navegador
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={handleCancelAll} disabled={cancellingAll || subscriptions.length === 0}>
              {cancellingAll ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Cancelar todos os alertas
            </Button>
            <Button type="button" variant="destructive" size="lg" onClick={handleDeleteData} disabled={deleting}>
              {deleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Apagar meus dados
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-5">
            <TriangleAlert className="size-4" />
            <AlertTitle>Não foi possível concluir uma ação</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 grid gap-3">
          {subscriptions.length > 0 ? (
            subscriptions.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-[18px] border border-border/60 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[length:var(--text-body)] font-semibold text-foreground">{item.nome_urna}</p>
                  <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                    {item.partido_sigla} · {item.cargo_disputado}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={submittingSlug === item.slug}
                  onClick={() => handleUnfollow(item.slug)}
                >
                  {submittingSlug === item.slug ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Parar de acompanhar
                </Button>
              </div>
            ))
          ) : (
            <Alert>
              <Mail className="size-4" />
              <AlertTitle>Nenhuma ficha acompanhada</AlertTitle>
              <AlertDescription>
                Você pode voltar a qualquer candidato e ativar um novo alerta por email.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  )
}
