import { mkdirSync } from "node:fs"
import path from "node:path"
import { expect, test, type Locator, type Page } from "playwright/test"

const EVIDENCE_DIR = path.join(process.cwd(), ".codex-local", "pf-18-visual")

async function expectCompactTargets(page: Page, targets: Locator) {
  await expect(targets.first()).toBeVisible()
  expect(await targets.count()).toBeGreaterThan(0)

  const layout = await targets.evaluateAll((elements) => ({
    viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    defects: elements.flatMap((element, index) => {
      const rect = element.getBoundingClientRect()
      const outsideViewport = rect.left < -2 || rect.right > window.innerWidth + 2
      const internalOverflow = element.scrollWidth > element.clientWidth + 2
      return outsideViewport || internalOverflow
        ? [{ index, outsideViewport, internalOverflow, left: rect.left, right: rect.right }]
        : []
    }),
  }))

  expect(layout.viewportOverflow, "a página não pode ter overflow horizontal").toBeFalsy()
  expect(layout.defects, "cards ou linhas não podem clipar nem transbordar").toEqual([])
}

async function openRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" })
  expect(response?.ok(), `${route} deve responder com sucesso`).toBeTruthy()
  await page.waitForLoadState("networkidle").catch(() => undefined)
}

test.describe("PF-18 rankings compactos", () => {
  test.beforeAll(() => mkdirSync(EVIDENCE_DIR, { recursive: true }))

  test("índice de rankings cabe na viewport", async ({ page }, testInfo) => {
    await openRoute(page, "/rankings")
    await expectCompactTargets(page, page.locator("[data-pf-ranking-card]:visible"))
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `${testInfo.project.name}-rankings-index.png`),
      fullPage: true,
    })
  })

  test("ranking detalhado preserva linhas sem overflow", async ({ page }, testInfo) => {
    await openRoute(page, "/rankings/gastos-parlamentares")
    await expectCompactTargets(page, page.locator("[data-pf-ranking-row]:visible"))
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `${testInfo.project.name}-ranking-detail.png`),
      fullPage: true,
    })
  })

  test("ranking estadual cabe na viewport", async ({ page }, testInfo) => {
    await openRoute(page, "/uf/sp")
    await expectCompactTargets(page, page.locator("[data-pf-state-ranking-card]:visible"))
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `${testInfo.project.name}-state-ranking.png`),
      fullPage: true,
    })
  })
})
