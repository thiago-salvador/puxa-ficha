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

      await expect(page.getByText(/Governador,\s*SP/)).toBeVisible()
      await expect(page.getByText(/pergunta 1 de/i)).toBeVisible()
    })

    test("voltar preserva resposta, sessionStorage restaura e finalizacao limpa progresso", async ({ page }) => {
      await page.goto("/quiz/perguntas?cargo=Presidente")
      await page.waitForLoadState("networkidle")

      await page.getByRole("radio", { name: "Concordo totalmente" }).click()
      await page.getByRole("button", { name: /continuar/i }).click()
      await expect(page.getByText(/pergunta 2 de/i)).toBeVisible()

      await page.getByRole("radio", { name: "Discordo totalmente" }).click()
      await page.getByRole("button", { name: /anterior/i }).click()
      await expect(page.getByText(/pergunta 1 de/i)).toBeVisible()
      await expect(page.getByRole("radio", { name: "Concordo totalmente" })).toHaveAttribute("aria-checked", "true")

      await page.reload()
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(/pergunta 1 de/i)).toBeVisible()
      await expect(page.getByRole("radio", { name: "Concordo totalmente" })).toHaveAttribute("aria-checked", "true")

      await page.getByRole("button", { name: /continuar/i }).click()
      await expect(page.getByText(/pergunta 2 de/i)).toBeVisible()
      await expect(page.getByRole("radio", { name: "Discordo totalmente" })).toHaveAttribute("aria-checked", "true")
      await page.getByRole("button", { name: /continuar/i }).click()

      for (let step = 3; step <= 15; step += 1) {
        await expect(page.getByText(new RegExp(`pergunta ${step} de`, "i"))).toBeVisible()
        await page.getByRole("radio", { name: "Neutro ou sem opinião" }).click()
        await page.getByRole("button", { name: /continuar/i }).click()
      }

      await expect(page).toHaveURL(/\/quiz\/resultado\?/, { timeout: 15_000 })
      const remainingProgressKeys = await page.evaluate(() =>
        Object.keys(window.sessionStorage).filter((key) => key.startsWith("puxaficha.quiz.progress."))
      )
      expect(remainingProgressKeys).toEqual([])
    })
  })

  test.describe("resultado", () => {
    test("payload neutro mostra comparação em ordem alfabética (presidente)", async ({ page }) => {
      await page.goto(`/quiz/resultado?v=3&r=${encodeURIComponent(QUIZ_NEUTRAL_R)}`)
      await page.waitForLoadState("networkidle")

      await expect(page.getByRole("heading", { name: /sua comparação/i })).toBeVisible()
      await expect(page.getByRole("heading", { name: /candidatos em ordem alfabética/i })).toBeVisible()
      await expect(page.getByText(/não é recomendação de voto, pesquisa eleitoral nem ranking/i)).toBeVisible()
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

      await expect(page.getByRole("heading", { name: /sua comparação/i })).toBeVisible()
    })

    test("resultado mostra thumb de compartilhamento e candidatos clicaveis", async ({ page }) => {
      const q = new URLSearchParams({
        v: "3",
        r: QUIZ_NEUTRAL_R,
        cargo: "Governador",
        uf: "SP",
      })
      await page.goto(`/quiz/resultado?${q.toString()}`)
      await page.waitForLoadState("networkidle")

      const previewImage = page.getByAltText("Prévia visual do resultado compartilhado")
      await expect(previewImage).toBeVisible()
      await expect(previewImage).toHaveAttribute("src", /\/quiz\/resultado\/og\?/)

      const candidateLink = page.locator("article a[href^='/candidato/']").first()
      await expect(candidateLink).toBeVisible()
      await candidateLink.click()
      await expect(page).toHaveURL(/\/candidato\//)
    })
  })
})
