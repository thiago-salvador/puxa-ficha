import { expect, test } from "playwright/test"

for (const width of [360, 768, 1024, 1440]) {
  test(`hero responsivo e captura integral ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/", { waitUntil: "networkidle" })
    const hero = page.locator("main picture img").first()
    await expect(hero).toBeVisible()
    const image = await hero.evaluate(async (node: HTMLImageElement) => {
      await node.decode()
      return { src: node.currentSrc, width: node.naturalWidth, height: node.naturalHeight }
    })
    expect(image.width).toBeGreaterThan(0)
    if (width <= 640) expect(image.src).toContain("/images/hero-dossie-mobile.webp")
    else {
      expect(image.src).toContain("/_next/image?")
      expect(new URL(image.src).searchParams.get("w")).toBe(String(width <= 828 ? 828 : width <= 1200 ? 1200 : 1920))
    }
    const imageResponse = await page.request.get(image.src)
    expect(imageResponse.ok()).toBe(true)
    const imageBytes = (await imageResponse.body()).byteLength
    if (width === 768) expect(imageBytes).toBeLessThan(166_292)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await testInfo.attach("selected-image.json", { body: JSON.stringify({ viewport: width, ...image, imageBytes }), contentType: "application/json" })
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: false })

    await page.goto("/candidato/lula", { waitUntil: "networkidle" })
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`candidate-${width}.png`), fullPage: false })
  })
}
