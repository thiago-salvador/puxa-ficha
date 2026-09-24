import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

// cspell:ignore AtlasIntel cenario Datafolha Bolsonaro Ipsos marcal

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never
require.extensions[".css"] = (module) => {
  const target: Record<string, unknown> = {}
  const styles = new Proxy(target, { get: (object, property) => property === "default" ? object.default : property })
  target.default = styles
  module.exports = styles
}

const {
  PesquisasPresidenciaisHero,
  PesquisasPresidenciaisOverview,
  PesquisasPresidenciaisTab,
} = require("../src/components/PesquisasPresidenciaisSection") as typeof import("@/components/PesquisasPresidenciaisSection")
const {
  listarPesquisasGovernadorPorSlug,
  listarPesquisasPresidenciaisPorSlug,
} = require(
  "../src/lib/pesquisas-eleitorais",
) as typeof import("@/lib/pesquisas-eleitorais")
const { PollWeekDetails } = require(
  "../src/components/PollResearchDetails",
) as typeof import("@/components/PollResearchDetails")
const { aggregatePollWeeks } = require("../src/lib/poll-weeks") as typeof import("@/lib/poll-weeks")
const { fixturePoll } = require("./fixtures/poll-series") as typeof import("./fixtures/poll-series")

const pesquisasLula = listarPesquisasPresidenciaisPorSlug("lula")

function firstLula() {
  const pesquisa = pesquisasLula[0]
  assert.ok(pesquisa)
  return pesquisa
}

function percent(value: number | null) {
  assert.ok(value !== null)
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
}

function date(value: string | null) {
  assert.ok(value)
  return value.split("-").reverse().join("/")
}

function period(pesquisa: ReturnType<typeof firstLula>) {
  return `${date(pesquisa.fieldwork.start.value)} a ${date(pesquisa.fieldwork.end.value)}`
}

