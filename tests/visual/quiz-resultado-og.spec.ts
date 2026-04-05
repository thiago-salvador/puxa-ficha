/**
 * Quiz resultado — rota OG (ImageResponse).
 * Usa APIRequestContext (sem browser). Mobile project ignora este ficheiro no config.
 *
 * PF_BASE_URL=https://seu-preview.vercel.app npx playwright test quiz-resultado-og
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
