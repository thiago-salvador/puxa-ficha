import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ProfileTabs } from "../src/components/ProfileTabs"
import { ProgramaGovernoTab } from "../src/components/ProgramaGovernoSection"
import { SocialCardModal } from "../src/components/SocialCardModal"
import type { ProgramaGovernoApiResponse, ProgramaGovernoFontePublica, ProgramaGovernoManifestoPublico } from "../src/lib/programa-governo"

const fonte: ProgramaGovernoFontePublica = {
  ano: 2026,
  cargo: "PRESIDENTE" as const,
  uf: "BR",
  sqCandidato: "123",
  slug: "candidato-teste",
  nomeUrna: "CANDIDATO TESTE",
  partido: "PTESTE",
  arquivoNome: "programa.pdf",
  pacoteUrl: "https://example.org/programa.zip",
  datasetUrl: "https://example.org/dataset",
  pdfOriginalUrl: null,
  consultadoEm: "2026-08-26T12:00:00Z",
}

const secoes = Array.from({ length: 20 }, (_, index) => ({
  id: `capitulo-${index + 1}`,
  titulo: `Capítulo ${index + 1}`,
  nivel: 1,
  paginaInicial: index + 1,
  paginaFinal: index + 1,
  origem: "pdftotext" as const,
  conteudo: index === 19 ? "TERMO_QUE_EXISTE_APENAS_NO_ULTIMO_CAPITULO" : `Conteúdo do capítulo ${index + 1}.`,
}))

const manifesto: ProgramaGovernoManifestoPublico = {
  estado: "aprovado",
  fonte,
  reviewedAt: "2026-08-26T12:00:00Z",
  paginas: secoes.length,
  resumo: { texto: "Resumo revisado.", frases: [], temas: [] },
}

const response: ProgramaGovernoApiResponse = {
  estado: "aprovado",
  fonte,
  data: {
    version: 1,
    estado: "aprovado",
    fonte: { ...fonte, arquivoNoPacote: "BR/programa.pdf" },
    reviewedAt: "2026-08-26T12:00:00Z",
    paginas: secoes.length,
    resumo: manifesto.resumo!,
    secoes,
  },
}

describe("ondas de UX da ficha", () => {
  it("mantém três destinos prioritários no mobile e concentra o restante em Mais", () => {
    const tabs = [
      ["geral", "Visão geral"],
      ["pesquisas", "Pesquisas"],
      ["programa", "Programa"],
      ["media", "Mídia"],
      ["dinheiro", "Dinheiro"],
      ["justica", "Justiça"],
    ].map(([id, label]) => ({ id, label }))
    const html = renderToStaticMarkup(<ProfileTabs tabs={tabs} activeTab="geral" onTabChange={() => {}} />)

    assert.match(html, /Seções principais do perfil/)
    assert.match(html, />Mais</)
    assert.doesNotMatch(html, /Role na horizontal/)
    assert.match(html, /min-h-12/)
    assert.equal((html.match(/id="profile-tab-(geral|pesquisas|programa)"/g) ?? []).length, 3)
  })

  it("limita a primeira pintura do programa sem perder o contrato de busca integral", () => {
    const html = renderToStaticMarkup(
      <ProgramaGovernoTab manifesto={manifesto} loadState="loaded" response={response} onRetry={() => {}} />,
    )
    const source = readFileSync("src/components/ProgramaGovernoSection.tsx", "utf8")

    assert.equal((html.match(/data-pf-programa-section=/g) ?? []).length, 12)
    assert.match(html, /12 de 20 capítulos exibidos/)
    assert.match(html, /Carregar mais 8 capítulos/)
    assert.doesNotMatch(html, /TERMO_QUE_EXISTE_APENAS_NO_ULTIMO_CAPITULO/)
    assert.match(source, /secoes\.map\(\(section\) =>\s*findProgramaTextMatches/)
    assert.match(source, /setVisibleSectionCount\(\(current\) => Math\.max\(current, sectionIndex \+ 1\)\)/)
  })

  it("explica carregamentos em vez de exibir apenas placeholders visuais", () => {
    const programLoading = renderToStaticMarkup(
      <ProgramaGovernoTab manifesto={manifesto} loadState="loading" response={null} onRetry={() => {}} />,
    )
    const modalLoading = renderToStaticMarkup(
      <SocialCardModal
        slug="candidato-teste"
        candidateName="Candidato Teste"
        shareUrl="https://example.org/candidato/candidato-teste"
        shareTitle="Ficha"
        open
        onClose={() => {}}
      />,
    )
    const deferredProfile = readFileSync("src/components/DeferredCandidatoProfileClient.tsx", "utf8")
    const follow = readFileSync("src/components/alerts/FollowCandidateButton.tsx", "utf8")

    assert.match(programLoading, /aria-busy="true"/)
    assert.match(programLoading, /Carregando programa de governo/)
    assert.match(modalLoading, /Gerando prévia/)
    assert.match(modalLoading, /role="status"/)
    assert.match(deferredProfile, /Carregando indicadores e seções da ficha/)
    assert.match(follow, /Verificando alertas/)
  })

  it("padroniza ritmo dos cards e preserva os dados políticos existentes", () => {
    const overview = readFileSync("src/components/ProfileOverview.tsx", "utf8")
    const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf8")
    const hero = readFileSync("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", "utf8")

    assert.match(overview, /items-stretch/)
    assert.match(overview, /flex h-full min-h-\[220px\] flex-col/)
    assert.match(overview, /data-pf-profile-overview-paired-cards/)
    assert.match(overview, /historico\.length > 0 \|\| trailingCard/)
    assert.match(profile, /trailingCard=\{\s*programaEnabled && programaGoverno/)
    assert.match(profile, /min-h-\[112px\]/)
    assert.match(hero, /data-pf-chapa-2026/)
    assert.match(hero, /PesquisasPresidenciaisHero/)
    assert.match(hero, /data-pf-photo-credit-collapsible/)
    assert.doesNotMatch(overview, /ranking de candidatos/i)
  })
})
