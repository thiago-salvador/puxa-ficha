/**
 * Deploy de preview da Vercel não reporta ao Sentry por padrão.
 *
 * Motivo (master review 2026-08-04): o projeto tem UM painel de erro, e issues
 * de preview entraram misturadas com produção (PUXA-FICHA-N, 88 eventos de
 * `Connection closed.` vindos do preview do PR #72, escalando na véspera do
 * lançamento). Erro de preview aparece no próprio PR e no build; no painel ele
 * só enterra o sinal de produção.
 *
 * Escape para depurar um preview específico com Sentry ligado: setar
 * SENTRY_ENABLE_PREVIEW=1 (server/edge) e NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW=1
 * (client) nas envs de Preview da Vercel, e remover depois.
 */
export function sentryHabilitadoNesteAmbiente(): boolean {
  const ambiente = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV
  if (ambiente !== "preview") return true
  const optIn =
    process.env.NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW ?? process.env.SENTRY_ENABLE_PREVIEW
  return optIn === "1"
}
