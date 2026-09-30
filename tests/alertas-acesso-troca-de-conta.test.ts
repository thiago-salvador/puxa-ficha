/**
 * Troca de conta pelo link de gestão só com confirmação explícita.
 *
 * GET /alertas/acesso validava o manage token contra o banco e gravava o cookie
 * de sessão por cima do que o navegador já tinha. Validar o token prova que o
 * link existe, não que quem abriu quis trocar de conta: um navegador com sessão
 * de um assinante passava a operar a conta de outro, e o próximo "seguir" feito
 * ali caía na conta errada.
 *
 * Contrato agora:
 * - sem sessão, ou sessão do mesmo assinante: o GET segue como antes;
 * - sessão de outro assinante: o GET preserva o cookie atual, guarda o token do
 *   link num cookie pendente e manda para /alertas/acesso/confirmar;
 * - a troca só acontece no POST /alertas/acesso com Origin da própria origem.
 *
 * Os testes passam as respostas por um cookie jar mínimo para exercer o fluxo
 * de ponta a ponta (link -> confirmação -> seguir) contra o duplo de Supabase.
 */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import {
  AlertsRouteFixture,
  seedCandidate,
  seedSubscriber,
} from "./helpers/alerts-route-fixture"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const { NextRequest } = require("next/server") as typeof import("next/server")
const acessoModule = require("../src/app/(site)/alertas/acesso/route")
const { createAlertsAcessoHandler } = acessoModule
const createAlertsAcessoConfirmHandler = acessoModule.createAlertsAcessoConfirmHandler as
  | ((deps: unknown) => (req: InstanceType<typeof NextRequest>) => Promise<Response>)
  | undefined
const { createToggleHandler } = require("../src/app/api/alerts/toggle/route")

const SESSION_COOKIE = "pf_alerts_manage"
const PENDING_COOKIE = "pf_alerts_manage_pending"
const TOKEN_ATUAL = "ManageTokenAtual0001"
const TOKEN_OUTRO = "ManageTokenOutro0001"

type NextRequestInstance = InstanceType<typeof NextRequest>

interface JarEntry {
  value: string
  path: string
}

/** Cookie jar mínimo: respeita valor, remoção (expires/maxAge) e prefixo de path. */
class CookieJar {
  private readonly entries = new Map<string, JarEntry>()

  set(name: string, value: string, path = "/") {
    this.entries.set(name, { value, path })
  }

  get(name: string): string | undefined {
    return this.entries.get(name)?.value
  }

  headerFor(pathname: string): string {
    return [...this.entries.entries()]
      .filter(([, entry]) => pathname.startsWith(entry.path))
      .map(([name, entry]) => `${name}=${entry.value}`)
      .join("; ")
  }

  absorb(response: Response) {
    const cookies = (response as unknown as { cookies?: { getAll(): Array<Record<string, unknown>> } }).cookies
    for (const cookie of cookies?.getAll() ?? []) {
      const name = String(cookie.name)
      const expires = cookie.expires instanceof Date ? cookie.expires.getTime() : null
      const removed =
        cookie.value === "" ||
        (typeof cookie.maxAge === "number" && cookie.maxAge <= 0) ||
        (expires !== null && expires <= Date.now())
      if (removed) this.entries.delete(name)
      else this.set(name, String(cookie.value), typeof cookie.path === "string" ? cookie.path : "/")
    }
  }
}

function cenario() {
  const atual = seedSubscriber({
    id: "sub_atual",
    email: "atual@example.com",
    manageToken: TOKEN_ATUAL,
    verifyToken: "VerifyTokenAtual0001",
    verified: true,
    verified_at: "2026-03-01T10:00:00.000Z",
    verify_token_hash: null,
  })
  const outro = seedSubscriber({
    id: "sub_outro",
    email: "outro@example.com",
    manageToken: TOKEN_OUTRO,
    verifyToken: "VerifyTokenOutro0001",
    verified: true,
    verified_at: "2026-03-01T10:00:00.000Z",
    verify_token_hash: null,
  })
  const fixture = new AlertsRouteFixture({
    candidatos_publico: [seedCandidate()],
    alert_subscribers: [atual, outro],
    alert_subscriptions: [],
  })
  return { fixture }
}

function deps(fixture: AlertsRouteFixture) {
  return {
    findSubscriberByManageToken: (manageToken: string) => fixture.findSubscriberByManageToken(manageToken),
    findPublicCandidateBySlug: (slug: string) => fixture.findPublicCandidateBySlug(slug),
    createAlertsServiceRoleClient: () => fixture.createClient(),
    logAlertsApiExit: fixture.logAlertsApiExit,
  }
}

