import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BoxShareButton } from "@/components/BoxShareButton"
import type { BoxCardModel } from "@/lib/box-card-model"

const model: BoxCardModel = {
  kind: "patrimonio-resumo",
  title: "Patrimônio declarado",
  key: "candidata-teste",
  identity: "Candidata Teste · Partido",
  rows: [{ label: "2022", value: "R$ 0,00" }],
  warnings: [],
  sources: [],
  deepLink: "/candidato/candidata-teste?tab=geral#box-patrimonio-resumo",
  revision: "rev-1",
}

test("BoxShareButton não cria elemento quando a projeção é nula", () => {
  assert.equal(renderToStaticMarkup(createElement(BoxShareButton, { model: null })), "")
})

test("BoxShareButton expõe o título e o tipo de card no controle acessível", () => {
  const html = renderToStaticMarkup(createElement(BoxShareButton, { model }))
  assert.match(html, /aria-label="Compartilhar Patrimônio declarado"/)
  assert.match(html, /data-pf-box-share="patrimonio-resumo"/)
  assert.match(html, />Compartilhar</)
  assert.doesNotMatch(html, /role="dialog"/, "o modal só aparece depois do clique")
})
