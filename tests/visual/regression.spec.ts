import { expect, test } from "playwright/test"

const ROUTES = [
  { name: "home", path: "/" },
  { name: "candidate-lula", path: "/candidato/lula" },
  { name: "compare", path: "/comparar" },
  { name: "quiz", path: "/quiz" },
]

test.describe("Visual regression baselines", () => {
  for (const route of ROUTES) {
    test(`${route.name} viewport remains stable`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" })
      await page.waitForLoadState("networkidle").catch(() => undefined)
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
            caret-color: transparent !important;
          }
        `,
      })

      const surface = page.locator("main")
      await expect(surface).toHaveScreenshot(`${route.name}.png`, {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
        mask: [
          page.locator("header"),
          page.locator("img[src^='https://']"),
          page.locator("img[src^='/_next/image']"),
          page.locator("[data-nextjs-toast]"),
          page.locator("[data-vercel-analytics]"),
        ],
      })
    })
  }
})
