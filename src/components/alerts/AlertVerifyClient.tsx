"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { clearStoredAlertManageToken, writeStoredFollowedCandidateSlugs } from "@/lib/alerts-client"

interface AlertVerifyClientProps {
  initialToken: string | null
}

const GENERIC_VERIFY_ERROR = "Não foi possível validar seu link agora. Tente de novo em alguns minutos."

/**
 * A API responde com `error` em inglês (mantido por compatibilidade) e um código
 * estável em `reason`. A tela nunca mostra o `error` cru: traduz o código para
 * uma frase em português com saída acionável e cai no texto genérico quando o
 * código for desconhecido ou ausente.
 */
const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  link_invalido_ou_expirado:
    "Este link já foi usado ou expirou. Peça um novo email de confirmação na página do candidato.",
  payload_invalido:
    "Não conseguimos identificar seu pedido neste navegador. Abra o link de confirmação no mesmo navegador em que você pediu os alertas, ou peça um novo email na página do candidato.",
  payload_grande:
    "O link de confirmação chegou maior do que o esperado. Copie o endereço direto do email e abra de novo.",
  json_invalido:
    "Houve um erro ao enviar seu pedido. Recarregue esta página e abra o link do email de novo.",
  origem_bloqueada:
    "Por segurança, só aceitamos a confirmação aberta direto do email. Abra o link no seu navegador, sem passar por outro site.",
  falha_ao_confirmar:
    "Nosso sistema não conseguiu registrar a confirmação agora. Tente de novo em alguns minutos.",
}

/**
 * Só o texto desta classe vai para a tela. Erro de rede do próprio `fetch`
 * chega com mensagem em inglês do navegador, então esses caem no genérico.
 */
class VerifyMessageError extends Error {}

function verifyErrorMessage(reason: unknown): string {
  if (typeof reason !== "string") return GENERIC_VERIFY_ERROR
  return VERIFY_ERROR_MESSAGES[reason] ?? GENERIC_VERIFY_ERROR
}

export function AlertVerifyClient({ initialToken }: AlertVerifyClientProps) {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("Validando seu link...")

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!initialToken) {
        if (!cancelled) {
          setStatus("error")
          setMessage("Link incompleto. Abra novamente o email de confirmação.")
        }
        return
      }

      if (typeof window !== "undefined") {
        window.history.replaceState({}, document.title, "/alertas/verificar")
      }

      try {
        const response = await fetch("/api/alerts/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: initialToken }),
        })
        const data = (await response.json().catch(() => null)) as { reason?: string } | null

        if (!response.ok) {
          throw new VerifyMessageError(verifyErrorMessage(data?.reason))
        }

        clearStoredAlertManageToken()

        const meResponse = await fetch("/api/alerts/me", {
          method: "GET",
          cache: "no-store",
        })
        const meData = (await meResponse.json().catch(() => null)) as
          | { ok?: boolean; anonymous?: boolean; subscriptions?: Array<{ slug: string }> }
          | null

        if (meResponse.ok && meData?.ok === true && !meData.anonymous) {
          writeStoredFollowedCandidateSlugs((meData.subscriptions ?? []).map((item) => item.slug))
        }

        if (!cancelled) {
          setStatus("success")
          setMessage("Seu email foi confirmado e este navegador já pode gerenciar os alertas.")
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error")
          setMessage(error instanceof VerifyMessageError ? error.message : GENERIC_VERIFY_ERROR)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [initialToken])

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      {status === "loading" ? (
        <Alert>
          <LoaderCircle className="size-4 animate-spin" />
          <AlertTitle>Confirmando seu email</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : status === "success" ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Email confirmado</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Não foi possível confirmar</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button type="button" size="lg" onClick={() => window.location.assign("/alertas/gerenciar")}>
          Abrir gestão dos alertas
        </Button>
        <Link href="/" className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-foreground">
          Voltar para o site
        </Link>
      </div>
    </div>
  )
}
