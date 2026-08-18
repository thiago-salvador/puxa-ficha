import test from "node:test"
import assert from "node:assert/strict"
import {
  EDITORIAL_BADGE_LABELS,
  resolveEditorialBadgeKind,
  type EditorialBadgeKind,
} from "../src/lib/editorial-badge"

/**
 * Contrato: cada par (gerado_por, verificado) válido em `PontoAtencao` mapeia para um kind único.
 * Comportamento esperado na UI: ver EditorialBadge + EDITORIAL_BADGE_LABELS (texto exibido).
 */
test("resolveEditorialBadgeKind: matriz completa gerado_por × verificado", () => {
  const cases: Array<{
    geradoPor: "ia" | "curadoria" | "automatico"
    verificado: boolean
    expected: EditorialBadgeKind
  }> = [
    { geradoPor: "curadoria", verificado: true, expected: "curadoria_verified" },
    { geradoPor: "curadoria", verificado: false, expected: "curadoria_pending" },
    { geradoPor: "ia", verificado: true, expected: "ia_verified" },
    { geradoPor: "ia", verificado: false, expected: "ia_pending" },
    { geradoPor: "automatico", verificado: true, expected: "automatico_verified" },
    { geradoPor: "automatico", verificado: false, expected: "automatico_pending" },
  ]
  for (const c of cases) {
    assert.equal(resolveEditorialBadgeKind(c.geradoPor, c.verificado), c.expected)
  }
})

test("EDITORIAL_BADGE_LABELS: seis kinds, textos distintos e não vazios", () => {
  const kinds: EditorialBadgeKind[] = [
    "curadoria_verified",
    "curadoria_pending",
    "ia_verified",
    "ia_pending",
    "automatico_verified",
    "automatico_pending",
  ]
  const labels = kinds.map((k) => EDITORIAL_BADGE_LABELS[k])
  for (const k of kinds) {
    assert.ok(EDITORIAL_BADGE_LABELS[k].length > 12, k)
  }
  assert.equal(new Set(labels).size, 6, "cada kind deve ter copy única")
})

test("gerado_por 'automatico': mapeia para automatico_verified ou automatico_pending (não existe kind único 'automatico')", () => {
  assert.equal(resolveEditorialBadgeKind("automatico", true), "automatico_verified")
  assert.equal(resolveEditorialBadgeKind("automatico", false), "automatico_pending")
})
