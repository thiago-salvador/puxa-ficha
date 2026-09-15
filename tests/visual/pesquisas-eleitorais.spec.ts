import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, test, type Locator, type Page } from "playwright/test"

type CatalogPoll = {
  state: string
  source_status: string
  instituto?: { value?: string }
  geography?: { code?: string }
  fieldwork?: { end?: { value?: string } }
  registration?: { code?: { value?: string } }
  cenarios?: Array<{
    turn: number
    comparability_key?: string
    resultados?: Array<{ raw_label?: string; candidate_slug?: string; value_percent?: number }>
  }>
}

const presidentialCatalog = (JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/pesquisas-presidencia-2026.json"), "utf8")) as { pesquisas: CatalogPoll[] }).pesquisas
const governorCatalog = (JSON.parse(readFileSync(resolve(process.cwd(), "scripts/data/pesquisas-governadores-2026.json"), "utf8")) as { datasets: Array<{ pesquisas: CatalogPoll[] }> }).datasets.flatMap(dataset => dataset.pesquisas)
const publishedPoderData = presidentialCatalog
  .filter(poll => poll.state === "publicado" && poll.source_status === "aprovado" && poll.instituto?.value === "PoderData")
  .filter(poll => poll.fieldwork?.end?.value && poll.registration?.code?.value)
  .filter(poll => poll.cenarios?.some(scenario => scenario.turn === 1 && /^estimulad[ao]$/.test(scenario.comparability_key?.split("|")[4] ?? "")))
  .map(poll => ({ end: poll.fieldwork!.end!.value!, registration: poll.registration!.code!.value! }))
  .sort((left, right) => left.end.localeCompare(right.end))
const latestPublishedPa = governorCatalog
  .filter(poll => poll.state === "publicado" && poll.source_status === "aprovado" && poll.geography?.code === "PA")
  .filter(poll => poll.cenarios?.some(scenario => scenario.turn === 1 && /^estimulad[ao]$/.test(scenario.comparability_key?.split("|")[4] ?? "")))
  .filter(poll => poll.fieldwork?.end?.value && poll.registration?.code?.value)
  .sort((left, right) => left.fieldwork!.end!.value!.localeCompare(right.fieldwork!.end!.value!))
  .at(-1)
if (!latestPublishedPa) throw new Error("catálogo de governadores não contém pesquisa publicada para PA")
const latestPaFirstTurn = latestPublishedPa.cenarios?.find(scenario => scenario.turn === 1 && /^estimulad[ao]$/.test(scenario.comparability_key?.split("|")[4] ?? ""))
if (!latestPaFirstTurn) throw new Error("pesquisa PA mais recente não contém cenário de primeiro turno")

async function openPolls(page: Page, path = "/") {
  await page.goto(`${path}#pesquisas`, { waitUntil: "domcontentloaded" })
  const section = page.locator("[data-pf-polls]")
  await expect(section).toBeVisible()
  await expect(section.getByRole("heading", { name: "A evolução da disputa" })).toBeVisible()
  return section
}

async function optionValues(select: Locator) {
  return select.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))
}

async function selectSeriesWithAtLeastTwoWeeks(section: Locator) {
  const scenario = section.getByRole("combobox", { name: "Cenário", exact: true })
  for (const value of await optionValues(scenario)) {
    await scenario.selectOption(value)
    const points = section.locator('[data-pf-poll-trend] button[aria-label*="semana"]')
    if (await points.count() > 1) return true
  }
  return false
}

async function findWeekWithTitle(section: Locator, title: RegExp) {
  const scenario = section.getByRole("combobox", { name: "Cenário", exact: true })
  for (const value of await optionValues(scenario)) {
    await scenario.selectOption(value)
    const points = section.locator('[data-pf-poll-trend] button[aria-label*="semana"]')
    for (let index = 0; index < await points.count(); index += 1) {
      const close = section.getByRole("button", { name: "Fechar detalhes do ponto" })
      if (await close.isVisible().catch(() => false)) await close.click()
      await points.nth(index).click()
      const heading = section.locator("[data-pf-week-source] > p > strong")
      await expect(heading).toBeVisible()
      if (title.test((await heading.textContent()) ?? "")) return { scenario, points, heading }
    }
  }
  return null
}

