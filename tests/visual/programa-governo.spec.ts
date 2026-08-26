import { expect, test, type Page } from "playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { build } from "esbuild"
import path from "node:path"

const fonte = {
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

const fonteGovernador = {
  ano: 2026,
  cargo: "GOVERNADOR",
  uf: "SP",
  sqCandidato: "000000000001",
  nomeUrna: "CANDIDATA TESTE",
  partido: "PTESTE",
  arquivoNome: "2026SP000000000001_01.pdf",
  pacoteUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_SP.zip",
  datasetUrl: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
  pdfOriginalUrl: null,
  consultadoEm: "2026-08-25T12:00:00Z",
}

const resumo = {
  texto: "Este é um resumo sintético usado apenas para provar a interface antes da aprovação editorial do conteúdo real. Ele descreve propostas de saúde, educação, trabalho e meio ambiente sem substituir a revisão humana.",
  frases: [],
  temas: [
    { id: "saude", titulo: "Saúde", descricao: "Saúde pública", evidencias: [{ pagina: 1, trecho: "Saúde" }] },
    { id: "educacao", titulo: "Educação", descricao: "Educação pública", evidencias: [{ pagina: 1, trecho: "Educação" }] },
    { id: "trabalho", titulo: "Trabalho", descricao: "Trabalho e renda", evidencias: [{ pagina: 2, trecho: "trabalho" }] },
    { id: "ambiente", titulo: "Meio ambiente", descricao: "Proteção ambiental", evidencias: [{ pagina: 2, trecho: "ambiente" }] },
  ],
}

const approvedResponse = {
  estado: "aprovado",
  fonte,
  data: {
    version: 1,
    estado: "aprovado",
    fonte: {
      ...fonte,
      slug: "lula",
      arquivoNoPacote: "BR/2026BR280002542548_01.pdf",
    },
    resumo,
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
        conteudo: "Saúde pública universal.\n\nEducação pública e saúde preventiva para todas as pessoas.",
      },
      {
        id: "trabalho-e-ambiente",
        titulo: "Trabalho e meio ambiente",
        nivel: 1,
        paginaInicial: 2,
        paginaFinal: 2,
        origem: "pdftotext",
        conteudo: `Geração de trabalho e proteção do meio ambiente.\n\n${"palavralonga".repeat(40)}`,
      },
    ],
  },
}

const approvedGovernorResponse = {
  ...approvedResponse,
  fonte: fonteGovernador,
  data: {
    ...approvedResponse.data,
    fonte: {
      ...fonteGovernador,
      slug: "candidata-teste-sp",
      arquivoNoPacote: "SP/2026SP000000000001_01.pdf",
    },
  },
}

const chunkDocuments = Array.from({ length: 8 }, (_, index) => {
  const ordinal = String(index + 1).padStart(2, "0")
  return {
    documentoId: `SP:000000000001:${ordinal}`,
    fonte: {
      arquivoNome: `2026SP000000000001_${ordinal}.pdf`,
      arquivoNoPacote: `SP/2026SP000000000001_${ordinal}.pdf`,
      pacoteUrl: fonteGovernador.pacoteUrl,
      datasetUrl: fonteGovernador.datasetUrl,
      pdfOriginalUrl: null,
    },
    sourceSha256: String(index + 1).repeat(64).slice(0, 64),
    extractedTextSha256: String(index + 2).repeat(64).slice(0, 64),
    paginas: 2,
    secoes: 2,
  }
})

const chunkManifest = {
  estado: "aprovado",
  fonte: fonteGovernador,
  reviewedAt: "2026-08-26T12:00:00Z",
  paginas: 16,
  resumo,
  documentos: chunkDocuments,
}

let multidocumentHarness = ""

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from "react"
        import { createRoot } from "react-dom/client"
        import {
          ProgramaGovernoTab,
          useProgramaGovernoDocuments,
        } from "./src/components/ProgramaGovernoSection"

        const manifesto = ${JSON.stringify(chunkManifest)}

        function App() {
          const documents = useProgramaGovernoDocuments({
            active: true,
            slug: "candidata-teste-sp",
            manifesto,
          })
          return (
            <ProgramaGovernoTab
              manifesto={manifesto}
              loadState="idle"
              response={null}
              onRetry={() => {}}
              selectedDocumentId={documents.activeDocumentId}
              documentLoadState={documents.loadState}
              loadedDocument={documents.loadedDocument}
              onSelectDocument={documents.selectDocument}
              onRetryDocument={documents.retryDocument}
            />
          )
        }

        createRoot(document.getElementById("root")).render(<App />)
      `,
      resolveDir: process.cwd(),
      sourcefile: "programa-governo-visual-harness.tsx",
      loader: "tsx",
    },
    alias: { "@": path.join(process.cwd(), "src") },
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    platform: "browser",
    write: false,
  })
  multidocumentHarness = result.outputFiles[0].text
})

async function mountMultidocumentHarness(page: Page) {
  const appResponse = await page.request.get("/candidato/lula")
  const appHtml = await appResponse.text()
  const linkTags = appHtml.match(/<link[^>]+>/g) ?? []
  const stylesheetHrefs = linkTags
    .filter((tag) => /rel="stylesheet"/.test(tag))
    .map((tag) => tag.match(/href="([^"]+)"/)?.[1])
    .filter((href): href is string => Boolean(href))
  const styles = await Promise.all(stylesheetHrefs.map(async (href) => {
    const response = await page.request.get(href)
    return response.text()
  }))
  await page.setContent(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <base href="http://127.0.0.1:3111/">
        <title>Programa de governo multidocumento</title>
        <style>${styles.join("\n")}</style>
      </head>
      <body>
        <main class="mx-auto max-w-7xl px-5 py-8 md:px-12">
          <h1 class="sr-only">Programa de governo multidocumento</h1>
          <div id="root"></div>
        </main>
      </body>
    </html>
  `)
  await page.addScriptTag({ content: multidocumentHarness })
  await expect(page.locator("[data-pf-programa-multidocument]")).toBeVisible()
}

