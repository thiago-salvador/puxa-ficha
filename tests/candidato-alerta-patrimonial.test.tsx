import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { MoneyTabSection } from "@/components/CandidatoProfileSections"
import { ProfileOverview } from "@/components/ProfileOverview"
import { fonteDadosAbertosPatrimonioTse } from "@/lib/evolucao-patrimonial"
import type { FichaCandidato, Patrimonio } from "@/lib/types"

function patrimonioRow(ano_eleicao: number, valor_total: number): Patrimonio {
  return {
    id: `pat-${ano_eleicao}`,
    candidato_id: "candidato-alerta",
    ano_eleicao,
    valor_total,
    bens: [],
  }
}

function renderMoneyTab(patrimonio: Patrimonio[]): string {
  return renderToStaticMarkup(
    <MoneyTabSection
      patrimonio={patrimonio}
      financiamento={[]}
      historico={[]}
      gastos={[]}
      historicoLength={0}
      suggestion={null}
    />,
  )
}

function buildFicha(patrimonio: Patrimonio[]): FichaCandidato {
  return {
    patrimonio,
    financiamento: [],
    processos: [],
    votos: [],
    historico: [],
    pontos_atencao: [],
    projetos_lei: [],
    gastos_parlamentares: [],
    gastos_executivo: [],
  } as unknown as FichaCandidato
}

test("exibe o sinal na visão geral e na aba Dinheiro quando o aumento passa de R$ 1 milhão", () => {
  const patrimonio = [patrimonioRow(2022, 500_000), patrimonioRow(2026, 2_000_000)]
  const moneyHtml = renderMoneyTab(patrimonio)
  const overviewHtml = renderToStaticMarkup(
    <ProfileOverview ficha={buildFicha(patrimonio)} onNavigateTab={() => {}} />,
  )

  for (const html of [moneyHtml, overviewHtml]) {
    assert.ok(html.includes('data-pf-patrimonio-evolucao-alerta="1500000"'))
    assert.ok(html.includes("Aumento patrimonial expressivo"))
    assert.ok(html.includes("entre 2022 e 2026"))
    assert.ok(html.includes("não determina sua causa"))
    assert.ok(html.includes(`href="${fonteDadosAbertosPatrimonioTse(2022)}"`))
    assert.ok(html.includes(`href="${fonteDadosAbertosPatrimonioTse(2026)}"`))
  }
})

test("omite o sinal quando o aumento é exatamente R$ 1 milhão", () => {
  const html = renderMoneyTab([
    patrimonioRow(2022, 500_000),
    patrimonioRow(2026, 1_500_000),
  ])

  assert.ok(!html.includes("data-pf-patrimonio-evolucao-alerta"))
  assert.ok(!html.includes("Sinal de alerta"))
})

test("omite o sinal sem duas declarações comparáveis", () => {
  const html = renderMoneyTab([patrimonioRow(2026, 2_000_000)])

  assert.ok(!html.includes("data-pf-patrimonio-evolucao-alerta"))
})
