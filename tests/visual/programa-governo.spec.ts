import { expect, test } from "playwright/test"
import AxeBuilder from "@axe-core/playwright"

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

test("estado real pendente é explícito, lazy e acessível", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  let programRequests = 0
  page.on("request", (request) => {
    if (request.url().includes("/api/candidato-profile/lula/programa")) programRequests += 1
  })

  await page.goto("/candidato/lula")
  await expect(page.locator("[data-pf-programa-overview]")).toBeVisible()
  await expect(page.locator("[data-pf-programa-state=aguardando_revisao]")).toBeVisible()
  expect(programRequests).toBe(0)
  await page.screenshot({ path: testInfo.outputPath("pending-overview-desktop.png"), fullPage: true })

  await page.getByRole("tab", { name: "Programa" }).click()
  await expect(page.locator("[data-pf-programa-state=aguardando_revisao]")).toBeVisible()
  expect(programRequests).toBe(1)
  await page.getByRole("tab", { name: "Mídia" }).click()
  await page.getByRole("tab", { name: "Programa" }).click()
  await expect(page.locator("[data-pf-programa-state=aguardando_revisao]")).toBeVisible()
  expect(programRequests).toBe(1)
  await page.goBack()
  await expect(page.getByRole("tab", { name: "Mídia" })).toHaveAttribute("aria-selected", "true")

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
  )
  expect(violations).toEqual([])
  await context.close()
})

test("fixture aprovada prova busca, sumário e navegação do documento", async ({ page }, testInfo) => {
  let programRequests = 0
  await page.route("**/api/candidato-profile/lula/programa", async (route) => {
    programRequests += 1
    await route.fulfill({ json: approvedResponse })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/candidato/lula?tab=programa")

  await expect(page.locator("[data-pf-programa-document]")).toBeVisible()
  expect(programRequests).toBe(1)
  await expect(page.getByRole("navigation", { name: "Sumário do programa" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Saúde e educação" })).toHaveAttribute("href", "#programa-saude-e-educacao")
  await page.getByLabel("Buscar no programa").fill("saude")
  await expect(page.locator("#programa-search-results")).toHaveText("2 resultados")
  await page.getByRole("button", { name: "Próximo resultado" }).click()
  await expect(page.locator("mark[aria-current=true]")).toHaveText(/saúde/i)
  await expect(page.locator("[data-pf-programa-source=\"pacote-zip\"]")).toHaveAttribute("target", "_blank")
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath("approved-tab-desktop.png"), fullPage: true })

  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
  )
  expect(violations).toEqual([])
})

test("mobile e teclado preservam a aba sem overflow", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.route("**/api/candidato-profile/lula/programa", (route) => route.fulfill({ json: approvedResponse }))
  await page.goto("/candidato/lula")
  const geral = page.getByRole("tab", { name: "Visão geral" })
  await geral.focus()
  await geral.press("ArrowRight")
  await expect(page.getByRole("tab", { name: "Pesquisas" })).toBeFocused()
  await page.getByRole("tab", { name: "Pesquisas" }).press("ArrowRight")
  await expect(page.getByRole("tab", { name: "Programa" })).toBeFocused()
  await expect(page.locator("[data-pf-programa-document]")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath("approved-tab-mobile.png"), fullPage: true })
  await context.close()
})

test.afterAll(() => {
  console.log("PROGRAMAS_VISUAL_PASS")
})
