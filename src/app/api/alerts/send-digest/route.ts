import type { NextRequest } from "next/server"
import { after, NextResponse } from "next/server"
import {
  buildAlertOneClickUnsubscribeUrl,
  buildAlertManageUrl,
  buildAlertUnsubscribeUrl,
  createAlertsServiceRoleClient,
  decryptAlertManageToken,
} from "@/lib/alerts"
import {
  buildAlertDigestEmail,
  type AlertDigestEmailCandidate,
} from "@/lib/alerts-shared"
import { logAlertsApiExit, logAlertsEvent } from "@/lib/alerts-log"
import { resolveChainOrigin, validarOrigemEncadeamento } from "@/lib/cron-chain-origin"
import { secretsMatch } from "@/lib/crypto-utils"
import { sendTransactionalEmail } from "@/lib/email"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { formatCargoDisputadoPublicLabel } from "@/lib/ui-labels"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const DEFAULT_BATCH_LIMIT = 25
const MAX_BATCH_LIMIT = 50
const MAX_DIGEST_CHAIN_DEPTH = 20
const CHAIN_FETCH_ATTEMPTS = 2
const CHAIN_FETCH_RETRY_DELAY_MS = 3000
const CHAIN_FETCH_TIMEOUT_MS = 15_000
const DIGEST_TIME_ZONE = "America/Sao_Paulo"
type AfterResponseCallback = () => Promise<void> | void

interface SendDigestDeps {
  createAlertsServiceRoleClient: typeof createAlertsServiceRoleClient
  sendTransactionalEmail: typeof sendTransactionalEmail
  logAlertsApiExit: typeof logAlertsApiExit
  logAlertsEvent: typeof logAlertsEvent
  afterResponse: (callback: AfterResponseCallback) => void
  fetchImpl: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => Date
}

const defaultSendDigestDeps: SendDigestDeps = {
  createAlertsServiceRoleClient,
  sendTransactionalEmail,
  logAlertsApiExit,
  logAlertsEvent,
  afterResponse: after,
  fetchImpl: fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
}

interface DigestSubscriberRow {
  id: string
  email: string
  nome: string | null
  verified_at: string | null
  last_digest_sent_at: string | null
  manage_token_ciphertext: string
  created_at: string
}

interface CandidateChangeRow {
  id: string
  candidato_id: string
  titulo: string
  descricao: string | null
  created_at: string
}

type DatabaseWriteError = { message?: string } | null | undefined

function getCronSecret(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization")?.trim()
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim()
  }
  return null
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

function formatDigestDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DIGEST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function formatDatabaseWriteError(step: string, error: DatabaseWriteError): string {
  const message = typeof error?.message === "string" && error.message.trim().length > 0
    ? error.message.trim()
    : "unknown database write error"
  return `${step}: ${message}`.slice(0, 500)
}