test("estado real aprovado é explícito, lazy e acessível", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  let programRequests = 0
  page.on("request", (request) => {
    if (request.url().includes("/api/candidato-profile/lula/programa")) programRequests += 1
  })

  await page.goto("/candidato/lula")
  await expect(page.locator("[data-pf-programa-overview]")).toBeVisible()
  await expect(page.getByText("Resumo por IA, revisado editorialmente")).toBeVisible()
  expect(programRequests).toBe(0)
  await page.screenshot({ path: testInfo.outputPath("approved-overview-desktop.png"), fullPage: true })

  await page.getByRole("tab", { name: "Programa" }).click()
  await expect(page.locator("[data-pf-programa-document]")).toBeVisible()
  expect(programRequests).toBe(1)
  await page.getByRole("tab", { name: "Mídia" }).click()
  await page.getByRole("tab", { name: "Programa" }).click()
  await expect(page.locator("[data-pf-programa-document]")).toBeVisible()
  expect(programRequests).toBe(1)
  await page.goBack()
  await expect(page.getByRole("tab", { name: "Mídia" })).toHaveAttribute("aria-selected", "true")

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
  )
  expect(violations).toEqual([])
  await context.close()
})

test("fixture estadual aprovada prova busca, sumário e navegação do documento", async ({ page }, testInfo) => {
  let programRequests = 0
  await page.route("**/api/candidato-profile/lula/programa", async (route) => {
    programRequests += 1
    await route.fulfill({ json: approvedGovernorResponse })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/candidato/lula?tab=programa")

  await expect(page.locator("[data-pf-programa-document]")).toBeVisible()
  expect(programRequests).toBe(1)
  await expect(page.getByText("Documento oficial do TSE · Governo de SP")).toBeVisible()
  await expect(page.getByText("Arquivo oficial: 2026SP000000000001_01.pdf")).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Sumário do programa" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Saúde e educação" })).toHaveAttribute("href", "#programa-saude-e-educacao")
  await page.getByLabel("Buscar no programa").fill("saude")
  await expect(page.locator("#programa-search-results")).toHaveText("2 resultados")
  await page.getByRole("button", { name: "Próximo resultado" }).click()
  await expect(page.locator("#programa-search-results")).toHaveText("Resultado 1 de 2")
  await expect(page.locator("mark[aria-current=true]")).toHaveText(/saúde/i)
  await expect(page.locator("mark[aria-current=true]")).toBeFocused()
  await expect(page.locator("[data-pf-programa-source=\"pacote-zip\"]")).toHaveAttribute("target", "_blank")
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath("approved-tab-desktop.png"), fullPage: true })

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
  )
  expect(violations).toEqual([])
})

test("governador em 390 px preserva teclado, foco, axe e ausência de overflow", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.route("**/api/candidato-profile/lula/programa", (route) => route.fulfill({ json: approvedGovernorResponse }))
  await page.goto("/candidato/lula")
  const geral = page.getByRole("tab", { name: "Visão geral" })
  await geral.focus()
  await geral.press("ArrowRight")
  await expect(page.getByRole("tab", { name: "Pesquisas" })).toBeFocused()
  await page.getByRole("tab", { name: "Pesquisas" }).press("ArrowRight")
  await expect(page.getByRole("tab", { name: "Programa" })).toBeFocused()
  await expect(page.locator("[data-pf-programa-document]")).toBeVisible()
  await expect(page.getByText("Documento oficial do TSE · Governo de SP")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
  )
  expect(violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("approved-tab-mobile.png"), fullPage: true })
  await context.close()
})

