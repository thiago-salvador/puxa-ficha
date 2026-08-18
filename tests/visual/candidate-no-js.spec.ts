import { expect, test } from "playwright/test"

test("candidate keeps identity, sources, legal notice and methodology without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  await page.goto("/candidato/lula", { waitUntil: "domcontentloaded" })

  await expect(page.locator("[data-pf-hero-name]")).toContainText("Lula")
  await expect(page.locator("[data-pf-profile-server-disclosure]")).toBeVisible()
  await expect(page.locator("[data-pf-profile-legal-disclaimer]")).toContainText(
    "Não é recomendação de voto",
  )
  await expect(page.locator("[data-pf-profile-source-footer]")).toContainText("Fontes:")
  await expect(
    page.locator('[data-pf-profile-server-disclosure] a[href="/metodologia"]'),
  ).toBeVisible()

  await context.close()
})
