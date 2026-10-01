import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  createAlertsServiceRoleClient,
  findPublicCandidateBySlug,
  findSubscriberByManageToken,
} from "@/lib/alerts"
import { logAlertsApiExit } from "@/lib/alerts-log"
import {
  ALERT_COHORT_UFS,
  resolveAlertCohort,
} from "@/lib/alerts-cohort"
import {
  clearAlertPendingManageTokenCookie,
  readAlertManageTokenCookie,
  readAlertPendingManageTokenCookie,
  setAlertManageTokenCookie,
  setAlertPendingManageTokenCookie,
} from "@/lib/alerts-session"
import {
  normalizeCandidateSlug,
  normalizeOpaqueToken,
  parseAlertCohortAccessParam,
} from "@/lib/alerts-shared"
import { getCrossSiteWriteBlockReason } from "@/lib/cross-site-write-guard"
import { isRequestBodyTooLargeError, readTextBodyWithLimit } from "@/lib/request-body"
import {
  createDistributedIpRateLimiter,
  rateLimitExceededResponse,
} from "@/lib/request-rate-limit"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Mesmo motivo do teto em src/app/api/alerts/session/route.ts: cada manage token
// inventado custa um SELECT com service role em alert_subscribers e ocupa um slot
// do semáforo do Supabase, degradando a ficha pública junto. As quatro rotas de
// mutação de alertas ganharam o guard no review de 2026-08-03 e esta ficou de
// fora, mesmo fazendo a mesma consulta e sendo alcançável por GET simples.
const acessoRateLimiter = createDistributedIpRateLimiter({
  namespace: "alertas-acesso",
  max: 120,
  windowMs: 60_000,
})

function buildRedirectUrl(req: NextRequest, verifyToken: string | null, hash: string | null): URL {
  const target = verifyToken ? `/alertas/verificar?token=${encodeURIComponent(verifyToken)}` : "/alertas/gerenciar"
  const url = new URL(target, req.nextUrl.origin)
  if (!verifyToken && hash) url.hash = hash
  return url
}

type AcessoHash = "deletar-dados" | "cancelar-tudo"

function parseAcessoHash(raw: string | null | undefined): AcessoHash | null {
  return raw === "deletar-dados" || raw === "cancelar-tudo" ? raw : null
}

/**
 * Pagina de confirmacao da troca de conta. O manage token do link NAO viaja
 * nesta URL (fica no cookie pendente); so o destino final (verify/hash), que a
 * pagina devolve no POST para o redirect depois da troca.
 */
function buildConfirmUrl(req: NextRequest, verifyToken: string | null, hash: string | null): URL {
  const url = new URL("/alertas/acesso/confirmar", req.nextUrl.origin)
  if (verifyToken) url.searchParams.set("verify", verifyToken)
  else if (hash) url.searchParams.set("hash", hash)
  return url
}

/**
 * O navegador ja tem uma sessao de alertas de OUTRO assinante? So nesse caso a
 * troca pede confirmacao. Cookie que nao corresponde a ninguem (token apagado ou
 * rotacionado) nao e identidade a preservar, e segue o caminho de quem chega sem
 * cookie. Falha do banco ao resolver o cookie atual preserva a sessao existente:
 * na duvida, pedir confirmacao e mais barato que trocar a conta de alguem.
 */
async function sessionBelongsToAnotherSubscriber(
  deps: Pick<AlertsAcessoDeps, "findSubscriberByManageToken">,
  currentToken: string | null,
  linkManageToken: string,
  linkSubscriberId: string,
): Promise<boolean> {
  if (!currentToken || currentToken === linkManageToken) return false
  try {
    const current = await deps.findSubscriberByManageToken(currentToken)
    return current !== null && current.id !== linkSubscriberId
  } catch {
    return true
  }
}

/**
 * Injecao de dependencia no mesmo formato das rotas de /api/alerts: e o que
 * permite exercer o fluxo inteiro (email de gestao -> abrir link -> inscricao
 * criada) contra o duplo de Supabase, em vez de so afirmar coisas sobre o texto
 * do arquivo.
 */
export interface AlertsAcessoDeps {
  findSubscriberByManageToken: typeof findSubscriberByManageToken
  findPublicCandidateBySlug: typeof findPublicCandidateBySlug
  createAlertsServiceRoleClient: typeof createAlertsServiceRoleClient
  logAlertsApiExit: typeof logAlertsApiExit
}

const defaultAcessoDeps: AlertsAcessoDeps = {
  findSubscriberByManageToken,
  findPublicCandidateBySlug,
  createAlertsServiceRoleClient,
  logAlertsApiExit,
}

