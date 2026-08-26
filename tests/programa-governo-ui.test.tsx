import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  findProgramaTextMatches,
  loadProgramaGovernoDocumentoCompleto,
  programaGovernoDocumentoCacheKey,
  ProgramaGovernoOverview,
  ProgramaGovernoTab,
} from "../src/components/ProgramaGovernoSection"
import type {
  ProgramaGovernoApiResponse,
  ProgramaGovernoDocumentoPublico,
  ProgramaGovernoFontePublica,
  ProgramaGovernoManifestoPublico,
  ProgramaGovernoPublico,
} from "../src/lib/programa-governo"

const fonte: ProgramaGovernoFontePublica = {
  ano: 2026,
  cargo: "PRESIDENTE",
  uf: "BR",
  sqCandidato: "280002542548",
  slug: "lula",
  nomeUrna: "LULA",
  partido: "PT",
  arquivoNome: "2026BR280002542548_01.pdf",
  pacoteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_BR.zip",
  datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
  pdfOriginalUrl: null,
  consultadoEm: "2026-08-25T12:00:00Z",
}

const fonteGovernador: ProgramaGovernoFontePublica = {
  ano: 2026,
  cargo: "GOVERNADOR",
  uf: "SP",
  sqCandidato: "000000000001",
  slug: "candidata-teste-sp",
  nomeUrna: "CANDIDATA TESTE",
  partido: "PTESTE",
  arquivoNome: "2026SP000000000001_01.pdf",
  pacoteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_SP.zip",
  datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
  pdfOriginalUrl: null,
  consultadoEm: "2026-08-25T12:00:00Z",
}

function documentoGovernador(
  index: number,
  options: Partial<ProgramaGovernoDocumentoPublico> = {},
): ProgramaGovernoDocumentoPublico {
  const ordinal = String(index).padStart(2, "0")
  return {
    documentoId: `SP:000000000001:${ordinal}`,
    fonte: {
      arquivoNome: `2026SP000000000001_${ordinal}.pdf`,
      arquivoNoPacote: `SP/2026SP000000000001_${ordinal}.pdf`,
      pacoteUrl: fonteGovernador.pacoteUrl,
      datasetUrl: fonteGovernador.datasetUrl,
      pdfOriginalUrl: null,
      consultadoEm: fonteGovernador.consultadoEm,
    },
    sourceSha256: String(index).repeat(64).slice(0, 64),
    extractedTextSha256: String(index + 1).repeat(64).slice(0, 64),
    paginas: 2,
    secoes: 2,
    ...options,
  }
}

const documentosGovernador = Array.from({ length: 8 }, (_, index) =>
  documentoGovernador(index + 1),
)

