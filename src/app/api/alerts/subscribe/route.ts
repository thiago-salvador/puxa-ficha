import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  ALERT_VERIFICATION_EMAIL_COOLDOWN_MS,
  applyAlertsNoStoreHeaders,
  alertBodyStringField,
  buildAlertDeleteDataUrl,
  buildAlertManageAccessEmail,
  buildAlertManageUrl,
  buildAlertVerificationEmail,
  buildAlertVerifyUrl,
  createAlertToken,
  createAlertVerifyExpiryDate,
  createAlertsServiceRoleClient,
  encryptAlertManageToken,
  extractClientIp,
  findPublicCandidateBySlug,
  findSubscriberByEmailHash,
  findSubscriberByManageToken,
  hashAlertEmail,
  hashAlertIp,
  hashAlertToken,
  normalizeAlertEmail,
  normalizeCandidateSlug,
} from "@/lib/alerts"
import { isAlertsEmailFeatureEnabled } from "@/lib/alerts-feature"
import { isAlertSubscribeHoneypotFilled } from "@/lib/alerts-honeypot"
import {
  readAlertManageTokenCookie,
  resolveAlertManageToken,
  setAlertManageTokenCookie,
} from "@/lib/alerts-session"
import { hashTrustedClientIp } from "@/lib/client-ip"
import { rejectCrossSiteAlertsMutation } from "@/lib/alerts-csrf"
import {
  createFixedWindowIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"
import { logAlertsApiExit, logAlertsEvent } from "@/lib/alerts-log"
import { sendTransactionalEmail } from "@/lib/email"
import { isMissingQuotaRpc, readQuotaRpcId, readQuotaRpcStatus } from "@/lib/quota-rpc"
import {
  isRequestBodyTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Chaves de idempotência dos emails do subscribe, no mesmo espírito de
 * `buildDigestIdempotencyKey`: estáveis por envio lógico (assinante mais o
 * token que o email carrega) e únicas entre tipos de email pelo prefixo. O
 * hash do token entra truncado: 32 hex bastam para não colidir e a chave fica
 * longe do limite de 256 caracteres da Resend.
 */
export function buildVerificationIdempotencyKey(subscriberId: string, verifyTokenHash: string): string {
  return `pf-verify:${subscriberId}:${verifyTokenHash.slice(0, 32)}`
}

export function buildManageAccessIdempotencyKey(subscriberId: string, manageTokenHash: string): string {
  return `pf-manage:${subscriberId}:${manageTokenHash.slice(0, 32)}`
}

const MAX_NEW_SUBSCRIBERS_PER_HOUR = 24
const IP_RATE_WINDOW_MS = 3_600_000
const SUBSCRIBE_IP_NAMESPACE = "alerts-subscribe"

/**
 * Teto durável de e-mails disparados por um mesmo cliente na janela de uma hora,
 * contado no banco. Mesmo valor do teto de assinantes novos: o orçamento de
 * e-mail por IP é um só, independente do caminho que pediu o envio.
 */
const MAX_EMAILS_PER_IP_HOUR = 24

/**
 * Teto por IP no processo, aplicado a TODA requisicao de subscribe.
 *
 * O teto de banco (MAX_NEW_SUBSCRIBERS_PER_HOUR) so roda quando o email ainda
 * nao existe, entao o caminho de assinante ja verificado, que dispara email de
 * link de gestao, ficava coberto apenas pelo cooldown de 15 min por assinante:
 * um bot com uma lista de emails validos conseguia um email por endereco sem
 * nunca esbarrar em teto de IP.
 *
 * Este limitador e em memoria do processo, logo e por instancia, e nao
 * substitui o rate limit distribuido na borda. Serve como camada de dentro,
 * barata, que fecha a assimetria entre os dois caminhos.
 */
const subscribeRateLimiter = createFixedWindowIpRateLimiter({
  namespace: SUBSCRIBE_IP_NAMESPACE,
  max: 12,
  windowMs: 10 * 60_000,
})

/**
 * A coluna `last_email_request_ip_hash` chega pela migration
 * `..._alert_subscribers_last_email_request_ip_hash`. Enquanto ela não estiver
 * aplicada, o PostgREST responde coluna desconhecida (`42703` na leitura,
 * `PGRST204` na escrita). Reconhecer essa assinatura é o que permite deploy do
 * código e aplicação da migration em qualquer ordem: sem coluna, o teto durável
 * degrada aberto e o limitador em memória volta a ser a única camada de dentro.
 *
 * Mesma degradação já usada em `src/lib/analytics-launch-store.ts`.
 */
function isMissingEmailIpHashColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false
  if (error.code === "42703" || error.code === "PGRST204") return true
  const message = error.message?.toLowerCase() ?? ""
  return (
    message.includes("last_email_request_ip_hash") &&
    (message.includes("column") || message.includes("schema cache"))
  )
}

let avisouColunaAusente = false

function avisarColunaAusenteUmaVez() {
  if (avisouColunaAusente) return
  avisouColunaAusente = true
  console.error(
    "alerts subscribe: coluna last_email_request_ip_hash ausente, teto durável por IP desligado até a migration ser aplicada",
  )
}

type EmailBudgetResult =
  | { kind: "ok"; reserved: boolean }
  | { kind: "blocked"; response: NextResponse }

/**
 * Reserva a cota de e-mail por IP no banco, carimbando o assinante na mesma
 * transação, antes do envio. Sem a RPC ou sem a coluna, degrada para o COUNT
 * antigo (janela de deploy) e deixa o carimbo para depois do envio.
 */
async function reserveEmailIpBudget(
  supabase: AlertsServiceRoleClient,
  subscriberId: string,
  emailIpHash: string,
  sinceIso: string,
  exceededReason: string,
  deps: Pick<SubscribeDeps, "logAlertsApiExit">,
): Promise<EmailBudgetResult> {
  const sentAt = new Date().toISOString()
  const { data, error } = await supabase.rpc("reserve_alert_email_ip_budget", {
    p_subscriber_id: subscriberId,
    p_email_ip_hash: emailIpHash,
    p_since: sinceIso,
    p_max: MAX_EMAILS_PER_IP_HOUR,
    p_sent_at: sentAt,
  }).abortSignal(supabaseQueryTimeoutSignal())

  if (error) {
    if (isMissingEmailIpHashColumn(error)) {
      avisarColunaAusenteUmaVez()
      return { kind: "ok", reserved: false }
    }
    if (!isMissingQuotaRpc(error, "reserve_alert_email_ip_budget")) {
      deps.logAlertsApiExit("subscribe", 503, "email_ip_rate_check_failed")
      return {
        kind: "blocked",
        response: NextResponse.json({ error: "Rate check failed" }, { status: 503 }),
      }
    }

    const { count, error: countError } = await supabase
      .from("alert_subscribers")
      .select("*", { count: "exact", head: true })
      .abortSignal(supabaseQueryTimeoutSignal())
      .eq("last_email_request_ip_hash", emailIpHash)
      .gte("last_verification_email_sent_at", sinceIso)

    if (countError) {
      if (isMissingEmailIpHashColumn(countError)) {
        avisarColunaAusenteUmaVez()
        return { kind: "ok", reserved: false }
      }
      deps.logAlertsApiExit("subscribe", 503, "email_ip_rate_check_failed")
      return {
        kind: "blocked",
        response: NextResponse.json({ error: "Rate check failed" }, { status: 503 }),
      }
    }

    if ((count ?? 0) >= MAX_EMAILS_PER_IP_HOUR) {
      deps.logAlertsApiExit("subscribe", 429, exceededReason)
      return {
        kind: "blocked",
        response: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
      }
    }

    return { kind: "ok", reserved: false }
  }

  const status = readQuotaRpcStatus(data)
  if (status === "quota_exceeded") {
    deps.logAlertsApiExit("subscribe", 429, exceededReason)
    return {
      kind: "blocked",
      response: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    }
  }
  if (status === "reserved") return { kind: "ok", reserved: true }

  deps.logAlertsApiExit("subscribe", 503, "email_ip_rate_check_failed")
  return {
    kind: "blocked",
    response: NextResponse.json({ error: "Rate check failed" }, { status: 503 }),
  }
}

/**
 * Resposta unica de sucesso, identica nos tres caminhos (assinante novo, ja
 * cadastrado sem verificar, ja verificado) e tambem quando o cooldown segura o
 * envio.
 *
 * Antes, o corpo distinguia `manageLinkSent`, `requiresVerification` e
 * `cooldownActive`, o que transformava o endpoint num oraculo: bastava enviar
 * um email para descobrir se ele ja estava cadastrado e se ja tinha sido
 * verificado. Enumeracao de base de assinantes num site sobre politica nao e
 * dano hipotetico.
 */
function neutralSubscribeResponse(candidateSlug: string) {
  return NextResponse.json({
    ok: true,
    emailSent: true,
    candidateSlug,
  })
}
type AlertsServiceRoleClient = ReturnType<typeof createAlertsServiceRoleClient>

interface SubscribeDeps {
  createAlertsServiceRoleClient: typeof createAlertsServiceRoleClient
  findPublicCandidateBySlug: typeof findPublicCandidateBySlug
  findSubscriberByEmailHash: typeof findSubscriberByEmailHash
  findSubscriberByManageToken: typeof findSubscriberByManageToken
  sendTransactionalEmail: typeof sendTransactionalEmail
  logAlertsApiExit: typeof logAlertsApiExit
  logAlertsEvent: typeof logAlertsEvent
  now: () => Date
}

const defaultSubscribeDeps: SubscribeDeps = {
  createAlertsServiceRoleClient,
  findPublicCandidateBySlug,
  findSubscriberByEmailHash,
  findSubscriberByManageToken,
  sendTransactionalEmail,
  logAlertsApiExit,
  logAlertsEvent,
  now: () => new Date(),
}

function optionalName(body: unknown): string | null {
  const normalized = alertBodyStringField(body, "nome").trim()
  return normalized ? normalized.slice(0, 120) : null
}

async function markVerificationEmailSent(
  supabase: AlertsServiceRoleClient,
  subscriberId: string,
  candidateSlug: string,
  failureEvent: string,
  deps: Pick<SubscribeDeps, "logAlertsEvent">,
  emailIpHash: string,
): Promise<void> {
  const sentAt = new Date().toISOString()

  const avisarFalha = (message: string | undefined) => {
    deps.logAlertsEvent({
      route: "subscribe",
      event: failureEvent,
      level: "warn",
      detail: {
        candidateSlug,
        message: message?.slice(0, 200),
      },
    })
  }

  const { error } = await supabase
    .from("alert_subscribers")
    .update({
      last_verification_email_sent_at: sentAt,
      last_email_request_ip_hash: emailIpHash,
    }).abortSignal(supabaseQueryTimeoutSignal())
    .eq("id", subscriberId)

  if (!error) return

  if (isMissingEmailIpHashColumn(error)) {
    // Sem a coluna ainda, regrava só o carimbo de tempo em vez de perder a
    // escrita inteira: sem `last_verification_email_sent_at` o cooldown de 15
    // min deixaria de existir, e ele é a única barreira que sobra enquanto a
    // migration não é aplicada.
    avisarColunaAusenteUmaVez()
    const { error: retryError } = await supabase
      .from("alert_subscribers")
      .update({ last_verification_email_sent_at: sentAt })
      .abortSignal(supabaseQueryTimeoutSignal())
      .eq("id", subscriberId)

    if (retryError) avisarFalha(retryError.message)
    return
  }

  avisarFalha(error.message)
}

export function createSubscribeHandler(deps: SubscribeDeps = defaultSubscribeDeps) {
  return async function POST(req: NextRequest) {
    const csrfResponse = rejectCrossSiteAlertsMutation(req, "subscribe", deps.logAlertsApiExit)
    if (csrfResponse) return csrfResponse

    const rateLimit = subscribeRateLimiter.check(req.headers)
    if (!rateLimit.allowed) {
      deps.logAlertsApiExit("subscribe", 429, "rate_limit_ip_window")
      return rateLimitExceededResponse(rateLimit)
    }

    let body: unknown
    try {
      body = await readJsonBodyWithLimit(req)
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        deps.logAlertsApiExit("subscribe", 413, "body_too_large")
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
      }
      deps.logAlertsApiExit("subscribe", 400, "invalid_json")
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    if (isAlertSubscribeHoneypotFilled(body)) {
      deps.logAlertsApiExit("subscribe", 204, "honeypot_filled")
      return new NextResponse(null, { status: 204 })
    }

    const email = normalizeAlertEmail(alertBodyStringField(body, "email"))
    const candidateSlug = normalizeCandidateSlug(alertBodyStringField(body, "candidateSlug"))
    const manageToken = resolveAlertManageToken([
      alertBodyStringField(body, "manageToken"),
      readAlertManageTokenCookie(req),
    ])
    const nome = optionalName(body)

    if (!email || !candidateSlug) {
      deps.logAlertsApiExit("subscribe", 400, "invalid_payload")
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const candidate = await deps.findPublicCandidateBySlug(candidateSlug)
    if (!candidate) {
      deps.logAlertsApiExit("subscribe", 404, "candidate_not_found", { candidateSlug })
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
    }

    const emailHash = hashAlertEmail(email)
    const existingSubscriber = await deps.findSubscriberByEmailHash(emailHash)
    const supabase = deps.createAlertsServiceRoleClient()
    const requestTime = deps.now()
    const now = requestTime.getTime()
    const ipHash = hashAlertIp(extractClientIp(req.headers))
    // Hash distinto do `ip_consentimento_hash` de propósito: aquele é registro
    // de consentimento e não pode trocar de fórmula sem invalidar linha antiga;
    // este é balde de rate limit, e o namespace da rota impede correlacionar o
    // mesmo visitante entre superfícies pelo valor gravado.
    const emailIpHash = hashTrustedClientIp(req.headers, SUBSCRIBE_IP_NAMESPACE)
    const ipWindowStartIso = new Date(now - IP_RATE_WINDOW_MS).toISOString()
    const lastVerificationSentAt = existingSubscriber?.last_verification_email_sent_at
      ? new Date(existingSubscriber.last_verification_email_sent_at).getTime()
      : 0
    const cooldownActive =
      Boolean(existingSubscriber) &&
      lastVerificationSentAt > 0 &&
      now - lastVerificationSentAt < ALERT_VERIFICATION_EMAIL_COOLDOWN_MS

    if (existingSubscriber?.verified) {
      if (!manageToken) {
        if (cooldownActive) {
          deps.logAlertsApiExit("subscribe", 200, "verified_manage_link_cooldown", {
            candidateSlug: candidate.slug,
            cooldownActive: true,
          })
          return neutralSubscribeResponse(candidate.slug)
        }

        const budget = await reserveEmailIpBudget(
          supabase,
          existingSubscriber.id,
          emailIpHash,
          ipWindowStartIso,
          "rate_limit_manage_email_ip_hour",
          deps,
        )
        if (budget.kind === "blocked") return budget.response

        const nextManageToken = createAlertToken()
        const manageTokenHash = hashAlertToken(nextManageToken)
        const manageTokenCiphertext = encryptAlertManageToken(nextManageToken)
        // O link de gestao carrega o candidato que a pessoa pediu para seguir.
        // Antes, este ramo mandava o email e ia embora sem criar a inscricao, e
        // a UI promete o contrario: a pessoa abria o link e o candidato nao
        // estava la. Quem efetiva o follow e /alertas/acesso, depois de validar
        // o token contra um assinante real.
        const manageUrl = buildAlertManageUrl(nextManageToken, candidate.slug)
        const deleteDataUrl = buildAlertDeleteDataUrl(nextManageToken)
        const accessEmail = buildAlertManageAccessEmail({
          candidateName: candidate.nome_urna,
          manageUrl,
          deleteDataUrl,
        })

        const { error: updateError } = await supabase
          .from("alert_subscribers")
          .update({
            manage_token_hash: manageTokenHash,
            manage_token_ciphertext: manageTokenCiphertext,
          }).abortSignal(supabaseQueryTimeoutSignal())
          .eq("id", existingSubscriber.id)

        if (updateError) {
          deps.logAlertsApiExit("subscribe", 503, "db_refresh_manage_access_failed")
          return NextResponse.json({ error: "Could not refresh manage access" }, { status: 503 })
        }

        try {
          await deps.sendTransactionalEmail({
            to: email,
            subject: accessEmail.subject,
            text: accessEmail.text,
            html: accessEmail.html,
            // Mesma proteção do digest: se a Resend aceitar e o fetch estourar o
            // prazo, uma nova tentativa com este token não vira segundo email.
            idempotencyKey: buildManageAccessIdempotencyKey(existingSubscriber.id, manageTokenHash),
          })
        } catch {
          deps.logAlertsApiExit("subscribe", 503, "manage_access_email_failed")
          return NextResponse.json(
            { error: "Não foi possível enviar o link de gestão agora." },
            { status: 503 },
          )
        }

        if (!budget.reserved) {
          await markVerificationEmailSent(
            supabase,
            existingSubscriber.id,
            candidate.slug,
            "manage_access_sent_timestamp_update_failed",
            deps,
            emailIpHash,
          )
        }

        deps.logAlertsApiExit("subscribe", 200, "verified_manage_link_sent", {
          candidateSlug: candidate.slug,
        })
        return neutralSubscribeResponse(candidate.slug)
      }

      const authorizedSubscriber = await deps.findSubscriberByManageToken(manageToken)
      if (!authorizedSubscriber || authorizedSubscriber.id !== existingSubscriber.id) {
        deps.logAlertsApiExit("subscribe", 403, "invalid_manage_token_verified_flow")
        return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
      }

      const { error: upsertError } = await supabase.from("alert_subscriptions").upsert(
        {
          subscriber_id: existingSubscriber.id,
          candidato_id: candidate.id,
        },
        { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
      ).abortSignal(supabaseQueryTimeoutSignal())

      if (upsertError) {
        deps.logAlertsApiExit("subscribe", 503, "db_upsert_subscription_failed_verified")
        return NextResponse.json({ error: "Could not update subscription" }, { status: 503 })
      }

      deps.logAlertsApiExit("subscribe", 200, "verified_following", { candidateSlug: candidate.slug })
      return setAlertManageTokenCookie(
        NextResponse.json({
          ok: true,
          verified: true,
          following: true,
          candidateSlug: candidate.slug,
        }),
        manageToken,
      )
    }

    let emailBudgetReserved = false

    if (existingSubscriber && cooldownActive) {
      const { error: subscriptionError } = await supabase.from("alert_subscriptions").upsert(
        {
          subscriber_id: existingSubscriber.id,
          candidato_id: candidate.id,
        },
        { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
      ).abortSignal(supabaseQueryTimeoutSignal())

      if (subscriptionError) {
        deps.logAlertsApiExit("subscribe", 503, "db_pending_subscription_cooldown_failed")
        return NextResponse.json({ error: "Could not save pending subscription" }, { status: 503 })
      }

      deps.logAlertsApiExit("subscribe", 200, "requires_verification_cooldown", {
        candidateSlug: candidate.slug,
      })
      return neutralSubscribeResponse(candidate.slug)
    }

    if (existingSubscriber) {
      // Assinante que já existe não passa pelo teto de assinantes novos, então
      // sem esta checagem o reenvio do e-mail de confirmação ficaria só com o
      // cooldown por endereço.
      const budget = await reserveEmailIpBudget(
        supabase,
        existingSubscriber.id,
        emailIpHash,
        ipWindowStartIso,
        "rate_limit_verification_email_ip_hour",
        deps,
      )
      if (budget.kind === "blocked") return budget.response
      emailBudgetReserved = budget.reserved
    }

    const verifyToken = createAlertToken()
    const nextManageToken = createAlertToken()
    const verifyTokenHash = hashAlertToken(verifyToken)
    const manageTokenHash = hashAlertToken(nextManageToken)
    const manageTokenCiphertext = encryptAlertManageToken(nextManageToken)
    const verifyExpiresAt = createAlertVerifyExpiryDate(requestTime).toISOString()

    let subscriberId = existingSubscriber?.id ?? null

    if (existingSubscriber) {
      const { error: updateError } = await supabase
        .from("alert_subscribers")
        .update({
          email,
          nome,
          verify_token_hash: verifyTokenHash,
          verify_token_expires_at: verifyExpiresAt,
          manage_token_hash: manageTokenHash,
          manage_token_ciphertext: manageTokenCiphertext,
          ip_consentimento_hash: ipHash,
        }).abortSignal(supabaseQueryTimeoutSignal())
        .eq("id", existingSubscriber.id)

      if (updateError) {
        deps.logAlertsApiExit("subscribe", 503, "db_update_subscriber_failed")
        return NextResponse.json({ error: "Could not update subscriber" }, { status: 503 })
      }

      subscriberId = existingSubscriber.id
    } else {
      const { data: inserted, error: insertError } = await supabase.rpc(
        "insert_alert_subscriber_under_ip_quota",
        {
          p_email: email,
          p_email_hash: emailHash,
          p_nome: nome,
          p_verify_token_hash: verifyTokenHash,
          p_verify_token_expires_at: verifyExpiresAt,
          p_manage_token_hash: manageTokenHash,
          p_manage_token_ciphertext: manageTokenCiphertext,
          p_ip_consentimento_hash: ipHash,
          p_since: ipWindowStartIso,
          p_max: MAX_NEW_SUBSCRIBERS_PER_HOUR,
        },
      ).abortSignal(supabaseQueryTimeoutSignal())

      if (insertError) {
        if (isMissingQuotaRpc(insertError, "insert_alert_subscriber_under_ip_quota")) {
          const { count, error: countError } = await supabase
            .from("alert_subscribers")
            .select("*", { count: "exact", head: true })
            .abortSignal(supabaseQueryTimeoutSignal())
            .eq("ip_consentimento_hash", ipHash)
            .gte("created_at", ipWindowStartIso)

          if (countError) {
            deps.logAlertsApiExit("subscribe", 503, "rate_check_failed")
            return NextResponse.json({ error: "Rate check failed" }, { status: 503 })
          }

          if ((count ?? 0) >= MAX_NEW_SUBSCRIBERS_PER_HOUR) {
            deps.logAlertsApiExit("subscribe", 429, "rate_limit_new_subscribers_hour")
            return NextResponse.json({ error: "Too many requests" }, { status: 429 })
          }

          const { data: insertedSubscriber, error: legacyInsertError } = await supabase
            .from("alert_subscribers")
            .insert({
              email,
              email_hash: emailHash,
              nome,
              verify_token_hash: verifyTokenHash,
              verify_token_expires_at: verifyExpiresAt,
              manage_token_hash: manageTokenHash,
              manage_token_ciphertext: manageTokenCiphertext,
              ip_consentimento_hash: ipHash,
            }).abortSignal(supabaseQueryTimeoutSignal())
            .select("id")
            .single()

          if (legacyInsertError || !insertedSubscriber) {
            deps.logAlertsApiExit("subscribe", 503, "db_insert_subscriber_failed")
            return NextResponse.json({ error: "Could not create subscriber" }, { status: 503 })
          }

          subscriberId = insertedSubscriber.id
        } else {
          deps.logAlertsApiExit("subscribe", 503, "db_insert_subscriber_failed")
          return NextResponse.json({ error: "Could not create subscriber" }, { status: 503 })
        }
      } else {
        const status = readQuotaRpcStatus(inserted)
        if (status === "quota_exceeded") {
          deps.logAlertsApiExit("subscribe", 429, "rate_limit_new_subscribers_hour")
          return NextResponse.json({ error: "Too many requests" }, { status: 429 })
        }
        const insertedId = readQuotaRpcId(inserted)
        if (status !== "inserted" || !insertedId) {
          deps.logAlertsApiExit("subscribe", 503, "db_insert_subscriber_failed")
          return NextResponse.json({ error: "Could not create subscriber" }, { status: 503 })
        }
        subscriberId = insertedId
      }
    }

    if (!subscriberId) {
      deps.logAlertsApiExit("subscribe", 503, "subscriber_id_missing_after_upsert")
      return NextResponse.json({ error: "Could not create subscriber" }, { status: 503 })
    }

    const { error: subscriptionError } = await supabase.from("alert_subscriptions").upsert(
      {
        subscriber_id: subscriberId,
        candidato_id: candidate.id,
      },
      { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
    ).abortSignal(supabaseQueryTimeoutSignal())

    if (subscriptionError) {
      deps.logAlertsApiExit("subscribe", 503, "db_create_subscription_failed")
      return NextResponse.json({ error: "Could not create subscription" }, { status: 503 })
    }

    const verifyUrl = buildAlertVerifyUrl(verifyToken, nextManageToken)
    const manageUrl = buildAlertManageUrl(nextManageToken)
    const deleteDataUrl = buildAlertDeleteDataUrl(nextManageToken)
    const emailPayload = buildAlertVerificationEmail({
      candidateName: candidate.nome_urna,
      verifyUrl,
      manageUrl,
      deleteDataUrl,
    })

    try {
      await deps.sendTransactionalEmail({
        to: email,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
        idempotencyKey: buildVerificationIdempotencyKey(subscriberId, verifyTokenHash),
      })
    } catch {
      deps.logAlertsApiExit("subscribe", 503, "verification_email_send_failed")
      return NextResponse.json(
        { error: "Não foi possível enviar o e-mail de confirmação agora." },
        { status: 503 },
      )
    }

    if (!emailBudgetReserved) {
      await markVerificationEmailSent(
        supabase,
        subscriberId,
        candidate.slug,
        "verification_email_sent_timestamp_update_failed",
        deps,
        emailIpHash,
      )
    }

    deps.logAlertsApiExit("subscribe", 200, "requires_verification_email_sent", {
      candidateSlug: candidate.slug,
    })
    return neutralSubscribeResponse(candidate.slug)
  }
}

const subscribeHandler = createSubscribeHandler()

export async function POST(req: NextRequest) {
  if (!isAlertsEmailFeatureEnabled()) {
    return applyAlertsNoStoreHeaders(
      NextResponse.json({ error: "Alerts email feature disabled" }, { status: 503 }),
    )
  }
  return subscribeHandler(req)
}
