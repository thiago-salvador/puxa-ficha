import { expect, test, type Page } from "playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { build } from "esbuild"

async function fixture(page: Page, query = "") {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  const shell = await page.evaluate(() => ({
    styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link => link.href),
    htmlClass: document.documentElement.className,
  }))
  const bundle = await build({ entryPoints: ["tests/visual/fixtures/second-round-polls.tsx"], bundle: true, write: false, outdir: "/tmp/second-round-polls-bundle", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, loader: { ".module.css": "local-css" } })
  const script = bundle.outputFiles.find(file => file.path.endsWith(".js"))!.text
  const css = bundle.outputFiles.find(file => file.path.endsWith(".css"))!.text
  await page.route("**/__second_round_fixture*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="pt-BR" class="${shell.htmlClass}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pesquisas: teste de evolução</title>${shell.styles.map(url => `<link rel="stylesheet" href="${url}">`).join("")}<style>${css}</style></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>` }))
  await page.goto(`/__second_round_fixture${query}`)
  await page.evaluate(() => document.fonts.ready)
  return page.locator("[data-pf-evolucao-2turno]")
}

test("real home uses daily means and retains all institutes, dates and original sources", async ({ page }, info) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto("/#pesquisas-2turno", { waitUntil: "domcontentloaded" })
  const section = page.locator("#pesquisas-2turno")
  await expect(section.getByRole("tab", { name: "Evolução", exact: true })).toBeVisible()
  await expect(section.locator("[data-pf-media-linha]")).toHaveCount(2)
  await expect(section.getByRole("combobox", { name: "Instituto", exact: true }).locator("option")).not.toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  // Element screenshots span beyond a viewport; fixed chrome must not obscure the section.
  await page.addStyleTag({ content: "header.fixed, nextjs-portal, [data-pf-faixa-fixa] { visibility: hidden !important; }" })
  await section.getByText("Entenda o cálculo da média", { exact: true }).scrollIntoViewIfNeeded()
  await expect(section.getByText("Média simples por data de divulgação.", { exact: false })).toBeVisible()
  await section.scrollIntoViewIfNeeded()
  await section.screenshot({ path: info.outputPath("home-desktop.png") })
  await section.getByRole("tab", { name: "Pesquisas", exact: true }).click()
  await expect(section.getByRole("tabpanel", { name: "Pesquisas", exact: true }).getByRole("link", { name: /Fonte da pesquisa/ }).first()).toHaveAttribute("href", /^https:\/\//)
  await section.getByRole("tab", { name: "Evolução", exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => section.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await section.screenshot({ path: info.outputPath("home-mobile.png") })
  expect(errors).toEqual([])
})

test("daily means match sources; filters, date keyboard navigation, tabs and mobile work", async ({ page }, info) => {
  const section = await fixture(page)
  await expect(section.locator("[data-pf-media-ponto]")).toHaveCount(12)
  await expect(section.locator("[data-pf-pesquisa-ponto]")).toHaveCount(0)
  await expect(section.locator("[data-pf-dia-selecionado]")).toHaveAttribute("data-pf-dia-selecionado", "2026-10-22")
  await expect(section.locator("[data-pf-dia-selecionado]")).toContainText("48,4%")
  await expect(section.locator("[data-pf-dia-selecionado]")).toContainText("45,8%")
  await expect(section.locator("[data-pf-dia-selecionado]")).toContainText("3 pesquisas")
  const points = section.getByRole("group", { name: "Datas das pesquisas" }).getByRole("button")
  await points.nth(1).focus()
  await expect(section.locator("[data-pf-dia-selecionado]")).toContainText("48,0%")
  await expect(section.locator("[data-pf-dia-selecionado]")).toContainText("45,0%")
  await page.keyboard.press("ArrowRight")
  await expect(section.locator("[data-pf-dia-selecionado]")).toHaveAttribute("data-pf-dia-selecionado", "2026-10-13")
  await page.keyboard.press("End")
  await section.getByRole("combobox", { name: "Instituto", exact: true }).selectOption("Instituto A")
  await expect(section.locator("[data-pf-dia-selecionado]")).toContainText("48,0%")
  await expect(section.locator("[data-pf-media-ponto]")).toHaveCount(6)
  await section.getByRole("combobox", { name: "Instituto", exact: true }).selectOption("all")
  await section.getByRole("combobox", { name: "Base da pesquisa", exact: true }).selectOption({ label: "Votos válidos · Intenção de voto estimulada" })
  await expect(section.locator("[data-pf-media-linha]")).toHaveCount(0)
  await expect(section.locator("[data-pf-dia-selecionado]")).toContainText("52,0%")
  await section.getByRole("combobox", { name: "Base da pesquisa", exact: true }).selectOption({ label: "Votos totais · Intenção de voto estimulada" })
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.locator("main").screenshot({ path: info.outputPath("approved-desktop.png") })
  await section.getByRole("tab", { name: "Pesquisas", exact: true }).click()
  const panel = section.getByRole("tabpanel", { name: "Pesquisas", exact: true })
  await expect(panel.getByRole("link", { name: /Fonte da pesquisa/ })).toHaveCount(6)
  await panel.getByRole("button", { name: "Ver todas as 9 pesquisas" }).click()
  await expect(panel.getByRole("link", { name: /Fonte da pesquisa/ })).toHaveCount(9)
  await section.getByRole("tab", { name: "Evolução", exact: true }).click()
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await expect.poll(() => section.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    if (width === 390) await page.locator("main").screenshot({ path: info.outputPath("approved-mobile.png") })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const accessibility = await new AxeBuilder({ page }).include("[data-pf-evolucao-2turno]").withTags(["wcag2a", "wcag2aa"]).analyze()
  expect(accessibility.violations).toEqual([])
})

test("ties keep readable endpoints, single dates show no trend, missing dates show a notice", async ({ page }, info) => {
  let section = await fixture(page, "?tie")
  const labels = section.locator("[data-pf-media-final]")
  await expect(labels).toHaveCount(2)
  const boxes = await labels.evaluateAll(nodes => nodes.map(node => node.querySelector("text:last-of-type")!.getBoundingClientRect().toJSON()))
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeGreaterThan(40)
  await page.locator("main").screenshot({ path: info.outputPath("tie-desktop.png") })
  section = await fixture(page, "?single")
  await expect(section.locator("[data-pf-media-linha]")).toHaveCount(0)
  await expect(section.locator("[data-pf-media-ponto]")).toHaveCount(2)
  await expect(section).toContainText("Uma data disponível neste filtro")
  section = await fixture(page, "?empty")
  await expect(section.locator("[data-pf-media-ponto]")).toHaveCount(0)
  await expect(section.getByRole("status")).toContainText("Nenhuma pesquisa com data de publicação verificada")
  await section.getByRole("tab", { name: "Pesquisas", exact: true }).click()
  await expect(section.getByRole("tabpanel", { name: "Pesquisas", exact: true })).toContainText("Data não informada")
})
