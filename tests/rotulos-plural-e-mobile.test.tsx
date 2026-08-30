import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ProfileTabs } from "../src/components/ProfileTabs"
import { formatDestaquesLabel } from "../src/lib/ui-labels"

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf-8")
}

/**
 * Dois defeitos de rotulo do master-review, na mesma barra e no mesmo card:
 *   - "1 DESTAQUES" no card do topo da ficha e no widget de embed;
 *   - "PES…" na aba Pesquisas a 360px, porque o rotulo mobile era o nome inteiro.
 */
describe("singular de Destaques", () => {
  it("singulariza em 1 e mantém plural no resto", () => {
    assert.equal(formatDestaquesLabel(1), "Destaque")
    assert.equal(formatDestaquesLabel(0), "Destaques")
    assert.equal(formatDestaquesLabel(2), "Destaques")
    assert.equal(formatDestaquesLabel(37), "Destaques")
  })

  it("as três superfícies chamam o helper, nenhuma tem o rótulo fixo", () => {
    const ficha = readSource("src/components/CandidatoProfile.tsx")
    const embed = readSource("src/components/EmbedWidget.tsx")

    assert.match(ficha, /label=\{formatDestaquesLabel\(destaques\.totalExibido\)\}/)
    assert.match(ficha, /label: formatDestaquesLabel\(destaques\.totalExibido\)/)
    assert.match(embed, /label=\{formatDestaquesLabel\(pontos\.length\)\}/)

    assert.doesNotMatch(ficha, /label="Destaques"/, "card ou aba com rótulo fixo")
    assert.doesNotMatch(embed, /label="Destaques"/, "embed com rótulo fixo")
  })
})

describe("rótulo mobile da aba Pesquisas", () => {
  const tabs = [
    { id: "geral", label: "Visão geral" },
    { id: "pesquisas", label: "Pesquisas", count: 3 },
    { id: "programa", label: "Programa" },
  ]

  it("usa a forma curta na barra mobile e o nome inteiro no desktop", () => {
    // O componente emite as duas barras no mesmo markup, a mobile escondida por
    // CSS (`sm:hidden`) e a desktop por `hidden sm:flex`. Isolar a mobile pelo
    // aria-label é o que separa uma da outra.
    const html = renderToStaticMarkup(
      React.createElement(ProfileTabs, {
        tabs,
        activeTab: "geral",
        onTabChange: () => {},
        variant: "mobile" as const,
      }),
    )
    const inicio = html.indexOf('aria-label="Seções principais do perfil"')
    assert.ok(inicio > 0, "não achei a tablist mobile")
    const barraMobile = html.slice(inicio)

    assert.ok(barraMobile.includes(">Pesq.<"), "barra mobile devia usar a forma curta")
    assert.ok(
      !barraMobile.includes(">Pesquisas<"),
      "barra mobile não pode usar o nome inteiro, que trunca em PES… a 360px",
    )
    // O desktop, que tem espaço, continua com o nome por extenso.
    assert.ok(html.slice(0, inicio).includes(">Pesquisas<"), "desktop perdeu o nome inteiro")
  })

  it("nenhum rótulo mobile passa de 8 caracteres", () => {
    const src = readSource("src/components/ProfileTabs.tsx")
    const bloco = /const MOBILE_TAB_LABELS: Record<string, string> = \{([\s\S]*?)\}/.exec(src)
    assert.ok(bloco, "não achei MOBILE_TAB_LABELS")
    const rotulos = [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    assert.ok(rotulos.length >= 3, rotulos.join(","))
    for (const rotulo of rotulos) {
      assert.ok(
        rotulo.length <= 8,
        `"${rotulo}" tem ${rotulo.length} caracteres e trunca a 360px`,
      )
    }
  })
})
