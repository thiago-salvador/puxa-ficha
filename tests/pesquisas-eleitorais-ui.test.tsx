import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

// cspell:ignore cenario Datafolha Bolsonaro marcal

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

const {
  PesquisasPresidenciaisHero,
  PesquisasPresidenciaisOverview,
  PesquisasPresidenciaisTab,
} = require("../src/components/PesquisasPresidenciaisSection") as typeof import("@/components/PesquisasPresidenciaisSection")
const { listarPesquisasPresidenciaisPorSlug } = require(
  "../src/lib/pesquisas-eleitorais",
) as typeof import("@/lib/pesquisas-eleitorais")

const pesquisasLula = listarPesquisasPresidenciaisPorSlug("lula")

describe("experiência v2 de pesquisas presidenciais", () => {
  it("mantém o hero mínimo e restrito ao primeiro turno", () => {
    const html = renderToStaticMarkup(<PesquisasPresidenciaisHero pesquisas={pesquisasLula} />)

    assert.match(html, /data-pf-pesquisa-hero=/)
    assert.match(html, /Datafolha/)
    assert.match(html, /39%/)
    assert.match(html, /18\/08\/2026 a 19\/08\/2026/)
    assert.doesNotMatch(html, /Pesquisa estimulada|cenário|2º turno|46%/i)
    assert.doesNotMatch(html, /aria-live/)
  })

  it("configura rotação de cinco segundos e respeita movimento reduzido", () => {
    const source = readFileSync("src/components/PesquisasPresidenciaisSection.tsx", "utf8")

    assert.match(source, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/)
    assert.match(source, /window\.setInterval/)
    assert.match(source, /}, 5000\)/)
    assert.match(source, /pesquisa\.cenario\.turn === 1/)
    assert.doesNotMatch(source, /aria-live=/)
  })

  it("renderiza exatamente uma pesquisa completa na Visão geral", () => {
    const html = renderToStaticMarkup(
      <PesquisasPresidenciaisOverview pesquisas={pesquisasLula} onOpenTab={() => {}} />,
    )

    assert.equal((html.match(/data-pf-pesquisa-card=/g) ?? []).length, 1)
    assert.match(html, /Datafolha/)
    assert.match(html, /39%/)
    assert.match(html, /Pesquisa estimulada, cenário sem Pablo Marçal/)
    assert.match(html, /2\.058 entrevistas/)
    assert.match(html, /2 pontos percentuais/)
    assert.match(html, /aria-label="Pesquisa anterior"/)
    assert.match(html, /aria-label="Próxima pesquisa"/)
    assert.equal((html.match(/size-11/g) ?? []).length, 2)
    assert.doesNotMatch(html, /41%|46%/)
  })

  it("expande os três resultados na aba Pesquisas", () => {
    const html = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={pesquisasLula} />)

    assert.equal((html.match(/data-pf-pesquisa-card=/g) ?? []).length, 3)
    assert.match(html, /39%/)
    assert.match(html, /41%/)
    assert.match(html, /46%/)
    assert.match(html, /1º turno/)
    assert.match(html, /2º turno/)
    assert.match(html, /Ver divulgação pública/)
    assert.match(html, /fotografia do período/)
    assert.doesNotMatch(html.toLowerCase(), /média|ranking|empate|lidera/)
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
    const oldHtml = renderToStaticMarkup(<PesquisasPresidenciaisTab pesquisas={[oldPoll]} />)
    const zeroHtml = renderToStaticMarkup(
      <PesquisasPresidenciaisTab
        pesquisas={listarPesquisasPresidenciaisPorSlug("hertz-dias")}
      />,
    )

    assert.match(oldHtml, /Pesquisa antiga/)
    assert.doesNotMatch(oldHtml, />39%<|>39%<!-- -->/)
    assert.match(zeroHtml, />0%<|>0%<!-- -->/)
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

  it("carrega pesquisas uma vez no server e remove a seção grande antiga", () => {
    assert.match(
      viewSource,
      /const pesquisas = pesquisasEnabled \? listarPesquisasPresidenciaisPorSlug\(slug\) : \[\]/,
    )
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

  it("isola timeline e não-presidentes por autorização explícita do servidor", () => {
    assert.match(
      viewSource,
      /ficha\.cargo_disputado === "Presidente" && seoSubpath !== "timeline"/,
    )
    assert.match(profileSource, /id !== "pesquisas" \|\| pesquisasEnabled/)
    assert.match(profileSource, /next === "pesquisas" && !pesquisasEnabled/)
  })
})
