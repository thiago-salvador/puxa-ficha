/**
 * Smoke visual + contrato: selos editoriais na ficha pública.
 *
 * Base URL:
 *   PF_BASE_URL (default em playwright.config: deploy de preview). Para ficha com dados reais
 *   use servidor local já buildado ou o job "Auditoria factual" (127.0.0.1:3000 após `next start`).
 *
 * Slug da ficha (pontos públicos esperados):
 *   PF_EDITORIAL_FICHA_SLUG (default: lula)
 *
 * Local com webServer (build + start; exige Supabase real no env, não placeholder):
 *   npm run test:visual:editorial:local
 *
 * "Selos" em /sobre: exigido quando a base é localhost/127.0.0.1 (build local ou job de auditoria)
 *   ou quando `PF_EDITORIAL_REQUIRE_SELLOS=1`. Para bater num deploy antigo sem a palavra "selos",
 *   use `PF_EDITORIAL_RELAX_SOBER=1`.
 *
 * Quando o candidato não tem pontos de atenção públicos, os três testes de ficha marcam skip.
 */

import { test, expect } from "playwright/test"

const KIND_RE =
  /^(curadoria_verified|curadoria_pending|ia_verified|ia_pending|automatico_verified|automatico_pending)$/

const FICHA_SLUG = (process.env.PF_EDITORIAL_FICHA_SLUG ?? "lula").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "lula"

function shouldAssertSelosOnSobre(): boolean {
  if (process.env.PF_EDITORIAL_RELAX_SOBER === "1") return false
  if (process.env.PF_EDITORIAL_REQUIRE_SELLOS === "1") return true
  const base = (process.env.PF_BASE_URL ?? "").toLowerCase()
  return /127\.0\.0\.1|localhost/.test(base)
}

test.describe("/sobre — transparência editorial", () => {
  test("Metodologia: pontos de atenção, curadoria, IA/interface; 'selos' se base local ou REQUIRE_SELLOS", async ({
    page,
  }) => {
    await page.goto("/sobre")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { level: 1, name: /Puxa Ficha/i })).toBeVisible()
    const body = page.locator("body")
    if (shouldAssertSelosOnSobre()) {
      await expect(body).toContainText(/selos/i)
    }
    await expect(body).toContainText(/pontos de atenção/i)
    await expect(body).toContainText(/curadoria/i)
    await expect(body).toContainText(/automatiz|IA|interface/i)
  })
})

test.describe("/metodologia — linguagem editorial", () => {
  test("pipeline usa steps editoriais e notices reutilizados", async ({ page }) => {
    await page.goto("/metodologia")
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("heading", { level: 1, name: /Metodologia e Fontes/i })).toBeVisible()
    await expect(page.locator("[data-pf-process-step]")).toHaveCount(5)
    await expect(page.locator("[data-pf-notice-panel]").first()).toBeVisible()
    await expect(page.locator("[data-pf-meta-badge]").first()).toBeVisible()
  })
})

test.describe("Editorial badges — ficha candidato", () => {
  test("aba Destaques: selos com data-pf-editorial-kind quando há pontos", async ({
    page,
  }, testInfo) => {
    await page.goto(`/candidato/${FICHA_SLUG}?tab=alertas`)
    await page.waitForLoadState("networkidle")

    const badges = page.locator("[data-pf-editorial-badge]")
    const n = await badges.count()
    if (n === 0) {
      testInfo.skip(true, "Sem pontos de atenção neste slug/ambiente — nada a validar.")
    }

    await expect(badges.first()).toBeVisible()
    const kind = await badges.first().getAttribute("data-pf-editorial-kind")
    expect(kind).toMatch(KIND_RE)
    await expect(badges.first().locator("svg")).toHaveCount(0)
  })

  test("visão geral: selos no overview quando há pontos listados", async ({
    page,
  }, testInfo) => {
    await page.goto(`/candidato/${FICHA_SLUG}`)
    await page.waitForLoadState("networkidle")

    const overviewBadges = page.locator("[data-pf-editorial-badge]")
    const n = await overviewBadges.count()
    if (n === 0) {
      testInfo.skip(true, "Sem selos na visão geral para este slug.")
    }
    await expect(overviewBadges.first()).toBeVisible()
  })

  test("bloco Resumo (CandidateSnapshot) quando há itens agregados", async ({
    page,
  }, testInfo) => {
    await page.goto(`/candidato/${FICHA_SLUG}`)
    await page.waitForLoadState("networkidle")

    const snap = page.locator("[data-pf-candidate-snapshot]")
    const n = await snap.count()
    if (n === 0) {
      testInfo.skip(true, "CandidateSnapshot vazio para este slug — sem seção Resumo.")
    }
    await expect(snap).toBeVisible()
    await expect(snap.getByText("Resumo", { exact: true })).toBeVisible()
  })
})