describe("experiência v2 de pesquisas presidenciais", () => {
  it("mantém o hero mínimo e restrito ao primeiro turno", () => {
    const html = renderToStaticMarkup(<PesquisasPresidenciaisHero pesquisas={pesquisasLula} />)
    const pesquisa = firstLula()

    assert.match(html, /data-pf-pesquisa-hero=/)
    assert.ok(html.includes(pesquisa.instituto.value!))
    assert.ok(html.includes(percent(pesquisa.resultado.valuePercent)))
    assert.ok(html.includes(period(pesquisa)))
    assert.doesNotMatch(html, /2º turno/i)
    assert.doesNotMatch(html, /aria-live/)
  })

  it("fixa a pesquisa mais recente no hero e omite o cenário complementar", () => {
    const source = readFileSync("src/components/PesquisasPresidenciaisSection.tsx", "utf8")
    const pesquisa = firstLula()
    const html = renderToStaticMarkup(<PesquisasPresidenciaisHero pesquisas={pesquisasLula} />)

    assert.match(source, /const pesquisa = primeiroTurno\[0\]/)
    assert.match(source, /pesquisa\.cenario\.turn === 1/)
    assert.doesNotMatch(source, /useEffect|setInterval|matchMedia/)
    assert.ok(html.includes(pesquisa.cenario.labelRaw) === false)
    assert.doesNotMatch(source, /aria-live=/)
  })

  it("renderiza exatamente uma pesquisa completa na Visão geral", () => {
    const html = renderToStaticMarkup(
      <PesquisasPresidenciaisOverview pesquisas={pesquisasLula} onOpenTab={() => {}} />,
    )
    const pesquisa = firstLula()

    assert.equal((html.match(/data-pf-pesquisa-card=/g) ?? []).length, 1)
    assert.ok(html.includes(pesquisa.instituto.value!))
    assert.ok(html.includes(percent(pesquisa.resultado.valuePercent)))
    assert.ok(html.includes(pesquisa.cenario.labelRaw))
    assert.ok(html.includes(`${pesquisa.sample.size.value!.toLocaleString("pt-BR")} entrevistas`))
    assert.ok(html.includes(`${pesquisa.marginErrorPp.value!.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} pontos percentuais`))
    assert.match(html, /aria-label="Pesquisa anterior"/)
    assert.match(html, /aria-label="Próxima pesquisa"/)
    assert.equal((html.match(/size-11/g) ?? []).length, 2)
    assert.doesNotMatch(html, /2º turno/)
  })

  it("lista as fontes revisadas na aba Pesquisas", () => {
    const html = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={pesquisasLula} />)
    const current = firstLula()
    const datafolha = pesquisasLula.find((pesquisa) => pesquisa.sourceId === "datafolha-folha-globo-nacional-2026")
    assert.ok(datafolha)

    assert.equal((html.match(/data-pf-pesquisa-card=/g) ?? []).length, pesquisasLula.length)
    assert.ok(html.includes(current.instituto.value!))
    assert.ok(html.includes(percent(current.resultado.valuePercent)))
    assert.ok(html.includes(datafolha.instituto.value!))
    assert.ok(html.includes(percent(datafolha.resultado.valuePercent)))
    assert.match(html, /percentuais do total de entrevistados/)
    assert.match(html, /cenário sem Pablo Marçal/)
    assert.match(html, /1º turno/)
    assert.match(html, /Ver divulgação pública/)
    assert.match(html, /fotografia do período/)
    assert.doesNotMatch(html, /AtlasIntel|Ipsos-Ipec|2º turno/)
    assert.doesNotMatch(html.toLowerCase(), /média|ranking|empate|lidera/)
  })

  it("aceita uma, duas ou três fontes sem reservar espaço vazio", () => {
    const datafolha = pesquisasLula[0]
    assert.ok(datafolha)
    const atlas = structuredClone(datafolha)
    atlas.id = `${datafolha.id}-layout-atlas`
    atlas.sourceId = "atlasintel-bloomberg-nacional-2026"
    atlas.instituto.value = "AtlasIntel"
    const ipsos = structuredClone(datafolha)
    ipsos.id = `${datafolha.id}-layout-ipsos`
    ipsos.sourceId = "ipsos-ipec-nacional-2026"
    ipsos.instituto.value = "Ipsos-Ipec"

    for (const pesquisas of [[datafolha], [datafolha, atlas], [datafolha, atlas, ipsos]]) {
      const html = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={pesquisas} />)
      assert.equal((html.match(/data-pf-pesquisa-card=/g) ?? []).length, pesquisas.length)
      assert.doesNotMatch(html, /data-pf-pesquisas-empty=/)
    }
  })

  it("mantém estado vazio explícito nas três superfícies", () => {
    const hero = renderToStaticMarkup(<PesquisasPresidenciaisHero pesquisas={[]} />)
    const overview = renderToStaticMarkup(
      <PesquisasPresidenciaisOverview pesquisas={[]} onOpenTab={() => {}} />,
    )
    const tab = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={[]} />)

    assert.match(hero, /Sem pesquisa qualificada recente/)
    assert.match(overview, /Sem pesquisa qualificada recente para este candidato/)
    assert.match(tab, /Sem pesquisa qualificada recente para este candidato/)
    assert.doesNotMatch(`${hero}${overview}${tab}`, />0%<|>0%<!-- -->/)
  })

  it("troca pesquisa antiga por estado textual e preserva zero publicado", () => {
    const oldPoll = structuredClone(pesquisasLula[0])
    oldPoll.state = "antigo"
    const errorPoll = structuredClone(pesquisasLula[0])
    errorPoll.state = "erro"
    const oldHtml = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={[oldPoll]} />)
    const errorHtml = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={[errorPoll]} />)
    const zeroHtml = renderToStaticMarkup(
      <PesquisasPresidenciaisTab
        pesquisas={listarPesquisasPresidenciaisPorSlug("hertz-dias")}
      />,
    )

    assert.match(oldHtml, /Pesquisa antiga/)
    assert.doesNotMatch(oldHtml, />38,4%<|>38,4%<!-- -->/)
    assert.match(errorHtml, /Resultado indisponível/)
    assert.doesNotMatch(errorHtml, />38,4%<|>38,4%<!-- -->/)
    assert.match(zeroHtml, />0%<|>0%<!-- -->/)
  })

  it("exibe menção espontânea sem convertê-la em candidatura e preserva Outros", () => {
    const poll = fixturePoll("2026-09-15", [31, 42, 10])
    poll.office = "Governador"
    poll.geography = { type: "estadual", label: "Rio Grande do Sul", code: "RS" }
    poll.scenario.geography = "Rio Grande do Sul"
    poll.registration.code.value = "RS-09640/2026"
    poll.provenance.capture.supportingPdfSha256 = "a".repeat(64)
    poll.scenario.id = "real-time-big-data-rs-rs-09640-2026-espontanea-governador"
    poll.scenario.labelRaw = "Espontânea governador"
    poll.scenario.comparabilityKey = "2026|Governador|RS|1|espontanea|real-time-big-data-rs-09640-2026|total_amostra"
    poll.scenario.question = {
      value: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO RIO GRANDE DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)",
      status: "publicado",
    }
    poll.scenario.resultados.push({
      rawLabel: "Eduardo Leite",
      candidateSlug: null,
      matchStatus: "reviewed_source_mention",
      valuePercent: 1,
      status: "publicado",
      sourceMentionReview: {
        registrationId: "RS-09640/2026",
        geographyCode: "RS",
        office: "Governador",
        scenarioId: poll.scenario.id,
        mode: "espontanea",
        sourceSha256: "a".repeat(64),
        rawLabel: "Eduardo Leite",
        valuePercent: 1,
        scenarioLabel: "Espontânea governador",
        scenarioQuestion: "EM OUTUBRO TEREMOS ELEIÇÕES, SE A ELEIÇÃO PARA GOVERNADOR DO RIO GRANDE DO SUL FOSSE HOJE, EM QUEM O (A) SENHOR (A) VOTARIA? (PERGUNTA ABERTA)",
      },
    })
    poll.scenario.resultados.push({
      rawLabel: "Outros",
      candidateSlug: null,
      matchStatus: "not_candidate",
      valuePercent: 2,
      status: "publicado",
    })
    const [week] = aggregatePollWeeks([poll])
    assert.ok(week)
    const html = renderToStaticMarkup(
      <PollWeekDetails
        week={week}
        candidateKeys={["candidate:candidate-0", "candidate:candidate-1", "candidate:candidate-2"]}
      />,
    )

    assert.ok(html.includes("Eduardo Leite"))
    assert.ok(html.includes("1%"))
    assert.match(html, /Menção espontânea; não confirma candidatura/)
    assert.ok(html.includes("Outros"))
    assert.ok(html.includes("2%"))
    const resultsHtml = html.slice(html.indexOf("<ul"), html.indexOf("</ul>") + "</ul>".length)
    assert.doesNotMatch(resultsHtml, /<a\b/)
    assert.doesNotMatch(resultsHtml, /Eduardo Leite[\s\S]*Vínculo com candidatura/)
    assert.match(html, /aria-label="Demais respostas da pesquisa"/)
    assert.doesNotMatch(html, /aria-label="[^"\n]*candidatos/i)
  })

  it("reutiliza as três superfícies para candidaturas estaduais qualificadas", () => {
    const pesquisas = listarPesquisasGovernadorPorSlug("tarcisio-gov-sp", "SP")
    const hero = renderToStaticMarkup(<PesquisasPresidenciaisHero pesquisas={pesquisas} />)
    const overview = renderToStaticMarkup(
      <PesquisasPresidenciaisOverview pesquisas={pesquisas} onOpenTab={() => {}} />,
    )
    const tab = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={pesquisas} />)

    assert.match(hero, /Quaest/)
    assert.match(hero, /44%/)
    assert.match(overview, /44%/)
    assert.equal((tab.match(/data-pf-pesquisa-card=/g) ?? []).length, pesquisas.length)
    assert.match(tab, /quaest-sp-02456-2026-revisao-20260924/)
    assert.match(tab, /datafolha-tarcisio-lidera-disputa/)
    assert.equal(pesquisas[0]?.registration.code.value, "SP-02456/2026")
  })
})

