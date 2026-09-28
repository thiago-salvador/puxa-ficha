import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const require = createRequire(import.meta.url)
require.extensions[".css"] = (module) => {
  const target: Record<string, unknown> = {}
  const styles = new Proxy(target, { get: (object, property) => property === "default" ? object.default : property })
  target.default = styles
  module.exports = styles
}

test("quadro de estados rola no celular e por isso aceita foco de teclado com rótulo", async () => {
  const { StateBoard } = await import("../src/components/imprensa/method/StateBoard")
  const { computeMethodStateBoard } = await import("../src/lib/imprensa-frescor")
  const rows = computeMethodStateBoard([
    { patrimonio: { estado: "publicado" }, processos: { estado: "indeterminado" }, sancoes: { estado: "vazio-confirmado" }, tcu: { estado: "vazio_verificado" }, sites: { estado: "publicado" } },
  ] as never)
  const html = renderToStaticMarkup(<StateBoard rows={rows} total={1} />)
  assert.match(html, /<div[^>]*role="region"[^>]*>/)
  assert.match(html, /<div[^>]*aria-label="Candidatos por estado do dado"[^>]*>/)
  assert.match(html, /<div[^>]*tabindex="0"[^>]*>/i)
})

test("o foco de teclado no quadro de estados tem contorno visível no CSS real", async () => {
  const { readFileSync } = await import("node:fs")
  const css = readFileSync(new URL("../src/components/imprensa/method/method.module.css", import.meta.url), "utf8")
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selectors]) =>
    selectors.split(",").some((selector) => selector.trim() === ".board:focus-visible"),
  )
  assert.ok(rule, "falta a regra .board:focus-visible")
  assert.match(rule[2], /outline:\s*3px solid var\(--focus\)/)
  assert.match(rule[2], /outline-offset:\s*3px/)
})
