import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { findSubscriberByManageToken } from "@/lib/alerts"
import { setAlertManageTokenCookie } from "@/lib/alerts-session"
import { normalizeOpaqueToken } from "@/lib/alerts-shared"
import { createFixedWindowIpRateLimiter } from "@/lib/request-rate-limit"

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

export async function GET(req: NextRequest) {
  const manageToken = normalizeOpaqueToken(req.nextUrl.searchParams.get("manage") ?? "")
  const verifyToken = normalizeOpaqueToken(req.nextUrl.searchParams.get("verify") ?? "")
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
    subscriber = await findSubscriberByManageToken(manageToken)
  } catch {
    // Indisponibilidade do banco nao pode virar sessao concedida: fail-closed.
    return response
  }
  if (!subscriber) return response

  return setAlertManageTokenCookie(response, manageToken)
}