export function createAlertsAcessoHandler(deps: AlertsAcessoDeps = defaultAcessoDeps) {
  return async function GET(req: NextRequest) {
    const manageToken = normalizeOpaqueToken(req.nextUrl.searchParams.get("manage") ?? "")
    const verifyToken = normalizeOpaqueToken(req.nextUrl.searchParams.get("verify") ?? "")
    const followSlug = normalizeCandidateSlug(req.nextUrl.searchParams.get("follow") ?? "")
    const cohortParam = parseAlertCohortAccessParam(req.nextUrl.searchParams.get("cohort"))
    const hash = parseAcessoHash(req.nextUrl.searchParams.get("hash"))

    const response = NextResponse.redirect(buildRedirectUrl(req, verifyToken, hash))
    if (!manageToken) return response

    // O teto fica depois do early-return acima porque link de e-mail sem manage
    // token não chega no banco: só entra na cota quem vai custar consulta. Ao
    // estourar, o contrato desta rota (página, não API) pede redirecionar sem
    // cookie, a mesma degradação para anônimo já usada quando o token não existe,
    // em vez de devolver 429 em JSON no meio de uma navegação do navegador.
    try {
      const decision = await acessoRateLimiter.check(req.headers)
      if (!decision.allowed) return response
    } catch (error) {
      console.warn("alertas/acesso rate limit failed closed", error)
      return response
    }

    // FIXACAO DE SESSAO (master review de 2026-08-03). Antes, qualquer string que
    // casasse com ALERT_TOKEN_RE virava cookie de sessao por 180 dias, sem nenhuma
    // consulta ao banco: bastava mandar a vitima abrir
    // /alertas/acesso?manage=<token-do-atacante> (navegacao top-level GET carrega
    // cookie SameSite=Lax) para a sessao de alertas dela virar a do atacante, e as
    // inscricoes que ela criasse depois caiam na conta dele.
    //
    // O contrato agora e o mesmo do POST /api/alerts/session: so vira cookie o
    // token que corresponde a um assinante real. Token invalido redireciona sem
    // cookie, sem revelar se existe ou nao (a pagina de destino trata o anonimo).
    let subscriber = null
    try {
      subscriber = await deps.findSubscriberByManageToken(manageToken)
    } catch {
      // Indisponibilidade do banco nao pode virar sessao concedida: fail-closed.
      return response
    }
    if (!subscriber) return response

    // FOLLOW PENDENTE. Assinante ja verificado que pede para seguir num navegador
    // novo nao tem sessao, entao o subscribe manda o email de gestao em vez de
    // criar a inscricao. O slug pedido viaja no link, e o follow e efetivado aqui,
    // DEPOIS de o token ter sido validado contra um assinante real, no mesmo gate
    // que ja autoriza o cookie. Quem chega aqui com token valido ja tem acesso
    // total a conta, entao o follow nao abre superficie nova.
    //
    // Fail-open de proposito: erro ao criar a inscricao nao pode virar pagina de
    // erro no meio de uma navegacao vinda de email. Vira log, e a pessoa cai na
    // gestao com sessao valida e pode seguir de novo com um clique.
    if (followSlug) {
      try {
        const candidate = await deps.findPublicCandidateBySlug(followSlug)
        if (candidate) {
          const supabase = deps.createAlertsServiceRoleClient()
          const { error } = await supabase.from("alert_subscriptions").upsert(
            { subscriber_id: subscriber.id, candidato_id: candidate.id },
            { onConflict: "subscriber_id,candidato_id", ignoreDuplicates: true },
          ).abortSignal(supabaseQueryTimeoutSignal())
          if (error) {
            deps.logAlertsApiExit("alertas-acesso", 302, "follow_pendente_falhou", {
              candidateSlug: candidate.slug,
            })
          } else {
            deps.logAlertsApiExit("alertas-acesso", 302, "follow_pendente_aplicado", {
              candidateSlug: candidate.slug,
            })
          }
        } else {
          deps.logAlertsApiExit("alertas-acesso", 302, "follow_pendente_slug_desconhecido")
        }
      } catch {
        deps.logAlertsApiExit("alertas-acesso", 302, "follow_pendente_falhou")
      }
    }

    if (cohortParam.length > 0) {
      try {
        const resolved = resolveAlertCohort({
          cohort: [],
          subscriptions: cohortParam,
          allowedUfs: ALERT_COHORT_UFS,
          senadoEnabled: process.env.SENADO_ENABLED?.trim().toLowerCase() === "true",
        })
        if (resolved.invalidSubscriptions.length === 0 && resolved.validSubscriptions.length === cohortParam.length) {
          const supabase = deps.createAlertsServiceRoleClient()
          const { error } = await supabase.from("alert_cohort_subscriptions").upsert(
            resolved.validSubscriptions.map((subscription) => ({
              subscriber_id: subscriber.id,
              cargo: subscription.cargo,
              uf: subscription.uf,
            })),
            { onConflict: "subscriber_id,cargo,uf", ignoreDuplicates: true },
          ).abortSignal(supabaseQueryTimeoutSignal())
          deps.logAlertsApiExit(
            "alertas-acesso",
            302,
            error ? "cohort_pendente_falhou" : "cohort_pendente_aplicado",
            { cohortSubscriptionCount: resolved.validSubscriptions.length },
          )
        }
      } catch {
        deps.logAlertsApiExit("alertas-acesso", 302, "cohort_pendente_falhou")
      }
    }

    // TROCA DE CONTA SEM CONFIRMACAO. Validar o token prova que o link existe,
    // nao que quem abriu quis trocar de conta. Se este navegador ja tem sessao de
    // outro assinante, o GET preserva a sessao atual e manda para a confirmacao;
    // a troca so acontece no POST da propria origem. Mesmo assinante, ou
    // navegador sem sessao, segue direto como sempre.
    const currentToken = readAlertManageTokenCookie(req)
    if (await sessionBelongsToAnotherSubscriber(deps, currentToken, manageToken, subscriber.id)) {
      deps.logAlertsApiExit("alertas-acesso", 307, "troca_de_conta_pendente")
      const confirmResponse = NextResponse.redirect(buildConfirmUrl(req, verifyToken, hash))
      return setAlertPendingManageTokenCookie(confirmResponse, manageToken)
    }

    return setAlertManageTokenCookie(response, manageToken)
  }
}

