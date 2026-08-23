import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CandidatoProfile } from "../src/components/CandidatoProfile"
import type { FichaCandidato } from "../src/lib/types"

function buildFicha(noticias: FichaCandidato["noticias"] = []): FichaCandidato {
  return {
    id: "cand-media-1",
    slug: "ficha-de-midia",
    nome: "Ficha de Mídia",
    nome_urna: "Ficha de Mídia",
    partido: "TESTE",
    estado: "SP",
    cargo_disputado: "Deputado Federal",
    pontos_atencao: [],
    sancoes_administrativas: [],
    processos: [],
    historico: [],
    patrimonio: [],
    patrimonio_ausencias_oficiais: [],
    votos: [],
    mudancas_partido: [],
    financiamento: [],
    gastos_parlamentares: [],
    projetos_lei: [],
    sancoes_verificacao: null,
    processos_verificacao: null,
    trajetoria_verificacao: null,
    votacoes_verificacao: null,
    noticias,
  } as unknown as FichaCandidato
}

const noticia = {
  id: "noticia-1",
  candidato_id: "cand-media-1",
  titulo: "Notícia exclusiva da aba Mídia",
  snippet: "Resumo da notícia de teste.",
  url: "https://example.com/noticia",
  fonte: "Fonte de Teste",
  data_publicacao: "2026-08-22T12:00:00.000Z",
}

describe("aba Mídia da ficha do candidato", () => {
  test("move as notícias da Visão geral para a aba Mídia", () => {
    const ficha = buildFicha([noticia])
    const overviewHtml = renderToStaticMarkup(
      <CandidatoProfile ficha={ficha} initialTab="geral" />,
    )
    const mediaHtml = renderToStaticMarkup(
      <CandidatoProfile ficha={ficha} initialTab="media" />,
    )

    assert.doesNotMatch(overviewHtml, /Notícia exclusiva da aba Mídia/)
    assert.match(mediaHtml, /Notícia exclusiva da aba Mídia/)
    assert.match(mediaHtml, /id="profile-tab-media"/)
    assert.match(mediaHtml, /id="profile-panel-media"/)
    assert.match(mediaHtml, />Mídia</)
    assert.match(mediaHtml, /1 notícia recente/)
  })

  test("mantém a aba disponível com estado vazio honesto", () => {
    const html = renderToStaticMarkup(
      <CandidatoProfile ficha={buildFicha()} initialTab="media" />,
    )

    assert.match(html, /data-pf-media-empty="true"/)
    assert.match(html, /Ainda não há notícias exibidas nesta ficha\./)
  })
})
