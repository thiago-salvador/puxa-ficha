import { expect, test } from "playwright/test"

test("Mesa preserva recorte, export e proveniência em tela", async ({ page, request }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 })
  const filters = "cargo=Governador&uf=SP"
  const response = await page.goto(`/imprensa/mesa?${filters}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole("heading", { name: "Mesa de apuração" })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
  const headerBox = await page.locator("header").first().boundingBox()
  const noticeBox = await page.getByText("Confira os dados na fonte original antes de publicar.", { exact: true }).first().boundingBox()
  expect(headerBox && noticeBox && noticeBox.y >= headerBox.y + headerBox.height).toBe(true)
  await expect(page.getByLabel("Cargo", { exact: true })).toHaveValue("Governador")
  await expect(page.getByLabel("UF", { exact: true })).toHaveValue("SP")
  await page.screenshot({ path: testInfo.outputPath("imprensa-primeira-tela.png") })
  await page.getByLabel("Cargo", { exact: true }).focus()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel("UF", { exact: true })).toBeFocused()

  const rows = page.locator("tbody tr")
  const count = await rows.count()
  expect(count).toBeGreaterThan(0)
  const jsonResponse = await request.get(`/api/imprensa/export?format=json&${filters}`)
  expect(jsonResponse.status()).toBe(200)
  expect(jsonResponse.headers()["x-robots-tag"]).toContain("noindex")
  const json = await jsonResponse.json()
  expect(json.filters).toEqual({ cargo: "Governador", uf: "SP" })
  expect(json.aviso).toBe("Confira os dados na fonte original antes de publicar.")
  expect(json.rows).toHaveLength(count)
  expect(json.rows[0].fichaUrl).toMatch(/^\/candidato\//)
  expect(json.rows[0].sites.ocorrencias).toBeUndefined()
  expect(json.rows[0].processos.ocorrencias).toBeUndefined()
  expect(json.rows[0].chapa.estado).toMatch(/^(publicado|sem_dado)$/)
  await page.getByRole("searchbox", { name: "Buscar por nome" }).fill(json.rows[0].nome)
  await expect(page.locator("tbody tr")).toHaveCount(1)
  await page.getByRole("searchbox", { name: "Buscar por nome" }).fill("")
  const onlyFilters = page.getByRole("group", { name: "Mostrar só" })
  await onlyFilters.getByRole("button").first().click()
  expect(await page.locator("tbody tr").count()).toBeLessThanOrEqual(count)
  await onlyFilters.getByRole("button").first().click()
  await expect(page.locator("tbody tr")).toHaveCount(count)
  await page.getByLabel("Ordenar").selectOption("desc")
  await expect(page.getByLabel("Ordenar")).toHaveValue("desc")

  const csvResponse = await request.get(`/api/imprensa/export?format=csv&${filters}`)
  expect(csvResponse.status()).toBe(200)
  expect(csvResponse.headers()["content-type"]).toContain("text/csv")
  expect(csvResponse.headers()["content-disposition"]).toContain("attachment")
  expect((await csvResponse.body()).at(0)).toBe(0xef)
  expect(await csvResponse.text()).toContain("chapa_fonte_sha256")
  const longResponse = await request.get(`/api/imprensa/export/sites?format=json&${filters}`)
  expect(longResponse.status()).toBe(200)
  const long = await longResponse.json()
  expect(long.rows.every((row: { slug: string }) => json.rows.some((candidate: { slug: string }) => candidate.slug === row.slug))).toBe(true)

  const fichaLink = testInfo.project.name === "mobile"
    ? page.locator('[class*="mobileCard"] a[href^="/candidato/"]').first()
    : rows.first().locator('a[href^="/candidato/"]').first()
  await expect(fichaLink).toHaveAttribute("href", /\/candidato\//)
  await expect(page.getByRole("link", { name: "Baixar CSV" })).toHaveAttribute("href", /cargo=Governador.*uf=SP/)
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("link", { name: "Baixar CSV" }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/imprensa.*\.csv$/)
  await page.getByLabel("UF", { exact: true }).selectOption("")
  await page.getByRole("button", { name: /filtrar|aplicar/i }).click()
  await expect(page).toHaveURL(/cargo=Governador/)
  await expect(page.getByLabel("UF", { exact: true })).toHaveValue("")
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  expect(overflow).toBe(false)
  if (testInfo.project.name === "mobile") await expect(page.locator('[class*="mobileCard"]').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("imprensa.png"), fullPage: true })
})

test("recorte nacional mostra evidência e ficha sem exigir UF", async ({ page, request }) => {
  const response = await page.goto("/imprensa/mesa?cargo=Presidente")
  expect(response?.status()).toBe(200)
  await expect(page.getByLabel("Cargo", { exact: true })).toHaveValue("Presidente")
  await expect(page.getByLabel("UF", { exact: true })).toHaveValue("")
  const exported = await (await request.get("/api/imprensa/export?format=json&cargo=Presidente")).json()
  expect(exported.rows.length).toBeGreaterThan(0)
  expect(exported.rows.some((row: { sites: { estado: string }; chapa: { estado: string } }) => row.sites.estado === "publicado" || row.chapa.estado === "publicado")).toBe(true)
  await expect(page.locator("tbody tr")).toHaveCount(exported.rows.length)
  await expect(page.locator('a[href^="/candidato/"]').first()).toHaveAttribute("href", /\/candidato\//)
})

test("páginas de mudanças e frescor mantêm escopo, navegação e layout", async ({ page }, testInfo) => {
  for (const [path, title, filename] of [
    ["/imprensa/atualizacoes", "O que mudou", "imprensa-atualizacoes.png"],
    ["/imprensa/frescor", "Como coletamos", "imprensa-frescor.png"],
  ]) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    await expect(page.getByText("Confira os dados na fonte original antes de publicar.").first()).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Seções da imprensa" }).getByRole("link", { name: "Mesa", exact: true })).toHaveAttribute("href", /^\/imprensa\/mesa/)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    expect(overflow).toBe(false)
    await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true })
  }
})

test("formulário de alertas usa o recorte da Mesa quando a flag está ativa", async ({ page }, testInfo) => {
  test.skip(process.env.NEXT_PUBLIC_ALERTS_EMAIL_ENABLED !== "true", "Alertas por email desativados neste preview")
  await page.goto("/imprensa/mesa?cargo=Governador&uf=SP")
  const alerts = page.getByRole("region", { name: "Alertas por cargo e UF" })
  await expect(alerts.getByRole("combobox", { name: "Cargo" })).toHaveValue("Governador")
  await expect(alerts.getByRole("combobox", { name: "UF" })).toHaveValue("SP")
  await expect(alerts.getByRole("textbox", { name: "Email" })).toBeVisible()
  await expect(alerts.getByRole("button", { name: "Receber atualizações deste recorte" })).toBeEnabled()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  expect(overflow).toBe(false)
  await alerts.screenshot({ path: testInfo.outputPath("imprensa-alertas.png") })
  await page.goto("/imprensa/mesa?cargo=Governador&uf=XX")
  await expect(page.getByRole("region", { name: "Alertas por cargo e UF" }).getByRole("combobox", { name: "UF" })).toHaveValue("")
})

test("Sala indexável apresenta os blocos, as tarefas do herói, exportação e aviso", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 })
  const response = await page.goto("/imprensa")
  expect(response?.status()).toBe(200)
  await expect(page.getByRole("heading", { name: "Sala de imprensa" })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/imprensa$/)
  const robots = page.locator('meta[name="robots"]')
  if (await robots.count()) await expect(robots).not.toHaveAttribute("content", /noindex/)
  const headerBox = await page.locator("header").first().boundingBox()
  const noticeBox = await page.getByText("Confira os dados na fonte original antes de publicar.", { exact: true }).first().boundingBox()
  expect(headerBox && noticeBox && noticeBox.y >= headerBox.y + headerBox.height).toBe(true)
  for (const id of ["numeros", "estados", "atualizacoes", "nesta-sala", "confianca", "ferramentas", "kit", "quem-faz"]) {
    await expect(page.locator(`#${id}`)).toBeAttached()
  }
  await expect(page.getByText("Confira os dados na fonte original antes de publicar.").first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Buscar candidato pelo nome/ })).toBeVisible()
  await expect(page.getByRole("link", { name: "Escolher meu estado" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Abrir a Mesa" })).toBeVisible()
  await expect(page.locator('#ferramentas a[href="/api/imprensa/export?format=csv"]')).toBeVisible()
  await expect(page.getByRole("link", { name: /atualizações/i }).first()).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  expect(overflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath("imprensa-sala.png"), fullPage: true })
})

test("pacote do estado, Presidência e Kit abrem com a barra da seção e sem rolagem lateral", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 375, height: 812 })
  for (const [path, filename] of [
    ["/imprensa/uf/sp", "imprensa-uf.png"],
    ["/imprensa/presidencia", "imprensa-presidencia.png"],
    ["/imprensa/kit", "imprensa-kit.png"],
  ]) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Seções da imprensa" })).toBeVisible()
    await expect(page.getByText("Confira os dados na fonte original antes de publicar.").first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    expect(overflow).toBe(false)
    await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true })
  }
})
