import { expect, test } from "playwright/test"

test("home presents presidential programs then national polls", async ({ page }) => {
  await page.goto("/")
  const programs = page.locator("#programas")
  const polls = page.locator("#pesquisas")
  await expect(programs).toBeVisible()
  await expect(polls).toBeVisible()
  await expect(programs.getByText("Contexto do estado", { exact: true })).toHaveCount(0)
  await expect(programs.getByRole("button", { name: "Segurança", exact: true })).toHaveAttribute("aria-pressed", "true")
  await programs.getByRole("button", { name: "Saúde", exact: true }).click()
  await expect(programs.getByRole("button", { name: "Saúde", exact: true })).toHaveAttribute("aria-pressed", "true")
  const order = await page.locator("h2").allTextContents()
  expect(order.indexOf("O que está nos programas")).toBeGreaterThan(order.indexOf("Presidenciáveis"))
  expect(order.indexOf("Um cenário por vez")).toBeGreaterThan(order.indexOf("O que está nos programas"))
  expect(order.indexOf("Atualizações recentes")).toBeGreaterThan(order.indexOf("Um cenário por vez"))
  await expect(polls.getByRole("combobox", { name: "Turno", exact: true })).toHaveValue("1")
  await polls.getByRole("combobox", { name: "Turno", exact: true }).selectOption("2")
  await expect(polls.getByRole("combobox", { name: "Turno", exact: true })).toHaveValue("2")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test("first-turn national poll fits a 375px viewport", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  await page.goto("/")
  await expect(page.locator("#pesquisas")).toBeVisible()
  await page.waitForLoadState("networkidle")
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
  const otherThemes = page.getByRole("combobox", { name: "Outros temas do programa" })
  if (await otherThemes.count()) {
    const longestTheme = await otherThemes.evaluate((select: HTMLSelectElement) =>
      [...select.options].sort((a, b) => b.text.length - a.text.length)[0].value)
    await otherThemes.selectOption(longestTheme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(dimensions.viewport)
  }
  await context.close()
})
