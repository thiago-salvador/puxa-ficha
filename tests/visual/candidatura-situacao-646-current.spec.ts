import { test, expect } from "playwright/test"
import identities from "../../docs/operations/evidence/issue-646-20261002/identidades.json"

for (const candidate of identities) {
  test(`${candidate.slug}: header, dados gerais e trajetória vigentes`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(`/candidato/fixture-646-current-${candidate.sq_candidato_2026}`)
    const expected = ["150002551911", "260002551712", "70002553751"].includes(candidate.sq_candidato_2026) ? "Renúncia" : "Indeferido"
    await expect(page.locator("[data-pf-candidacy-situation]")).toContainText(expected, { ignoreCase: true })
    const data = page.locator("[data-pf-candidate-general-data]")
    await expect(data.locator('[data-pf-candidate-general-field="situacao-candidatura"]')).toContainText(expected)
    await expect(data.locator('[data-pf-candidate-general-field="recurso-tse"]')).toContainText("Desconhecido")
    await page.screenshot({ path: testInfo.outputPath(`${candidate.slug}-geral.png`), fullPage: true })
    await page.goto(`/candidato/fixture-646-current-${candidate.sq_candidato_2026}?tab=trajetoria`)
    await expect(page.getByText(new RegExp(`Situação do registro no TSE: ${expected}`, "i")).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`${candidate.slug}.png`), fullPage: true })
    expect(errors).toEqual([])
  })
}
