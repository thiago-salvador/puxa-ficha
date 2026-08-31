import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"

import { FINANCING_BREAKDOWN_KEYS, FINANCING_COLOR_BY_KEY } from "../src/lib/ui-labels"

/**
 * O donut de financiamento desenhava as fatias claras (`#d4d4d4`, `#e5e5e5`)
 * sobre o card branco: 1,6:1 e 1,3:1. Um candidato com 100% em "Outras origens"
 * via um anel que parecia estado vazio. WCAG 1.4.11 pede 3:1 para componente
 * grafico nao textual, e e esse o piso travado aqui.
 */
const MINIMO_CONTRASTE = 3

function canalLinear(valor: number): number {
  const s = valor / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminanciaRelativa(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  assert.ok(m, `cor fora do formato #rrggbb: ${hex}`)
  const n = Number.parseInt(m[1], 16)
  const r = canalLinear((n >> 16) & 0xff)
  const g = canalLinear((n >> 8) & 0xff)
  const b = canalLinear(n & 0xff)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: string, b: string): number {
  const la = luminanciaRelativa(a)
  const lb = luminanciaRelativa(b)
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la]
  return (claro + 0.05) / (escuro + 0.05)
}

function fundoDoCard(): string {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8")
  const m = /--card:\s*(#[0-9a-fA-F]{6})/.exec(css)
  assert.ok(m, "não achei --card em globals.css")
  return m[1]
}

describe("paleta do donut de financiamento", () => {
  it("cobre exatamente as chaves do breakdown", () => {
    assert.deepEqual(
      Object.keys(FINANCING_COLOR_BY_KEY).sort(),
      [...FINANCING_BREAKDOWN_KEYS].sort(),
    )
  })

  it("toda cor de dado tem pelo menos 3:1 contra o fundo do card", () => {
    const fundo = fundoDoCard()
    for (const [chave, cor] of Object.entries(FINANCING_COLOR_BY_KEY)) {
      const razao = contraste(cor, fundo)
      assert.ok(
        razao >= MINIMO_CONTRASTE,
        `${chave} (${cor}) tem ${razao.toFixed(2)}:1 contra ${fundo}, abaixo de ${MINIMO_CONTRASTE}:1`,
      )
    }
  })

  it("as fatias são distinguíveis entre si", () => {
    const cores = FINANCING_BREAKDOWN_KEYS.map((k) => FINANCING_COLOR_BY_KEY[k])
    for (let i = 1; i < cores.length; i += 1) {
      assert.ok(
        contraste(cores[i - 1], cores[i]) >= 1.2,
        `fatias vizinhas ${cores[i - 1]} e ${cores[i]} ficaram indistinguíveis`,
      )
    }
  })

  it("nenhum componente redefine a paleta localmente", () => {
    for (const rel of [
      "src/components/ProfileOverview.tsx",
      "src/components/CandidatoProfileSections.tsx",
    ]) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf-8")
      assert.doesNotMatch(
        src,
        /fundo_eleitoral:\s*"#/,
        `${rel} não pode ter cópia local da paleta de financiamento`,
      )
    }
  })
})
