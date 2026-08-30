import assert from "node:assert/strict"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { DeferredCandidatoProfileClient } from "../src/components/DeferredCandidatoProfileClient"
import { formatCompact } from "../src/lib/utils"

/**
 * O skeleton e a primeira pintura da ficha. O KPI de patrimonio usava um compact
 * sem moeda e imprimia "189,2 mil"; o card hidratado, logo depois, imprime
 * "R$ 189,2 mil". O numero trocava de significado no meio do carregamento.
 */
function renderSkeleton(patrimonio: number | null): string {
  return renderToStaticMarkup(
    React.createElement(DeferredCandidatoProfileClient, {
      slug: "candidato-teste",
      overview: { processos: 0, patrimonio, mudancas: 1 },
    }),
  )
}

describe("KPI de patrimônio no skeleton da ficha", () => {
  it("usa a mesma formatação do card hidratado, com R$", () => {
    const html = renderSkeleton(189_200)
    const esperado = formatCompact(189_200)
    assert.match(esperado, /^R\$ /, "formatCompact é a função do card real e leva R$")
    assert.ok(
      html.includes(esperado),
      `skeleton devia exibir ${JSON.stringify(esperado)}; html não contém`,
    )
    assert.ok(
      html.includes(`data-pf-overview-patrimonio="${esperado}"`),
      "o readback do KPI tem que carregar o mesmo texto exibido",
    )
  })

  it("não imprime mais o compact sem moeda", () => {
    const html = renderSkeleton(189_200)
    const semMoeda = new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(189_200)
    assert.ok(
      !html.includes(`>${semMoeda}<`),
      `skeleton não pode exibir ${JSON.stringify(semMoeda)} sem R$`,
    )
  })

  it("patrimônio ausente continua N/D", () => {
    const html = renderSkeleton(null)
    assert.ok(html.includes('data-pf-overview-patrimonio="N/D"'), html.slice(0, 400))
  })

  it("valores grandes e pequenos batem com o card", () => {
    for (const valor of [0, 1_500, 45_000_000, 656_400]) {
      const html = renderSkeleton(valor)
      assert.ok(
        html.includes(formatCompact(valor)),
        `${valor} devia sair como ${formatCompact(valor)}`,
      )
    }
  })
})
