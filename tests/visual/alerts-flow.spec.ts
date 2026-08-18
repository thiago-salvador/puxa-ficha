import { expect, test } from "playwright/test"

const MANAGE_TOKEN = "ManageTokenPlaywright001"
const VERIFY_TOKEN = "VerifyTokenPlaywright001"

test.describe("Alertas e2e", () => {
  test.skip(({ browserName, isMobile }) => isMobile || browserName === "webkit", "Fluxo de token/API coberto no launch desktop; mobile visual cobre layout.")

  // O fluxo inteiro nasce em /candidato/lula, que só renderiza o botão de
  // seguir com dados reais do Supabase. No job de PR do CI o servidor sobe com
  // env placeholder e este e2e não tem como iniciar; fica de fora lá
  // (PF_EXPECT_PLACEHOLDER_DATA=1) e permanece como checagem manual
  // pré-lançamento: npm run test:playwright:launch contra um servidor com
  // dados reais.
  test.skip(
    process.env.PF_EXPECT_PLACEHOLDER_DATA === "1",
    "Fluxo depende de dados reais do Supabase; o job de PR roda com env placeholder",
  )

  test("ativa, verifica, pausa, reativa, cancela tudo e apaga os dados", async ({
    page,
  }) => {
    const state = {
      deleted: false,
      following: new Set<string>(),
    }

    await page.route("**/api/alerts/**", async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (url.pathname === "/api/alerts/session" && request.method() === "DELETE") {
        await route.continue()
        return
      }

      const hasManageCookie = (await page.context().cookies()).some(
        (cookie) => cookie.name === "pf_alerts_manage" && cookie.value === MANAGE_TOKEN,
      )

      if (url.pathname === "/api/alerts/me") {
        if (!hasManageCookie || state.deleted) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: false,
              anonymous: true,
              subscriptions: [],
            }),
          })
          return
        }

        const subscriptions = state.following.has("lula")
          ? [
              {
                id: "sub_lula",
                slug: "lula",
                nome_urna: "Lula",
                partido_sigla: "PT",
                cargo_disputado: "Presidente",
              },
            ]
          : []

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            subscriber: {
              emailMasked: "el*****@example.com",
              canalEmail: true,
              verified: true,
              lastDigestSentAt: null,
            },
            subscriptions,
          }),
        })
        return
      }

      if (url.pathname === "/api/alerts/subscribe") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            requiresVerification: true,
            candidateSlug: "lula",
            emailMasked: "el*****@example.com",
          }),
        })
        return
      }

      if (url.pathname === "/api/alerts/verify") {
        if (!hasManageCookie) {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "Invalid manage token" }),
          })
          return
        }

        state.following.add("lula")
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            verified: true,
          }),
        })
        return
      }

      if (url.pathname === "/api/alerts/toggle") {
        if (!hasManageCookie || state.deleted) {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "Invalid manage token" }),
          })
          return
        }

        const payload = request.postDataJSON() as { candidateSlug?: string }
        if (payload.candidateSlug === "lula" && state.following.has("lula")) {
          state.following.delete("lula")
        } else if (payload.candidateSlug === "lula") {
          state.following.add("lula")
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            following: state.following.has("lula"),
            candidateSlug: "lula",
          }),
        })
        return
      }

      if (url.pathname === "/api/alerts/unsubscribe-all") {
        if (!hasManageCookie || state.deleted) {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "Invalid manage token" }),
          })
          return
        }

        state.following.clear()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        })
        return
      }

      if (url.pathname === "/api/alerts/delete-data") {
        if (!hasManageCookie || state.deleted) {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "Invalid manage token" }),
          })
          return
        }

        state.deleted = true
        state.following.clear()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        })
        return
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unhandled alerts route" }),
      })
    })

    await page.goto("/candidato/lula", { waitUntil: "domcontentloaded" })

    const disabledAlertsNotice = page.getByText(/Alertas por email estão em validação operacional/i)
    const followButton = page
      .getByRole("button", { name: /Seguir candidato|Receber alertas/i })
      .first()

    await expect(async () => {
      const hasButton = await followButton.isVisible().catch(() => false)
      const hasDisabledNotice = await disabledAlertsNotice.isVisible().catch(() => false)
      expect(hasButton || hasDisabledNotice).toBeTruthy()
    }).toPass({ timeout: 15_000 })

    if (await disabledAlertsNotice.isVisible().catch(() => false)) {
      return
    }

    await expect(followButton).toBeVisible()
    await followButton.click()

    await page.getByPlaceholder(/seuemail@exemplo.com/i).fill("eleitor@example.com")
    await page.getByRole("button", { name: /Confirmar por email/i }).click()
    await expect(page.getByText(/Confirme seu email/i)).toBeVisible()

    await page.goto(`/alertas/acesso?verify=${VERIFY_TOKEN}&manage=${MANAGE_TOKEN}`, {
      waitUntil: "domcontentloaded",
    })

    await expect(page).toHaveURL(/\/alertas\/verificar$/)
    await expect(page.getByText(/Email confirmado/i)).toBeVisible()

    const cookiesAfterVerify = await page.context().cookies()
    expect(cookiesAfterVerify.some((cookie) => cookie.name === "pf_alerts_manage")).toBeTruthy()

    await page.getByRole("button", { name: /Abrir gestão dos alertas/i }).click()

    await expect(page).toHaveURL(/\/alertas\/gerenciar$/)
    await expect(page.getByRole("heading", { name: /Seus acompanhamentos/i })).toBeVisible()
    await expect(page.getByText(/^Lula$/)).toBeVisible()

    await page.getByRole("button", { name: /Parar de acompanhar/i }).click()
    await expect(page.getByText(/Nenhuma ficha acompanhada/i)).toBeVisible()

    await page.goto("/candidato/lula", { waitUntil: "domcontentloaded" })

    const reactivateButton = page
      .getByRole("button", { name: /Seguir candidato|Receber alertas/i })
      .first()
    await expect(reactivateButton).toBeVisible()
    await reactivateButton.click()
    await expect(page.getByRole("button", { name: /Seguindo por email/i })).toBeVisible()

    await page.goto("/alertas/gerenciar", { waitUntil: "domcontentloaded" })
    await expect(page.getByText(/^Lula$/)).toBeVisible()

    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: /Cancelar todos os alertas/i }).click()
    await expect(page.getByText(/Nenhuma ficha acompanhada/i)).toBeVisible()

    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: /Apagar meus dados/i }).click()
    await expect(page.getByText(/Abra o link enviado por email/i)).toBeVisible()

    await page.goto("/candidato/lula", { waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("button", { name: /Seguir candidato|Receber alertas/i }).first(),
    ).toBeVisible()
  })
})
