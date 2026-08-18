/**
 * Quiz resultado — rota OG (ImageResponse).
 * Usa APIRequestContext (sem browser).
 *
 * Rodar: npm run test:visual:quiz-og (build + servidor local + este spec).
 * Contra URL ja deployada: PF_QUIZ_OG_BASE_URL=https://... npx playwright test -c playwright.quiz-og.config.ts
 */

import { test, expect } from "playwright/test"

test.describe("Quiz resultado OG", () => {
  test("GET /quiz/resultado/og returns PNG", async ({ request }) => {
    const res = await request.get("/quiz/resultado/og")
    expect(res.ok()).toBeTruthy()
    expect(res.headers()["content-type"] ?? "").toMatch(/image\/png/i)
    const buf = await res.body()
    expect(buf.byteLength).toBeGreaterThan(500)
  })

  test("GET governador sem UF returns PNG (fallback card)", async ({ request }) => {
    const res = await request.get("/quiz/resultado/og?cargo=Governador")
    expect(res.ok()).toBeTruthy()
    expect(res.headers()["content-type"] ?? "").toMatch(/image\/png/i)
  })

  test("GET invalid r returns PNG (fallback card)", async ({ request }) => {
    const res = await request.get("/quiz/resultado/og?r=invalid&v=3")
    expect(res.ok()).toBeTruthy()
    expect(res.headers()["content-type"] ?? "").toMatch(/image\/png/i)
  })
})
