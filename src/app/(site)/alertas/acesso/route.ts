import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import {
  createAlertsServiceRoleClient,
  findPublicCandidateBySlug,
  findSubscriberByManageToken,
} from "@/lib/alerts"
import { logAlertsApiExit } from "@/lib/alerts-log"
import { setAlertManageTokenCookie } from "@/lib/alerts-session"
import { normalizeCandidateSlug, normalizeOpaqueToken } from "@/lib/alerts-shared"
import { createFixedWindowIpRateLimiter } from "@/lib/request-rate-limit"
import { supabaseQueryTimeoutSignal } from "@/lib/supabase-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Mesmo motivo do teto em src/app/api/alerts/session/route.ts: cada manage token
// inventado custa um SELECT com service role em alert_subscribers e ocupa um slot
// do semáforo do Supabase, degradando a ficha pública junto. As quatro rotas de
// mutação de alertas ganharam o guard no review de 2026-08-03 e esta ficou de
// fora, mesmo fazendo a mesma consulta e sendo alcançável por GET simples.
const acessoRateLimiter = createFixedWindowIpRateLimiter({
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
    const hashRaw = req.nextUrl.searchParams.get("hash") ?? ""
    const hash = hashRaw === "deletar-dados" || hashRaw === "cancelar-tudo" ? hashRaw : null

    const response = NextResponse.redirect(buildRedirectUrl(req, verifyToken, hash))
    if (!manageToken) return response

    // O teto fica depois do early-return acima porque link de e-mail sem manage
    // token não chega no banco: só entra na cota quem vai custar consulta. Ao
    // estourar, o contrato desta rota (página, não API) pede redirecionar sem
    // cookie, a mesma degradação para anônimo já usada quando o token não existe,
    // em vez de devolver 429 em JSON no meio de uma navegação do navegador.
    try {
      const decision = acessoRateLimiter.check(req.headers)
      if (!decision.allowed) return response
    } catch (error) {
      console.warn("alertas/acesso rate limit failed open", error)
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

    return setAlertManageTokenCookie(response, manageToken)
  }
}

export const GET = createAlertsAcessoHandler()
