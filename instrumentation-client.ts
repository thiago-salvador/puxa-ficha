import * as Sentry from "@sentry/nextjs"
import { sentryHabilitadoNesteAmbiente } from "@/lib/sentry-env"
import { redactSensitiveUrl, scrubSentryEvent } from "@/lib/sentry-scrub"

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim()
if (dsn && sentryHabilitadoNesteAmbiente()) {
  Sentry.init({
    dsn,
    // Só captura de erro no navegador. O tracing de cliente (browserTracing)
    // era o maior chunk de JS do site (133 KB br) e a maior long task em toda
    // página, para amostrar 5% das navegações; o tracing do servidor continua
    // em sentry.server.config.ts. `excludeTracing` no next.config tira o
    // código do bundle; este filtro garante o comportamento se o build
    // deixar de ter a opção.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserTracing"),
    tracesSampleRate: 0,
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
