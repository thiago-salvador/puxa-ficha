/**
 * Quiz "Quem me representa?" — landing, governador sem UF, fluxo SP, resultado com payload neutro.
 *
 * PF_BASE_URL=http://127.0.0.1:3000 npm run start  (outro terminal)
 * PF_BASE_URL=http://127.0.0.1:3000 npm run test:visual:quiz
 * npm run test:visual:quiz:mobile
 *
 * Se PF_BASE_URL nao tiver /quiz (ex.: producao antes do deploy), a suite inteira e ignorada.
 */

import { test, expect } from "playwright/test"

/** 15 respostas neutras + importancia falsa, v3 — regenere com encodeQuizRespostasPayload(..., 3). */
const QUIZ_NEUTRAL_R = "REREREREREA"

test.describe("Quiz e2e", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/quiz")
    if (!res.ok()) {
      test.skip(
        true,
        `/quiz indisponivel neste PF_BASE_URL (HTTP ${res.status()}). Suba npm run start ou use deploy com a rota.`
      )
    }
  })

  test.describe("landing", () => {
    test("mostra titulo e botoes de cargo", async ({ page }) => {
      await page.goto("/quiz")
      await page.waitForLoadState("networkidle")

      await expect(page.getByRole("heading", { name: /quem me representa/i })).toBeVisible()
      await expect(page.getByRole("button", { name: /^presidente$/i })).toBeVisible()
      await expect(page.getByRole("button", { name: /Começar/i })).toBeVisible()
    })

    test("Presidente leva para perguntas", async ({ page }) => {
      await page.goto("/quiz")
      await page.waitForLoadState("networkidle")

      await page.getByRole("button", { name: /^presidente$/i }).click()
      await expect(page).toHaveURL(/\/quiz\/perguntas\?cargo=Presidente/i)
      await expect(page.getByText(/pergunta 1 de/i)).toBeVisible()
    })
  })

  test.describe("governador", () => {
    test("sem uf na URL mostra estado obrigatorio", async ({ page }) => {
      await page.goto("/quiz/perguntas?cargo=Governador")
      await page.waitForLoadState("networkidle")

      await expect(page.getByRole("heading", { name: /estado obrigatório/i })).toBeVisible()
      await expect(page.getByRole("link", { name: /escolher cargo e estado/i })).toBeVisible()
    })

    test("com uf=SP mostra progresso e contexto", async ({ page }) => {
      await page.goto("/quiz/perguntas?cargo=Governador&uf=SP")
      await page.waitForLoadState("networkidle")

      await expect(page.getByText("Governador — SP", { exact: true })).toBeVisible()
      await expect(page.getByText(/pergunta 1 de/i)).toBeVisible()
    })
  })

  test.describe("resultado", () => {
    test("payload neutro mostra ranking (presidente)", async ({ page }) => {
      await page.goto(`/quiz/resultado?v=3&r=${encodeURIComponent(QUIZ_NEUTRAL_R)}`)
      await page.waitForLoadState("networkidle")

      await expect(page.getByRole("heading", { name: /seu alinhamento/i })).toBeVisible()
      await expect(page.getByRole("heading", { name: /candidatos mais alinhados/i })).toBeVisible()
    })

    test("payload neutro com governador SP", async ({ page }) => {
      const q = new URLSearchParams({
        v: "3",
        r: QUIZ_NEUTRAL_R,
        cargo: "Governador",
        uf: "SP",
      })
      await page.goto(`/quiz/resultado?${q.toString()}`)
      await page.waitForLoadState("networkidle")

      await expect(page.getByRole("heading", { name: /seu alinhamento/i })).toBeVisible()
    })
  })
})
