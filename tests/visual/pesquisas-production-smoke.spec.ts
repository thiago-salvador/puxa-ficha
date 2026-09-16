import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "playwright/test"
import {
  automationBypassHeaders,
  establishAutomationBypass,
} from "../../scripts/vercel-automation-bypass"

const EXPECTED_SHA = process.env.PF_EXPECTED_DEPLOY_SHA ?? ""

type BrowserGuard = {
  browserErrors: string[]
}

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(" "))
        .join(", ")
      return `${violation.id} (${violation.impact}): ${violation.help} [${targets}]`
    })
    .join("\n")
}

async function installReadOnlyBrowserGuard(page: Page): Promise<BrowserGuard> {
  const browserErrors: string[] = []

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`)
  })
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`))

  await page.route("**/*", async (route) => {
    const method = route.request().method()
    if (method !== "GET" && method !== "HEAD") {
      await route.fulfill({ status: 204, body: "" })
      return
    }
    await route.continue()
  })

  return { browserErrors }
}

async function expectNoHorizontalOverflow(page: Page, regions: Locator[]) {
  const documentOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(documentOverflows).toBe(false)

  for (const region of regions) {
    await expect(region).toBeVisible()
    expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false)
  }
}

async function expectBasicAccessibility(page: Page, selectors: string[]) {
  let builder = new AxeBuilder({ page })
  for (const selector of selectors) builder = builder.include(selector)
  const results = await builder.analyze()
  const blockingViolations = results.violations.filter(
    (violation) =>
      violation.impact === "moderate" ||
      violation.impact === "serious" ||
      violation.impact === "critical",
  )
  expect(blockingViolations, formatViolations(blockingViolations)).toEqual([])
}

async function expectReadOnlyAndClean(guard: BrowserGuard) {
  expect(guard.browserErrors, `erros do navegador:\n${guard.browserErrors.join("\n")}`).toEqual([])
}

async function openPublicPolls(page: Page, path: string) {
  await page.goto(`${path}#pesquisas`, { waitUntil: "domcontentloaded" })
  const section = page.locator("[data-pf-polls]")
  await expect(section).toBeVisible()
  await expect(section.getByRole("heading", { name: "A evolução da disputa" })).toBeVisible()
  await expect(section.locator("[data-pf-poll-trend]")).toBeVisible()
  await expect(section.locator('[data-pf-poll-trend] button[aria-label*="semana"]')).not.toHaveCount(0)
  await expect(section.locator("[data-pf-week-source] > p > strong")).toHaveText(
    /^(1 pesquisa na semana|Média de [2-9]\d* pesquisas)$/,
  )
  await expect(section.locator("[data-pf-week-source] a")).not.toHaveCount(0)
  const filters = section.getByRole("button", { name: "Filtros de pesquisa", exact: true })
  if (await filters.isVisible()) {
    await filters.click()
    await expect(filters).toHaveAttribute("aria-expanded", "true")
  }
  return section
}

async function expectMobileWeekNavigation(section: Locator) {
  const points = section.locator('[data-pf-poll-trend] button[aria-label*="semana"]')
  if (await points.count() < 2) return

  const mobile = section.locator("[data-pf-mobile-research]")
  await expect(mobile).toBeVisible()
  const previous = section.getByRole("button", { name: "Anterior", exact: true })
  const next = section.getByRole("button", { name: "Próxima", exact: true })
  await expect(previous).toBeEnabled()
  await expect(next).toBeDisabled()
  const latest = await mobile.innerText()
  await previous.click()
  await expect.poll(() => mobile.innerText()).not.toBe(latest)
  await expect(next).toBeEnabled()
  await next.click()
  await expect.poll(() => mobile.innerText()).toBe(latest)
}

test.beforeAll(async ({ request }) => {
  expect(EXPECTED_SHA, "defina PF_EXPECTED_DEPLOY_SHA com o SHA de produção esperado").toMatch(
    /^[0-9a-f]{40}$/,
  )

  const response = await request.get("/api/deployment-info", {
    headers: automationBypassHeaders(process.env.VERCEL_AUTOMATION_BYPASS_SECRET),
  })
  expect(response.ok(), `deployment-info respondeu ${response.status()}`).toBe(true)
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    environment: "production",
    commitRef: "main",
    commitSha: EXPECTED_SHA,
  })
})

test.beforeEach(async ({ context, baseURL }) => {
  if (baseURL) {
    await establishAutomationBypass(context, baseURL, process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
  }
})

test.describe("smoke somente leitura de pesquisas em produção", () => {
  test("catálogo presidencial publica a semana e mantém a prova de produção", async ({ page }, testInfo) => {
    const guard = await installReadOnlyBrowserGuard(page)
    const section = await openPublicPolls(page, "/")
    await expect(section.getByRole("combobox", { name: "Turno", exact: true })).toHaveValue("1")
    await expect(section.getByRole("combobox", { name: "Instituto", exact: true })).toBeVisible()
    await expect(section.getByRole("link", { name: /Fonte da pesquisa|Fonte:/ }).first()).toHaveAttribute(
      "href",
      /^https:\/\//,
    )
    await expectNoHorizontalOverflow(page, [section])
    await expectBasicAccessibility(page, ["[data-pf-polls]"])
    if ((page.viewportSize()?.width ?? 1440) <= 640) await expectMobileWeekNavigation(section)
    await page.screenshot({
      path: testInfo.outputPath(`presidencia-${testInfo.project.name}.png`),
      fullPage: true,
      animations: "disabled",
    })
    await expectReadOnlyAndClean(guard)
  })

  test("superfície do Amazonas mantém pesquisas isoladas por UF", async ({ page }, testInfo) => {
    const guard = await installReadOnlyBrowserGuard(page)
    const section = await openPublicPolls(page, "/uf/am")
    await expect(section).not.toContainText("Lula")
    await expect(section).toContainText("Omar")
    await expect(section.getByRole("combobox", { name: "Cenário", exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page, [section])
    await expectBasicAccessibility(page, ["[data-pf-polls]"])
    await page.screenshot({
      path: testInfo.outputPath(`amazonas-${testInfo.project.name}.png`),
      fullPage: true,
      animations: "disabled",
    })
    await expectReadOnlyAndClean(guard)
  })
})
