import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "playwright/test"
import { establishAutomationBypass } from "../../scripts/vercel-automation-bypass"

type RouteA11y = {
  name: string
  path: string
}

const ROUTES: RouteA11y[] = [
  { name: "home", path: "/" },
  { name: "candidate", path: "/candidato/lula" },
  { name: "compare", path: "/comparar" },
  { name: "donors", path: "/doadores?q=silva" },
  { name: "quiz", path: "/quiz" },
  { name: "alerts-access", path: "/alertas/acesso" },
  { name: "governors", path: "/governadores" },
  { name: "uf", path: "/uf/sp" },
  { name: "rankings", path: "/rankings" },
  { name: "ranking-detail", path: "/rankings/gastos-parlamentares" },
  { name: "candidate-timeline", path: "/candidato/lula/timeline" },
  { name: "quiz-questions", path: "/quiz/perguntas" },
  { name: "quiz-result", path: "/quiz/resultado" },
  { name: "embed-home", path: "/embed" },
  { name: "embed-candidate", path: "/embed/lula" },
]

test.beforeEach(async ({ context, baseURL }) => {
  if (baseURL) {
    await establishAutomationBypass(context, baseURL, process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
  }
})

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(" "))
        .join(", ")
      return `${violation.id} (${violation.impact}): ${violation.help} [${targets}]`
    })
    .join("\n")
}

test.describe("Acessibilidade automatizada", () => {
  for (const route of ROUTES) {
    test(`${route.name} has no moderate, serious or critical axe violations`, async ({ page }) => {
      // Com dados placeholder o slug do embed cai em notFound() e o axe avalia
      // a página 404, não a rota real. O job "Acessibilidade (produção)" cobre
      // esta rota contra produção, onde o candidato existe.
      test.skip(
        route.name === "embed-candidate" && Boolean(process.env.PF_EXPECT_PLACEHOLDER_DATA),
        "Sem dados reais o slug cai em notFound; rota coberta pelo job de produção.",
      )
      const path =
        route.name === "alerts-access" && test.info().project.name === "mobile"
          ? "/alertas/gerenciar"
          : route.path
      await page.goto(path, { waitUntil: "domcontentloaded" })
      await page.waitForLoadState("networkidle").catch(() => undefined)

      // As animações de entrada (hero-fade, stagger-item, section-reveal) mantêm
      // opacity 0 durante o delay; o axe roda depois que todas terminam, senão o
      // H1 ainda invisível dispara page-has-heading-one (falha intermitente do
      // job de a11y na main em 04/08). Se alguma animação nunca terminar, o
      // timeout deixa o axe rodar mesmo assim e reportar a violação real.
      await page
        .waitForFunction(
          () =>
            Array.from(
              document.querySelectorAll(".hero-fade, .stagger-item, .section-reveal"),
            ).every((el) => getComputedStyle(el).opacity === "1"),
          undefined,
          { timeout: 10_000 },
        )
        .catch(() => undefined)

      const results = await new AxeBuilder({ page }).analyze()
      const blockingViolations = results.violations.filter((violation) =>
        violation.impact === "moderate" ||
        violation.impact === "serious" ||
        violation.impact === "critical"
      )

      expect(blockingViolations, formatViolations(blockingViolations)).toEqual([])
    })
  }

  test("open navigation menu has no moderate, serious or critical axe violations", async ({ page }) => {
    // O painel do menu só existe visível depois do clique; sem este caso, o
    // axe nunca via o role="dialog" (que ficava num <nav>, papel não permitido).
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Abrir menu" }).click()
    await expect(page.getByRole("dialog", { name: "Menu principal" })).toBeVisible()
    // A entrada do menu é uma timeline GSAP de ~2s (overlay, painéis, links e
    // rodapé com autoAlpha). Enquanto ela roda, o axe mede o texto ainda
    // translúcido e acusa color-contrast falso. Espera todo o painel opaco.
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>("#primary-navigation-panel *")).every(
            (el) => getComputedStyle(el).opacity === "1",
          ),
        undefined,
        { timeout: 10_000 },
      )
      .catch(() => undefined)

    const results = await new AxeBuilder({ page }).analyze()
    const blockingViolations = results.violations.filter((violation) =>
      violation.impact === "moderate" ||
      violation.impact === "serious" ||
      violation.impact === "critical"
    )
    expect(blockingViolations, formatViolations(blockingViolations)).toEqual([])
  })

  test("alerts-manage error state has no moderate, serious or critical axe violations", async ({ page }) => {
    await page.route("**/api/alerts/me", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Não foi possível carregar sua gestão de alertas." }),
      })
    })

    await page.goto("/alertas/gerenciar", { waitUntil: "domcontentloaded" })
    await expect(page.getByText("Acesso indisponível")).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    const blockingViolations = results.violations.filter((violation) =>
      violation.impact === "moderate" ||
      violation.impact === "serious" ||
      violation.impact === "critical"
    )

    expect(blockingViolations, formatViolations(blockingViolations)).toEqual([])
  })
})
