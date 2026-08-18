import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildAlertDeleteDataUrl,
  buildAlertManageUrl,
  buildAlertUnsubscribeUrl,
  buildAlertVerifyUrl,
} from "@/lib/alerts-shared"
import { redactSensitiveUrl } from "@/lib/sentry-scrub"

const MANAGE = "ManageTokenSecretValue01"
const VERIFY = "VerifyTokenSecretValue01"

/**
 * Regressao de 2026-08-03. `sentry-scrub` conhecia `manageToken`/`manage_token` e
 * `verifyToken`/`verify_token`, mas os links que saem nos emails usam os nomes
 * curtos `manage` e `verify`. Como o match e exato por Set (nao substring), o
 * token de gerenciamento ia integro para o Sentry dentro do breadcrumb de
 * navegacao, e quem tivesse acesso ao projeto conseguia gerenciar os alertas do
 * assinante.
 *
 * O teste amarra o redator as URLs REAIS produzidas por alerts-shared, para que
 * renomear um parametro la sem atualizar a lista aqui quebre o build.
 */
describe("sentry-scrub redige os parametros reais dos links de alerta", () => {
  const casos: Array<{ nome: string; url: string; segredo: string }> = [
    { nome: "buildAlertManageUrl", url: buildAlertManageUrl(MANAGE), segredo: MANAGE },
    { nome: "buildAlertVerifyUrl", url: buildAlertVerifyUrl(VERIFY, MANAGE), segredo: VERIFY },
    { nome: "buildAlertDeleteDataUrl", url: buildAlertDeleteDataUrl(MANAGE), segredo: MANAGE },
    { nome: "buildAlertUnsubscribeUrl", url: buildAlertUnsubscribeUrl(MANAGE), segredo: MANAGE },
  ]

  for (const { nome, url, segredo } of casos) {
    it(`${nome}: nenhum token sobrevive ao redator`, () => {
      const redigida = redactSensitiveUrl(url)
      assert.ok(redigida, "redactSensitiveUrl devolveu vazio")
      assert.ok(
        !redigida.includes(segredo),
        `token em claro sobreviveu em ${nome}: ${redigida}`,
      )
      assert.ok(redigida.includes("[REDACTED]"), `esperava marcador de redacao em ${redigida}`)
    })
  }

  it("o token de gerenciamento nao sobrevive em nenhuma das URLs de email", () => {
    for (const { url } of casos) {
      assert.ok(!redactSensitiveUrl(url)?.includes(MANAGE))
    }
  })

  it("preserva a parte nao sensivel da URL", () => {
    const redigida = redactSensitiveUrl(buildAlertManageUrl(MANAGE)) ?? ""
    assert.ok(redigida.includes("/alertas/acesso"), `path perdido: ${redigida}`)
  })

  it("URL sem query passa intacta", () => {
    assert.equal(
      redactSensitiveUrl("https://puxaficha.com.br/candidato/lula"),
      "https://puxaficha.com.br/candidato/lula",
    )
  })
})
