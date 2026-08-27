import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "playwright/test"

const CANDIDATE_PATH = "/candidato/lula"
const GLOBAL_PROGRAM_PATHS = [
  "/candidato/romeu-zema",
  "/candidato/samara-martins",
  "/candidato/hertz-dias",
]

async function waitForProfile(page: Page) {
  await page.locator("[data-pf-profile-overview-grid]").waitFor({ state: "visible", timeout: 20_000 })
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

async function expectCareerAndProgramPair(page: Page) {
  const pair = page.locator("[data-pf-profile-overview-paired-cards]")
  const careerCard = pair.locator(":scope > *").filter({
    has: page.getByRole("heading", { name: "Carreira Política" }),
  })
  const programCard = pair.locator(":scope > [data-pf-programa-overview]")
  await expect(careerCard).toHaveCount(1)
  await expect(programCard).toHaveCount(1)
  const [careerBox, programBox] = await Promise.all([
    careerCard.boundingBox(),
    programCard.boundingBox(),
  ])
  expect(careerBox).not.toBeNull()
  expect(programBox).not.toBeNull()
  expect(Math.abs(careerBox!.x - programBox!.x)).toBeGreaterThan(1)
  expect(Math.abs(careerBox!.y - programBox!.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(careerBox!.width - programBox!.width)).toBeLessThanOrEqual(1)
}

test.describe("polimento da ficha de candidatos", () => {
  test("mobile concentra a navegação, comunica estados e mantém alvos de toque", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "cenário específico de viewport mobile")
    test.setTimeout(45_000)
    await page.goto(CANDIDATE_PATH, { waitUntil: "domcontentloaded" })
    await expect(page.getByText("Carregando indicadores e seções da ficha...")).toBeVisible()
    await page.waitForTimeout(4_500)
    await waitForProfile(page)

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

  test("desktop mantém ritmo de grid e leitor progressivo", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "cenário específico de viewport desktop")
    await page.goto(CANDIDATE_PATH, { waitUntil: "domcontentloaded" })
    await waitForProfile(page)

    const overview = page.locator("[data-pf-profile-overview-grid]")
    const primaryGrid = page.locator("[data-pf-profile-overview-primary-grid]")
    const rows = await primaryGrid.evaluate((node) => {
      const cards = Array.from(node.children).map((card) => {
        const rect = card.getBoundingClientRect()
        return { top: Math.round(rect.top), height: Math.round(rect.height), width: Math.round(rect.width) }
      }).filter((rect) => rect.width > 0 && rect.height > 0)
      return Object.values(cards.reduce<Record<string, typeof cards>>((groups, card) => {
        const key = String(card.top)
        groups[key] = [...(groups[key] ?? []), card]
        return groups
      }, {}))
    })
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows.filter((items) => items.length === 2)) {
      expect(Math.abs(row[0].height - row[1].height)).toBeLessThanOrEqual(1)
      expect(Math.abs(row[0].width - row[1].width)).toBeLessThanOrEqual(1)
    }
    await expectCareerAndProgramPair(page)
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

  test("grid compartilhado mantém Carreira e Programa em meia largura nas demais fichas", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "cenário específico de viewport desktop")
    test.setTimeout(60_000)
    for (const candidatePath of GLOBAL_PROGRAM_PATHS) {
      await page.goto(candidatePath, { waitUntil: "domcontentloaded" })
      await waitForProfile(page)
      await expectCareerAndProgramPair(page)
      await expectNoPageOverflow(page)
    }
  })
})
