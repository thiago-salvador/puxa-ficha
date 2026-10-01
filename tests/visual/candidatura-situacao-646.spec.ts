import { test, expect } from "playwright/test"

const cases = [
  { sq: "260002549466", nome: "Ricardo Marques", conflito: true },
  { sq: "180002544457", nome: "Major Paulo Roberto", conflito: false },
  { sq: "180002544459", nome: "Toinho Dufrango", conflito: false },
]

for (const candidate of cases) {
  test(`${candidate.nome}: julgamento, concorrência e recurso separados após hidratação`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(`/candidato/fixture-646-${candidate.sq}`)
    await expect(page.getByRole("heading", { level: 1 })).toContainText(candidate.nome)
    const data = page.locator("[data-pf-candidate-general-data]")
    await expect(data).toBeVisible()
    const judgment = data.locator('[data-pf-candidate-general-field="situacao-candidatura"]')
    if (candidate.conflito) {
      await expect(judgment).toContainText("Fontes oficiais divergentes")
      await expect(judgment).toContainText("Indeferido")
      await expect(judgment).toContainText("Deferido")
      await expect(page.locator("[data-pf-candidacy-situation]")).toContainText("Fontes oficiais divergentes")
    } else {
      await expect(judgment).toContainText(/indeferido/i)
      await expect(judgment).not.toContainText("com recurso")
    }
    await expect(data.locator('[data-pf-candidate-general-field="situacao-concorrencia"]')).toContainText("Concorrendo")
    await expect(data.locator('[data-pf-candidate-general-field="recurso-tse"]')).toContainText("Desconhecido")
    await expect(data.locator('[data-pf-candidate-general-field="aptidao-tse"]')).toContainText("não")
    await data.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`${candidate.sq}.png`), fullPage: true })
    expect(errors).toEqual([])
  })
}
