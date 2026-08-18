import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const root = process.cwd()
const routePath = join(root, "src/app/(site)/alertas/acesso/route.ts")

/**
 * Regressao de 2026-08-03 (master review).
 *
 * GET /alertas/acesso gravava o cookie de sessao de alertas direto do query
 * param, sem nenhuma consulta ao banco. Qualquer string que casasse com
 * ALERT_TOKEN_RE virava sessao por 180 dias.
 *
 * Cenario concreto: o atacante se cadastra, verifica o proprio email e fica com
 * um manage token valido MT_ATK. Manda a vitima abrir
 * https://puxaficha.com.br/alertas/acesso?manage=MT_ATK. Como e navegacao
 * top-level GET, o cookie SameSite=Lax e aceito, e a sessao de alertas da vitima
 * passa a ser a do atacante: as inscricoes que ela criar caem na conta dele, que
 * consegue le-las em GET /api/alerts/me.
 *
 * O contrato agora e o mesmo do POST /api/alerts/session: so vira cookie o token
 * que corresponde a um assinante real, e indisponibilidade do banco falha
 * fechado (redireciona sem cookie) em vez de conceder sessao.
 */
describe("GET /alertas/acesso nao aceita fixacao de sessao", () => {
  const src = readFileSync(routePath, "utf8")

  it("consulta o assinante antes de gravar o cookie", () => {
    assert.match(
      src,
      /findSubscriberByManageToken/,
      "a rota precisa validar o manage token contra o banco antes de setAlertManageTokenCookie",
    )
  })

  it("a validacao acontece ANTES do setAlertManageTokenCookie", () => {
    const posValidacao = src.indexOf("findSubscriberByManageToken(manageToken)")
    const posCookie = src.indexOf("return setAlertManageTokenCookie")
    assert.ok(posValidacao > 0, "chamada de validacao nao encontrada")
    assert.ok(posCookie > 0, "gravacao de cookie nao encontrada")
    assert.ok(
      posValidacao < posCookie,
      "o cookie esta sendo gravado antes (ou sem) a validacao do token",
    )
  })

  it("token sem assinante correspondente nao vira cookie", () => {
    assert.match(
      src,
      /if \(!subscriber\) return response/,
      "faltou o early-return que redireciona sem cookie quando o token nao existe",
    )
  })

  it("falha de banco nao concede sessao (fail-closed)", () => {
    assert.match(
      src,
      /catch \{[\s\S]{0,200}?return response/,
      "erro na consulta precisa redirecionar sem cookie, nunca cair no caminho que grava a sessao",
    )
  })
})