export function createSendDigestHandler(deps: SendDigestDeps = defaultSendDigestDeps) {
  return async function POST(req: NextRequest) {
    const expectedSecret = process.env.CRON_SECRET?.trim()
    const providedSecret = getCronSecret(req)

    if (!secretsMatch(providedSecret, expectedSecret)) {
      deps.logAlertsApiExit("send-digest", 401, "unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const cursor = parsePositiveInt(req.nextUrl.searchParams.get("cursor"), 0)
    const requestedLimit = parsePositiveInt(req.nextUrl.searchParams.get("limit"), DEFAULT_BATCH_LIMIT)
    const limit = Math.max(1, Math.min(MAX_BATCH_LIMIT, requestedLimit || DEFAULT_BATCH_LIMIT))
    const chainDepth = parsePositiveInt(req.nextUrl.searchParams.get("depth"), 0)
    const shouldChain = req.nextUrl.searchParams.get("chain") !== "0" && chainDepth < MAX_DIGEST_CHAIN_DEPTH
    const runStartedAt = deps.now().toISOString()
    const digestDate = formatDigestDate(new Date(runStartedAt))

    const supabase = deps.createAlertsServiceRoleClient()
    const { data: subscribers, error: subscribersError, count } = await supabase
      .from("alert_subscribers")
      .select(
        "id, email, nome, verified_at, last_digest_sent_at, manage_token_ciphertext, created_at",
        { count: "exact" },
      )
      .eq("verified", true)
      .eq("canal_email", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(cursor, cursor + limit - 1)

    if (subscribersError) {
      deps.logAlertsApiExit("send-digest", 503, "db_subscribers_query_failed")
      return NextResponse.json({ error: "Could not load subscribers" }, { status: 503 })
    }

    deps.logAlertsEvent({
      route: "send-digest",
      event: "batch_start",
      detail: {
        cursor,
        limit,
        digestDate,
        batchSize: subscribers?.length ?? 0,
        totalSubscribers: count ?? null,
      },
    })

    let processed = 0
    let sent = 0
    let failed = 0
    let skipped = 0
    let enviadosSemRegistro = 0

    for (const subscriber of (subscribers ?? []) as DigestSubscriberRow[]) {
      processed += 1

      const { data: existingLog, error: existingLogError } = await supabase
        .from("notification_log")
        .select("id, status")
        .eq("subscriber_id", subscriber.id)
        .eq("canal", "email")
        .eq("digest_date", digestDate)
        .maybeSingle()

      if (existingLogError) {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_step_failed",
          level: "warn",
          detail: { subscriberId: subscriber.id, step: "notification_log_query" },
        })
        failed += 1
        continue
      }

      if (existingLog?.status === "sent") {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_skipped",
          detail: { subscriberId: subscriber.id, reason: "already_sent_today" },
        })
        skipped += 1
        continue
      }

      const { data: subscriptionRows, error: subscriptionsError } = await supabase
        .from("alert_subscriptions")
        .select("candidato_id")
        .eq("subscriber_id", subscriber.id)

      if (subscriptionsError) {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_step_failed",
          level: "warn",
          detail: { subscriberId: subscriber.id, step: "subscriptions_query" },
        })
        failed += 1
        continue
      }

      const candidateIds = Array.from(
        new Set((subscriptionRows ?? []).map((row) => row.candidato_id).filter(Boolean)),
      )

      if (candidateIds.length === 0) {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_skipped",
          detail: { subscriberId: subscriber.id, reason: "no_subscriptions" },
        })
        skipped += 1
        continue
      }

      const { data: candidateRows, error: candidatesError } = await supabase
        .from("candidatos_publico")
        .select("id, slug, nome_urna, partido_sigla, cargo_disputado")
        .in("id", candidateIds)

      if (candidatesError) {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_step_failed",
          level: "warn",
          detail: { subscriberId: subscriber.id, step: "candidates_publico_query" },
        })
        failed += 1
        continue
      }

      const candidateMap = new Map((candidateRows ?? []).map((row) => [row.id, row]))
      const windowStart = subscriber.last_digest_sent_at || subscriber.verified_at || subscriber.created_at

      const { data: changeRows, error: changesError } = await supabase
        .from("candidate_changes")
        .select("id, candidato_id, titulo, descricao, created_at")
        .in("candidato_id", candidateIds)
        .gt("created_at", windowStart)
        .lte("created_at", runStartedAt)
        .order("created_at", { ascending: false })
        .limit(40)

      if (changesError) {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_step_failed",
          level: "warn",
          detail: { subscriberId: subscriber.id, step: "candidate_changes_query" },
        })
        failed += 1
        continue
      }

      if (!changeRows || changeRows.length === 0) {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_skipped",
          detail: { subscriberId: subscriber.id, reason: "no_changes_in_window" },
        })
        skipped += 1
        continue
      }

      const grouped: AlertDigestEmailCandidate[] = []

      for (const candidateId of candidateIds) {
        const candidate = candidateMap.get(candidateId)
        if (!candidate) continue

        const changes = (changeRows as CandidateChangeRow[])
          .filter((row) => row.candidato_id === candidateId)
          .map((row) => ({ title: row.titulo, description: row.descricao ?? null }))

        if (changes.length === 0) continue

        const partyLabel = formatPartyPublicLabel(candidate.partido_sigla)
        // O valor interno de cargo_disputado inclui o token "Nenhum", que
        // vazava literal no email de digest. Passar pelo formatador publico
        // e a mesma regra da ficha (auditoria 2026-07-24, etapa 2C).
        const cargoLabel = formatCargoDisputadoPublicLabel(candidate.cargo_disputado)
        grouped.push({
          candidateName: candidate.nome_urna,
          candidateMeta: [partyLabel || null, cargoLabel || null].filter(Boolean).join(" · "),
          changes,
        })
      }

      if (grouped.length === 0) {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_skipped",
          detail: { subscriberId: subscriber.id, reason: "no_grouped_changes" },
        })
        skipped += 1
        continue
      }

      let manageToken: string
      let manageUrl: string
      let unsubscribeUrl: string
      let oneClickUnsubscribeUrl: string
      let emailPayload: ReturnType<typeof buildAlertDigestEmail>
      try {
        // decryptAlertManageToken lanca em ciphertext corrompido / chave rotacionada.
        // Sem este catch, uma unica linha ruim 500-ava o handler inteiro e, como a
        // ordem por created_at e deterministica, todos os assinantes seguintes
        // ficavam permanentemente sem digest (review 2026-06-09).
        manageToken = decryptAlertManageToken(subscriber.manage_token_ciphertext)
        manageUrl = buildAlertManageUrl(manageToken)
        unsubscribeUrl = buildAlertUnsubscribeUrl(manageToken)
        oneClickUnsubscribeUrl = buildAlertOneClickUnsubscribeUrl(manageToken)
        emailPayload = buildAlertDigestEmail({
          items: grouped,
          manageUrl,
          unsubscribeUrl,
        })
      } catch {
        deps.logAlertsEvent({
          route: "send-digest",
          event: "subscriber_step_failed",
          level: "warn",
          detail: { subscriberId: subscriber.id, step: "manage_token_decrypt" },
        })
        failed += 1
        continue
      }

      let logId = existingLog?.id ?? null

      if (logId) {
        const { error: pendingLogError } = await supabase
          .from("notification_log")
          .update({
            status: "pending",
            error_message: null,
            candidato_ids: candidateIds,
            change_ids: (changeRows as CandidateChangeRow[]).map((row) => row.id),
          })
          .eq("id", logId)

        if (pendingLogError) {
          deps.logAlertsEvent({
            route: "send-digest",
            event: "subscriber_step_failed",
            level: "warn",
            detail: { subscriberId: subscriber.id, step: "notification_log_pending_update" },
          })
          failed += 1
          continue
        }
      } else {
        const { data: insertedLog, error: insertLogError } = await supabase
          .from("notification_log")
          .insert({
            subscriber_id: subscriber.id,
            canal: "email",
            digest_date: digestDate,
            status: "pending",
            candidato_ids: candidateIds,
            change_ids: (changeRows as CandidateChangeRow[]).map((row) => row.id),
          })
          .select("id")
          .single()

        if (insertLogError || !insertedLog) {
          deps.logAlertsEvent({
            route: "send-digest",
            event: "subscriber_step_failed",
            level: "warn",
            detail: { subscriberId: subscriber.id, step: "notification_log_insert" },
          })
          failed += 1
          continue
        }

        logId = insertedLog.id
      }

      // Divide o try em dois estados: antes e depois de o email existir no mundo.
      // Tudo que der errado DEPOIS disto e problema de registro, nao de envio, e
      // registro perdido nunca pode virar reenvio.
      let emailEnviado = false

      try {
        await deps.sendTransactionalEmail({
          to: subscriber.email,
          subject: emailPayload.subject,
          text: emailPayload.text,
          html: emailPayload.html,
          headers: {
            "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        })
        emailEnviado = true

        const { error: sentLogError } = await supabase
          .from("notification_log")
          .update({
            status: "sent",
            error_message: null,
            sent_at: runStartedAt,
          })
          .eq("id", logId)

        if (sentLogError) {
          throw new Error(formatDatabaseWriteError("notification_log_sent_update", sentLogError))
        }

        const { error: subscriberDigestUpdateError } = await supabase
          .from("alert_subscribers")
          .update({ last_digest_sent_at: runStartedAt })
          .eq("id", subscriber.id)

        if (subscriberDigestUpdateError) {
          const errMsg = formatDatabaseWriteError(
            "alert_subscriber_digest_update",
            subscriberDigestUpdateError,
          )
          deps.logAlertsEvent({
            route: "send-digest",
            event: "subscriber_step_failed",
            level: "warn",
            detail: {
              subscriberId: subscriber.id,
              step: "alert_subscriber_digest_update",
              errorMessage: errMsg,
            },
          })
          const { error: logPartialError } = await supabase
            .from("notification_log")
            .update({ error_message: errMsg })
            .eq("id", logId)

          if (logPartialError) {
            deps.logAlertsEvent({
              route: "send-digest",
              event: "subscriber_step_failed",
              level: "warn",
              detail: { subscriberId: subscriber.id, step: "notification_log_partial_update" },
            })
          }
          failed += 1
          continue
        }

        deps.logAlertsEvent({
          route: "send-digest",
          event: "digest_email_sent",
          detail: { subscriberId: subscriber.id, changeCount: (changeRows as CandidateChangeRow[]).length },
        })
        sent += 1
      } catch (error) {
        const errMsg = error instanceof Error ? error.message.slice(0, 500) : "Unknown error"

        // O email SAIU e so o registro falhou.
        //
        // Marcar 'failed' aqui era o defeito: 'failed' nao e 'sent', entao a
        // proxima execucao do mesmo dia passava direto pela guarda
        // `existingLog?.status === "sent"` e MANDAVA O DIGEST DE NOVO, com o
        // mesmo conteudo, para quem ja tinha recebido. A falha era de escrita no
        // banco, e o preco era pago na caixa de entrada do assinante.
        //
        // Nao ha status novo a gravar: `notification_log.status` tem CHECK em
        // ('pending','sent','failed','skipped'), e de todo jeito a escrita que
        // acabou de falhar e a mesma que precisariamos para corrigir. Entao a
        // linha fica como esta (tipicamente 'pending') e o que impede o reenvio
        // e avancar a janela do assinante: com `last_digest_sent_at` no instante
        // desta execucao, as mudancas ja enviadas saem do recorte
        // `created_at > windowStart` e a proxima execucao classifica como
        // "no_changes_in_window" em vez de reenviar.
        //
        // Risco residual, assumido e nomeado: se ESTA escrita tambem falhar, o
        // reenvio volta a ser possivel. Nesse ponto o banco esta inacessivel
        // para escrita e nao ha o que fazer de dentro do request; o que se
        // ganha e que o caso sai em log de erro e leva a resposta a 500.
        if (emailEnviado) {
          deps.logAlertsEvent({
            route: "send-digest",
            event: "digest_enviado_sem_registro",
            level: "error",
            detail: { subscriberId: subscriber.id, errorMessage: errMsg },
          })

          const { error: janelaError } = await supabase
            .from("alert_subscribers")
            .update({ last_digest_sent_at: runStartedAt })
            .eq("id", subscriber.id)

          if (janelaError) {
            deps.logAlertsEvent({
              route: "send-digest",
              event: "subscriber_step_failed",
              level: "error",
              detail: {
                subscriberId: subscriber.id,
                step: "alert_subscriber_digest_update_pos_envio",
                errorMessage: formatDatabaseWriteError(
                  "alert_subscriber_digest_update_pos_envio",
                  janelaError,
                ),
              },
            })
          }

          enviadosSemRegistro += 1
          continue
        }

        deps.logAlertsEvent({
          route: "send-digest",
          event: "digest_email_failed",
          level: "error",
          detail: { subscriberId: subscriber.id, errorMessage: errMsg },
        })
        const { error: failedLogError } = await supabase
          .from("notification_log")
          .update({
            status: "failed",
            error_message: errMsg,
          })
          .eq("id", logId)

        if (failedLogError) {
          deps.logAlertsEvent({
            route: "send-digest",
            event: "subscriber_step_failed",
            level: "warn",
            detail: { subscriberId: subscriber.id, step: "notification_log_failed_update" },
          })
        }

        failed += 1
      }
    }

    const total = count ?? cursor + (subscribers?.length ?? 0)
    const nextCursor = cursor + (subscribers?.length ?? 0)
    const hasMore = nextCursor < total
    const chainRequired = hasMore && shouldChain

    const origemBruta = resolveChainOrigin(req)
    const origem = validarOrigemEncadeamento(origemBruta)
    if (chainRequired && !origem.ok) {
      deps.logAlertsEvent({
        route: "send-digest",
        event: "digest_chain_origin_rejected",
        level: "error",
        detail: { origem: origemBruta, motivo: origem.motivo, nextCursor },
      })
    }
    const chainScheduled = chainRequired && origem.ok

    if (chainScheduled) {
      // Origem canonica, nunca req.nextUrl.origin: em producao o cron chega pela
      // URL *.vercel.app atras do SSO e o fetch encadeado morre num 302 silencioso
      // (mesmo bug do news/refresh, ver src/lib/cron-chain-origin.ts).
      const nextUrl = new URL(req.nextUrl.pathname, origem.origin)
      nextUrl.searchParams.set("cursor", String(nextCursor))
      nextUrl.searchParams.set("limit", String(limit))
      nextUrl.searchParams.set("chain", "1")
      nextUrl.searchParams.set("depth", String(chainDepth + 1))

      deps.afterResponse(async () => {
        for (let attempt = 1; attempt <= CHAIN_FETCH_ATTEMPTS; attempt += 1) {
          const ultimaTentativa = attempt === CHAIN_FETCH_ATTEMPTS
          const eventoDeFalha = ultimaTentativa
            ? "digest_chain_fetch_failed"
            : "digest_chain_fetch_retry"
          try {
            const res = await deps.fetchImpl(nextUrl.toString(), {
              method: "POST",
              headers: {
                Authorization: `Bearer ${expectedSecret}`,
              },
              cache: "no-store",
              // Um redirect aqui e sempre bug (SSO, dominio errado): seguir o 3xx
              // esconderia a falha de novo.
              redirect: "manual",
              signal: AbortSignal.timeout(CHAIN_FETCH_TIMEOUT_MS),
            })
            if (res.ok) break
            deps.logAlertsEvent({
              route: "send-digest",
              event: eventoDeFalha,
              level: "error",
              detail: { nextCursor, status: res.status, attempt },
            })
          } catch (error) {
            const message =
              error instanceof Error &&
              (error.name === "AbortError" || error.name === "TimeoutError")
                ? "timeout"
                : error instanceof Error
                  ? error.message.slice(0, 300)
                  : "unknown"
            deps.logAlertsEvent({
              route: "send-digest",
              event: eventoDeFalha,
              level: "error",
              detail: { nextCursor, message, attempt },
            })
          }
          if (!ultimaTentativa) await deps.sleep(CHAIN_FETCH_RETRY_DELAY_MS)
        }
      })
    }

    // O UNICO mecanismo de alerta de cron do projeto e a notificacao nativa da
    // Vercel, disparada por HTTP 500 (contrato documentado em
    // src/app/api/internal/published-consistency/route.ts). Ate 2026-08-03 esta
    // rota respondia 200 mesmo com sent=0 e failed=N, entao RESEND_API_KEY
    // revogada, dominio suspenso ou chave de cifra rotacionada paravam o digest
    // em silencio e a Vercel registrava sucesso.
    //
    // Dois casos degradados duros:
    //   1. o lote inteiro falhou (nenhum envio saiu, mas havia gente pra enviar)
    //   2. o teto de encadeamento cortou com fila pendente, ou seja parte da base
    //      nao foi processada hoje e nao sera sem intervencao
    //   3. algum email saiu sem conseguir ser registrado. O assinante recebeu,
    //      entao nao e perda de entrega, mas o registro do dia ficou incompleto
    //      e a camada de escrita esta falhando: exatamente o tipo de coisa que
    //      so aparece se alguem for avisado.
    const loteInteiroFalhou = failed > 0 && sent === 0
    const filaTruncada = hasMore && !shouldChain
    const origemInvalida = chainRequired && !origem.ok
    const registroPerdido = enviadosSemRegistro > 0
    const degradado = loteInteiroFalhou || filaTruncada || origemInvalida || registroPerdido
    const status = degradado ? 500 : 200

    const motivoDegradacao = loteInteiroFalhou
      ? "nenhum envio concluido no lote"
      : filaTruncada
        ? "teto de encadeamento atingido com fila pendente"
        : origemInvalida
          ? "origem de encadeamento rejeitada"
          : "email enviado sem registro gravado"

    const corpo = {
      ok: !degradado,
      degradado: degradado
        ? { loteInteiroFalhou, filaTruncada, origemInvalida, registroPerdido, motivo: motivoDegradacao }
        : null,
      processed,
      sent,
      failed,
      skipped,
      enviadosSemRegistro,
      cursor,
      nextCursor: hasMore ? nextCursor : null,
      chainScheduled,
      chainDepth,
      total,
    }

    if (degradado) {
      deps.logAlertsEvent({
        route: "send-digest",
        event: loteInteiroFalhou
          ? "digest_lote_inteiro_falhou"
          : filaTruncada
            ? "digest_chain_depth_exhausted"
            : "digest_registro_perdido",
        level: "error",
        detail: {
          processed,
          sent,
          failed,
          skipped,
          enviadosSemRegistro,
          cursor,
          nextCursor,
          total,
          chainDepth,
        },
      })
    }

    deps.logAlertsApiExit("send-digest", status, "batch_complete", {
      processed,
      sent,
      failed,
      skipped,
      enviadosSemRegistro,
      cursor,
      nextCursor: hasMore ? nextCursor : null,
      chainScheduled,
      chainDepth,
      total,
      degradado,
    })

    return NextResponse.json(corpo, { status })
  }
}

const handler = createSendDigestHandler()

// Vercel Cron triggers this endpoint via GET (auth gated by CRON_SECRET, which Vercel injects from
// the env var). GitHub manual dispatch and the internal auto-chain use POST. Both share one handler.
export const GET = handler
export const POST = handler
