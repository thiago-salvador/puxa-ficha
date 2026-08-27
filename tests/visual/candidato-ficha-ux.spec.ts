import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "playwright/test"

const CANDIDATE_PATH = "/candidato/lula"
const GLOBAL_PROGRAM_PATHS = [
  "/candidato/romeu-zema",
  "/candidato/samara-martins",
  "/candidato/hertz-dias",
]

async function waitForProfile(page: Page) {
  const overview = page.locator("[data-pf-profile-overview-grid]")
  await overview.waitFor({ state: "visible", timeout: 20_000 })
  await expect(overview).toHaveAttribute("data-pf-profile-overview-layout", /^(masonry|single-column)$/)
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

async function captureAccessiblePage(page: Page, path: string) {
  await expectNoPageOverflow(page)
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([])
  await page.screenshot({ path, fullPage: true })
}

async function expectIntrinsicMasonry(page: Page) {
  const overview = page.locator("[data-pf-profile-overview-grid]")
  await expect(overview).toHaveAttribute("data-pf-profile-overview-layout", "masonry")
  const geometry = await overview.evaluate((node) => {
    const container = node.getBoundingClientRect()
    const items = Array.from(node.querySelectorAll<HTMLElement>(":scope > [data-pf-profile-overview-item]"))
      .map((item) => {
        const rect = item.getBoundingClientRect()
        return {
          column: item.dataset.pfProfileOverviewColumn,
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
          bottom: rect.bottom,
        }
      })
      .filter((item) => item.width > 0 && item.height > 0)
    return { container: { bottom: container.bottom, width: container.width }, items }
  })

  expect(geometry.items.length).toBeGreaterThan(1)
  expect(new Set(geometry.items.map((item) => item.column))).toEqual(new Set(["1", "2"]))
  const expectedWidth = (geometry.container.width - 24) / 2
  for (const item of geometry.items) {
    expect(Math.abs(item.width - expectedWidth)).toBeLessThanOrEqual(1)
    expect(item.bottom).toBeLessThanOrEqual(geometry.container.bottom + 1)
  }
  for (const column of ["1", "2"]) {
    const items = geometry.items.filter((item) => item.column === column).sort((a, b) => a.y - b.y)
    for (let index = 1; index < items.length; index += 1) {
      expect(items[index].y - items[index - 1].bottom).toBeGreaterThanOrEqual(23)
    }
  }
}

async function expectZemaIndependentStack(page: Page) {
  const items = page.locator("[data-pf-profile-overview-item]")
  const program = items.filter({ has: page.locator("[data-pf-programa-overview]") })
  const sites = items.filter({ has: page.locator("[data-pf-candidate-sites-card]") })
  const career = items.filter({ has: page.getByRole("heading", { name: "Carreira Política" }) })
  await expect(program).toHaveCount(1)
  await expect(sites).toHaveCount(1)
  await expect(career).toHaveCount(1)

  const [programColumn, sitesColumn, careerColumn] = await Promise.all([
    program.getAttribute("data-pf-profile-overview-column"),
    sites.getAttribute("data-pf-profile-overview-column"),
    career.getAttribute("data-pf-profile-overview-column"),
  ])
  expect(sitesColumn).toBe(careerColumn)
  expect(programColumn).not.toBe(sitesColumn)

  const [programBox, sitesBox, careerBox] = await Promise.all([
    program.boundingBox(),
    sites.boundingBox(),
    career.boundingBox(),
  ])
  expect(programBox).not.toBeNull()
  expect(sitesBox).not.toBeNull()
  expect(careerBox).not.toBeNull()
  expect(Math.abs(programBox!.width - sitesBox!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(programBox!.width - careerBox!.width)).toBeLessThanOrEqual(1)
  expect(sitesBox!.y + sitesBox!.height).toBeLessThan(careerBox!.y)
  expect(careerBox!.height).toBeLessThan(programBox!.height)
}

test.describe("polimento da ficha de candidatos", () => {
  test("mobile concentra a navegação, comunica estados e mantém alvos de toque", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "cenário específico de viewport mobile")
    test.setTimeout(45_000)
    await page.goto(CANDIDATE_PATH, { waitUntil: "domcontentloaded" })
    await expect(page.getByText("Carregando indicadores e seções da ficha...")).toBeVisible()
    await page.waitForTimeout(4_500)
    await waitForProfile(page)

    const overview = page.locator("[data-pf-profile-overview-grid]")
    await expect(overview).toHaveAttribute("data-pf-profile-overview-layout", "single-column")
    const mobileItemsFit = await overview.locator(":scope > [data-pf-profile-overview-item]:visible").evaluateAll(
      (items) => items.every((item) => {
        const rect = item.getBoundingClientRect()
        const parent = item.parentElement?.getBoundingClientRect()
        return parent != null && Math.abs(rect.width - parent.width) <= 1 && getComputedStyle(item).position === "static"
      }),
    )
    expect(mobileItemsFit).toBe(true)

    const primaryTabs = page.getByRole("tablist", { name: "Seções principais do perfil" })
    await expect(primaryTabs).toBeVisible()
    await expect(primaryTabs.getByRole("tab")).toHaveCount(3)
    expect(await primaryTabs.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)

    const moreButton = page.getByRole("button", { name: /Mais/ })
    await expect(moreButton).toBeVisible()
    await expect(moreButton).toHaveCSS("min-height", "48px")
    await moreButton.click()
    const moreMenu = page.getByRole("menu")
    await expect(moreMenu).toBeVisible()
    await expect(moreMenu.getByRole("menuitemradio")).toHaveCount(7)
    await moreMenu.getByRole("menuitemradio", { name: /^Mídia/ }).click()
    await expect(page).toHaveURL(/tab=media/)

    await page.getByRole("tab", { name: "Visão" }).click()
    await expect(page).toHaveURL(/tab=geral/)
    const actionArea = page.getByLabel("Ações da ficha")
    const shareButton = actionArea.getByRole("button", { name: "Compartilhar perfil" })
    await expect(shareButton).toBeVisible({ timeout: 10_000 })
    const actionBoxes = await actionArea.locator("button, a").evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    expect(actionBoxes.length).toBeGreaterThan(0)
    for (const box of actionBoxes) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }

    const credit = page.locator("[data-pf-photo-credit-collapsible]")
    await expect(credit).toBeVisible()
    await expect(credit).not.toHaveAttribute("open", "")
    await captureAccessiblePage(page, testInfo.outputPath("ficha-mobile.png"))
  })

  test("desktop mantém masonry intrínseco e leitor progressivo", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "cenário específico de viewport desktop")
    await page.goto(CANDIDATE_PATH, { waitUntil: "domcontentloaded" })
    await waitForProfile(page)

    const overview = page.locator("[data-pf-profile-overview-grid]")
    await expectIntrinsicMasonry(page)
    await overview.screenshot({ path: testInfo.outputPath("ficha-overview-desktop.png") })

    await page.getByRole("tab", { name: /^Programa/ }).click()
    const reader = page.locator("[data-pf-programa-document]")
    await expect(reader).toBeVisible({ timeout: 15_000 })
    await expect(reader.locator("[data-pf-programa-section]")).toHaveCount(12)
    const loadMore = reader.getByRole("button", { name: /Carregar mais/ })
    await expect(loadMore).toBeVisible()
    await loadMore.click()
    expect(await reader.locator("[data-pf-programa-section]").count()).toBeGreaterThan(12)
    await captureAccessiblePage(page, testInfo.outputPath("ficha-programa-desktop.png"))
  })

  test("masonry compartilhado mantém qualquer card em meia largura e altura própria", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "cenário específico de viewport desktop")
    test.setTimeout(60_000)
    for (const candidatePath of GLOBAL_PROGRAM_PATHS) {
      await page.goto(candidatePath, { waitUntil: "domcontentloaded" })
      await waitForProfile(page)
      await expectIntrinsicMasonry(page)
      if (candidatePath === "/candidato/romeu-zema") await expectZemaIndependentStack(page)
      await expectNoPageOverflow(page)
    }
  })
})
