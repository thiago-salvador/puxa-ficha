import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

/** Intl usa espaco nao separavel (U+00A0/U+202F) entre numero e sufixo. */
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ")

import { formatBRL, formatCompact, formatCompactNumber, formatDecimal, formatPercent } from "@/lib/utils"
import { STATE_INDICATOR_CONFIG } from "@/lib/state-indicator-metadata"

/**
 * Regressao do master review de 2026-08-04 (G5-03).
 *
 * O mesmo patrimonio aparecia como "R$ 129.8M" no card e no comparador
 * (sufixo e ponto decimal en-US) e como "R$ 129.795.314" no ranking.
 * Site civico em pt-BR nao pode exibir "R$ 1.7M": e ambiguo para o leitor
 * brasileiro. Todo numero exibido sai dos formatadores centrais pt-BR.
 */
describe("formatadores centrais pt-BR", () => {
  it("moeda compacta usa sufixo pt-BR e virgula decimal", () => {
    assert.equal(norm(formatCompact(129_795_314)).replace(/ /g, " "), "R$ 129,8 mi")
    assert.equal(norm(formatCompact(595_100)).replace(/ /g, " "), "R$ 595,1 mil")
    assert.equal(norm(formatCompact(3_445)).replace(/ /g, " "), "R$ 3,4 mil")
    assert.equal(norm(formatCompact(2_100_000_000)).replace(/ /g, " "), "R$ 2,1 bi")
  })

  it("abaixo de mil cai no BRL cheio com separador pt-BR", () => {
    assert.equal(norm(formatCompact(999)).replace(/ /g, " "), "R$ 999")
    assert.equal(norm(formatBRL(129_795_314)).replace(/ /g, " "), "R$ 129.795.314")
  })

  it("contagem compacta, decimal e percentual sao pt-BR", () => {
    assert.equal(norm(formatCompactNumber(46_600_000)), "46,6 mi")
    assert.equal(formatDecimal(0.491, 3), "0,491")
    assert.equal(formatPercent(4.7, 1), "4,7%")
    assert.equal(formatPercent(14, 1), "14,0%")
  })

  it("nenhum formatador emite sufixo en-US (K/M) nem ponto decimal", () => {
    for (const value of [1_234, 56_789, 1_234_567, 129_795_314, 2_100_000_000]) {
      const compact = formatCompact(value)
      assert.doesNotMatch(compact, /\d[KM]\b/, `sufixo en-US em ${compact}`)
      assert.doesNotMatch(compact, /\d\.\d(?!\d)/, `ponto decimal em ${compact}`)
    }
  })

  it("indicadores estaduais formatam em pt-BR", () => {
    assert.equal(norm(STATE_INDICATOR_CONFIG.populacao_estimada.format(46_600_000)), "46,6 mi")
    assert.equal(norm(STATE_INDICATOR_CONFIG.gini.format(0.491)), "0,491")
    assert.equal(norm(STATE_INDICATOR_CONFIG.taxa_desemprego.format(4.7)), "4,7%")
    assert.equal(norm(STATE_INDICATOR_CONFIG.homicidios_100k.format(23.45)), "23,5")
  })
})

/**
 * O mesmo campo (patrimonio) precisa sair do MESMO formatador central em
 * card, comparador e ranking. Guarda por fonte: se alguem reintroduzir um
 * template manual "R$ ..." com toFixed nesses componentes, o teste quebra.
 */
describe("card, comparador e ranking usam o formatador central", () => {
  const root = process.cwd()
  const surfaces = [
    "src/components/CandidatoCard.tsx",
    "src/components/CandidatoGrid.tsx",
    "src/components/ComparadorPanel.tsx",
  ]

  for (const surface of surfaces) {
    it(`${surface} nao formata moeda na mao`, () => {
      const src = readFileSync(join(root, surface), "utf8")
      assert.match(src, /formatCompact/, "deve importar o formatador central")
      assert.doesNotMatch(src, /toFixed\(/, "toFixed manual em superficie publica")
      assert.doesNotMatch(src, /R\$ \$\{/, "template R$ manual em superficie publica")
    })
  }
})
