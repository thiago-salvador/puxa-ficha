import { test, expect } from "playwright/test"
import AxeBuilder from "@axe-core/playwright"

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
const ONE_HOUR_BEHIND = new Set(["AM", "MT", "MS", "RO", "RR"])

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-29T15:00:00-03:00") })
})

test("guia acompanha as 27 UFs e mantém destinos oficiais", async ({ page }) => {
  test.setTimeout(120_000)
  for (const uf of UFS) {
    await page.goto(`/colinha?uf=${uf}#antes-de-votar`)
    const block = page.locator("#antes-de-votar")
    await expect(block).toBeVisible()
    const start = uf === "AC" ? "6h" : ONE_HOUR_BEHIND.has(uf) ? "7h" : "8h"
    const end = uf === "AC" ? "15h" : ONE_HOUR_BEHIND.has(uf) ? "16h" : "17h"
    await expect(block).toContainText(new RegExp(`${start}.*${end}`))
    await expect(block.locator(`a[href="https://www.tre-${uf.toLowerCase()}.jus.br/"]`)).toBeVisible()
    for (const link of await block.locator('a[href^="https:"]').all()) {
      const url = new URL((await link.getAttribute("href"))!)
      expect(url.hostname).toMatch(/^(?:www\.)?(?:tse|tre-[a-z]{2})\.jus\.br$/)
      await expect(link).toHaveAttribute("rel", /noreferrer/)
      await expect(link).toHaveAttribute("referrerpolicy", "no-referrer")
      if (await link.getAttribute("target") === "_blank") {
        await expect(link).toHaveAccessibleName(/nova aba/i)
      }
    }
  }
})

test("sem UF e mudança de UF no builder", async ({ page }) => {
  await page.goto("/colinha#antes-de-votar")
  const block = page.locator("#antes-de-votar")
  await expect(block).toContainText(/Brasília/)
  await expect(block).toContainText(/escolha.*UF|selecione.*UF|escolha.*estado/i)
  await page.getByRole("button", { name: "AC", exact: true }).click()
  await expect(block).toContainText(/6h.*15h/)
  await expect(block.locator('a[href="https://www.tre-ac.jus.br/"]')).toBeVisible()
})

test("hub da UF aponta para o guia com a UF e a âncora", async ({ page }) => {
  await page.goto("/uf/sp")
  const link = page.getByRole("link", { name: "Antes de votar", exact: true })
  await expect(link).toHaveAttribute("href", "/colinha?uf=SP#antes-de-votar")
  await link.click()
  await expect(page.locator("#antes-de-votar")).toContainText(/horário local de SP/)
})

for (const uf of ["SP", "AM", "AC"]) {
  for (const width of [375, 1440]) {
    test(`guia ${uf} em ${width}px com teclado e acessibilidade`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 })
      await page.goto(`/colinha?uf=${uf}#antes-de-votar`)
      const block = page.locator("#antes-de-votar")
      await expect(block).toBeVisible()
      await block.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const links = block.locator("a")
      await links.first().focus()
      for (let index = 0; index < await links.count(); index++) {
        await expect(links.nth(index)).toBeFocused()
        await page.keyboard.press("Tab")
      }
      const result = await new AxeBuilder({ page }).include("#antes-de-votar").analyze()
      expect(result.violations).toEqual([])
      await page.evaluate(() => window.scrollTo(0, 0))
      await testInfo.attach(`guia-${uf}-${width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: "image/png",
      })
    })
  }
}

test("prazo vence com a página aberta", async ({ page }) => {
  await page.goto("/colinha?uf=AC#antes-de-votar")
  const block = page.locator("#antes-de-votar")
  await expect(block).toContainText(/6h.*15h/)
  await page.clock.setSystemTime(new Date("2026-10-04T16:59:59-03:00"))
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await page.clock.fastForward(2_000)
  await expect(block).toContainText(/confira no TSE/i)
  await expect(block).not.toContainText(/6h.*15h/)
})

test("links do guia não enviam a URL nem as escolhas no Referer", async ({ page, context }) => {
  const secret = "990000000001"
  const outgoing: { url: string; referer: string; body: string }[] = []
  context.on("request", request => {
    const url = new URL(request.url())
    if (request.isNavigationRequest() && url.pathname === "/colinha") return
    outgoing.push({ url: request.url(), referer: request.headers().referer ?? "", body: request.postData() ?? "" })
  })
  await page.goto(`/colinha?uf=AC&df=${secret}#antes-de-votar`)
  const block = page.locator("#antes-de-votar")
  await expect(block).toBeVisible()
  await context.route(/https:\/\/(?:www\.)?(?:tse|tre-[a-z]{2})\.jus\.br\//, route => route.fulfill({ status: 200, body: "Destino oficial" }))
  for (const link of await block.locator('a[target="_blank"]').all()) {
    const popupReady = context.waitForEvent("page")
    await link.click()
    const popup = await popupReady
    await popup.waitForLoadState("domcontentloaded")
    await popup.close()
  }
  expect(outgoing.length).toBeGreaterThan(0)
  await test.info().attach("rede-guia", { body: JSON.stringify(outgoing, null, 2), contentType: "application/json" })
  for (const request of outgoing) {
    expect(request.url).not.toContain(secret)
    expect(request.referer).not.toContain("/colinha")
    if (!request.url.includes("/api/colinha/candidatos")) expect(request.body).not.toContain(secret)
    if (new URL(request.url).hostname.endsWith(".jus.br")) expect(request.url).not.toContain("uf=")
  }
})
