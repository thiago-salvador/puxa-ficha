import { expect, test } from "playwright/test"

const INTERNAL_TOKEN = "launch-internal-token"

test.describe("Internal route gate", () => {
  test.skip(({ browserName, isMobile }) => isMobile || browserName === "webkit", "Gate interno coberto no launch desktop; mobile visual cobre layout.")

  // O cookie interno é escopado por superfície (path /internaltest ou
  // /styleguide), então o bootstrap de uma superfície não abre a outra: cada
  // uma exige o token uma vez e só a sessão daquela superfície persiste.
  test("requires token bootstrap per surface and then keeps each browser session", async ({ page }) => {
    const denied = await page.goto("/internaltest")
    expect(denied?.status()).toBe(404)
    await expect(page.getByText("Not Found")).toBeVisible()

    await page.goto(`/internaltest?token=${INTERNAL_TOKEN}`)
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveURL(/\/internaltest$/)
    await expect(page.getByRole("heading", { name: /Internal test/i })).toBeVisible()

    const crossSurface = await page.goto("/styleguide")
    expect(crossSurface?.status()).toBe(404)
    await expect(page.getByText("Not Found")).toBeVisible()

    await page.goto(`/styleguide?token=${INTERNAL_TOKEN}`)
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/styleguide$/)
    await expect(page.getByRole("heading", { name: /Styleguide/i })).toBeVisible()

    await page.goto("/styleguide")
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/styleguide$/)
    await expect(page.getByRole("heading", { name: /Styleguide/i })).toBeVisible()

    await page.goto("/internaltest")
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/internaltest$/)
    await expect(page.getByRole("heading", { name: /Internal test/i })).toBeVisible()
  })
})
