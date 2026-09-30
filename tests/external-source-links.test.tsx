import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { test } from "node:test"
import React, { type ComponentType, type MouseEvent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

import { TrackedExternalSourceLink } from "@/components/TrackedExternalSourceLink"
import { fixturePoll } from "./fixtures/poll-series"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
require.extensions[".css"] = (module) => {
  const styles: Record<string, unknown> = new Proxy({}, {
    get: (_target, key) => key === "__esModule" ? false : key === "default" ? styles : String(key),
  })
  module.exports = styles
}

// Compile the actual module with a test-only alias to exercise private sinks
// without widening the application's exports or bypassing their render code.
const sinks = new Map<string, ComponentType<Record<string, unknown>>>()
function renderSink(file: string, name: string, props: Record<string, unknown>): string {
  const key = file + ":" + name
  let sink = sinks.get(key)
  if (!sink) {
    const filename = path.resolve(file)
    const source = readFileSync(filename, "utf8") + "\nexport { " + name + " as TestSink }\n"
    const compiled = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const compiledModule = { exports: {} as { TestSink: ComponentType<Record<string, unknown>> } }
    new Function("require", "module", "exports", compiled)(createRequire(filename), compiledModule, compiledModule.exports)
    sink = compiledModule.exports.TestSink
    assert.equal(typeof sink === "function" || typeof sink === "object", true, key)
    sinks.set(key, sink)
  }
  return renderToStaticMarkup(React.createElement(sink, props))
}

const validUrl = "https://example.org/source?x=1&y=2"
const unsafeUrls = ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"]
function assertSource(html: string, url: string, label: string) {
  assert.ok(html.includes(label), "source label must remain visible: " + label)
  if (url === validUrl) assert.ok(html.includes('href="https://example.org/source?x=1&amp;y=2'), "valid source URL must remain unchanged")
  else assert.doesNotMatch(html, /href="(?:javascript:|data:|javascript:throw)/i)
}

test("tracked sources reject unsafe URLs without navigation, analytics or a caller click", (context) => {
  const requests: string[] = []
  context.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(init?.body))
    return new Response(null, { status: 204 })
  })
  let clicks = 0
  for (const href of unsafeUrls) {
    const element = TrackedExternalSourceLink({ area: "ficha", href, children: "Fonte", onClick: () => { clicks++ } })
    const html = renderToStaticMarkup(element)
    assert.equal(html, "Fonte")
    assert.equal((element.props as { onClick?: unknown }).onClick, undefined)
  }
  assert.equal(clicks, 0)
  assert.deepEqual(requests, [])

  const element = TrackedExternalSourceLink({ area: "ficha", href: validUrl, children: "Fonte", className: "source", target: "_blank", rel: "noopener noreferrer", onClick: () => { clicks++ } })
  assertSource(renderToStaticMarkup(element), validUrl, "Fonte")
  assert.equal(renderToStaticMarkup(element), '<a href="https://example.org/source?x=1&amp;y=2" class="source" target="_blank" rel="noopener noreferrer">Fonte</a>')
  const event = {} as MouseEvent<HTMLAnchorElement>
  ;(element.props as { onClick: (event: MouseEvent<HTMLAnchorElement>) => void }).onClick(event)
  assert.equal(clicks, 1)
  assert.equal(requests.length, 1)
  assert.deepEqual(JSON.parse(requests[0]), { eventName: "External Source Click", payload: { area: "ficha", host: "example.org" } })
})

