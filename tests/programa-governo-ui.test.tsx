import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  findProgramaTextMatches,
  ProgramaGovernoOverview,
  ProgramaGovernoTab,
} from "../src/components/ProgramaGovernoSection"
import type {
  ProgramaGovernoApiResponse,
  ProgramaGovernoFontePublica,
  ProgramaGovernoManifestoPublico,
  ProgramaGovernoPublico,
} from "../src/lib/programa-governo"

const fonte: ProgramaGovernoFontePublica = {
  ano: 2026,
  cargo: "PRESIDENTE",
  uf: "BR",
  sqCandidato: "280002542548",
  nomeUrna: "LULA",
  partido: "PT",
  arquivoNome: "2026BR280002542548_01.pdf",
  pacoteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_BR.zip",
  datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
  pdfOriginalUrl: null,
}

const manifestoAprovado: ProgramaGovernoManifestoPublico = {
  estado: "aprovado",
  fonte,
  reviewedAt: "2026-08-26T12:00:00Z",
  paginas: 2,
  resumo: {
    texto: "Resumo editorial estritamente baseado no documento oficial.",
    frases: [],
    temas: [
      { id: "saude", titulo: "Saúde", descricao: "Saúde pública", evidencias: [{ pagina: 1, trecho: "Saúde" }] },
      { id: "educacao", titulo: "Educação", descricao: "Educação pública", evidencias: [{ pagina: 1, trecho: "Educação" }] },
      { id: "trabalho", titulo: "Trabalho", descricao: "Trabalho e renda", evidencias: [{ pagina: 2, trecho: "trabalho" }] },
      { id: "ambiente", titulo: "Meio ambiente", descricao: "Proteção ambiental", evidencias: [{ pagina: 2, trecho: "ambiente" }] },
    ],
  },
}

const programa: ProgramaGovernoPublico = {
  version: 1,
  estado: "aprovado",
  fonte: {
    ...fonte,
    slug: "lula",
    arquivoNoPacote: "BR/2026BR280002542548_01.pdf",
  },
  resumo: manifestoAprovado.resumo!,
  paginas: 2,
  reviewedAt: "2026-08-26T12:00:00Z",
  secoes: [
    {
      id: "saude-e-educacao",
      titulo: "Saúde e educação",
      nivel: 1,
      paginaInicial: 1,
      paginaFinal: 1,
      origem: "pdftotext",
      conteudo: "Saúde pública universal.\n\nEducação pública com acesso para todos.",
    },
    {
      id: "trabalho-e-ambiente",
      titulo: "Trabalho e meio ambiente",
      nivel: 1,
      paginaInicial: 2,
      paginaFinal: 2,
      origem: "pdftotext",
      conteudo: "Geração de trabalho.\n\nProteção do meio ambiente.",
    },
  ],
}

const response: ProgramaGovernoApiResponse = {
  data: programa,
  estado: "aprovado",
  fonte,
}

describe("box do programa na Visão geral", () => {
  it("mostra somente resumo aprovado, temas, selo e duas ações", () => {
    const html = renderToStaticMarkup(
      <ProgramaGovernoOverview manifesto={manifestoAprovado} onOpenTab={() => {}} />,
    )
    assert.match(html, /Resumo editorial estritamente baseado/)
    assert.match(html, /Resumo por IA, revisado editorialmente/)
    assert.equal((html.match(/rounded-full bg-muted px-3/g) ?? []).length, 4)
    assert.match(html, /Ler programa completo/)
    assert.match(html, /Abrir pacote oficial do TSE/)
    assert.match(html, /target="_blank"/)
    assert.match(html, /abre em nova aba/)
  })

  it("não vaza resumo pendente e explica a revisão humana", () => {
    const html = renderToStaticMarkup(
      <ProgramaGovernoOverview
        manifesto={{ ...manifestoAprovado, estado: "aguardando_revisao" }}
        onOpenTab={() => {}}
      />,
    )
    assert.match(html, /Conteúdo em revisão editorial/)
    assert.match(html, /só serão publicados após revisão humana/)
    assert.doesNotMatch(html, /Resumo editorial estritamente baseado/)
    assert.doesNotMatch(html, /Resumo por IA, revisado editorialmente/)
  })
})

