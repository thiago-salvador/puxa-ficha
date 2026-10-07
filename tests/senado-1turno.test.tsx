import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getEstadoUFs } from "@/lib/br-uf"
import { getResultados1Turno } from "@/lib/resultados-1turno"
import { Senado1Turno } from "@/components/Senado1Turno"

const data = getResultados1Turno()
const ufs = getEstadoUFs()
const disputas = (data.disputas ?? []).filter((d) => d.cargo === "Senador")

describe("senado no 1º turno", () => {
  it("mapa com as 27 UFs e card do maior eleitorado, com eleitos, suplentes e quem ficou de fora", () => {
    const html = renderToStaticMarkup(<Senado1Turno ufs={ufs} data={data} />)
    assert.equal((html.match(/data-pf-senado-uf=/g) ?? []).length, 27)
    const maior = [...disputas].sort((a, b) => (b.totais.eleitorado ?? 0) - (a.totais.eleitorado ?? 0))[0]
    assert.match(html, new RegExp(`data-pf-senado-card="${maior.uf.toLowerCase()}"`))
    assert.equal((html.match(/data-pf-senado-eleito=/g) ?? []).length, maior.candidatos.filter((c) => c.fase === "eleito").length)
    assert.match(html, /1º suplente/)
    assert.match(html, /data-pf-senado-fora/)
    assert.match(html, /atrás da segunda vaga/)
  })

  it("a legenda soma as 54 vagas", () => {
    const html = renderToStaticMarkup(<Senado1Turno ufs={ufs} data={data} />)
    const legenda = html.slice(html.indexOf("data-pf-senado-legenda"))
    const vagas = [...legenda.matchAll(/>(\d+)(?: vagas?)?<\/span>/g)].reduce((n, m) => n + Number(m[1]), 0)
    const eleitos = disputas.flatMap((d) => d.candidatos.filter((c) => c.fase === "eleito")).length
    assert.equal(vagas, eleitos)
  })

  it("sem Senado no snapshot, a seção some", () => {
    assert.equal(renderToStaticMarkup(<Senado1Turno ufs={ufs} data={{ ...data, disputas: [] }} />), "")
  })
})