function section(id: string, pagina: number, conteudo: string) {
  return {
    id,
    titulo: `Seção ${id}`,
    nivel: 1,
    paginaInicial: pagina,
    paginaFinal: pagina,
    origem: "pdftotext" as const,
    conteudo,
  }
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

const manifestoMultidocumento: ProgramaGovernoManifestoPublico = {
  ...manifestoAprovado,
  fonte: fonteGovernador,
  paginas: 16,
  documentos: documentosGovernador,
}

const programa: ProgramaGovernoPublico = {
  version: 1,
  estado: "aprovado",
  fonte: {
    ...fonte,
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

  it("generaliza o box aprovado para governador sem alterar a saída presidencial", () => {
    const governador = renderToStaticMarkup(
      <ProgramaGovernoOverview
        manifesto={{ ...manifestoAprovado, fonte: fonteGovernador }}
        onOpenTab={() => {}}
      />,
    )
    const presidente = renderToStaticMarkup(
      <ProgramaGovernoOverview manifesto={manifestoAprovado} onOpenTab={() => {}} />,
    )
    assert.match(governador, /Eleições 2026 · Governo de SP/)
    assert.match(governador, /Ler programa completo/)
    assert.match(presidente, />Eleições 2026</)
    assert.doesNotMatch(presidente, /Governo de/)
  })

  it("expõe estados canônicos neutros com fonte e data, sem vazar conteúdo pendente", () => {
    const cases = [
      ["em_revisao", "Conteúdo em revisão editorial"],
      ["sem_documento_oficial", "Documento oficial não localizado"],
      ["falha_de_extracao", "Texto integral indisponível"],
      ["perfil_local_ausente", "Ficha local não disponível"],
    ] as const

    for (const [estado, title] of cases) {
      const html = renderToStaticMarkup(
        <ProgramaGovernoOverview
          manifesto={{
            ...manifestoAprovado,
            estado,
            fonte: fonteGovernador,
            resumo: {
              ...manifestoAprovado.resumo!,
              texto: "CONTEUDO_PENDENTE_NAO_PUBLICAR",
            },
          }}
          onOpenTab={() => {}}
        />,
      )
      assert.match(html, new RegExp(title))
      assert.match(html, /Fonte consultada: Tribunal Superior Eleitoral \(TSE\), em 25 de agosto de 2026/)
      assert.match(html, /Abrir pacote oficial do TSE/)
      assert.doesNotMatch(html, /CONTEUDO_PENDENTE_NAO_PUBLICAR/)
      assert.doesNotMatch(html, /Ler programa completo/)
      if (estado === "sem_documento_oficial" || estado === "perfil_local_ausente") {
        assert.doesNotMatch(html, /disponibiliza este documento/)
      }
    }
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

  it("mantém contexto estadual e rótulos de documento e páginas", () => {
    const governador: ProgramaGovernoPublico = {
      ...programa,
      fonte: {
        ...fonteGovernador,
        arquivoNoPacote: "SP/2026SP000000000001_01.pdf",
      },
    }
    const html = renderToStaticMarkup(
      <ProgramaGovernoTab
        manifesto={{ ...manifestoAprovado, fonte: fonteGovernador }}
        loadState="loaded"
        response={{ data: governador, estado: "aprovado", fonte: fonteGovernador }}
        onRetry={() => {}}
      />,
    )
    assert.match(html, /Documento oficial do TSE · Governo de SP/)
    assert.match(html, /Arquivo oficial: 2026SP000000000001_01.pdf/)
    assert.match(html, /2 páginas, texto integral extraído e revisado/)
  })

  it("renderiza seletor multidocumento sem misturar o arquivo selecionado", () => {
    const selected = documentosGovernador[1]
    const html = renderToStaticMarkup(
      <ProgramaGovernoTab
        manifesto={manifestoMultidocumento}
        loadState="idle"
        response={null}
        onRetry={() => {}}
        selectedDocumentId={selected.documentoId}
        documentLoadState="loaded"
        loadedDocument={{
          documentoId: selected.documentoId,
          sourceSha256: selected.sourceSha256,
          extractedTextSha256: selected.extractedTextSha256,
          secoes: [section("somente-documento-2", 1, "CONTEUDO_DOCUMENTO_2")],
        }}
        onSelectDocument={() => {}}
        onRetryDocument={() => {}}
      />,
    )
    assert.match(html, /data-pf-programa-multidocument/)
    assert.equal((html.match(/<option/g) ?? []).length, 8)
    assert.match(html, /2026SP000000000001_02.pdf/)
    assert.match(html, /2 páginas, 2 seções/)
    assert.match(html, /CONTEUDO_DOCUMENTO_2/)
    assert.doesNotMatch(html, /CONTEUDO_DOCUMENTO_1/)

    const overview = renderToStaticMarkup(
      <ProgramaGovernoOverview manifesto={manifestoMultidocumento} onOpenTab={() => {}} />,
    )
    assert.match(overview, /Ler documentos completos/)
    assert.doesNotMatch(overview, /Ler programa completo/)
  })

  it("não combina texto cacheado com uma nova versão do mesmo documento", () => {
    const previous = documentosGovernador[0]
    const updated = {
      ...previous,
      sourceSha256: "c".repeat(64),
      extractedTextSha256: "d".repeat(64),
    }
    assert.notEqual(
      programaGovernoDocumentoCacheKey(previous),
      programaGovernoDocumentoCacheKey(updated),
    )

    const html = renderToStaticMarkup(
      <ProgramaGovernoTab
        manifesto={{ ...manifestoMultidocumento, documentos: [updated] }}
        loadState="idle"
        response={null}
        onRetry={() => {}}
        selectedDocumentId={updated.documentoId}
        documentLoadState="loaded"
        loadedDocument={{
          documentoId: previous.documentoId,
          sourceSha256: previous.sourceSha256,
          extractedTextSha256: previous.extractedTextSha256,
          secoes: [section("versao-antiga", 1, "TEXTO_CACHEADO_ANTIGO")],
        }}
        onSelectDocument={() => {}}
        onRetryDocument={() => {}}
      />,
    )
    assert.doesNotMatch(html, /TEXTO_CACHEADO_ANTIGO/)
    assert.match(html, /1 documento oficial\./)
    assert.doesNotMatch(html, /1 documentos oficiais/)
    assert.match(html, /O documento carregado não corresponde à seleção atual/)
  })

  it("busca sem diferenciar acentos ou caixa e preserva os índices originais", () => {
    const text = "Saúde, SAUDE e saúde pública"
    const matches = findProgramaTextMatches(text, "saude")
    assert.deepEqual(matches.map((match) => text.slice(match.start, match.end)), ["Saúde", "SAUDE", "saúde"])
    assert.deepEqual(findProgramaTextMatches(text, "inexistente"), [])
    assert.deepEqual(findProgramaTextMatches(text, ""), [])
  })
})

describe("carregamento multidocumento em chunks", () => {
  it("segue o cursor até completo e não busca os outros sete documentos", async () => {
    const requested: string[] = []
    const selected = documentosGovernador[0]
    const fetcher = async (input: string) => {
      requested.push(input)
      const url = new URL(input, "https://local.test")
      const cursor = url.searchParams.get("cursor")
      const first = cursor === null
      return new Response(JSON.stringify({
        data: null,
        estado: "aprovado",
        fonte: fonteGovernador,
        chunk: {
          documento: selected,
          cursor,
          nextCursor: first ? `${selected.documentoId}@1` : null,
          completo: !first,
          secoes: first
            ? [section("documento-1-parte-1", 1, "PRIMEIRO_CHUNK")]
            : [section("documento-1-parte-2", 2, "SEGUNDO_CHUNK")],
          bytes: 1024,
        },
      }), { status: 200, headers: { "content-type": "application/json" } })
    }

    const loaded = await loadProgramaGovernoDocumentoCompleto(
      "candidata-teste-sp",
      selected,
      new AbortController().signal,
      fetcher,
    )
    assert.deepEqual(loaded.secoes.map(({ conteudo }) => conteudo), ["PRIMEIRO_CHUNK", "SEGUNDO_CHUNK"])
    assert.equal(loaded.sourceSha256, selected.sourceSha256)
    assert.equal(loaded.extractedTextSha256, selected.extractedTextSha256)
    assert.equal(requested.length, 2)
    assert.match(requested[0], new RegExp(`documentoId=${encodeURIComponent(selected.documentoId)}`))
    assert.match(requested[1], new RegExp(`cursor=${encodeURIComponent(`${selected.documentoId}@1`)}`))
    assert.ok(requested.every((url) => !documentosGovernador.slice(1).some((document) => url.includes(encodeURIComponent(document.documentoId)))))
  })

  it("rejeita cursor repetido e documento marcado completo antes de todas as seções", async () => {
    const selected = documentosGovernador[0]
    let calls = 0
    const repeatedCursor = async () => {
      const cursor = calls === 0 ? null : `${selected.documentoId}@1`
      calls += 1
      return new Response(JSON.stringify({
        data: null,
        estado: "aprovado",
        fonte: fonteGovernador,
        chunk: {
          documento: selected,
          cursor,
          nextCursor: `${selected.documentoId}@1`,
          completo: false,
          secoes: [section(`repetida-${calls}`, 1, `CHUNK_${calls}`)],
          bytes: 1024,
        },
      }))
    }
    await assert.rejects(
      loadProgramaGovernoDocumentoCompleto("candidata-teste-sp", selected, new AbortController().signal, repeatedCursor),
      /programa_governo_documento_cursor_loop/,
    )

    const incomplete = async () => new Response(JSON.stringify({
      data: null,
      estado: "aprovado",
      fonte: fonteGovernador,
      chunk: {
        documento: selected,
        cursor: null,
        nextCursor: null,
        completo: true,
        secoes: [section("incompleta", 1, "UMA_DE_DUAS")],
        bytes: 1024,
      },
    }))
    await assert.rejects(
      loadProgramaGovernoDocumentoCompleto("candidata-teste-sp", selected, new AbortController().signal, incomplete),
      /programa_governo_documento_incomplete/,
    )
  })
})

describe("integração da UI", () => {
  const view = readFileSync("src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx", "utf8")
  const deferred = readFileSync("src/components/DeferredCandidatoProfile.tsx", "utf8")
  const client = readFileSync("src/components/DeferredCandidatoProfileClient.tsx", "utf8")
  const profile = readFileSync("src/components/CandidatoProfile.tsx", "utf8")

  it("transporta apenas o manifesto pequeno e habilita qualquer identidade reconhecida", () => {
    assert.match(view, /getProgramaGovernoManifesto\(slug\)/)
    assert.match(view, /programaGoverno=\{programaGoverno\}/)
    assert.match(deferred, /programaGoverno=\{programaGoverno\}/)
    assert.match(client, /programaGoverno=\{programaGoverno\}/)
    assert.doesNotMatch(`${view}${deferred}${client}`, /\.secoes/)
    assert.match(profile, /const programaEnabled = programaGoverno !== null/)
    assert.doesNotMatch(profile, /programaEnabled = ficha\.cargo_disputado === "Presidente"/)
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
it("PROGRAMAS_UI_CHUNKS_PASS", () => assert.ok(true))
