import { execFileSync } from "node:child_process"
import path from "node:path"
import { expect, test } from "playwright/test"

const FIXTURE_RENDERER = path.join(process.cwd(), "tests/helpers/render-candidato-alerta-patrimonial.tsx")

function buildFixture() {
  return execFileSync(process.execPath, ["--import", "tsx", FIXTURE_RENDERER], {
    cwd: process.cwd(),
    encoding: "utf8",
  })
}

test("alerta patrimonial fica legível na ficha", async ({ page }, testInfo) => {
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate((markup) => {
    document.body.innerHTML = markup
  }, buildFixture())

  const alertas = page.locator('[data-pf-patrimonio-evolucao-alerta="1500000"]')
  await expect(alertas).toHaveCount(2)
  for (const alerta of await alertas.all()) {
    await expect(alerta).toBeVisible()
    await expect(alerta).toContainText("Evolução patrimonial acima de R$ 1 milhão")
    await expect(alerta).toContainText("entre 2022 e 2026")
  }
  const estilo = await alertas.first().evaluate((element) => {
    const computed = window.getComputedStyle(element)
    return {
      borderStyle: computed.borderTopStyle,
      borderRadius: computed.borderRadius,
      fontFamily: computed.fontFamily,
    }
  })
  expect(estilo.borderStyle).toBe("solid")
  expect(estilo.borderRadius).not.toBe("0px")
  expect(estilo.fontFamily.toLowerCase()).toContain("inter")

  await page.screenshot({
    path: testInfo.outputPath("candidato-alerta-patrimonial.png"),
    fullPage: true,
  })
})
