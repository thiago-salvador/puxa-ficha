import { expect, test } from "playwright/test"

const FICHA_SLUG =
  (process.env.PF_EDITORIAL_FICHA_SLUG ?? "lula").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "lula"

test.describe("Copy pública normalizada", () => {
  test("ficha pública exibe headings corrigidos e VotingDots na aba de votos", async ({ page }) => {
    await page.goto(`/candidato/${FICHA_SLUG}`)
    await page.waitForLoadState("networkidle")

    await expect(page.getByText("Carreira Política", { exact: true })).toBeVisible()

    await page.getByRole("tab", { name: /^Votos(?:\s|\(|$)/i }).click()
    await expect(page.getByText(/^Votações Chave(?:\s+\(\d+\))?$/i)).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: /Como votou em temas importantes/i })).toBeVisible()

    const votingDotsTitle = page.getByText(/Padrão de voto/i)
    if (await votingDotsTitle.count()) {
      await expect(votingDotsTitle).toBeVisible()
    } else {
      await expect(page.getByText(/Votações ainda não coletadas/i)).toBeVisible()
    }
  })

  test("comparador mostra copy corrigida após selecionar dois candidatos", async ({ page }) => {
    await page.goto("/comparar")
    await page.waitForLoadState("networkidle")

    const addButtons = page.getByRole("button", { name: /adicionar.+comparação/i })
    await expect(addButtons.nth(0)).toBeVisible()
    await addButtons.nth(0).click()
    await addButtons.nth(1).click()

    await expect(page.getByRole("heading", { level: 2, name: /Comparação/i })).toBeVisible()
    await expect(page.getByText(/Prévia em redes: cartão com os dois primeiros/i)).toBeVisible()
  })

  test("quiz perguntas exibe o retorno com acentuação corrigida", async ({ page }) => {
    await page.goto("/quiz/perguntas")
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("link", { name: "Voltar à introdução" })).toBeVisible()
  })
})