function abrirLink(jar: CookieJar, query: string): NextRequestInstance {
  const cookie = jar.headerFor("/alertas/acesso")
  return new NextRequest(`http://localhost/alertas/acesso?${query}`, {
    headers: {
      "x-forwarded-for": "198.51.100.20",
      ...(cookie ? { cookie } : {}),
    },
  })
}

function confirmar(jar: CookieJar, headers: Record<string, string>, body = ""): NextRequestInstance {
  const cookie = jar.headerFor("/alertas/acesso")
  return new NextRequest("http://localhost/alertas/acesso", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "198.51.100.20",
      ...headers,
      ...(cookie ? { cookie } : {}),
    },
    body,
  })
}

function seguir(jar: CookieJar, candidateSlug = "lula"): NextRequestInstance {
  const cookie = jar.headerFor("/api/alerts/toggle")
  return new NextRequest("http://localhost/api/alerts/toggle", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "x-forwarded-for": "198.51.100.20",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ candidateSlug }),
  })
}

function confirmHandler(fixture: AlertsRouteFixture) {
  assert.equal(
    typeof createAlertsAcessoConfirmHandler,
    "function",
    "POST /alertas/acesso (confirmação da troca) não existe",
  )
  return createAlertsAcessoConfirmHandler!(deps(fixture))
}

describe("GET /alertas/acesso com sessão de outra conta", () => {
  it("não troca o cookie, pede confirmação, e o seguir continua na conta atual", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(deps(fixture))
    const toggle = createToggleHandler(deps(fixture))
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, TOKEN_ATUAL)

    const resposta = await acesso(abrirLink(jar, `manage=${TOKEN_OUTRO}`))
    jar.absorb(resposta)

    assert.equal(jar.get(SESSION_COOKIE), TOKEN_ATUAL, "o GET trocou a sessão sem confirmação")
    const location = new URL(resposta.headers.get("location") ?? "", "http://localhost")
    assert.equal(location.pathname, "/alertas/acesso/confirmar", "a troca precisa passar pela confirmação")
    assert.equal(location.searchParams.get("manage"), null, "o token do link não pode ir para a URL de confirmação")
    assert.equal(jar.get(PENDING_COOKIE), TOKEN_OUTRO, "o token do link fica só no cookie pendente")

    const follow = await toggle(seguir(jar))
    assert.equal(follow.status, 200)
    const inscricoes = fixture.getTable("alert_subscriptions")
    assert.equal(inscricoes.length, 1)
    assert.equal(inscricoes[0].subscriber_id, "sub_atual", "o seguir caiu na conta do link, não na do navegador")
  })

  it("falha ao resolver a sessão atual preserva o cookie (fail-closed)", async () => {
    const { fixture } = cenario()
    const base = deps(fixture)
    const acesso = createAlertsAcessoHandler({
      ...base,
      findSubscriberByManageToken: async (token: string) => {
        if (token === TOKEN_ATUAL) throw new Error("db down")
        return base.findSubscriberByManageToken(token)
      },
    })
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, TOKEN_ATUAL)

    const resposta = await acesso(abrirLink(jar, `manage=${TOKEN_OUTRO}`))
    jar.absorb(resposta)

    assert.equal(jar.get(SESSION_COOKIE), TOKEN_ATUAL)
    assert.equal(new URL(resposta.headers.get("location") ?? "").pathname, "/alertas/acesso/confirmar")
  })
})

