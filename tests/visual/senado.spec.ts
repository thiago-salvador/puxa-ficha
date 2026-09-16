import { expect, test } from "playwright/test"
import AxeBuilder from "@axe-core/playwright"

test.describe("superfície local do Senado", () => {
  test("oferece as 27 UFs e chega à consulta estadual pela home via Parlamentares", async ({ page }) => {
    // O diretório /senado continua publicado, mas fora do menu principal.
    await page.goto("/senado", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Por estado" })).toBeVisible()
    await expect(page.getByRole("link", { name: "São Paulo SP" })).toHaveAttribute("href", "/uf/sp/senado")
    await expect(page.locator('a[href^="/uf/"][href$="/senado"]')).toHaveCount(27)
    await expect(page.locator('a[href="/senado"]')).toHaveCount(0)

    // Navegação aprovada: home → Parlamentares → mapa de senadores → UF.
    await page.goto("/", { waitUntil: "domcontentloaded" })
    const categorias = page.getByRole("navigation", { name: "Categorias de candidatos" })
    await expect(categorias.getByRole("link")).toHaveText(["Presidenciáveis", "Governadores", "Parlamentares"])
    await expect(page.locator('a[href="/senado"]')).toHaveCount(0)
    await categorias.getByRole("link", { name: "Parlamentares", exact: true }).click()
    await expect(page).toHaveURL(/\/parlamentares$/)

    const parlamentares = page.getByRole("navigation", { name: "Categorias parlamentares" })
    await expect(parlamentares.getByRole("link", { name: "Senadores", exact: true })).toHaveAttribute("aria-current", "page")
    await expect(parlamentares.getByRole("link", { name: "Deputados", exact: true })).toHaveAttribute("href", "/parlamentares/deputados")
    await expect(page.locator('#diretorio-estados a[href^="/uf/"][href$="/senado"]')).toHaveCount(27)

    await page.locator('#diretorio-estados a[href="/uf/sp/senado"]').click()
    await expect(page).toHaveURL(/\/uf\/sp\/senado$/)
    await expect(page.getByRole("heading", { name: "São Paulo", exact: true })).toBeVisible()
  })

  test("ficha do titular mostra suplências verificadas", async ({ page }) => {
    await page.goto("/candidato/fixture-senado-alfa", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Fixture Senadora Alfa", exact: true })).toBeVisible()
    await expect(page.locator("[data-pf-senado-suplentes]")).toBeVisible()
    // Card de suplentes vive na grade da visão geral, antes do bloco de alertas.
    await expect(page.locator("[data-pf-profile-overview-grid] [data-pf-senado-suplentes]")).toHaveCount(1)
    await expect(page.getByText("Fixture Suplente Alfa 1", { exact: true })).toBeVisible()
    await expect(page.getByText("Fixture Suplente Alfa 2", { exact: true })).toBeVisible()
  })

  for (const width of [320, 390, 1440]) {
    test("consulta estadual não cria overflow em " + width + "px", async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto("/uf/sp/senado", { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("heading", { name: "São Paulo", exact: true })).toBeVisible()
      await expect(page.getByText("Duas vagas em disputa, dois votos por eleitor e sem segundo turno.")).toBeVisible()
      await expect(page.getByRole("link", { name: /Fixture Senadora Alfa.*Ver/ })).toBeVisible()
      await expect(page.getByText("Fixture Suplente Alfa 1", { exact: true })).toBeVisible()
      await expect(page.getByText("Fixture Suplente Alfa 2", { exact: true })).toBeVisible()
      await expect(page.locator("#pesquisas")).toContainText("Dois votos por eleitor. Sem segundo turno.")
      if (width === 390) {
        await page.getByRole("button", { name: /Adicionar Fixture Senadora Alfa/ }).click()
        await page.getByRole("button", { name: /Adicionar Fixture Senador Beta/ }).click()
        await expect(page.getByText("2\/4 selecionados")).toBeVisible()
        await page.getByRole("button", { name: "Ver comparação" }).click()
        await expect(page.getByRole("button", { name: "Copiar link para compartilhar" })).toBeVisible()
        await expect(page.getByRole("region", { name: "Tabela de comparação. Role na horizontal para ver todas as colunas." })).toBeVisible()
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (width <= 390) {
        const accessibility = await new AxeBuilder({ page }).analyze()
        expect(accessibility.violations).toEqual([])
      }
      await page.screenshot({ path: testInfo.outputPath(`senado-sp-${width}.png`), fullPage: true })
    })
  }

  test("flag desligada não publica as rotas do Senado", async ({ request }) => {
    const hub = await request.get("http://127.0.0.1:3113/senado")
    expect(hub.status()).toBe(404)
    const hubBody = await hub.text()
    expect(hubBody).not.toContain("Por estado")
    expect(hubBody).not.toContain("Fixture Senadora Alfa")

    const state = await request.get("http://127.0.0.1:3113/uf/sp/senado")
    expect(state.status()).toBe(404)
    const stateBody = await state.text()
    expect(stateBody).not.toContain("Duas vagas em disputa")
    expect(stateBody).not.toContain("Fixture Senador Beta")
  })

  test("flag ON/OFF também governa sitemap, busca, slugs e superfícies existentes", async ({ request }) => {
    const onSitemap = await (await request.get("http://127.0.0.1:3112/sitemap.xml")).text()
    const offSitemap = await (await request.get("http://127.0.0.1:3113/sitemap.xml")).text()
    expect(onSitemap).toContain("/senado")
    expect(offSitemap).not.toContain("/senado")

    const onSlugs = await (await request.get("http://127.0.0.1:3112/api/candidato-slugs")).json()
    const offSlugs = await (await request.get("http://127.0.0.1:3113/api/candidato-slugs")).json()
    expect(onSlugs.slugs).toContain("fixture-senado-alfa")
    expect(offSlugs.slugs).not.toContain("fixture-senado-alfa")

    const onSearch = await (await request.get("http://127.0.0.1:3112/api/search-index")).json()
    const offSearch = await (await request.get("http://127.0.0.1:3113/api/search-index")).json()
    expect(onSearch.data.some((item: { href: string }) => item.href.endsWith("fixture-senado-alfa"))).toBe(true)
    expect(offSearch.data.some((item: { href: string }) => item.href.endsWith("fixture-senado-alfa"))).toBe(false)

    // A entrada do Senado é /parlamentares; nenhuma home linka /senado direto.
    const onHome = await (await request.get("http://127.0.0.1:3112/")).text()
    const offHome = await (await request.get("http://127.0.0.1:3113/")).text()
    expect(onHome).toContain('href="/parlamentares"')
    expect(offHome).toContain('href="/parlamentares"')
    expect(onHome).not.toContain('href="/senado"')
    expect(offHome).not.toContain('href="/senado"')

    const stateSenadoHref = /href="\/uf\/[a-z]{2}\/senado"/
    const onParlamentares = await request.get("http://127.0.0.1:3112/parlamentares")
    const offParlamentares = await request.get("http://127.0.0.1:3113/parlamentares")
    expect(onParlamentares.status()).toBe(200)
    expect(offParlamentares.status()).toBe(200)
    const onParlamentaresBody = await onParlamentares.text()
    const offParlamentaresBody = await offParlamentares.text()
    expect(onParlamentaresBody).toMatch(stateSenadoHref)
    expect(onParlamentaresBody).toContain('href="/uf/sp/senado"')
    expect(offParlamentaresBody).not.toMatch(stateSenadoHref)
    expect(offParlamentaresBody).toContain("A cobertura de senadores está em preparação.")
    expect(offParlamentaresBody).toContain('href="/parlamentares/deputados"')

    expect((await request.get("http://127.0.0.1:3113/senado")).status()).toBe(404)
    expect((await request.get("http://127.0.0.1:3113/uf/sp/senado")).status()).toBe(404)
  })

  test("UF sem candidaturas mostra vazio sem sugerir ausência eleitoral", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/uf/ac/senado", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Acre", exact: true })).toBeVisible()
    await expect(page.getByText("Nenhuma candidatura publicada nesta cobertura", { exact: true })).toBeVisible()
    await expect(page.getByText("Isso não indica ausência de candidaturas na eleição.", { exact: true })).toBeVisible()
  })

  test("falha do reader de suplentes fica explícita", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/uf/rj/senado", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Rio de Janeiro", exact: true })).toBeVisible()
    await expect(page.getByText("Fixture Senador Erro", { exact: true })).toBeVisible()
    await expect(page.getByText("Não foi possível consultar os suplentes nesta tentativa.", { exact: true })).toBeVisible()
  })
})
