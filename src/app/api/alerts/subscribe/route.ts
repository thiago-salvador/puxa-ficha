import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  ALERT_VERIFICATION_EMAIL_COOLDOWN_MS,
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
  maskAlertEmail,
  normalizeAlertEmail,
  normalizeCandidateSlug,
  normalizeOpaqueToken,
} from "@/lib/alerts"
import { logAlertsApiExit } from "@/lib/alerts-log"
import { sendTransactionalEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_NEW_SUBSCRIBERS_PER_HOUR = 24

function optionalName(body: unknown): string | null {
  const normalized = alertBodyStringField(body, "nome").trim()
  return normalized ? normalized.slice(0, 120) : null
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    logAlertsApiExit("subscribe", 400, "invalid_json")
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = normalizeAlertEmail(alertBodyStringField(body, "email"))
  const candidateSlug = normalizeCandidateSlug(alertBodyStringField(body, "candidateSlug"))
  const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
  const nome = optionalName(body)

  if (!email || !candidateSlug) {
    logAlertsApiExit("subscribe", 400, "invalid_payload")
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const candidate = await findPublicCandidateBySlug(candidateSlug)
  if (!candidate) {
    logAlertsApiExit("subscribe", 404, "candidate_not_found", { candidateSlug })
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  }

  const emailHash = hashAlertEmail(email)
  const existingSubscriber = await findSubscriberByEmailHash(emailHash)
  const supabase = createAlertsServiceRoleClient()
  const now = Date.now()
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
        logAlertsApiExit("subscribe", 200, "verified_manage_link_cooldown", {
          candidateSlug: candidate.slug,
          cooldownActive: true,
        })
        return NextResponse.json({
          ok: true,
          verified: true,
          manageLinkSent: true,
          cooldownActive: true,
          emailMasked: maskAlertEmail(email),
          candidateSlug: candidate.slug,
        })
      }

      const nextManageToken = createAlertToken()
      const manageTokenHash = hashAlertToken(nextManageToken)
      const manageTokenCiphertext = encryptAlertManageToken(nextManageToken)
      const sentAt = new Date(now).toISOString()
      const manageUrl = buildAlertManageUrl(nextManageToken)
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
          last_verification_email_sent_at: sentAt,
        })
        .eq("id", existingSubscriber.id)

      if (updateError) {
        logAlertsApiExit("subscribe", 503, "db_refresh_manage_access_failed")
        return NextResponse.json({ error: "Could not refresh manage access" }, { status: 503 })
      }

      try {
        await sendTransactionalEmail({
          to: email,
          subject: accessEmail.subject,
          text: accessEmail.text,
          html: accessEmail.html,
        })
      } catch {
        logAlertsApiExit("subscribe", 503, "manage_access_email_failed")
        return NextResponse.json({ error: "Manage access email unavailable" }, { status: 503 })
      }

      logAlertsApiExit("subscribe", 200, "verified_manage_link_sent", { candidateSlug: candidate.slug })
      return NextResponse.json({
        ok: true,
        verified: true,
        manageLinkSent: true,
        emailMasked: maskAlertEmail(email),
        candidateSlug: candidate.slug,
      })
    }

    const authorizedSubscriber = await findSubscriberByManageToken(manageToken)
    if (!authorizedSubscriber || authorizedSubscriber.id !== existingSubscriber.id) {
      logAlertsApiExit("subscribe", 403, "invalid_manage_token_verified_flow")
      return NextResponse.json({ error: "Invalid manage token" }, { status: 403 })
    }

    const { error: upsertError } = await supabase.from("alert_subscriptions").upsert(
      {
        subscriber_id: existingSubscriber.id,
        candidato_id: candidate.id,
      },
      { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
    )

    if (upsertError) {
      logAlertsApiExit("subscribe", 503, "db_upsert_subscription_failed_verified")
      return NextResponse.json({ error: "Could not update subscription" }, { status: 503 })
    }

    logAlertsApiExit("subscribe", 200, "verified_following", { candidateSlug: candidate.slug })
    return NextResponse.json({
      ok: true,
      verified: true,
      following: true,
      candidateSlug: candidate.slug,
      manageToken,
    })
  }

  const ipHash = hashAlertIp(extractClientIp(req.headers))

  if (!existingSubscriber) {
    const since = new Date(Date.now() - 3_600_000).toISOString()
    const { count, error: countError } = await supabase
      .from("alert_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("ip_consentimento_hash", ipHash)
      .gte("created_at", since)

    if (countError) {
      logAlertsApiExit("subscribe", 503, "rate_check_failed")
      return NextResponse.json({ error: "Rate check failed" }, { status: 503 })
    }

    if ((count ?? 0) >= MAX_NEW_SUBSCRIBERS_PER_HOUR) {
      logAlertsApiExit("subscribe", 429, "rate_limit_new_subscribers_hour")
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
  }

  if (existingSubscriber && cooldownActive) {
    const { error: subscriptionError } = await supabase.from("alert_subscriptions").upsert(
      {
        subscriber_id: existingSubscriber.id,
        candidato_id: candidate.id,
      },
      { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
    )

    if (subscriptionError) {
      logAlertsApiExit("subscribe", 503, "db_pending_subscription_cooldown_failed")
      return NextResponse.json({ error: "Could not save pending subscription" }, { status: 503 })
    }

    logAlertsApiExit("subscribe", 200, "requires_verification_cooldown", { candidateSlug: candidate.slug })
    return NextResponse.json({
      ok: true,
      requiresVerification: true,
      cooldownActive: true,
      emailMasked: maskAlertEmail(email),
      candidateSlug: candidate.slug,
    })
  }

  const verifyToken = createAlertToken()
  const nextManageToken = createAlertToken()
  const verifyTokenHash = hashAlertToken(verifyToken)
  const manageTokenHash = hashAlertToken(nextManageToken)
  const manageTokenCiphertext = encryptAlertManageToken(nextManageToken)
  const sentAt = new Date(now).toISOString()
  const verifyExpiresAt = createAlertVerifyExpiryDate(new Date(now)).toISOString()

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
        last_verification_email_sent_at: sentAt,
      })
      .eq("id", existingSubscriber.id)

    if (updateError) {
      logAlertsApiExit("subscribe", 503, "db_update_subscriber_failed")
      return NextResponse.json({ error: "Could not update subscriber" }, { status: 503 })
    }

    subscriberId = existingSubscriber.id
  } else {
    const { data: insertedSubscriber, error: insertError } = await supabase
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
        last_verification_email_sent_at: sentAt,
      })
      .select("id")
      .single()

    if (insertError || !insertedSubscriber) {
      logAlertsApiExit("subscribe", 503, "db_insert_subscriber_failed")
      return NextResponse.json({ error: "Could not create subscriber" }, { status: 503 })
    }

    subscriberId = insertedSubscriber.id
  }

  const { error: subscriptionError } = await supabase.from("alert_subscriptions").upsert(
    {
      subscriber_id: subscriberId,
      candidato_id: candidate.id,
    },
    { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
  )

  if (subscriptionError) {
    logAlertsApiExit("subscribe", 503, "db_create_subscription_failed")
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
    await sendTransactionalEmail({
      to: email,
      subject: emailPayload.subject,
      text: emailPayload.text,
      html: emailPayload.html,
    })
  } catch {
    logAlertsApiExit("subscribe", 503, "verification_email_send_failed")
    return NextResponse.json({ error: "Verification email unavailable" }, { status: 503 })
  }

  logAlertsApiExit("subscribe", 200, "requires_verification_email_sent", { candidateSlug: candidate.slug })
  return NextResponse.json({
    ok: true,
    requiresVerification: true,
    emailMasked: maskAlertEmail(email),
    candidateSlug: candidate.slug,
  })
}
