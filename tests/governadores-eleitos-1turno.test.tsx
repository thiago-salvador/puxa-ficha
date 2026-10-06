// cspell:ignore eleitorado
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { CandidatoResumo } from "@/lib/api"
import { getEstadoUFs } from "@/lib/br-uf"
import { getResultados1Turno } from "@/lib/resultados-1turno"
import { GovernadoresEleitos1Turno } from "@/components/GovernadoresEleitos1Turno"

const data = getResultados1Turno()
const ufs = getEstadoUFs()
const eleitos = (data.disputas ?? []).filter((d) => d.cargo === "Governador" && d.candidatos.some((c) => c.fase === "eleito"))

describe("governadores eleitos no 1º turno", () => {
  it("agrupa os eleitos por região e abre no maior eleitorado, sem números de ficha quando não há resumo", () => {
    const html = renderToStaticMarkup(<GovernadoresEleitos1Turno ufs={ufs} data={data} resumos={null} />)
    assert.equal((html.match(/data-pf-eleito-uf=/g) ?? []).length, eleitos.length)
    const regioes = [...html.matchAll(/data-pf-eleitos-regiao="([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(regioes, ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"].filter((r) => regioes.includes(r)))
    const maior = [...eleitos].sort((a, b) => (b.totais.eleitorado ?? 0) - (a.totais.eleitorado ?? 0))[0].uf.toLowerCase()
    assert.match(html, new RegExp(`data-pf-eleito-card="${maior}"`))
    assert.match(html, /data-pf-eleito-segundo/)
    assert.doesNotMatch(html, /data-pf-eleito-ficha/)
  })

  it("mostra pontos de atenção, processos e patrimônio da ficha que casou pelo slug", () => {
    const maior = [...eleitos].sort((a, b) => (b.totais.eleitorado ?? 0) - (a.totais.eleitorado ?? 0))[0]
    const eleito = maior.candidatos.find((c) => c.fase === "eleito")!
    const resumo = { candidato: { slug: eleito.slug }, patrimonio: 2_345_678, patrimonio_atipico: true, processos: 3, pontos_atencao: 1 } as unknown as CandidatoResumo
    const html = renderToStaticMarkup(<GovernadoresEleitos1Turno ufs={ufs} data={data} resumos={[resumo]} />)
    assert.match(html, /data-pf-eleito-ficha/)
    assert.match(html, /Ponto de atenção/)
    assert.match(html, /R\$ 2,3 mi/)
    assert.match(html, /valor declarado atípico/)
  })

  it("sem eleito no snapshot, a seção some", () => {
    assert.equal(renderToStaticMarkup(<GovernadoresEleitos1Turno ufs={ufs} data={{ ...data, disputas: [] }} resumos={null} />), "")
  })
})