/**
 * POST /alertas/acesso: confirmacao explicita da troca de conta.
 *
 * Exige `Origin` da propria origem (form POST de navegador sempre manda) e
 * rejeita Sec-Fetch-Site cross-site: sem isso, qualquer pagina externa poderia
 * submeter o form em nome de quem abriu o link. O token vem do cookie pendente,
 * nunca do body, e e revalidado contra o banco antes de virar sessao.
 */
export function createAlertsAcessoConfirmHandler(
  deps: Pick<AlertsAcessoDeps, "findSubscriberByManageToken" | "logAlertsApiExit"> = defaultAcessoDeps,
) {
  return async function POST(req: NextRequest) {
    const blockReason = getCrossSiteWriteBlockReason(req.headers, req.nextUrl.origin, {
      requireOrigin: true,
    })
    if (blockReason) {
      deps.logAlertsApiExit("alertas-acesso-confirmar", 403, blockReason)
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
    }

    const decision = await acessoRateLimiter.check(req.headers)
    if (!decision.allowed) {
      deps.logAlertsApiExit(
        "alertas-acesso-confirmar",
        decision.unavailable ? 503 : 429,
        "rate_limited",
      )
      return rateLimitExceededResponse(decision)
    }

    let form: URLSearchParams
    try {
      form = new URLSearchParams(await readTextBodyWithLimit(req))
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        deps.logAlertsApiExit("alertas-acesso-confirmar", 413, "body_too_large")
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
      }
      form = new URLSearchParams()
    }
    const verifyToken = normalizeOpaqueToken(form.get("verify") ?? "")
    const hash = parseAcessoHash(form.get("hash"))

    // Sem pedido pendente valido nada e trocado: a pessoa cai na gestao com a
    // sessao que ja tinha. 303 para o navegador seguir com GET.
    const keepCurrent = clearAlertPendingManageTokenCookie(
      NextResponse.redirect(new URL("/alertas/gerenciar", req.nextUrl.origin), 303),
    )

    const pendingToken = readAlertPendingManageTokenCookie(req)
    if (!pendingToken) {
      deps.logAlertsApiExit("alertas-acesso-confirmar", 303, "sem_troca_pendente")
      return keepCurrent
    }

    let subscriber = null
    try {
      subscriber = await deps.findSubscriberByManageToken(pendingToken)
    } catch {
      deps.logAlertsApiExit("alertas-acesso-confirmar", 303, "lookup_falhou")
      return keepCurrent
    }
    if (!subscriber) {
      deps.logAlertsApiExit("alertas-acesso-confirmar", 303, "troca_pendente_invalida")
      return keepCurrent
    }

    deps.logAlertsApiExit("alertas-acesso-confirmar", 303, "troca_de_conta_confirmada")
    const switched = clearAlertPendingManageTokenCookie(
      NextResponse.redirect(buildRedirectUrl(req, verifyToken, hash), 303),
    )
    return setAlertManageTokenCookie(switched, pendingToken)
  }
}

export const GET = createAlertsAcessoHandler()
export const POST = createAlertsAcessoConfirmHandler()
