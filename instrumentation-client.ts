import * as Sentry from "@sentry/nextjs"
import { sentryHabilitadoNesteAmbiente } from "@/lib/sentry-env"
import { redactSensitiveUrl, scrubSentryEvent } from "@/lib/sentry-scrub"

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim()
if (dsn && sentryHabilitadoNesteAmbiente()) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.05",
    ),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event)
    },
    beforeSendTransaction(event) {
      return scrubSentryEvent(event)
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb?.data && typeof breadcrumb.data === "object") {
        const data = breadcrumb.data as Record<string, unknown>
        for (const key of ["url", "to", "from"]) {
          const value = data[key]
          if (typeof value === "string") {
            data[key] = redactSensitiveUrl(value) ?? value
          }
        }
      }
      return breadcrumb
    },
  })
}
