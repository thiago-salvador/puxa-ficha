import { expect, test } from "playwright/test"

const SUMMARY_START =
  "Oito processos trabalhistas publicados entre abril de 2024 e agosto de 2026"

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

for (const viewport of VIEWPORTS) {
  test(`agrupa processos repetidos na Visão Geral e na aba Justiça, ${viewport.name}`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => consoleErrors.push(error.message))

    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const profileResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/candidato-profile/alexandre-kalil"),
    )
    await page.goto("/candidato/alexandre-kalil")
    await expect(page.locator('[data-pf-overview-raw="18"]')).toBeVisible()
    // No viewport mobile, os detalhes abaixo da dobra carregam no primeiro scroll.
    await page.evaluate(() => window.scrollTo(0, 300))
    expect((await profileResponsePromise).ok()).toBe(true)

    const overviewGroup = page
      .locator('[data-pf-process-group-size="8"]')
      .filter({ hasText: SUMMARY_START })
    await expect(overviewGroup).toBeVisible({ timeout: 15_000 })
    await expect(overviewGroup).toHaveCount(1)
    await expect(overviewGroup).toContainText("8 processos relacionados")
    expect(countOccurrences(await overviewGroup.innerText(), SUMMARY_START)).toBe(1)
    await overviewGroup.screenshot({
      path: testInfo.outputPath(`processos-overview-${viewport.name}.png`),
    })

    await page.getByRole("tab", { name: /Justiça/ }).click()
    await expect(page.getByRole("tab", { name: /Justiça/ })).toHaveAttribute("aria-selected", "true")

    const justiceGroup = page
      .locator('[data-pf-process-group-size="8"]')
      .filter({ hasText: SUMMARY_START })
    await expect(justiceGroup).toBeVisible({ timeout: 15_000 })
    await expect(justiceGroup).toHaveCount(1)
    expect(countOccurrences(await justiceGroup.innerText(), SUMMARY_START)).toBe(1)
    await expect(justiceGroup.locator("[data-pf-processo-link]")).toHaveCount(8)
    await justiceGroup.screenshot({
      path: testInfo.outputPath(`processos-justica-${viewport.name}.png`),
    })

    expect(consoleErrors).toEqual([])
  })
}