for (const url of [...unsafeUrls, validUrl]) {
  test("source sinks preserve labels and refuse unsafe navigation: " + url.split(":")[0], () => {
    const failures: string[] = []
    const render = (file: string, name: string, props: Record<string, unknown>, label: string) => {
      try { assertSource(renderSink("src/components/" + file + ".tsx", name, props), url, label) }
      catch (error) { failures.push(file + ":" + name + ": " + String(error)) }
    }
    const source = { pacoteUrl: url, pdfOriginalUrl: url, consultadoEm: "2026-09-01T12:00:00Z", arquivoNome: "programa.pdf" }
    const manifesto = { estado: "aprovado", fonte: source, resumo: { texto: "Resumo", temas: [], frases: [{ texto: "Frase", evidencias: [{ pagina: 2, trecho: "Trecho" }] }] } }

    render("ProgramaGovernoSection", "SourceLink", { fonte: source }, "Abrir PDF original no TSE")
    render("ProgramaGovernoSection", "SourceLink", { fonte: { ...source, pdfOriginalUrl: null } }, "Abrir pacote oficial do TSE")
    render("ProgramaGovernoSection", "ProgramaEvidencias", { manifesto }, "abrir no PDF")
    render("ProgramaGovernoSection", "ProgramStateNotice", { manifesto: { ...manifesto, estado: "documento_anunciado", anuncio: { fonteUrl: url } } }, "Ver registro da candidatura no TSE")
    render("ProgramaGovernoSection", "ProgramaGovernoPendente", { pendencia: { motivo: "registro_duplicado_tse", fonteUrl: url, consultadoEm: "2026-09-01" } }, "Abrir pacote oficial do TSE")
    render("ProgramaGovernoSection", "ProgramaEvidenciasRelacionadas", {
      temas: [{ id: "saude", titulo: "Saúde" }], mostrarSemCongresso: false,
      estado: { estado: "com_vinculos", processadoEm: null, itens: [{ id: "evidencia", temaId: "saude", tipo: "fala", relacao: "relacionada", texto: "Trecho", url }] },
    }, "Ver fonte")
    render("StatePrograms", "ProgramEvidence", { evidencias: [{ pagina: 2, trecho: "Trecho" }], manifesto }, "Documento no TSE")
    render("StatePrograms", "StatePrograms", { programs: [{ slug: "teste", nome_urna: "Teste", manifesto: null }], runningMates: { teste: { name: "Vice", status: "Deferido", source_url: url, checked_at: "2026-09-01" } } }, "Deferido")

    const candidate = { slug: "teste", nome_urna: "Teste" }
    render("SenadoRunningMates", "SenadoRunningMates", { candidates: [candidate], data: { teste: [1, 2].map(ordem => ({ ordem, nome_urna: "Suplente", fonte_url: url, sq_candidato: String(ordem) })) } }, "Fonte")
    render("SenadoRunningMates", "SenadoRunningMates", { candidates: [candidate], data: {}, absence: { teste: { fonte_url: url, fonte_data: "01/09/2026" } } }, "TSE")

    const update = { id: "update", candidate_slug: "teste", candidate_name: "Teste", year: 2026, field: "situacao", before_value: "PENDENTE", after_value: "APTO", detected_at: "2026-09-01T12:00:00Z", source_url: url }
    render("HomeRecentUpdates", "HomeRecentUpdates", { resource: { status: "available", updates: [update] } }, "Fonte: TSE")
    render("imprensa/updates/UpdateItem", "UpdateItem", { row: { ...update, nome: "Teste", cargo: "Presidente" } }, "Fonte oficial no TSE")
    render("imprensa/mesa/MesaRowDetails", "SourceLink", { href: url, children: "Fonte oficial" }, "Fonte oficial")
    render("imprensa/method/SourcesTable", "SourcesTable", { rows: [{ source: { id: "tse", label: "TSE", traz: "Dados", authorityUrl: url, maxAgeHours: 24, cadence: "daily" }, situacao: "atualizado", ultimaColeta: null }] }, "Abrir")
    render("imprensa/pack/ImprensaPack", "PollRow", { poll: { id: "poll", instituto: "Instituto", registrationCode: "REG-1", registrationUrl: url } }, "Registro REG-1 no TSE")
    render("ProgramasBusca", "Result", { resultado: { originalUrl: url, fichaUrl: "/candidato/teste", trecho: "Trecho", matches: [], documentoNumero: 1, documentosTotal: 1, paginasSemTexto: 0, version: "1", sourceSha256: "a".repeat(64), coletadoEm: "2026-09-01" } }, "Abrir pacote oficial do TSE")

    render("CandidateDebatesBentoCard", "QuoteSource", { quote: { id: "quote", article_url: url, publisher: "Veículo", occurred_on: "2026-09-01" } }, "Ler matéria")
    render("CandidateDebatesBentoCard", "QuoteSource", { quote: { id: "quote-audio", article_url: url, publisher: "Veículo", occurred_on: "2026-09-01", transcription: { media_url: url, start_seconds: 30 } } }, "Conferir em 0:30")
    render("AttributedFactChecks", "AttributedFactCheckCard", { check: {
      id: "check", publisher: "Veículo", claimFormat: "resumo", claim: "Afirmação", originalLabel: "Falso", summary: "Resumo", publishedAt: "2026-09-01", originalUrl: url, methodologyUrl: url,
      event: { context: "Contexto", date: "2026-09-01", adjacentTurns: [] }, review: { reviewedAt: "2026-09-01" },
      sources: [{ origin: "cited_by_publisher", title: "Fonte citada", url }, { origin: "consulted_by_us", title: "Fonte consultada", url }],
      corrections: [{ version: "v2", publishedAt: "2026-09-01", summary: "Correção", url }], relations: [],
    } }, "Ver registro")
    render("RepresentacoesEticaCategoria", "RepresentacoesEticaCategoria", { representacoes: [{ casa: "camara", id: "rep", proposicao: { sigla: "REP", numero: 1, ano: 2026 }, fase: "processo_instaurado", ultimo_andamento_em: "2026-09-01", verificado_em: "2026-09-01", url_oficial: url }] }, "Fonte oficial")
    render("quiz/QuizQuestion", "QuizQuestion", { pergunta: { id: "q1", texto: "Pergunta", o_que_e: { rotulo: "Tema", texto: "Contexto", fonte: { url, titulo: "Fonte do tema" } } }, reducedMotion: true, onSubmit() {} }, "Fonte do tema")
    render("CandidatePhotoCredit", "CandidatePhotoCredit", { credit: { origem: "wikimedia_commons", autor: "Autora", licenca: "CC BY-SA", fonte_url: url, licenca_url: url } }, "Wikimedia Commons")
    if (url === validUrl) {
      const html = renderSink("src/components/CandidatePhotoCredit.tsx", "CandidatePhotoCredit", { credit: { origem: "wikimedia_commons", autor: "Autora", licenca: "CC BY-SA", fonte_url: url, licenca_url: url } })
      assert.equal((html.match(/href="https:\/\/example.org\/source\?x=1&amp;y=2"/g) ?? []).length, 2)
    }

    const poll = fixturePoll("2026-09-01")
    poll.provenance.resultUrl = url
    poll.registration.url.value = url
    render("PollResearchDetails", "PollSource", { poll }, "Fonte da pesquisa")
    render("PollResearchDetails", "PollResearchDetails", { poll, candidateKeys: [] }, "Ler pesquisa ou matéria")
    const { listarPesquisasPresidenciaisPorSlug } = require("../src/lib/pesquisas-eleitorais") as typeof import("../src/lib/pesquisas-eleitorais")
    const pesquisa = listarPesquisasPresidenciaisPorSlug("lula")[0]
    render("PollIntentionCard", "PollIntentionCard", { pesquisas: [{ ...pesquisa, provenance: { ...pesquisa.provenance, resultUrl: url } }] }, "Fonte pública")
    const ficha = {
      id: "source-test", slug: "source-test", nome_urna: "Pessoa Teste", partido_sigla: "TESTE", estado: "SP", cargo_disputado: "Deputado Federal",
      pontos_atencao: [], sancoes_administrativas: [], processos: [], historico: [], patrimonio: [], votos: [], mudancas_partido: [], financiamento: [], gastos_parlamentares: [], projetos_lei: [],
      tcu_verificacao: { estado: "vazio_verificado", executado_em: "2026-09-01", detalhe: "Consulta", fontes: [{ cadastro: "responsaveis_contas_irregulares", url, volume: null }] },
    }
    render("CandidatoProfile", "CandidatoProfile", { ficha, initialTab: "alertas" }, "Contas irregulares")
    assert.deepEqual(failures, [])
  })
}

test("data source anchors are guarded across pages and components", () => {
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? files(file) : file.endsWith(".tsx") ? [file] : []
  })
  const unguarded: string[] = []
  const sourceProperty = /(?:source_url|fonte_url|url_oficial|fonteUrl|sourceUrl|originalUrl|authorityUrl|registrationUrl|provenance\.resultUrl|registration\.url\.value|pdfUrl|article_url|methodologyUrl|source\.url|correction\.url|sourceHref\()/
  let guarded = 0
  for (const file of files("src")) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === "a") {
        const attribute = node.attributes.properties.find((prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText(source) === "href")
        const href = attribute?.initializer?.getText(source) ?? ""
        if (sourceProperty.test(href)) {
          if (href.includes("safeHref(")) guarded++
          else if (file !== "src/components/CandidatePhotoCredit.tsx") unguarded.push(file + ":" + (source.getLineAndCharacterOfPosition(node.getStart()).line + 1) + " " + href)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.ok(guarded >= 30, "source anchor inventory must cover the data surfaces")
  assert.deepEqual(unguarded, [])
})
