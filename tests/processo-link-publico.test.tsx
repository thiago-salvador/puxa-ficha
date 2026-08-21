import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "@/components/CandidatoProfile"
import { ProfileOverview } from "@/components/ProfileOverview"
import type { FichaCandidato, Processo } from "@/lib/types"

const CNJ = "1039971-32.2024.8.26.0002"
const PORTAL = "https://comunica.pje.jus.br/consulta?numeroProcesso=10399713220248260002"
const API =
  "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=10399713220248260002"
const G1 =
  "https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/08/04/mp-de-sp-confirma-que-renan-santos-foi-absolvido-em-processo-por-acusacao-de-estupro.ghtml"

function processo(partial: Partial<Processo> & Pick<Processo, "id">): Processo {
  return {
    candidato_id: "cand-judicial",
    tipo: "civil",
    tribunal: "TJSP",
    numero_processo: CNJ,
    descricao: "Procedimento comum cível no TJSP.",
    status: "comunicacao_processual_publicada_merito_nao_inferido",
    data_inicio: null,
    data_decisao: null,
    gravidade: null,
    fonte: "DJEN",
    url_fonte: PORTAL,
    ...partial,
  }
}

function fichaCom(processos: Processo[]): FichaCandidato {
  return {
    id: "cand-judicial",
    slug: "candidato-judicial",
    nome_completo: "Pessoa Candidata",
    nome_urna: "Pessoa",
    partido_atual: "Partido",
    partido_sigla: "PTD",
    cargo_disputado: "Governador",
    status: "candidato",
    fonte_dados: ["DJEN"],
    ultima_atualizacao: "2026-08-10T00:00:00Z",
    processos,
    total_processos: processos.length,
    historico: [],
    mudancas_partido: [],
    patrimonio: [],
    financiamento: [],
    votos: [],
    pontos_atencao: [],
    projetos_lei: [],
    legislacao_mandato_executivo: [],
    gastos_parlamentares: [],
    sancoes_administrativas: [],
    noticias: [],
    indicadores_estaduais: [],
  } as unknown as FichaCandidato
}

function hrefsProcesso(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bdata-pf-processo-link="([^"]+)"/g)].map(
    (match) => match[1],
  )
}

function assertHrefPublico(href: string) {
  const url = new URL(href)
  const host = url.hostname.toLowerCase()
  const path = url.pathname.toLowerCase()
  assert.notEqual(host, "comunicaapi.pje.jus.br")
  assert.ok(host !== "docs.google.com" || !path.includes("/spreadsheets/"))
  assert.ok(!path.endsWith(".json"))
}

describe("processos clicáveis na Justiça", () => {
  it("o card inteiro aponta para o portal, mesmo quando a fonte gravada é a API JSON", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile
        ficha={fichaCom([
          processo({ id: "proc-api", url_fonte: API }),
          processo({
            id: "proc-cnj-so",
            url_fonte: null,
            descricao: "Comunicação só com CNJ.",
          }),
        ])}
        initialTab="justica"
      />,
    )

    const hrefs = hrefsProcesso(html)
    assert.equal(hrefs.length, 2)
    hrefs.forEach(assertHrefPublico)
    assert.ok(hrefs.every((href) => href === PORTAL))
  })

  it("absolvição sem CNJ aponta para o artigo, não inventa portal", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile
        ficha={fichaCom([
          processo({
            id: "proc-g1",
            tipo: "criminal",
            tribunal: "Justiça de São Paulo",
            numero_processo: null,
            descricao: "Absolvido. O número do processo não é público.",
            status: "absolvido",
            fonte: "g1",
            url_fonte: G1,
          }),
        ])}
        initialTab="justica"
      />,
    )

    assert.deepEqual(hrefsProcesso(html), [G1])
  })
})

describe("processos clicáveis na Visão Geral", () => {
  it("cada teaser é um link para o portal público", () => {
    const html = renderToStaticMarkup(
      <ProfileOverview
        ficha={fichaCom([
          processo({ id: "proc-overview", url_fonte: API }),
          processo({
            id: "proc-overview-cnj",
            url_fonte: null,
            descricao: "Segundo processo só com CNJ.",
          }),
        ])}
        onNavigateTab={() => {}}
      />,
    )

    const hrefs = hrefsProcesso(html)
    assert.equal(hrefs.length, 2)
    hrefs.forEach(assertHrefPublico)
    assert.ok(hrefs.every((href) => href === PORTAL))
    assert.match(html, /Processos judiciais/)
  })
})
