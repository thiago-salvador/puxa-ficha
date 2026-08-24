import { expect, test, type Locator, type Page } from "playwright/test"

// cspell:ignore Bolsonaro daciolo Datafolha domcontentloaded marcal networkidle pablo

const WITH_DATA_SLUG = "lula"
const WITHOUT_DATA_SLUG = "pablo-marcal"
const NON_PRESIDENT_SLUG = "cabo-daciolo"

async function expectStylesLoaded(element: Locator) {
  await expect
    .poll(
      () =>
        element.evaluate((node) => {
          const style = getComputedStyle(node)
          return style.fontFamily.toLowerCase().includes("inter") && style.display !== "none"
        }),
      { message: "o stylesheet e a fonte pública devem estar aplicados antes da prova visual" },
    )
    .toBe(true)
}

async function expectNoHorizontalOverflow(page: Page, element: Locator) {
  expect(await element.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(false)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
}

async function waitForProfile(page: Page) {
  const tabs = page.getByRole("tablist", { name: /Seções do perfil/ })
  await expect(tabs).toBeVisible({ timeout: 15_000 })
  return tabs
}

test.describe("pesquisas presidenciais v2", () => {
  test("hero alterna somente primeiro turno e pausa com movimento reduzido", async ({ page }, testInfo) => {
    await page.goto(`/candidato/${WITH_DATA_SLUG}`, { waitUntil: "domcontentloaded" })

    const fullHero = page.locator("[data-pf-hero]")
    const hero = page.locator("[data-pf-pesquisa-hero]")
    await expect(hero).toBeVisible()
    await expectStylesLoaded(hero)
    await expectNoHorizontalOverflow(page, fullHero)
    await expect(hero).toContainText("Datafolha")
    await expect(hero).toContainText("39%")
    await expect(hero).not.toContainText("46%")
    await expect(hero).not.toContainText("2º turno")
    await expect(hero).not.toContainText("cenário")
    const nameBox = await page.locator("[data-pf-hero-name]").boundingBox()
    const researchBox = await hero.boundingBox()
    expect(nameBox).not.toBeNull()
    expect(researchBox).not.toBeNull()
    const horizontalGap = researchBox!.x - (nameBox!.x + nameBox!.width)
    expect(horizontalGap).toBeGreaterThanOrEqual(12)
    expect(horizontalGap).toBeLessThanOrEqual(32)
    await fullHero.screenshot({ path: testInfo.outputPath("pesquisas-hero-desktop.png") })

    await expect.poll(() => hero.textContent(), { timeout: 6_500 }).toContain("PoderData")
    await expect(hero).toContainText("41%")
    await expect(hero).not.toContainText("46%")

    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.reload({ waitUntil: "domcontentloaded" })
    const reducedHero = page.locator("[data-pf-pesquisa-hero]")
    await expect(reducedHero).toContainText("Datafolha")
    await page.waitForTimeout(5_300)
    await expect(reducedHero).toContainText("Datafolha")
    await expect(reducedHero).toContainText("39%")

    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page, fullHero)
    await fullHero.screenshot({ path: testInfo.outputPath("pesquisas-hero-mobile.png") })
  })

  test("Visão geral troca toda a pesquisa por setas acessíveis", async ({ page }, testInfo) => {
    await page.goto(`/candidato/${WITH_DATA_SLUG}`, { waitUntil: "networkidle" })
    await waitForProfile(page)

    const overview = page.locator("[data-pf-pesquisas-overview]")
    await expect(overview).toBeVisible()
    await overview.scrollIntoViewIfNeeded()
    await expectStylesLoaded(overview)
    await expect(overview.locator("[data-pf-pesquisa-card]")).toHaveCount(1)
    await expect(overview).toHaveAttribute("data-pf-overview-grid-card", "")

    const gridLayout = await page.locator("[data-pf-profile-overview-grid]").evaluate((grid) => {
      const cards = Array.from(grid.children)
        .map((card) => card.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
      return cards.slice(0, 2).map((rect) => ({ width: rect.width, top: rect.top }))
    })
    expect(gridLayout).toHaveLength(2)
    expect(Math.abs(gridLayout[0].width - gridLayout[1].width)).toBeLessThanOrEqual(1)
    expect(Math.abs(gridLayout[0].top - gridLayout[1].top)).toBeLessThanOrEqual(1)

    const current = overview.locator("[data-pf-pesquisa-overview-current]")
    const next = overview.getByRole("button", { name: "Próxima pesquisa" })
    const previous = overview.getByRole("button", { name: "Pesquisa anterior" })
    await expect(next).toHaveCSS("width", "44px")
    await expect(previous).toHaveCSS("height", "44px")
    await expect(current).toContainText("Datafolha")
    await expect(current).toContainText("39%")
    await expect(current).toContainText("18/08/2026 a 19/08/2026")
    await expect(current.locator("[data-pf-pesquisa-link]")).toHaveAttribute(
      "href",
      /folha\.uol\.com\.br/,
    )

    await next.focus()
    await expect(next).toBeFocused()
    await next.press("Enter")
    await expect(current).toContainText("PoderData")
    await expect(current).toContainText("41%")
    await expect(current).toContainText("26/07/2026 a 29/07/2026")
    await expect(current.locator("[data-pf-pesquisa-link]")).toHaveAttribute(
      "href",
      /poder360\.com\.br/,
    )

    await next.press("Enter")
    await expect(current).toContainText("46%")
    await expect(current).toContainText("2º turno")
    await expect(current).toContainText("Flávio Bolsonaro e Lula")
    await expect(overview.locator("[data-pf-pesquisa-card]")).toHaveCount(1)

    const overviewGrid = page.locator("[data-pf-profile-overview-grid]")
    await overviewGrid.screenshot({ path: testInfo.outputPath("pesquisas-overview-desktop.png") })

    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page, overview)
    await overview.screenshot({ path: testInfo.outputPath("pesquisas-overview-mobile.png") })
  })

  test("aba abre por link e query, lista todos os resultados e funciona no mobile", async ({ page }, testInfo) => {
    await page.goto(`/candidato/${WITH_DATA_SLUG}`, { waitUntil: "networkidle" })
    await waitForProfile(page)

    const overview = page.locator("[data-pf-pesquisas-overview]")
    await overview.getByRole("button", { name: "Ver todas na aba Pesquisas" }).click()
    await expect(page).toHaveURL(/\?tab=pesquisas/)

    const tab = page.locator("[data-pf-pesquisas-tab]")
    await expect(tab).toBeVisible()
    await expect(tab.locator("[data-pf-pesquisa-card]")).toHaveCount(3)
    await expect(tab).toContainText("39%")
    await expect(tab).toContainText("41%")
    await expect(tab).toContainText("46%")
    await expect(tab).toContainText("2º turno")

    await page.goto(`/candidato/${WITH_DATA_SLUG}?tab=pesquisas`, { waitUntil: "networkidle" })
    await waitForProfile(page)
    await expect(page.getByRole("tab", { name: /^Pesquisas/ })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(page.locator("[data-pf-pesquisas-tab] [data-pf-pesquisa-card]")).toHaveCount(3)

    await page.setViewportSize({ width: 390, height: 844 })
    const mobileTab = page.locator("[data-pf-pesquisas-tab]")
    await expectStylesLoaded(mobileTab)
    await expectNoHorizontalOverflow(page, mobileTab)
    await mobileTab.screenshot({ path: testInfo.outputPath("pesquisas-tab-mobile.png") })

    const pesquisasTabButton = page.getByRole("tab", { name: /^Pesquisas/ })
    await pesquisasTabButton.focus()
    await pesquisasTabButton.press("ArrowRight")
    await expect(page.getByRole("tab", { name: /^Mídia/ })).toBeFocused()
  })

  test("estado vazio é honesto no hero, Visão geral e aba", async ({ page }, testInfo) => {
    await page.goto(`/candidato/${WITHOUT_DATA_SLUG}`, { waitUntil: "networkidle" })
    await waitForProfile(page)

    const hero = page.locator("[data-pf-pesquisa-hero]")
    await expect(hero).toContainText("Sem pesquisa qualificada recente")
    await expect(hero.getByText("0%", { exact: true })).toHaveCount(0)

    const overview = page.locator("[data-pf-pesquisas-overview]")
    await expect(overview.locator("[data-pf-pesquisas-empty]")).toBeVisible()
    await expect(overview.getByText("0%", { exact: true })).toHaveCount(0)
    await overview.getByRole("button", { name: "Ver todas na aba Pesquisas" }).click()

    const tab = page.locator("[data-pf-pesquisas-tab]")
    await expect(tab.locator("[data-pf-pesquisas-empty]")).toBeVisible()
    await expect(tab.getByText("0%", { exact: true })).toHaveCount(0)
    await tab.screenshot({ path: testInfo.outputPath("pesquisas-vazio-desktop.png") })
  })

  test("timeline e não-presidente não recebem a experiência", async ({ page }) => {
    await page.goto(`/candidato/${WITH_DATA_SLUG}/timeline`, { waitUntil: "networkidle" })
    await expect(page.locator("[data-pf-pesquisa-hero]")).toHaveCount(0)
    await expect(page.getByRole("tab", { name: /^Pesquisas/ })).toHaveCount(0)

    await page.goto(`/candidato/${NON_PRESIDENT_SLUG}`, { waitUntil: "networkidle" })
    await expect(page.locator("[data-pf-pesquisa-hero]")).toHaveCount(0)
    await waitForProfile(page)
    await expect(page.getByRole("tab", { name: /^Pesquisas/ })).toHaveCount(0)
  })
})
