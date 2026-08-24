import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "playwright/test"

test.describe("box de aspas jornalísticas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/internaltest#debates-imprensa", { waitUntil: "networkidle" })
    await page.locator("[data-pf-debates-press-demo]").scrollIntoViewIfNeeded()
  })

  test("tem controles, acessibilidade e não estoura a tela", async ({ page }, testInfo) => {
    const card = page.locator("[data-pf-debates-card]")
    await expect(card).toBeVisible()
    await expect(card.locator("blockquote")).toBeVisible()
    await card.getByRole("button", { name: "Próxima citação" }).click()
    await expect(card).toHaveAttribute("data-pf-debate-quote-id", /educacao/)
    await card.getByRole("button", { name: "Pausar rotação das citações" }).click()
    await expect(card.getByRole("button", { name: "Retomar rotação das citações" })).toBeVisible()

    const results = await new AxeBuilder({ page }).include("[data-pf-debates-card]").analyze()
    const blocking = results.violations.filter((violation) =>
      ["moderate", "serious", "critical"].includes(violation.impact ?? ""),
    )
    expect(blocking, blocking.map((violation) => violation.id).join(", ")).toEqual([])

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    await testInfo.attach(`debates-imprensa-${testInfo.project.name}.png`, {
      body: await card.screenshot(),
      contentType: "image/png",
    })
  })

  test("rotaciona automaticamente em dez segundos", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "prova temporal única evita duplicar espera")
    const card = page.locator("[data-pf-debates-card]")
    await expect(card).toHaveAttribute("data-pf-debate-quote-id", /seguranca-publica/)
    await expect(card).toHaveAttribute("data-pf-debate-quote-id", /educacao/, { timeout: 12_000 })
  })

  test("não rotaciona sozinho com movimento reduzido", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "prova temporal única evita duplicar espera")
    await page.emulateMedia({ reducedMotion: "reduce" })
    const card = page.locator("[data-pf-debates-card]")
    const initialId = await card.getAttribute("data-pf-debate-quote-id")
    await page.waitForTimeout(10_500)
    await expect(card).toHaveAttribute("data-pf-debate-quote-id", initialId ?? "")
  })
})
