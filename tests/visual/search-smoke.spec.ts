import { expect, test } from "playwright/test"
import { establishAutomationBypass } from "../../scripts/vercel-automation-bypass"

/**
 * Smoke curto no caminho real de busca (palette), o mesmo que
 * `checkGlobalSearch` em scripts/smoke-lancamento.ts. Não substitui a suíte
 * visual completa e não entra no job de PR com dados placeholder.
 *
 * Rodar: npm run test:search-smoke
 */
function isPuxaFichaHost(raw: string): boolean {
  try {
    const host = new URL(raw).hostname
    return host === "puxaficha.com.br" || host === "www.puxaficha.com.br"
  } catch {
    return false
  }
}

const baseUrl = process.env.PF_BASE_URL ?? ""
const hasRealIndex =
  process.env.PF_RUN_SEARCH_SMOKE === "1" || isPuxaFichaHost(baseUrl)

test.beforeEach(async ({ context }) => {
  await establishAutomationBypass(context, baseUrl, process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
})

test.describe("Busca rápida (caminho real)", () => {
  test.skip(
    !hasRealIndex,
    "índice real: rode com PF_BASE_URL=https://puxaficha.com.br (npm run test:search-smoke)",
  )

  test("palette abre, busca Lula e navega para a ficha", async ({ page }) => {
    test.setTimeout(45_000)
    await page.goto("/")
    await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
    const input = page.getByRole("combobox", { name: "Buscar no site" })
    await expect(input).toBeVisible()
    await input.fill("Lula")
    const target = page.getByRole("option").filter({ hasText: /Lula/i }).first()
    await expect(target).toBeVisible({ timeout: 15_000 })
    await target.click()
    await expect(page).toHaveURL(/\/candidato\/lula\/?$/)
    await expect(page.locator("main")).toContainText(/Lula/i)
  })
})
