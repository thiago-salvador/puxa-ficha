import { test, expect } from "playwright/test"

test.describe("Doadores page SSR", () => {
  test("renders search form without query", async ({ page }) => {
    await page.goto("/doadores")
    await expect(page.locator("h1")).toContainText("Quem este nome financiou")
    await expect(page.locator("input[name=q]")).toBeVisible()
    await expect(page.locator("button[type=submit]")).toBeVisible()
    // Without query, shows prompt text
    await expect(page.getByText("Digite um nome")).toBeVisible()
  })

  test("renders valid donor results from fixture when querying 'silva'", async ({ page }) => {
    // PF_DOADOR_REVERSE_FIXTURE_FILE is set in playwright.launch.config.ts
    // Fixture has 2 rows matching "silva": JOAO GONCALVES SILVA and SILVA & ASSOCIADOS LTDA
    await page.goto("/doadores?q=silva")
    await expect(page.locator("h1")).toContainText("Quem este nome financiou")
    await expect(page.locator("input[name=q]")).toHaveValue("silva")

    // Results heading with the query term
    await expect(page.getByText('Resultados para busca semelhante a "silva"')).toBeVisible()

    // Fixture donor names rendered in the result list
    await expect(page.getByText("JOAO GONCALVES SILVA")).toBeVisible()
    await expect(page.getByText("SILVA & ASSOCIADOS LTDA")).toBeVisible()

    // Candidate names from fixture
    await expect(page.getByText("FULANO DA SILVA")).toBeVisible()
    await expect(page.getByText("BELTRANA SOUZA")).toBeVisible()

    // Values rendered
    await expect(page.getByText("R$")).toHaveCount(2)
  })

  test("shows no results for query without fixture matches", async ({ page }) => {
    await page.goto("/doadores?q=inexistente-xyz-123")
    await expect(page.getByText("Nenhuma campanha encontrada com esse termo no recorte dos maiores doadores publicados")).toBeVisible()
  })

  test("embed route renders for known slug", async ({ page }) => {
    const response = await page.goto("/embed/lula")
    expect(response?.status()).toBe(200)
    // Embed page should contain candidate data or degraded state
    const body = await page.textContent("body")
    expect(body?.length).toBeGreaterThan(50)
  })
})
