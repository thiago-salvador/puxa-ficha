import { test, expect } from "playwright/test"

// A prova de layout mobile usa o perfil iPhone com Chromium já instalado.
test.use({ browserName: "chromium" })

const candidates = [
  { href: "/candidato/fixture-22-sp", title: "Fixture 22 SP", subtitle: "PL · Governador · SP · Urna 22", searchText: "fixture 22 sp", numero_urna: "22", estado: "SP", cargo_disputado: "Governador", party_sigla: "PL" },
  { href: "/candidato/fixture-22-br", title: "Fixture 22 BR", subtitle: "PL · Presidente · BR · Urna 22", searchText: "fixture 22 br", numero_urna: "22", estado: "BR", cargo_disputado: "Presidente", party_sigla: "PL" },
  { href: "/candidato/fixture-13-sp", title: "Fixture 13 SP", subtitle: "PT · Governador · SP · Urna 13", searchText: "fixture 13 sp", numero_urna: "13", estado: "SP", cargo_disputado: "Governador", party_sigla: "PT" },
  { href: "/candidato/fixture-13-rj", title: "Fixture 13 RJ", subtitle: "PT · Senador · RJ · Urna 13", searchText: "fixture 13 rj", numero_urna: "13", estado: "RJ", cargo_disputado: "Senador", party_sigla: "PT" },
  { href: "/candidato/fixture-4545-rj", title: "Fixture 4545 RJ", subtitle: "PSDB · Governador · RJ · Urna 4545", searchText: "fixture 4545 rj", numero_urna: "4545", estado: "RJ", cargo_disputado: "Governador", party_sigla: "PSDB" },
]

test("paleta de urna filtra e agrupa resultados em preview com dados controlados", async ({ page }, testInfo) => {
  await page.route("**/api/search-index", (route) => route.fulfill({ json: { ok: true, data: candidates } }))
  await page.goto("/")
  await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
  const input = page.getByRole("combobox", { name: "Buscar no site" })
  await expect(input).toBeVisible()

  const screenshot = async (name: string) => {
    const dir = process.env.PF_FRENTE5_SCREENSHOT_DIR
    if (dir) await page.screenshot({ path: `${dir}/${testInfo.project.name}-${name}.png`, fullPage: false })
  }

  const pt = page.getByRole("button", { name: "PT", exact: true })
  await expect(pt).toBeVisible()
  await pt.click()
  await expect(page).toHaveURL(/\?partido=PT$/)
  await expect(page.getByRole("option").filter({ hasText: "Fixture 13 SP" })).toBeVisible()
  await expect(page.getByRole("option").filter({ hasText: "Fixture 22 SP" })).toHaveCount(0)
  await pt.click()
  await expect(page).not.toHaveURL(/partido=/)

  await input.fill("22")
  await expect(page.getByRole("group", { name: "BR · Presidente" })).toBeVisible()
  await expect(page.getByRole("option").filter({ hasText: "Fixture 22 BR" })).toBeVisible()
  await expect(page.getByRole("option").filter({ hasText: "Fixture 13 SP" })).toHaveCount(0)
  await screenshot("22")

  await input.fill("13 SP")
  await expect(page.getByRole("option").filter({ hasText: "Fixture 13 SP" })).toBeVisible()
  await expect(page.getByRole("option").filter({ hasText: "Fixture 13 RJ" })).toHaveCount(0)
  await screenshot("13-sp")

  await input.fill("13")
  await expect(page.getByRole("group", { name: "SP · Governador" })).toBeVisible()
  await expect(page.getByRole("group", { name: "RJ · Senador" })).toBeVisible()
  await screenshot("13-repetido")

  await input.fill("4545 RJ")
  await expect(page.getByRole("option").filter({ hasText: "Fixture 4545 RJ" })).toBeVisible()
})

test("teclado abre o primeiro resultado numérico que aparece na tela", async ({ page }) => {
  await page.route("**/api/search-index", (route) => route.fulfill({ json: { ok: true, data: candidates } }))
  await page.goto("/")
  await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
  const input = page.getByRole("combobox", { name: "Buscar no site" })
  await input.fill("22")
  const firstVisible = page.getByRole("group", { name: "BR · Presidente" }).getByRole("option").first()
  await expect(firstVisible).toContainText("Fixture 22 BR")
  await input.press("ArrowDown")
  await expect(firstVisible).toHaveAttribute("aria-selected", "true")
  await input.press("Enter")
  await expect(page).toHaveURL(/\/candidato\/fixture-22-br$/)
})
