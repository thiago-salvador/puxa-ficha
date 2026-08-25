import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Locator, type Page } from "playwright/test"

const EXPECTED_SHA = process.env.PF_EXPECTED_DEPLOY_SHA ?? ""
const EMPTY_SLUG = process.env.PF_PESQUISAS_EMPTY_SLUG ?? "ciro-gomes-gov-ce"

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

async function waitForProfile(page: Page) {
  await expect(page.getByRole("tablist", { name: /Seções do perfil/ })).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForLoadState("networkidle")
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".hero-fade, .stagger-item, .section-reveal")).every(
          (element) => getComputedStyle(element).opacity === "1",
        ),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined)
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

test.beforeAll(async ({ request }) => {
  expect(EXPECTED_SHA, "defina PF_EXPECTED_DEPLOY_SHA com o SHA de produção esperado").toMatch(
    /^[0-9a-f]{40}$/,
  )

  const response = await request.get("/api/deployment-info")
  expect(response.ok(), `deployment-info respondeu ${response.status()}`).toBe(true)
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    environment: "production",
    commitRef: "main",
    commitSha: EXPECTED_SHA,
  })
})

test.describe("smoke somente leitura de pesquisas em produção", () => {
  test("Tarcísio mostra Datafolha e 45% nas três superfícies", async ({ page }, testInfo) => {
    const guard = await installReadOnlyBrowserGuard(page)
    await page.goto("/candidato/tarcisio-gov-sp", { waitUntil: "domcontentloaded" })
    await waitForProfile(page)

    const hero = page.locator("[data-pf-pesquisa-hero]")
    const overview = page.locator("[data-pf-pesquisas-overview]")
    await expect(hero).toContainText("Datafolha")
    await expect(hero).toContainText("45%")
    await expect(overview).toContainText("Datafolha")
    await expect(overview).toContainText("45%")
    await expectNoHorizontalOverflow(page, [page.locator("[data-pf-hero]"), overview])
    await expectBasicAccessibility(page, [
      "[data-pf-pesquisa-hero]",
      "[data-pf-pesquisas-overview]",
    ])
    await page.screenshot({
      path: testInfo.outputPath(`tarcisio-${testInfo.project.name}-visao-geral.png`),
      fullPage: true,
      animations: "disabled",
    })

    await page.getByRole("tab", { name: /^Pesquisas/ }).click()
    const tab = page.locator("[data-pf-pesquisas-tab]")
    await expect(tab).toContainText("Datafolha")
    await expect(tab).toContainText("45%")
    await expectNoHorizontalOverflow(page, [tab])
    await expectBasicAccessibility(page, ["[data-pf-pesquisas-tab]"])
    await page.screenshot({
      path: testInfo.outputPath(`tarcisio-${testInfo.project.name}-pesquisas.png`),
      fullPage: true,
      animations: "disabled",
    })

    await expectReadOnlyAndClean(guard)
  })

  test("Ciro mantém vazio explícito sem resultado de outra UF", async ({ page }, testInfo) => {
    const guard = await installReadOnlyBrowserGuard(page)
    await page.goto(`/candidato/${EMPTY_SLUG}`, { waitUntil: "domcontentloaded" })
    await waitForProfile(page)

    const hero = page.locator("[data-pf-pesquisa-hero]")
    const overview = page.locator("[data-pf-pesquisas-overview]")
    await expect(hero).toContainText("Sem pesquisa qualificada recente")
    await expect(overview.locator("[data-pf-pesquisas-empty]")).toBeVisible()
    await expect(page.getByText("0%", { exact: true })).toHaveCount(0)
    await expect(page.getByText("45%", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Datafolha", { exact: true })).toHaveCount(0)
    await expect(page.getByText("São Paulo", { exact: true })).toHaveCount(0)
    await expectNoHorizontalOverflow(page, [page.locator("[data-pf-hero]"), overview])
    await expectBasicAccessibility(page, [
      "[data-pf-pesquisa-hero]",
      "[data-pf-pesquisas-overview]",
    ])
    await page.screenshot({
      path: testInfo.outputPath(`ciro-${testInfo.project.name}-visao-geral.png`),
      fullPage: true,
      animations: "disabled",
    })

    await page.getByRole("tab", { name: /^Pesquisas/ }).click()
    const tab = page.locator("[data-pf-pesquisas-tab]")
    await expect(tab.locator("[data-pf-pesquisas-empty]")).toBeVisible()
    await expect(tab.getByText("0%", { exact: true })).toHaveCount(0)
    await expect(tab.getByText("45%", { exact: true })).toHaveCount(0)
    await expect(tab.getByText("Datafolha", { exact: true })).toHaveCount(0)
    await expectNoHorizontalOverflow(page, [tab])
    await expectBasicAccessibility(page, ["[data-pf-pesquisas-tab]"])
    await page.screenshot({
      path: testInfo.outputPath(`ciro-${testInfo.project.name}-pesquisas.png`),
      fullPage: true,
      animations: "disabled",
    })

    await expectReadOnlyAndClean(guard)
  })
})
