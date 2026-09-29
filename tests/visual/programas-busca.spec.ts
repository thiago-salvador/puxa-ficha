import { expect, test, type Page } from "playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { build } from "esbuild"
import path from "node:path"
import pablo from "../../src/data/programas-governo/presidencia-2026/pablo-marcal.json"
import { toProgramaGovernoManifestoPublico, toProgramaGovernoPublico, type ProgramaGovernoRegistro } from "../../src/lib/programa-governo"

test("filtros compartilháveis, teclado, histórico, página e acessibilidade", async ({ page, browser }, testInfo) => {
  await page.goto("/programas")
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://puxaficha.com.br/programas")
  await page.getByRole("searchbox", { name: "O que você quer encontrar?" }).fill("saúde")
  await page.getByRole("combobox", { name: "Candidato", exact: true }).selectOption("saulo-arcangeli")
  await page.getByRole("combobox", { name: "UF", exact: true }).selectOption("MA")
  await page.getByRole("combobox", { name: "Cargo", exact: true }).selectOption("GOVERNADOR")
  await page.getByRole("searchbox").press("Enter")
  await expect(page.locator('[data-pf-programa-busca-resultado]')).toHaveCount(20)
  await expect(page.locator('mark').first()).toBeVisible()
  await expect(page.getByRole("status")).toContainText("trechos encontrados")
  const status = await page.getByRole("status").innerText()
  const url = page.url()
  const params = new URL(url).searchParams
  expect(params.get("q")).toBe("saúde")
  expect(params.get("uf")).toBe("MA")
  expect(params.get("cargo")).toBe("GOVERNADOR")
  expect(params.get("candidato")).toBe("saulo-arcangeli")
  const result = page.locator('[data-pf-programa-busca-resultado]').first()
  await expect(result).toContainText("Versão 2")
  await expect(result).toContainText("SHA-256")
  await expect(result).toContainText("Página")
  await expect(result.getByRole("link", { name: "Abrir pacote oficial do TSE" })).toHaveAttribute("href", /tse\.jus\.br/)
  await expect(result.getByRole("link", { name: "Ver seção na ficha" })).toHaveAttribute("href", /sourceSha256=.*#programa-/)
  await expect(page.getByText(/páginas? deste documento não (tem|têm) texto pesquisável/).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath(`programas-${testInfo.project.name}.png`) })
  await result.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath(`programas-resultados-${testInfo.project.name}.png`) })
  const accessibility = await new AxeBuilder({ page }).include('section[aria-label="Consulta pública de programas"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
  expect(accessibility.violations).toEqual([])

  const clean = await browser.newContext({ viewport: testInfo.project.use.viewport })
  const restored = await clean.newPage()
  await restored.goto(url)
  await expect(restored.getByRole("status")).toHaveText(status)
  await expect(restored.getByRole("searchbox")).toHaveValue("saúde")
  await clean.close()

  await page.getByRole("link", { name: "Próxima página", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Página 2")
  await page.goBack()
  await expect(page.getByRole("status")).toHaveText(status)
  await page.getByRole("searchbox").fill("zzznadaencontrado")
  await page.getByRole("searchbox").press("Enter")
  await expect(page.getByText("Nenhum trecho encontrado nos documentos filtrados.", { exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole("searchbox")).toHaveValue("saúde")
  await expect(page.getByRole("status")).toHaveText(status)
  await page.goForward()
  await expect(page.getByRole("searchbox")).toHaveValue("zzznadaencontrado")
  await expect(page.getByText("Nenhum trecho encontrado nos documentos filtrados.", { exact: true })).toBeVisible()
})

async function prepareProgramaHarness(page: Page, data = toProgramaGovernoPublico(pablo as unknown as ProgramaGovernoRegistro)!) {
  const record = pablo as unknown as ProgramaGovernoRegistro
  const manifesto = toProgramaGovernoManifestoPublico(record)
  const bundle = await build({
    stdin: {
      contents: `import React from "react"; import {createRoot} from "react-dom/client";
        import {ProgramaGovernoTab} from "./src/components/ProgramaGovernoSection";
        createRoot(document.getElementById("root")).render(<ProgramaGovernoTab manifesto={${JSON.stringify(manifesto)}} loadState="loaded" response={${JSON.stringify({ estado: "aprovado", fonte: manifesto.fonte, data })}} onRetry={() => {}} />);`,
      resolveDir: process.cwd(), sourcefile: "programa-link-harness.tsx", loader: "tsx",
    },
    alias: { "@": path.join(process.cwd(), "src") }, bundle: true,
    define: { "process.env.NODE_ENV": '"test"' }, format: "iife", platform: "browser", write: false,
  })
  await page.route("**/__programa-link-test?**", (route) => route.fulfill({
    contentType: "text/html", body: '<!doctype html><html lang="pt-BR"><head><title>Teste de navegação documental</title></head><body><main id="root"></main></body></html>',
  }))
  return { bundle, hash: manifesto.sourceSha256! }
}

test("link de seção revela o capítulo e rejeita uma âncora de outra versão", async ({ page }) => {
  const data = toProgramaGovernoPublico(pablo as unknown as ProgramaGovernoRegistro)!
  const last = data.secoes.at(-1)!
  const { bundle, hash } = await prepareProgramaHarness(page, data)
  await page.goto(`/__programa-link-test?sourceSha256=${hash}&secao=${last.id}`)
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await expect(page.locator(`[id="programa-${hash}-${last.id}"]`)).toBeVisible()
  await page.locator("#programa-search").fill("saúde")
  await expect(page.getByRole("link", { name: "Buscar em todos os programas" })).toHaveAttribute("href", "/programas?q=sa%C3%BAde")
  await page.goto(`/__programa-link-test?sourceSha256=${"f".repeat(64)}&secao=${last.id}`)
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await expect(page.getByRole("alert")).toContainText("versão ou seção que não está mais disponível")
  await expect(page.locator(`[id="programa-${"f".repeat(64)}-${last.id}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-pf-programa-section="${last.id}"]`)).toHaveCount(0)
})

test("primeiro clique após seção intermediária revela todos os cinco capítulos restantes", async ({ page }) => {
  const original = toProgramaGovernoPublico(pablo as unknown as ProgramaGovernoRegistro)!
  const data = { ...original, secoes: Array.from({ length: 40 }, (_, index) => ({
    ...original.secoes[index % original.secoes.length], id: `pagina-${index + 1}`,
  })) }
  const { bundle, hash } = await prepareProgramaHarness(page, data)
  await page.goto(`/__programa-link-test?sourceSha256=${hash}&secao=pagina-35`)
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await expect(page.locator('[data-pf-programa-section]')).toHaveCount(35)
  await expect(page.getByText("35 de 40 capítulos exibidos", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Carregar mais 5 capítulos", exact: true }).click()
  await expect(page.locator('[data-pf-programa-section]')).toHaveCount(40)
  await expect(page.locator(`[id="programa-${hash}-pagina-40"]`)).toBeVisible()
  await expect(page.getByRole("button", { name: /Carregar mais/ })).toHaveCount(0)
})
