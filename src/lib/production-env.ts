import { isValidConfiguredFromEmail, resolveConfiguredFromEmail } from "@/lib/email-from"
import {
  isValidConfiguredReplyToEmail,
  normalizeConfiguredReplyToEmail,
} from "@/lib/email-reply-to"

/**
 * Validação de ambiente em deploy de produção (Vercel).
 * Chamada a partir de `instrumentation.ts` no runtime Node.
 */

function hasTrimmed(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

function isHex32Bytes(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value)
}

/**
 * Token esperado no header `x-pf-release-verify-cache-bypass`, ou `null` quando
 * o bypass não vale neste ambiente.
 *
 * Incidente de 2026-08-03: `PF_RELEASE_VERIFY_CACHE_BYPASS` e
 * `PF_ALLOW_RELEASE_VERIFY_CACHE_BYPASS_IN_PRODUCTION` ficaram ligadas em
 * produção por 106 dias. Com as duas setadas, toda ficha lia `headers()` em
 * runtime; ler header em rota estática dispara `app-static-to-dynamic-error` e
 * `/candidato/[slug]` passou a responder HTTP 500 em produção.
 *
 * Por isso o escape de produção deixou de existir: em `VERCEL_ENV=production` o
 * bypass é ignorado INDEPENDENTE do opt-in, e a variável de opt-in virou inerte
 * (a remoção dela no painel da Vercel é higiene, não pré-requisito). Verificação
 * de release com bypass roda em Preview, que é onde ela sempre deveria ter
 * rodado.
 */
export function resolveReleaseVerifyCacheBypassToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.VERCEL_ENV === "production") return null
  const token = env.PF_RELEASE_VERIFY_CACHE_BYPASS?.trim()
  return token ? token : null
}

/**
 * Falha rápido no boot do servidor em produção se variáveis críticas faltarem.
 * Não roda em preview/local para não quebrar `next build` sem .env completo.
 */
export function validateProductionEnvironment(): void {
  if (process.env.VERCEL_ENV !== "production") {
    return
  }

  const missing: string[] = []

  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anon =
    process.env.SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url) missing.push("SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL")
  if (!anon) missing.push("SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY")
  if (!service) missing.push("SUPABASE_SERVICE_ROLE_KEY")

  if (!hasTrimmed(process.env.PF_QUIZ_SHORT_LINK_SALT)) {
    missing.push("PF_QUIZ_SHORT_LINK_SALT")
  }

  if (!hasTrimmed(process.env.PF_ALERTS_TOKEN_SALT)) {
    missing.push("PF_ALERTS_TOKEN_SALT")
  }

  if (!hasTrimmed(process.env.PF_ALERTS_IP_SALT)) {
    missing.push("PF_ALERTS_IP_SALT")
  }

  const enc = process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY?.trim()
  if (!enc || !isHex32Bytes(enc)) {
    missing.push("PF_ALERTS_TOKEN_ENCRYPTION_KEY (64 caracteres hex = 32 bytes)")
  }

  // CRON_SECRET continua FATAL: sem ele as 4 rotas de cron respondem 401 e o
  // digest, o refresh de noticias e os dois gates internos param calados. A
  // falha nao aparece em lugar nenhum ate alguém reclamar.
  if (!hasTrimmed(process.env.CRON_SECRET)) {
    missing.push("CRON_SECRET")
  }

  // PF_REVALIDATE_SECRET continua FATAL, e isso e proposital. Sem ele a rota de
  // revalidação responde 503 e o site passa a servir dado velho para sempre, em
  // silencio: o pior modo de falha possivel aqui, porque parece funcionar.
  // tests/revalidate-route.test.ts:342 guarda exatamente esta linha.
  if (!hasTrimmed(process.env.PF_REVALIDATE_SECRET)) {
    missing.push("PF_REVALIDATE_SECRET")
  }

  // ---------------------------------------------------------------------
  // DEGRADÁVEIS: faltar quebra UMA feature, e a quebra e visivel. Nao derruba
  // a ficha publica, que e leitura de Supabase e nao depende de nenhuma delas.
  //
  // Antes de 2026-08-03 estas tambem derrubavam o boot. Efeito medido no master
  // review: trocar de provedor de email e apagar a RESEND_API_KEY antiga antes
  // de cadastrar a nova derruba /candidato/*, /rankings, /comparar e /uf no
  // proximo cold start de qualquer função Node, sem precisar de redeploy,
  // porque `register()` lança. Desproporcional: email nao tem relação nenhuma
  // com a ficha publica.
  // ---------------------------------------------------------------------
  const degraded: string[] = []

  if (!hasTrimmed(process.env.RESEND_API_KEY)) {
    degraded.push("RESEND_API_KEY (alertas por email nao serao enviados)")
  }

  if (!hasTrimmed(process.env.PF_ALERTS_REPLY_TO_EMAIL)) {
    degraded.push("PF_ALERTS_REPLY_TO_EMAIL (alertas por email nao serao enviados)")
  } else {
    const replyToEmail = normalizeConfiguredReplyToEmail(process.env.PF_ALERTS_REPLY_TO_EMAIL)
    if (!isValidConfiguredReplyToEmail(replyToEmail)) {
      degraded.push("PF_ALERTS_REPLY_TO_EMAIL em formato invalido")
    }
  }

  const sentryDsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (!sentryDsn) {
    degraded.push("SENTRY_DSN ou NEXT_PUBLIC_SENTRY_DSN (sem observabilidade)")
  }

  const configuredFromRaw = process.env.PF_ALERTS_FROM_EMAIL?.trim() || process.env.SMTP_FROM?.trim()
  if (configuredFromRaw) {
    const normalizedFrom = resolveConfiguredFromEmail(
      process.env.PF_ALERTS_FROM_EMAIL,
      process.env.SMTP_FROM,
    )
    if (!isValidConfiguredFromEmail(normalizedFrom)) {
      degraded.push("PF_ALERTS_FROM_EMAIL ou SMTP_FROM em formato invalido")
    }
  }

  if (degraded.length > 0) {
    // console.error para cair no Sentry (quando ha DSN) e no log da Vercel, sem
    // matar o boot. Nao e silencio: e erro registrado com a feature nomeada.
    console.error(
      `[production-env] Deploy em producao com feature degradada (site publico segue no ar): ${degraded.join("; ")}`,
    )
  }

  if (missing.length > 0) {
    throw new Error(
      `[production-env] Deploy em VERCEL_ENV=production com configuração incompleta: ${missing.join("; ")}`,
    )
  }
}
