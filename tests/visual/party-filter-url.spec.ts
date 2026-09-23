import { test, expect } from "playwright/test"

test.use({ browserName: "chromium" })

test("partido filtrado na paleta sincroniza com a grade de UF", async ({ page }) => {
  await page.route("**/api/search-index", (route) => route.fulfill({
    json: {
      ok: true,
      data: [
        { href: "/candidato/fixture-pt", title: "Fixture PT", subtitle: "PT · SP", searchText: "fixture pt", party_sigla: "PT" },
        { href: "/candidato/fixture-pl", title: "Fixture PL", subtitle: "PL · SP", searchText: "fixture pl", party_sigla: "PL" },
      ],
    },
  }))
  await page.goto("/uf/sp")
  await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
  await page.getByRole("button", { name: "PT", exact: true }).click()
  await expect(page).toHaveURL(/\/uf\/sp\?partido=PT$/)
  await expect(page.getByRole("option").filter({ hasText: "Fixture PT" })).toBeVisible()
  await expect(page.getByRole("option").filter({ hasText: "Fixture PL" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  const gridChip = page.getByRole("button", { name: /Partido: PT/ })
  await expect(gridChip).toBeVisible()
  await gridChip.click()
  await expect(page).not.toHaveURL(/partido=/)
  await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
  await expect(page.getByRole("button", { name: "PT", exact: true })).toHaveAttribute("aria-pressed", "false")
})

test("navegação interna atualiza o partido na grade e na paleta persistente", async ({ page }) => {
  await page.goto("/uf/sp?partido=PT")
  await expect(page.getByRole("button", { name: /Partido: PT/ })).toBeVisible()
  await page.evaluate(() => window.history.pushState(null, "", "/uf/sp?partido=PL"))
  await expect(page.getByRole("button", { name: /Partido: PL/ })).toBeVisible()
  await page.locator('a[href="/"]').first().click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
  await expect(page.getByRole("button", { name: "PL", exact: true })).toHaveAttribute("aria-pressed", "false")
})