async function expectNoHorizontalOverflow(page: Page, element: Locator) {
  await expect.poll(() => element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

test("catálogo público publica a primeira pesquisa e expõe o contrato da média semanal", async ({ page }) => {
  test.setTimeout(90_000)
  const section = await openPolls(page)
  await expect(section.getByRole("combobox", { name: "Turno", exact: true })).toHaveValue("1")
  await expect(section.getByRole("combobox", { name: "Instituto", exact: true })).toBeVisible()
  await expect(section.getByRole("combobox", { name: "Período", exact: true })).toBeVisible()

  await findWeekWithTitle(section, /^1 pesquisa na semana$/)
  await expect(section.locator("[data-pf-week-source]")).toContainText("1 pesquisa na semana")
  await expect(section.locator("[data-pf-week-source] [data-pf-poll-source]")).toHaveCount(1)
  await expect(section.locator("[data-pf-poll-details]")).toHaveCount(1)
  await expect(section.getByRole("link", { name: "Fonte da pesquisa" })).toHaveAttribute("href", /^https?:\/\//)

  const average = await findWeekWithTitle(section, /^Média de [2-9]\d* pesquisas$/)
  if (average) {
    await expect(section.locator("[data-pf-week-source]")).toContainText("Média simples, com o mesmo peso para cada pesquisa")
    const members = section.locator("[data-pf-week-member]")
    expect(await members.count()).toBeGreaterThanOrEqual(2)
    await expect(section.locator("[data-pf-week-source] a")).toHaveCount(await members.count())
    await members.first().locator("summary").click()
    await expect(members.first().locator("[data-pf-poll-details]")).toBeVisible()
  } else {
    await expect(section.getByText("Como calculamos a média", { exact: true })).toBeVisible()
  }
})

test("navegação mobile percorre as semanas e mantém o catálogo sem overflow", async ({ page }) => {
  test.setTimeout(60_000)
  const section = await openPolls(page)
  const hasMultipleWeeks = await selectSeriesWithAtLeastTwoWeeks(section)
  const points = section.locator('[data-pf-poll-trend] button[aria-label*="semana"]')
  const weekCount = await points.count()

  await page.setViewportSize({ width: 390, height: 844 })
  if (hasMultipleWeeks) {
    expect(weekCount).toBeGreaterThan(1)
    const mobile = section.locator("[data-pf-mobile-research]")
    await expect(mobile).toBeVisible()
    await expect(mobile).toContainText(`de ${weekCount}`)
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
  } else {
    expect(weekCount).toBe(1)
    await expect(section.locator('[data-pf-poll-trend]')).toHaveAttribute("data-single-poll", "true")
    await expect(section.locator("[data-pf-mobile-research]")).toHaveCount(0)
    await expect(section.locator("[data-pf-week-source] > p > strong")).toHaveText("1 pesquisa na semana")
  }
  await expect(section.locator("[data-pf-poll-candidate]")).not.toHaveCount(0)
  await expectNoHorizontalOverflow(page, section)
})

test("superfície estadual usa a mesma evolução sem misturar resultados presidenciais", async ({ page }) => {
  const section = await openPolls(page, "/uf/am")
  await expect(section.getByRole("combobox", { name: "Cenário", exact: true })).toBeVisible()
  await expect(section.locator("[data-pf-poll-trend]")).toBeVisible()
  await expect(section).not.toContainText("Lula")
  await expect(section).toContainText("Omar")
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page, section)
})

test("Pará expõe a nova pesquisa publicada na semana imediatamente", async ({ page }) => {
  const section = await openPolls(page, "/uf/pa")
  const source = section.locator("[data-pf-week-source]")
  const heading = source.locator(":scope > p > strong")
  await expect(heading).toHaveText(/^(1 pesquisa na semana|Média de [2-9]\d* pesquisas)$/)
  await expect(source).toContainText(formatDateForSource(latestPublishedPa.fieldwork!.end!.value!))
  await expect(source).toContainText(latestPublishedPa.instituto!.value!)
  await openTechnicalDetails(section)
  const original = section.locator("[data-pf-poll-details]").filter({ hasText: latestPublishedPa.registration!.code!.value! })
  await expect(original).toHaveCount(1)
  for (const result of latestPaFirstTurn.resultados ?? []) {
    if (!result.raw_label || result.value_percent === undefined) continue
    if (!result.candidate_slug) continue
    const rows = (await heading.textContent()) === "1 pesquisa na semana"
      ? section.locator("[data-pf-poll-candidate]")
      : original.locator("li")
    await expect(rows.filter({ hasText: result.raw_label.split(" (")[0] })).toContainText(`${result.value_percent.toLocaleString("pt-BR")}%`)
  }
  await expect(section).toContainText(latestPublishedPa.registration!.code!.value!)
})

test("catálogo presidencial navega as pesquisas PoderData publicadas e expõe cada registro", async ({ page }) => {
  test.setTimeout(90_000)
  const section = await openPolls(page)
  expect(publishedPoderData.length).toBeGreaterThanOrEqual(3)
  const institute = section.getByRole("combobox", { name: "Instituto", exact: true })
  await institute.selectOption({ label: "PoderData" })
  const scenario = section.getByRole("combobox", { name: "Cenário", exact: true })
  for (const poll of publishedPoderData) {
    let found = false
    for (const value of await optionValues(scenario)) {
      await scenario.selectOption(value)
      const close = section.getByRole("button", { name: "Fechar detalhes do ponto" })
      if (await close.isVisible()) await close.click()
      const point = section.locator(`[data-pf-poll-trend] button[aria-label*="semana ${formatDateForAria(weekMonday(poll.end))}"]`)
      if (await point.count() === 0) continue
      await point.click()
      await expect(section.getByRole("region", { name: "Pesquisa selecionada" })).toContainText("PoderData")
      await close.click()
      await openTechnicalDetails(section)
      const record = section.locator("[data-pf-poll-details]").filter({ hasText: poll.registration })
      if (await record.count() === 0) continue
      await expect(record).toBeVisible()
      await expect(record.getByRole("link", { name: "Ler pesquisa ou matéria" })).toHaveAttribute("href", /^https:\/\//)
      found = true
      break
    }
    expect(found, `registro publicado ausente do gráfico: ${poll.registration}`).toBe(true)
  }
})

async function openTechnicalDetails(section: Locator) {
  for (const member of await section.locator("[data-pf-week-member]").all()) {
    if (await member.getAttribute("open") === null) await member.locator(":scope > summary").click()
  }
  for (const summary of await section.getByText("Ficha técnica e fonte", { exact: true }).all()) {
    if (await summary.locator("..").getAttribute("open") === null) await summary.click()
  }
}

function weekMonday(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

function formatDateForAria(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number)
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
}

function formatDateForSource(isoDate: string) {
  return formatDateForAria(isoDate)
}