describe("integração e transporte", () => {
  const viewSource = readFileSync(
    "src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx",
    "utf8",
  )
  const deferredSource = readFileSync("src/components/DeferredCandidatoProfile.tsx", "utf8")
  const clientSource = readFileSync("src/components/DeferredCandidatoProfileClient.tsx", "utf8")
  const profileSource = readFileSync("src/components/CandidatoProfile.tsx", "utf8")
  const overviewSource = readFileSync("src/components/ProfileOverview.tsx", "utf8")

  it("carrega pesquisas uma vez no server e remove a seção grande antiga", () => {
    assert.match(viewSource, /listarPesquisasPresidenciaisPorSlug\(slug\)/)
    assert.match(viewSource, /listarPesquisasGovernadorPorSlug\(slug, ficha\.estado\)/)
    assert.equal((viewSource.match(/listarPesquisasPresidenciaisPorSlug\(slug\)/g) ?? []).length, 1)
    assert.doesNotMatch(viewSource, /<PesquisasPresidenciaisSection/)
    assert.match(viewSource, /<PesquisasPresidenciaisHero pesquisas=\{pesquisas\} \/>/)
  })

  it("transporta o mesmo conjunto pelo perfil diferido sem buscar novamente", () => {
    assert.match(deferredSource, /pesquisas=\{pesquisas\}/)
    assert.match(clientSource, /pesquisas=\{pesquisas\}/)
    assert.match(profileSource, /pesquisas=\{pesquisas\}/)
    assert.doesNotMatch(`${deferredSource}${clientSource}${profileSource}`, /listarPesquisasPresidenciaisPorSlug/)
  })

  it("encaixa a pesquisa como um card da mesma grade da Visão geral", () => {
    assert.match(profileSource, /leadingCard=\{[\s\S]*<PesquisasPresidenciaisOverview/)
    assert.match(overviewSource, /data-pf-profile-overview-grid=/)
    assert.match(overviewSource, /<PatrimonioTeaser[\s\S]*\{leadingCard\}/)
  })

  it("autoriza presidente e governador, mantendo timeline isolada", () => {
    assert.match(
      viewSource,
      /ficha\.cargo_disputado === "Presidente" \|\| ficha\.cargo_disputado === "Governador"/,
    )
    assert.match(viewSource, /seoSubpath !== "timeline"/)
    assert.match(profileSource, /id !== "pesquisas" \|\| pesquisasEnabled/)
    assert.match(profileSource, /next === "pesquisas" && !pesquisasEnabled/)
  })
})
