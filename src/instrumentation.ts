import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config")
    const { validateProductionEnvironment } = await import("@/lib/production-env")
    validateProductionEnvironment()
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config")
  }
}

/**
 * Sem este export, erro lancado dentro de Server Component, de route handler ou
 * de generateMetadata nao chega ao Sentry: `register()` so instala o SDK, quem
 * entrega o erro da request e este hook. Review de 2026-08-03.
 */
export const onRequestError = Sentry.captureRequestError
