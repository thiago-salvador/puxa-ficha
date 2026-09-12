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
  it("exibe a semana comprovada da gravação sem atribuir o dia da publicação à fala", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="marcos-reategui" candidateId="672dc346-45fe-4cee-8386-9645e6a5d2b7" />)
    assert.match(html, /entre 30\/08\/2026 e 01\/09\/2026/i)
    assert.match(html, /dia exato não informado/)
    assert.match(html, /Transcrição automática do áudio de The Papo com André Silva/)
    assert.match(html, /ZpJhiwE0qr0&amp;t=2460s/)
    assert.match(html, /Nós precisamos valorizar o nosso jovem/)
  })
  it("identifica transcrição automática e abre o áudio na minutagem da fala", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="tayna-miessa" candidateId="62addad9-47ab-4362-bbe1-917f7e70c646" />)
    assert.match(html, /Transcrição automática do áudio de BandNews FM Curitiba/)
    assert.match(html, /Pode conter erros; confira o trecho em 0:00/)
    assert.match(html, /09\.03-ENTREVISTA-TAYNA-MIESSA-01\.mp3#t=0/)
    assert.match(html, /BandNews FM Curitiba · 02\/09\/2026/)
    assert.doesNotMatch(html, /Aspa atribuída pela matéria/)
  })
  it("identifica a declaração em campanha sem apresentá-la como entrevista", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="gilberto-vasconcelos" candidateId="5dc271fa-9171-484c-a8b3-f366fed10d10" />)
    assert.match(html, /Declaração em campanha/)
    assert.match(html, /O Poder · 16\/08\/2026/)
    assert.match(html, /Estamos apresentando uma alternativa para a classe trabalhadora amazonense/)
    assert.doesNotMatch(html, />Entrevista</)
  })
  it("preserva crédito de assessoria publicado pelo veículo", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="hildon-chaves" candidateId="5a325c79-3414-4d70-8926-673e91cbd578" />)
    assert.match(html, /Crédito da matéria: Com informações de Assessoria Hildon Chaves/)
    assert.match(html, /newsrondonia\.com\.br/)
  })
  it("exibe o dia quando os dois limites comprovados coincidem", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="ravenna-castro" candidateId="ae28abd5-e231-405a-938e-85e8c6d64d75" />)
    assert.match(html, /GP1 · 09\/09\/2026/)
    assert.doesNotMatch(html, /dia exato não informado/)
    assert.match(html, /Nós vamos recorrer até o final/)
  })
  it("identifica quando a aspa literal vem do título jornalístico", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="camilo-duarte" candidateId="4bbfe1e0-c79b-45b6-bf3f-96be1bc6432f" />)
    assert.match(html, /Aspa atribuída no título da matéria de/)
    assert.match(html, /Portal Mídia/)
    assert.match(html, /<blockquote/)
  })
  it("renderiza fala de governador com a fonte própria do catálogo recorrente", () => {
    const html = renderToStaticMarkup(<CandidateDebatesBentoCard candidateSlug="ciro-gomes-gov-ce" candidateId="2df15aa1-0bd3-4bab-89bf-13d780645e54" />)
    assert.match(html, /Diário do Nordeste · 09\/09\/2026/)
    assert.match(html, /https:\/\/diariodonordeste\.verdesmares\.com\.br\/pontopoder\//)
    assert.match(html, /botar as coisas para funcionar com correção, com humanidade/)
    assert.doesNotMatch(html, /href="https:\/\/www\.band\.com\.br/)
  })
  it("renderiza uma aspa real com fonte, data e controles", () => {
    const html = renderToStaticMarkup(
      <CandidateDebatesBentoCard
        candidateSlug="augusto-cury"
        candidateId="5a4d76d2-6243-41b9-88b2-e94c68383e52"
      />,
    )

    assert.match(html, /data-pf-debates-card/)
    assert.match(html, /<blockquote/)
    assert.match(html, /CNN Brasil · 07\/09\/2026/)
    assert.match(html, /As condenações foram realmente exageradas em muitos casos/)
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
