import type { NextRequest } from "next/server"
import { after, NextResponse } from "next/server"
import {
  buildAlertManageUrl,
  buildAlertUnsubscribeUrl,
  createAlertsServiceRoleClient,
  decryptAlertManageToken,
} from "@/lib/alerts"
import {
  buildAlertDigestEmail,
  type AlertDigestEmailCandidate,
} from "@/lib/alerts-shared"
import { sendTransactionalEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_BATCH_LIMIT = 25
const MAX_BATCH_LIMIT = 50
const DIGEST_TIME_ZONE = "America/Sao_Paulo"

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

function getCronSecret(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization")?.trim()
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim()
  }
  return req.headers.get("x-cron-secret")?.trim() || null
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

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim()
  const providedSecret = getCronSecret(req)

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cursor = parsePositiveInt(req.nextUrl.searchParams.get("cursor"), 0)
  const requestedLimit = parsePositiveInt(req.nextUrl.searchParams.get("limit"), DEFAULT_BATCH_LIMIT)
  const limit = Math.max(1, Math.min(MAX_BATCH_LIMIT, requestedLimit || DEFAULT_BATCH_LIMIT))
  const shouldChain = req.nextUrl.searchParams.get("chain") !== "0"
  const runStartedAt = new Date().toISOString()
  const digestDate = formatDigestDate(new Date(runStartedAt))

  const supabase = createAlertsServiceRoleClient()
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
    return NextResponse.json({ error: "Could not load subscribers" }, { status: 503 })
  }

  let processed = 0
  let sent = 0
  let failed = 0
  let skipped = 0

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
      failed += 1
      continue
    }

    if (existingLog?.status === "sent") {
      skipped += 1
      continue
    }

    const { data: subscriptionRows, error: subscriptionsError } = await supabase
      .from("alert_subscriptions")
      .select("candidato_id")
      .eq("subscriber_id", subscriber.id)

    if (subscriptionsError) {
      failed += 1
      continue
    }

    const candidateIds = Array.from(
      new Set((subscriptionRows ?? []).map((row) => row.candidato_id).filter(Boolean)),
    )

    if (candidateIds.length === 0) {
      skipped += 1
      continue
    }

    const { data: candidateRows, error: candidatesError } = await supabase
      .from("candidatos_publico")
      .select("id, slug, nome_urna, partido_sigla, cargo_disputado")
      .in("id", candidateIds)

    if (candidatesError) {
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
      failed += 1
      continue
    }

    if (!changeRows || changeRows.length === 0) {
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

      grouped.push({
        candidateName: candidate.nome_urna,
        candidateMeta: `${candidate.partido_sigla} · ${candidate.cargo_disputado}`,
        changes,
      })
    }

    if (grouped.length === 0) {
      skipped += 1
      continue
    }

    const manageToken = decryptAlertManageToken(subscriber.manage_token_ciphertext)
    const manageUrl = buildAlertManageUrl(manageToken)
    const unsubscribeUrl = buildAlertUnsubscribeUrl(manageToken)
    const emailPayload = buildAlertDigestEmail({
      items: grouped,
      manageUrl,
      unsubscribeUrl,
    })

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
        failed += 1
        continue
      }

      logId = insertedLog.id
    }

    try {
      await sendTransactionalEmail({
        to: subscriber.email,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
        },
      })

      await supabase
        .from("notification_log")
        .update({
          status: "sent",
          error_message: null,
          sent_at: runStartedAt,
        })
        .eq("id", logId)

      await supabase
        .from("alert_subscribers")
        .update({ last_digest_sent_at: runStartedAt })
        .eq("id", subscriber.id)

      sent += 1
    } catch (error) {
      await supabase
        .from("notification_log")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        })
        .eq("id", logId)

      failed += 1
    }
  }

  const total = count ?? cursor + (subscribers?.length ?? 0)
  const nextCursor = cursor + (subscribers?.length ?? 0)
  const hasMore = nextCursor < total

  if (hasMore && shouldChain) {
    const nextUrl = new URL(req.nextUrl.pathname, req.nextUrl.origin)
    nextUrl.searchParams.set("cursor", String(nextCursor))
    nextUrl.searchParams.set("limit", String(limit))
    nextUrl.searchParams.set("chain", "1")

    after(async () => {
      try {
        await fetch(nextUrl.toString(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${expectedSecret}`,
          },
          cache: "no-store",
        })
      } catch {
      }
    })
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent,
    failed,
    skipped,
    cursor,
    nextCursor: hasMore ? nextCursor : null,
    chainScheduled: hasMore && shouldChain,
    total,
  })
}
