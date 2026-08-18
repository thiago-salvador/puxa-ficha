import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EditorialBadge } from "../src/components/attention-points/EditorialBadge"
import { EDITORIAL_BADGE_LABELS, resolveEditorialBadgeKind } from "../src/lib/editorial-badge"

/**
 * Contrato de UI: o HTML estático do badge contém o fragmento de copy do kind resolvido.
 * Não substitui revisão visual; garante que EditorialBadge e resolveEditorialBadgeKind não divergem.
 */
test("EditorialBadge inclui o texto do EDITORIAL_BADGE_LABELS para cada combinação", () => {
  const combos: Array<{
    geradoPor: "ia" | "curadoria" | "automatico"
    verificado: boolean
  }> = [
    { geradoPor: "curadoria", verificado: true },
    { geradoPor: "curadoria", verificado: false },
    { geradoPor: "ia", verificado: true },
    { geradoPor: "ia", verificado: false },
    { geradoPor: "automatico", verificado: true },
    { geradoPor: "automatico", verificado: false },
  ]
  for (const c of combos) {
    const kind = resolveEditorialBadgeKind(c.geradoPor, c.verificado)
    const label = EDITORIAL_BADGE_LABELS[kind]
    const html = renderToStaticMarkup(
      createElement(EditorialBadge, {
        geradoPor: c.geradoPor,
        verificado: c.verificado,
      }),
    )
    assert.ok(html.includes(label), `expected full label for kind=${kind}`)
    assert.ok(html.includes(`data-pf-editorial-kind="${kind}"`), `expected data-pf-editorial-kind for ${kind}`)
    assert.ok(!html.includes("<svg"), `EditorialBadge should be text-first for kind=${kind}`)
  }
})

test("EditorialBadge surface=onDark: kind automatico_verified no HTML", () => {
  const html = renderToStaticMarkup(
    createElement(EditorialBadge, {
      geradoPor: "automatico",
      verificado: true,
      surface: "onDark",
    }),
  )
  assert.ok(html.includes("Gerado automaticamente"))
  assert.ok(
    html.includes('data-pf-editorial-kind="automatico_verified"'),
    "gerado_por automatico + verificado => EditorialBadgeKind automatico_verified",
  )
  assert.ok(!html.includes("<svg"), "EditorialBadge onDark should also be text-first")
})
