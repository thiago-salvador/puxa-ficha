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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = normalizeAlertEmail(alertBodyStringField(body, "email"))
  const candidateSlug = normalizeCandidateSlug(alertBodyStringField(body, "candidateSlug"))
  const manageToken = normalizeOpaqueToken(alertBodyStringField(body, "manageToken"))
  const nome = optionalName(body)

  if (!email || !candidateSlug) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const candidate = await findPublicCandidateBySlug(candidateSlug)
  if (!candidate) {
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
        return NextResponse.json({ error: "Manage access email unavailable" }, { status: 503 })
      }

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
      return NextResponse.json({ error: "Could not update subscription" }, { status: 503 })
    }

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
      return NextResponse.json({ error: "Rate check failed" }, { status: 503 })
    }

    if ((count ?? 0) >= MAX_NEW_SUBSCRIBERS_PER_HOUR) {
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
      return NextResponse.json({ error: "Could not save pending subscription" }, { status: 503 })
    }

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
    return NextResponse.json({ error: "Verification email unavailable" }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    requiresVerification: true,
    emailMasked: maskAlertEmail(email),
    candidateSlug: candidate.slug,
  })
}
