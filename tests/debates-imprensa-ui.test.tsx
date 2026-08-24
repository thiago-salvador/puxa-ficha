import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import {
  CandidateDebatesBentoCard,
  DEBATE_PRESS_QUOTE_ROTATION_MS,
  hasCandidateDebatePressQuotes,
} from "../src/components/CandidateDebatesBentoCard"

describe("box Debates no bento da ficha", () => {
  it("renderiza uma aspa real com fonte, data e controles", () => {
    const html = renderToStaticMarkup(
      <CandidateDebatesBentoCard
        candidateSlug="augusto-cury"
        candidateId="5a4d76d2-6243-41b9-88b2-e94c68383e52"
      />,
    )

    assert.match(html, /data-pf-debates-card/)
    assert.match(html, /<blockquote/)
    assert.match(html, /Band · 23\/08\/2026/)
    assert.match(html, /Ler matéria/)
    assert.match(html, /Pausar rotação das citações/)
    assert.match(html, /Citação anterior/)
    assert.match(html, /Próxima citação/)
    assert.doesNotMatch(html, /Síntese editorial|performance|quem ganhou/i)
    assert.equal(DEBATE_PRESS_QUOTE_ROTATION_MS, 10_000)
  })

  it("não cria box para candidatura sem aspa atribuída", () => {
    assert.equal(hasCandidateDebatePressQuotes("flavio-bolsonaro", "id-incorreto"), false)
    const html = renderToStaticMarkup(
      <CandidateDebatesBentoCard candidateSlug="flavio-bolsonaro" candidateId="id-incorreto" />,
    )
    assert.equal(html, "")
  })

  it("mantém um único ponto de integração, sem faixa superior ou aba Debates", () => {
    const overview = readFileSync("src/components/ProfileOverview.tsx", "utf8")
    const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf8")
    const route = readFileSync("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", "utf8")
    const tabs = readFileSync("src/lib/candidato-profile-tabs.ts", "utf8")

    assert.match(overview, /<CandidateDebatesBentoCard/)
    assert.ok(
      overview.indexOf("<CandidateDebatesBentoCard") > overview.indexOf("<CareerTeaser"),
      "o box Debates deve fechar o bento da Visão geral",
    )
    assert.doesNotMatch(profile, /DebatesOverviewCarousel|DebatesArchiveTab/)
    assert.doesNotMatch(route, /DebatesPresidenciaisSection/)
    assert.doesNotMatch(tabs, /"debates"/)
  })
})