describe("POST /alertas/acesso confirma a troca", () => {
  it("com Origin da própria origem troca a sessão, limpa o pendente, e o seguir vai para a conta nova", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(deps(fixture))
    const confirm = confirmHandler(fixture)
    const toggle = createToggleHandler(deps(fixture))
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, TOKEN_ATUAL)

    jar.absorb(await acesso(abrirLink(jar, `manage=${TOKEN_OUTRO}`)))
    const resposta = await confirm(confirmar(jar, { origin: "http://localhost", "sec-fetch-site": "same-origin" }))
    jar.absorb(resposta)

    assert.equal(resposta.status, 303)
    assert.equal(new URL(resposta.headers.get("location") ?? "").pathname, "/alertas/gerenciar")
    assert.equal(jar.get(SESSION_COOKIE), TOKEN_OUTRO)
    assert.equal(jar.get(PENDING_COOKIE), undefined, "o pedido pendente precisa ser consumido")

    await toggle(seguir(jar))
    const inscricoes = fixture.getTable("alert_subscriptions")
    assert.equal(inscricoes.length, 1)
    assert.equal(inscricoes[0].subscriber_id, "sub_outro")
  })

  it("leva o verify do link até a página de confirmação de email", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(deps(fixture))
    const confirm = confirmHandler(fixture)
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, TOKEN_ATUAL)

    const get = await acesso(abrirLink(jar, `verify=VerifyTokenOutro0001&manage=${TOKEN_OUTRO}`))
    jar.absorb(get)
    const confirmUrl = new URL(get.headers.get("location") ?? "")
    assert.equal(confirmUrl.searchParams.get("verify"), "VerifyTokenOutro0001")

    const resposta = await confirm(
      confirmar(jar, { origin: "http://localhost" }, `verify=${confirmUrl.searchParams.get("verify")}`),
    )
    const destino = new URL(resposta.headers.get("location") ?? "")
    assert.equal(destino.pathname, "/alertas/verificar")
    assert.equal(destino.searchParams.get("token"), "VerifyTokenOutro0001")
    jar.absorb(resposta)
    assert.equal(jar.get(SESSION_COOKIE), TOKEN_OUTRO)
  })

  for (const [nome, headers] of [
    ["sem Origin", {}],
    ["com Origin de outro site", { origin: "https://example.org" }],
    ["com Sec-Fetch-Site cross-site", { origin: "http://localhost", "sec-fetch-site": "cross-site" }],
    ["com Origin null", { origin: "null" }],
  ] as const) {
    it(`${nome} é recusado e a sessão atual fica`, async () => {
      const { fixture } = cenario()
      const acesso = createAlertsAcessoHandler(deps(fixture))
      const confirm = confirmHandler(fixture)
      const jar = new CookieJar()
      jar.set(SESSION_COOKIE, TOKEN_ATUAL)

      jar.absorb(await acesso(abrirLink(jar, `manage=${TOKEN_OUTRO}`)))
      const resposta = await confirm(confirmar(jar, { ...headers }))
      jar.absorb(resposta)

      assert.equal(resposta.status, 403)
      assert.equal(jar.get(SESSION_COOKIE), TOKEN_ATUAL)
    })
  }

  it("sem pedido pendente não troca nada", async () => {
    const { fixture } = cenario()
    const confirm = confirmHandler(fixture)
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, TOKEN_ATUAL)

    const resposta = await confirm(confirmar(jar, { origin: "http://localhost" }))
    jar.absorb(resposta)

    assert.equal(resposta.status, 303)
    assert.equal(new URL(resposta.headers.get("location") ?? "").pathname, "/alertas/gerenciar")
    assert.equal(jar.get(SESSION_COOKIE), TOKEN_ATUAL)
  })

  it("token pendente que não corresponde a ninguém não vira sessão", async () => {
    const { fixture } = cenario()
    const confirm = confirmHandler(fixture)
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, TOKEN_ATUAL)
    jar.set(PENDING_COOKIE, "ManageTokenInventado9", "/alertas/acesso")

    const resposta = await confirm(confirmar(jar, { origin: "http://localhost" }))
    jar.absorb(resposta)

    assert.equal(jar.get(SESSION_COOKIE), TOKEN_ATUAL)
    assert.equal(jar.get(PENDING_COOKIE), undefined)
  })
})

describe("fluxos que não mudam", () => {
  it("navegador sem sessão recebe o cookie direto, sem confirmação", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(deps(fixture))
    const jar = new CookieJar()

    const resposta = await acesso(abrirLink(jar, `manage=${TOKEN_OUTRO}`))
    jar.absorb(resposta)

    assert.equal(resposta.status, 307)
    assert.equal(new URL(resposta.headers.get("location") ?? "").pathname, "/alertas/gerenciar")
    assert.equal(jar.get(SESSION_COOKIE), TOKEN_OUTRO)
    assert.equal(jar.get(PENDING_COOKIE), undefined)
  })

  it("link da mesma conta que já está no navegador segue direto", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(deps(fixture))
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, TOKEN_OUTRO)

    const resposta = await acesso(abrirLink(jar, `manage=${TOKEN_OUTRO}&hash=cancelar-tudo`))
    jar.absorb(resposta)

    const location = new URL(resposta.headers.get("location") ?? "")
    assert.equal(location.pathname, "/alertas/gerenciar")
    assert.equal(location.hash, "#cancelar-tudo")
    assert.equal(jar.get(SESSION_COOKIE), TOKEN_OUTRO)
    assert.equal(jar.get(PENDING_COOKIE), undefined)
  })

  it("cookie antigo que não corresponde a ninguém não bloqueia o link", async () => {
    const { fixture } = cenario()
    const acesso = createAlertsAcessoHandler(deps(fixture))
    const jar = new CookieJar()
    jar.set(SESSION_COOKIE, "ManageTokenApagado001")

    const resposta = await acesso(abrirLink(jar, `manage=${TOKEN_OUTRO}`))
    jar.absorb(resposta)

    assert.equal(new URL(resposta.headers.get("location") ?? "").pathname, "/alertas/gerenciar")
    assert.equal(jar.get(SESSION_COOKIE), TOKEN_OUTRO)
  })
})