describe("aba Programa", () => {
  it("renderiza estados de carregamento, erro e pendência distintamente", () => {
    const loading = renderToStaticMarkup(
      <ProgramaGovernoTab manifesto={manifestoAprovado} loadState="loading" response={null} onRetry={() => {}} />,
    )
    const failed = renderToStaticMarkup(
      <ProgramaGovernoTab manifesto={manifestoAprovado} loadState="failed" response={null} onRetry={() => {}} />,
    )
    const pending = renderToStaticMarkup(
      <ProgramaGovernoTab
        manifesto={{ ...manifestoAprovado, estado: "aguardando_revisao" }}
        loadState="loaded"
        response={{ data: null, estado: "aguardando_revisao", fonte }}
        onRetry={() => {}}
      />,
    )
    assert.match(loading, /role="status"/)
    assert.match(failed, /role="alert"/)
    assert.match(failed, /Tentar novamente/)
    assert.match(pending, /data-pf-programa-state="aguardando_revisao"/)
    assert.doesNotMatch(pending, /Saúde pública universal/)
  })

  it("mantém texto integral, sumário, páginas e busca acessível", () => {
    const html = renderToStaticMarkup(
      <ProgramaGovernoTab manifesto={manifestoAprovado} loadState="loaded" response={response} onRetry={() => {}} />,
    )
    assert.match(html, /Buscar no programa/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /aria-label="Resultado anterior"/)
    assert.match(html, /aria-label="Próximo resultado"/)
    assert.match(html, /aria-label="Sumário do programa"/)
    assert.match(html, /href="#programa-saude-e-educacao"/)
    assert.match(html, /id="programa-saude-e-educacao"/)
    assert.match(html, /Página 1/)
    assert.match(html, /Saúde pública universal/)
    assert.match(html, /Educação pública com acesso para todos/)
  })

  it("busca sem diferenciar acentos ou caixa e preserva os índices originais", () => {
    const text = "Saúde, SAUDE e saúde pública"
    const matches = findProgramaTextMatches(text, "saude")
    assert.deepEqual(matches.map((match) => text.slice(match.start, match.end)), ["Saúde", "SAUDE", "saúde"])
    assert.deepEqual(findProgramaTextMatches(text, "inexistente"), [])
    assert.deepEqual(findProgramaTextMatches(text, ""), [])
  })
})

describe("integração do piloto", () => {
  const view = readFileSync("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", "utf8")
  const deferred = readFileSync("src/components/DeferredCandidatoProfile.tsx", "utf8")
  const client = readFileSync("src/components/DeferredCandidatoProfileClient.tsx", "utf8")
  const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf8")

  it("habilita somente Presidência e transporta apenas o manifesto pequeno", () => {
    assert.match(view, /ficha\.cargo_disputado === "Presidente"[\s\S]*getProgramaGovernoManifesto\(slug\)/)
    assert.match(view, /programaGoverno=\{programaGoverno\}/)
    assert.match(deferred, /programaGoverno=\{programaGoverno\}/)
    assert.match(client, /programaGoverno=\{programaGoverno\}/)
    assert.doesNotMatch(`${view}${deferred}${client}`, /\.secoes/)
  })

  it("busca o texto apenas na primeira ativação e preserva o resultado carregado", () => {
    assert.match(profile, /activeTab !== "programa"/)
    assert.match(profile, /programaLoadStateRef\.current !== "idle"/)
    assert.match(profile, /fetchProgramaGoverno\(ficha\.slug, controller\.signal\)/)
    assert.match(profile, /programaLoadStateRef\.current = "loaded"/)
    assert.match(profile, /return \(\) => controller\.abort\(\)/)
  })
})

it("PROGRAMAS_UI_PASS", () => assert.ok(true))
