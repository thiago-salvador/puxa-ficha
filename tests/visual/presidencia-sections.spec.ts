import { expect, test } from "playwright/test"

test("home presents presidential programs then national polls", async ({ page }) => {
  await page.goto("/")
  const programs = page.locator("#programas")
  const polls = page.locator("#pesquisas")
  await expect(programs).toBeVisible()
  await expect(polls).toBeVisible()
  await expect(programs.getByText("Contexto do estado", { exact: true })).toHaveCount(0)
  await expect(programs.getByRole("button", { name: "Resumo do programa", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(programs.getByRole("navigation", { name: "Tema do programa" })).toHaveCount(0)
  await programs.getByRole("button", { name: "Por tema", exact: true }).click()
  const temas = programs.getByRole("navigation", { name: "Tema do programa" })
  await temas.getByRole("button", { name: "Saúde", exact: true }).click()
  await expect(temas.getByRole("button", { name: "Saúde", exact: true })).toHaveAttribute("aria-pressed", "true")
  const order = await page.locator("h2").allTextContents()
  expect(order.indexOf("O que está nos programas")).toBeGreaterThan(order.indexOf("Presidenciáveis"))
  expect(order.indexOf("A evolução da disputa")).toBeGreaterThan(order.indexOf("O que está nos programas"))
  expect(order.indexOf("Atualizações recentes")).toBeGreaterThan(order.indexOf("A evolução da disputa"))
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
  await page.locator("#programas").getByRole("button", { name: "Por tema", exact: true }).click()
  const themeButtons = page.getByRole("navigation", { name: "Tema do programa" }).getByRole("button")
  if (await themeButtons.count()) {
    const textos = await themeButtons.allTextContents()
    const longestTheme = [...textos].sort((a, b) => b.length - a.length)[0]
    await page.getByRole("navigation", { name: "Tema do programa" }).getByRole("button", { name: longestTheme, exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(dimensions.viewport)
  }
  await context.close()
})
