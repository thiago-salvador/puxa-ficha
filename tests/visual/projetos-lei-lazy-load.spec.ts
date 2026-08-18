import { expect, test } from "playwright/test"

test("perfil limita projetos inicialmente e carrega o inventário ao abrir Legislação", async ({ page, request }) => {
  const initialResponse = await request.get("/api/candidato-profile/jorginho-mello")
  expect(initialResponse.ok()).toBeTruthy()
  const initial = (await initialResponse.json()) as {
    data: { projetos_lei: unknown[]; projetos_lei_total: number; projetos_lei_truncados: boolean }
  }
  expect(initial.data.projetos_lei_total).toBeGreaterThan(25)
  expect(initial.data.projetos_lei).toHaveLength(25)
  expect(initial.data.projetos_lei_truncados).toBe(true)

  const offsets = new Set<number>()
  page.on("response", (response) => {
    const url = new URL(response.url())
    if (!url.pathname.endsWith("/candidato-profile/jorginho-mello/projetos-lei")) return
    offsets.add(Number(url.searchParams.get("offset") ?? "0"))
  })

  await page.goto("/candidato/jorginho-mello?tab=legislacao", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("tab", { name: /Legislação/ })).toHaveAttribute("aria-selected", "true")
  await expect.poll(() => offsets.size, { timeout: 20_000 }).toBeGreaterThanOrEqual(3)
  await expect(page.getByText(/Carregando o inventário legislativo completo/)).toHaveCount(0)
  await expect(page.getByText(/Não foi possível carregar todos/)).toHaveCount(0)
})
