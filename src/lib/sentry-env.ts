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
 *
 * Run fora da Vercel também não reporta no servidor.
 *
 * Motivo (triagem 2026-09-08): PUXA-FICHA-1E chegou ao painel como
 * `environment: production` com `server_name: Thiagos-MacBook-Pro.local`. Era
 * run local com `VERCEL_ENV=production` no ambiente, não deploy. O gate antigo
 * só sabia dizer "não é preview", então qualquer processo com essa variável
 * setada virava produção no painel e consumia a quota (o sinal de 80% do budget
 * mensal está aberto desde 10/08). `VERCEL=1` é variável de sistema da Vercel,
 * presente em build e runtime e ausente em `next dev`/`next start` local.
 *
 * ESCOPO, e ele é deliberado: a exigência vale só no servidor e no edge.
 *
 * O NAVEGADOR FICA DE FORA desta correção, inclusive rodando local. No bundle
 * do cliente o Next só inlina `NEXT_PUBLIC_*`, então `process.env.VERCEL` é
 * `undefined` lá e exigir a flag silenciaria erro de cliente em PRODUÇÃO, que
 * é o oposto do que se quer. Consequência aceita: um `next build && next start`
 * local ainda pode mandar erro de navegador rotulado `production`, via
 * `NEXT_PUBLIC_VERCEL_ENV` ausente caindo em `NODE_ENV`. Não foi o vetor da 1E
 * (o evento dela é `Backend`, do hook de instrumentação) e fechar esse caso
 * exigiria uma variável `NEXT_PUBLIC_` só para isso. Se um dia aparecer issue
 * de navegador com `server_name` de máquina local, é este parágrafo que vira
 * a próxima tarefa.
 */
function rodandoNaVercel(): boolean {
  return process.env.VERCEL === "1"
}

function noServidor(): boolean {
  return typeof window === "undefined"
}

export function sentryHabilitadoNesteAmbiente(): boolean {
  if (noServidor() && !rodandoNaVercel()) return false

  const ambiente = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV
  if (ambiente !== "preview") return true
  const optIn =
    process.env.NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW ?? process.env.SENTRY_ENABLE_PREVIEW
  return optIn === "1"
}

/**
 * Ambiente reportado ao Sentry.
 *
 * `VERCEL_ENV` só é levado a sério quando o run é de fato da Vercel: fora dela
 * a variável é só um valor no ambiente do processo, e foi por ela que a 1E
 * entrou como produção. Fora da Vercel o rótulo cai para `NODE_ENV`, que num
 * `next dev` local é `development`.
 *
 * Segunda linha de defesa: com o gate acima, servidor fora da Vercel nem chega
 * a inicializar o Sentry. Isto existe para o dia em que o gate mudar.
 */
export function ambienteSentry(): string | undefined {
  const doCliente = process.env.NEXT_PUBLIC_VERCEL_ENV
  if (doCliente) return doCliente
  if (noServidor() && rodandoNaVercel() && process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV
  }
  return process.env.NODE_ENV
}
