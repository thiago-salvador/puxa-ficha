import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const require = createRequire(import.meta.url)
require.extensions[".css"] = (module) => {
  const target: Record<string, unknown> = {}
  const styles = new Proxy(target, { get: (object, property) => property === "default" ? object.default : property })
  target.default = styles
  module.exports = styles
}

const { SalaSectionsNav } = require("../src/components/imprensa/sala/SalaSectionsNav") as typeof import("@/components/imprensa/sala/SalaSectionsNav")
const { buildImprensaNav, IMPRENSA_NAV } = require("../src/lib/imprensa-nav") as typeof import("@/lib/imprensa-nav")

function links(html: string): { href: string; labelledby: string; describedby: string }[] {
  return [...html.matchAll(/<a [^>]*>/g)].map(([tag]) => ({
    href: /href="([^"]*)"/.exec(tag)?.[1]?.replace(/&amp;/g, "&") ?? "",
    labelledby: /aria-labelledby="([^"]*)"/.exec(tag)?.[1] ?? "",
    describedby: /aria-describedby="([^"]*)"/.exec(tag)?.[1] ?? "",
  }))
}

function textOf(html: string, id: string): string {
  const match = new RegExp(`id="${id}"[^>]*>(.*?)</span>`).exec(html)
  return match ? match[1].replace(/<[^>]+>/g, "") : ""
}

describe("SalaSectionsNav", () => {
  it("tem um card por página da barra, menos a Sala, na mesma ordem e com o mesmo link", () => {
    const html = renderToStaticMarkup(<SalaSectionsNav />)
    const expected = buildImprensaNav().filter((item) => item.id !== "sala")
    const found = links(html)
    assert.equal(found.length, IMPRENSA_NAV.length - 1)
    assert.deepEqual(found.map((link) => link.href), expected.map((item) => item.href))
    assert.ok(!found.some((link) => link.href === "/imprensa"), "a Sala não aponta para si mesma")
  })

  it("dá a cada card o nome da página e a descrição da fonte única", () => {
    const html = renderToStaticMarkup(<SalaSectionsNav />)
    const expected = buildImprensaNav().filter((item) => item.id !== "sala")
    const found = links(html)
    expected.forEach((item, index) => {
      assert.equal(textOf(html, found[index].labelledby), item.label)
      assert.equal(textOf(html, found[index].describedby), item.description)
      assert.ok(item.description.length > 0)
    })
  })

  it("fica dentro de uma navegação rotulada e mantém a âncora #kit", () => {
    const html = renderToStaticMarkup(<SalaSectionsNav />)
    assert.match(html, /<nav aria-label="Páginas da sala de imprensa"/)
    assert.match(html, /<li id="kit"[^>]*><a [^>]*href="\/imprensa\/kit"/)
    assert.equal((html.match(/ id="kit"/g) ?? []).length, 1)
  })

  it("mostra só o dado vivo recebido e nenhum número inventado", () => {
    const html = renderToStaticMarkup(<SalaSectionsNav live={{ mesa: "1.234 candidatos com linha pública" }} />)
    assert.match(textOf(html, "nesta-sala-mesa-texto"), /1\.234 candidatos com linha pública$/)
    for (const id of ["estado", "presidencia", "atualizacoes", "frescor", "kit"]) {
      assert.doesNotMatch(textOf(html, `nesta-sala-${id}-texto`), /\d/, `sem dado vivo em ${id}`)
    }
  })
})
