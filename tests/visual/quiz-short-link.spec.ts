import { expect, test } from "playwright/test"

const QUIZ_NEUTRAL_R = "REREREREREA"

function buildQuizQueryString() {
  return new URLSearchParams({
    r: QUIZ_NEUTRAL_R,
    v: "3",
    cargo: "Governador",
    uf: "SP",
  }).toString()
}

test.describe("Quiz short-link roundtrip", () => {
  test.skip(({ browserName, isMobile }) => isMobile || browserName === "webkit", "Short-link HTTP coberto no launch desktop; mobile visual cobre layout do quiz.")

  test("POST /api/quiz/short-link persists a token and GET /quiz/r/[token] redirects to /quiz/resultado", async ({
    request,
    page,
  }) => {
    const queryString = buildQuizQueryString()
    const ip = `203.0.113.80-${Date.now().toString(36)}`

    const createResponse = await request.post("/api/quiz/short-link", {
      headers: {
        "x-forwarded-for": ip,
      },
      data: {
        queryString,
      },
    })

    expect(createResponse.status()).toBe(200)
    const created = (await createResponse.json()) as { path: string; url: string }
    expect(created.path).toMatch(/^\/quiz\/r\/[A-Za-z0-9_-]{8,16}$/)
    expect(created.url).toContain(created.path)

    // HTTP contrato: token válido devolve 307 real; o navegador segue o redirect
    // e termina em /quiz/resultado com HTTP 200.
    const pageResponse = await page.goto(created.path, { waitUntil: "domcontentloaded" })

    expect(pageResponse?.status()).toBe(200)
    const browserUrl = new URL(page.url())
    expect(browserUrl.pathname).toBe("/quiz/resultado")
    expect(browserUrl.search).toBe(`?${queryString}`)
    await expect(page.getByRole("heading", { name: /sua comparação/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /link curto/i })).toBeVisible()
  })

  test("invalid token redirects to quiz landing with noindex", async ({ request }) => {
    const invalidPath = `/quiz/r/${`missing${Date.now().toString(36)}`.slice(0, 14)}`

    // Contrato HTTP: token inválido ou expirado redireciona 307 para a landing
    // do quiz (que explica o link expirado e oferece refazer), sem cache e sem
    // indexação. O 404 cru era beco sem saída para link compartilhado.
    const response = await request.get(invalidPath, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    const location = new URL(response.headers()["location"], "http://127.0.0.1")
    expect(location.pathname).toBe("/quiz")
    expect(location.searchParams.get("erro")).toBe("link-expirado")
    expect(response.headers()["cache-control"]).toBe("no-store")
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow")
  })
})
