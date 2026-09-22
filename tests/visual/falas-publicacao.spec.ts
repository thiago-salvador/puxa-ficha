import { expect, test } from "playwright/test"
import catalog from "../../scripts/data/falas-candidatos.json"

// Opt-in: only the newly published IDs need readback; the full catalog stays local.
const ids = (process.env.PF_FALAS_QUOTE_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean)
const quotes = catalog.quotes.filter((quote) => ids.includes(quote.id))
if (ids.some((id) => !quotes.some((quote) => quote.id === id))) throw new Error("ID de fala ausente do catálogo local")

test.describe("publicação de falas verificadas", () => {
  test.skip(ids.length === 0, "Informe PF_FALAS_QUOTE_IDS para conferir o lote publicado")
  test.use({ reducedMotion: "reduce" })

  test("o domínio serve o SHA de produção esperado", async ({ request }) => {
    expect(process.env.PF_EXPECTED_DEPLOY_SHA).toMatch(/^[a-f0-9]{40}$/)
    const response = await request.get("/api/deployment-info", { headers: { "cache-control": "no-cache" } })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true, environment: "production", commitRef: "main", commitSha: process.env.PF_EXPECTED_DEPLOY_SHA,
    })
  })

  for (const quote of quotes) {
    test(`${quote.candidate_slug}: ${quote.id.slice(0, 12)}`, async ({ page }, testInfo) => {
      test.setTimeout(60_000)
      await page.goto(`/candidato/${quote.candidate_slug}`, { waitUntil: "domcontentloaded" })
      const card = page.locator("[data-pf-debates-card]")
      await expect(card).toBeVisible({ timeout: 30_000 })
      // Quote IDs and navigation are public DOM attributes, not bundle inspection.
      const seen = new Set<string>()
      for (let i = 0; i < 50; i++) {
        const current = await card.getAttribute("data-pf-debate-quote-id")
        if (current === quote.id) break
        if (!current || seen.has(current)) break
        seen.add(current)
        const next = card.getByRole("button", { name: "Próxima citação" })
        if (!(await next.isVisible())) break
        await next.click()
        await expect(card).not.toHaveAttribute("data-pf-debate-quote-id", current)
      }
      await expect(card).toHaveAttribute("data-pf-debate-quote-id", quote.id)
      await expect(card.locator("blockquote")).toContainText(quote.quote_text)
      const date = (value: string) => value.slice(0, 10).split("-").reverse().join("/")
      if (quote.occurred_on) await expect(card).toContainText(date(quote.occurred_on))
      else if ("occurred_between" in quote && quote.occurred_between) {
        await expect(card).toContainText(date(quote.occurred_between.from))
        await expect(card).toContainText(date(quote.occurred_between.to))
      }
      await expect(card.locator(`a[href="${quote.article_url}"]`).first()).toBeVisible()
      await testInfo.attach(`${quote.candidate_slug}.png`, { body: await card.screenshot(), contentType: "image/png" })
    })
  }
})