test("fluxo multidocumento segue chunks, troca, retry e cache sem prefetch", async ({ page }, testInfo) => {
  const requests: Array<{ documentoId: string; cursor: string | null }> = []
  let documentTwoAttempts = 0
  await page.route("**/api/candidato-profile/candidata-teste-sp/programa?**", async (route) => {
    const url = new URL(route.request().url())
    const documentoId = url.searchParams.get("documentoId") ?? ""
    const cursor = url.searchParams.get("cursor")
    requests.push({ documentoId, cursor })
    const document = chunkDocuments.find((candidate) => candidate.documentoId === documentoId)
    if (!document) {
      await route.fulfill({ status: 404, json: { data: null, estado: null } })
      return
    }
    if (documentoId === chunkDocuments[1].documentoId) {
      documentTwoAttempts += 1
      if (documentTwoAttempts === 1) {
        await route.fulfill({ status: 500, json: { data: null, estado: null } })
        return
      }
    }
    const firstDocument = documentoId === chunkDocuments[0].documentoId
    const firstChunk = firstDocument && cursor === null
    const secoes = firstChunk
      ? [{ id: "doc-1-saude", titulo: "Saúde", nivel: 1, paginaInicial: 1, paginaFinal: 1, origem: "pdftotext", conteudo: "Saúde no primeiro chunk." }]
      : firstDocument
        ? [{ id: "doc-1-educacao", titulo: "Educação", nivel: 1, paginaInicial: 2, paginaFinal: 2, origem: "pdftotext", conteudo: "Educação no segundo chunk." }]
        : [
            { id: "doc-2-trabalho", titulo: "Trabalho", nivel: 1, paginaInicial: 1, paginaFinal: 1, origem: "pdftotext", conteudo: "Trabalho do segundo documento." },
            { id: "doc-2-ambiente", titulo: "Ambiente", nivel: 1, paginaInicial: 2, paginaFinal: 2, origem: "pdftotext", conteudo: "Ambiente do segundo documento." },
          ]
    await route.fulfill({
      json: {
        data: null,
        estado: "aprovado",
        fonte: fonteGovernador,
        chunk: {
          documento: document,
          cursor,
          nextCursor: firstChunk ? `${documentoId}@1` : null,
          completo: !firstChunk,
          secoes,
          bytes: 2048,
        },
      },
    })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await mountMultidocumentHarness(page)
  await expect(page.getByLabel("Documento oficial")).toHaveValue(chunkDocuments[0].documentoId)
  await expect(page.getByText("Saúde no primeiro chunk.")).toBeVisible()
  await expect(page.getByText("Educação no segundo chunk.")).toBeVisible()
  expect(requests).toEqual([
    { documentoId: chunkDocuments[0].documentoId, cursor: null },
    { documentoId: chunkDocuments[0].documentoId, cursor: `${chunkDocuments[0].documentoId}@1` },
  ])
  await page.screenshot({ path: testInfo.outputPath("multidocument-desktop.png"), fullPage: true })

  const select = page.getByLabel("Documento oficial")
  await select.focus()
  await expect(select).toBeFocused()
  await select.press("Tab")
  await expect(select).not.toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(select).toBeFocused()
  await select.selectOption(chunkDocuments[1].documentoId)
  await expect(select).toHaveValue(chunkDocuments[1].documentoId)
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar este documento")
  await page.getByRole("button", { name: "Tentar este documento novamente" }).click()
  await expect(page.getByText("Trabalho do segundo documento.")).toBeVisible()
  await expect(page.getByText("Saúde no primeiro chunk.")).toHaveCount(0)

  const requestCountAfterDocumentTwo = requests.length
  await select.selectOption(chunkDocuments[0].documentoId)
  await expect(page.getByText("Saúde no primeiro chunk.")).toBeVisible()
  expect(requests.length).toBe(requestCountAfterDocumentTwo)
  expect(requests.every(({ documentoId }) => (
    documentoId === chunkDocuments[0].documentoId
    || documentoId === chunkDocuments[1].documentoId
  ))).toBe(true)

  await page.getByLabel("Buscar no programa").fill("educacao")
  await expect(page.locator("#programa-search-results")).toHaveText("1 resultado")
  await page.getByRole("button", { name: "Próximo resultado" }).click()
  await expect(page.locator("mark[aria-current=true]")).toBeFocused()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
  )
  expect(violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("multidocument-mobile.png"), fullPage: true })
})

test("ausência estadual é neutra, cita a fonte e não expõe conteúdo pendente", async ({ page }, testInfo) => {
  await page.route("**/api/candidato-profile/lula/programa", (route) => route.fulfill({
    json: {
      estado: "sem_documento_oficial",
      fonte: fonteGovernador,
      data: null,
    },
  }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/candidato/lula?tab=programa")

  const state = page.locator('[data-pf-programa-state="sem_documento_oficial"]')
  await expect(state).toBeVisible()
  await expect(state.getByText("Documento oficial não localizado")).toBeVisible()
  await expect(state.getByText(/Fonte consultada: Tribunal Superior Eleitoral \(TSE\), em 25 de agosto de 2026/)).toBeVisible()
  await expect(state.getByText(/disponibiliza este documento/)).toHaveCount(0)
  await expect(page.getByText("Resumo por IA, revisado editorialmente")).toHaveCount(0)
  await expect(page.getByText("Ler programa completo")).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
  )
  expect(violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("governor-absence-desktop.png"), fullPage: true })
})

test.afterAll(() => {
  console.log("PROGRAMAS_VISUAL_PASS")
})
