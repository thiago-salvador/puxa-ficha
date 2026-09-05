/**
 * Interaction tests — validates React behaviors that Claude Preview headless
 * could not test: search filtering, comparador selection, tab switching,
 * mobile menu cycle, and BrazilMap navigation.
 *
 * Run com URLs Supabase placeholder (nenhuma conexão real):
 *   CI=true PF_VISUAL_FIXTURE_BUILD=1 npm run build
 *   CI=true PF_VISUAL_FIXTURE_BUILD=1 npx playwright test tests/visual/interactions.spec.ts
 * O build .next-e2e injeta pessoas fictícias na fronteira SSR, não no DOM.
 */

import { test, expect } from "playwright/test"

// ---------------------------------------------------------------------------
// Navbar — mobile menu cycle
// ---------------------------------------------------------------------------

test.describe("Navbar mobile menu", () => {
  test("menu waits for hydration before accepting a click", async ({ page }) => {
    let releaseChunks = () => {}
    const chunksReady = new Promise<void>((resolve) => { releaseChunks = resolve })
    let blockedChunks = 0
    await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
      blockedChunks += 1
      await chunksReady
      await route.continue()
    })

    try {
      // HTML and CSS arrive normally; the real client chunks are held until
      // the SSR control has been inspected. No timer or hydration proxy.
      await page.goto("/", { waitUntil: "commit" })
      const menuBtn = page.getByRole("button", { name: "Abrir menu" })
      await expect(menuBtn).toBeVisible()
      await expect.poll(() => blockedChunks).toBeGreaterThan(0)
      const before = await menuBtn.evaluate((button: HTMLButtonElement) => {
        const disabled = button.disabled
        button.click()
        return { disabled, expandedAfterClick: button.getAttribute("aria-expanded") }
      })
      await test.info().attach("menu-before-hydration", {
        body: JSON.stringify({ ...before, blockedChunks }), contentType: "application/json",
      })
      expect(before.expandedAfterClick).toBe("false")
      await expect(menuBtn).toBeDisabled()

      releaseChunks()
      await expect(menuBtn).toBeEnabled()
      await menuBtn.click()
      const dialog = page.getByRole("dialog", { name: "Menu principal" })
      await expect(dialog).toBeVisible()
      await expect(page.locator(".menu-btn")).toHaveAttribute("aria-expanded", "true")
      await page.keyboard.press("Escape")
      await expect(dialog).toBeHidden()
    } finally {
      releaseChunks()
    }
  })

  test("opens, shows links, closes with Escape — and restores scroll", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Use stable class selector — aria-label changes after open/close
    const menuBtn = page.locator(".menu-btn")
    await expect(menuBtn).toBeVisible()
    await expect(menuBtn).toHaveAttribute("aria-expanded", "false")

    // Open
    await menuBtn.click()
    const dialog = page.getByRole("dialog", { name: /menu principal/i })
    await expect(dialog).toBeVisible()
    await expect(menuBtn).toHaveAttribute("aria-expanded", "true")

    // Confirm links are present
    await expect(dialog.getByText("Presidência")).toBeVisible()
    await expect(dialog.getByText("Governadores")).toBeVisible()
    await expect(dialog.getByText("Comparar")).toBeVisible()
    await expect(dialog.getByText("Sobre")).toBeVisible()

    // Close with Escape
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(menuBtn).toHaveAttribute("aria-expanded", "false")

    // Scroll lock should be released
    const overflow = await page.evaluate(() => document.body.style.overflow)
    expect(overflow).not.toBe("hidden")
  })

  test("closes by clicking close button inside dialog", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const menuBtn = page.locator(".menu-btn")
    await menuBtn.click()
    const dialog = page.getByRole("dialog", { name: /menu principal/i })
    await expect(dialog).toBeVisible()

    // Click explicit close button (not the overlay — GSAP may not complete in test)
    const closeBtn = dialog.getByRole("button", { name: /fechar menu/i }).first()
    await closeBtn.click()
    await expect(dialog).toBeHidden()
  })
})

// ---------------------------------------------------------------------------
// Busca rápida (palette) + DeferredCandidatoGrid view toggle
// ---------------------------------------------------------------------------

test.describe("Busca rápida palette", () => {
  test("search opens palette and filters the local candidate fixture", async ({ page }) => {
    await page.route("**/api/search-index", (route) => route.fulfill({ json: {
      ok: true,
      data: [{ href: "/candidato/fixture-alfa", title: "Pessoa Alfa", subtitle: "Fixture de teste", searchText: "pessoa alfa" }],
    } }))
    await page.goto("/")
    await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
    const searchInput = page.getByRole("combobox", { name: "Buscar no site" })
    await expect(searchInput).toBeVisible()
    await searchInput.fill("Pessoa Alfa")
    const target = page.getByRole("option").filter({ hasText: /Pessoa Alfa/i }).first()
    await expect(target).toBeVisible({ timeout: 15_000 })
  })

  test("Escape closes the palette", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Abrir busca rápida" }).first().click()
    const searchInput = page.getByRole("combobox", { name: "Buscar no site" })
    await expect(searchInput).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(searchInput).toBeHidden()
  })

  test("view toggle switches between grid and list", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const gridBtn = page.getByRole("button", { name: /visualizar em grade/i })
    const listBtn = page.getByRole("button", { name: /visualizar em lista/i })
    await expect(gridBtn).toBeVisible({ timeout: 15_000 })

    // Default: grid active
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true")
    await expect(listBtn).toHaveAttribute("aria-pressed", "false")

    // Switch to list
    await listBtn.click()
    await expect(listBtn).toHaveAttribute("aria-pressed", "true")
    await expect(gridBtn).toHaveAttribute("aria-pressed", "false")

    // Candidates still visible
    const links = page.locator("main a[href^='/candidato/']")
    expect(await links.count()).toBeGreaterThan(0)

    // Switch back to grid
    await gridBtn.click()
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true")
  })
})

// ---------------------------------------------------------------------------
// Comparador — select, sticky bar, clear
// ---------------------------------------------------------------------------

test.describe("ComparadorPanel", () => {
  test("selecting 2 candidates shows sticky bar", async ({ page }) => {
    await page.goto("/comparar")
    await page.waitForLoadState("networkidle")

    // On desktop, use the table rows; on mobile, use the card buttons
    // Both render buttons with aria-label containing the candidate name
    const candidateButtons = page.getByRole("button", { name: /adicionar.+compara(?:ção|cao)/i })
    const count = await candidateButtons.count()
    expect(count).toBeGreaterThan(1)

    // Select first two
    await candidateButtons.nth(0).click()
    // O primeiro deixa o conjunto "Adicionar" ao virar "Remover".
    await candidateButtons.first().click()
    await expect(page.getByRole("button", { name: /remover.+compara(?:ção|cao)/i })).toHaveCount(2)

    // Sticky bar should appear showing 2/4 selecionados
    const stickyBar = page.getByText(/2\/4 selecionados/i)
    await expect(stickyBar).toBeVisible()
  })

  test("deselecting removes from sticky bar", async ({ page }) => {
    await page.goto("/comparar")
    await page.waitForLoadState("networkidle")

    const addBtns = page.getByRole("button", { name: /adicionar.+compara(?:ção|cao)/i })
    await addBtns.nth(0).click()
    await addBtns.first().click()

    // Now one should be "Remover"
    const removeBtns = page.getByRole("button", { name: /remover.+compara(?:ção|cao)/i })
    await removeBtns.first().click()

    await expect(page.getByText(/1\/4 selecionados/i)).toBeVisible()
  })

  /** Eixos do comparador: com baseURL padrao (producao), rode apos deploy; local: PF_BASE_URL=http://localhost:3000 */
  test("eixo tabs appear and switch active comparacao eixo", async ({ page }) => {
    await page.goto("/comparar")
    await page.waitForLoadState("networkidle")

    const addBtns = page.getByRole("button", { name: /adicionar.+compara(?:ção|cao)/i })
    await addBtns.nth(0).click()
    await addBtns.first().click()

    const root = page.locator("[data-pf-comparacao-root]")
    await expect(root).toBeVisible({ timeout: 15_000 })

    const gastosTab = page.locator('[data-pf-comparador-eixo-tab="gastos"]')
    await expect(gastosTab).toBeVisible()
    await gastosTab.click()

    await expect(root).toHaveAttribute("data-pf-comparacao-eixo", "gastos")
    await expect(gastosTab).toHaveAttribute("aria-selected", "true")
  })
})

// ---------------------------------------------------------------------------
// CandidatoProfile tabs
// ---------------------------------------------------------------------------

test.describe("ProfileTabs", () => {
  test("clicking each tab switches content", async ({ page, isMobile }) => {
    await page.goto("/candidato/fixture-alfa")
    await page.waitForLoadState("networkidle")

    const tabNav = page.getByRole("navigation", { name: /se(?:ções|coes) do perfil/i })
    await expect(tabNav).toBeVisible()

    const tabs = tabNav.getByRole("tab")
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThan(1)

    // Click each tab and verify it becomes the active one
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i)
      await tab.click()
      await expect(tab).toHaveAttribute("aria-selected", "true")
      await expect(page).toHaveURL(/\?tab=/)
      // Active tab has border-foreground class
      await expect(tab).toHaveClass(/border-foreground/)
    }
    // No mobile, as demais seções são opções radio no menu Mais.
    if (isMobile) {
      const more = tabNav.getByRole("button", { name: /^Mais/ })
      await more.click()
      const choices = tabNav.getByRole("menuitemradio")
      const choiceCount = await choices.count()
      expect(choiceCount).toBeGreaterThan(0)
      for (let i = 0; i < choiceCount; i++) {
        await choices.nth(i).click()
        await expect(page).toHaveURL(/\?tab=/)
        await expect(page.getByRole("tabpanel")).toBeVisible()
        await more.click()
        await expect(choices.nth(i)).toHaveAttribute("aria-checked", "true")
      }
      await page.keyboard.press("Escape")
    }
  })

  test("query param restores active tab and browser back follows tab history", async ({ page, isMobile }) => {
    await page.goto("/candidato/fixture-alfa?tab=dinheiro")
    await page.waitForLoadState("networkidle")

    const more = page.getByRole("button", { name: /^Mais/ })
    if (isMobile) await more.click()
    const dinheiroTab = page.getByRole(isMobile ? "menuitemradio" : "tab", { name: /^dinheiro/i })
    const justicaTab = page.getByRole(isMobile ? "menuitemradio" : "tab", { name: /^justiça/i })
    const selectionAttribute = isMobile ? "aria-checked" : "aria-selected"
    await expect(dinheiroTab).toHaveAttribute(selectionAttribute, "true")
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "profile-tab-dinheiro")

    await justicaTab.click()
    await expect(page).toHaveURL(/\?tab=justica/)
    if (isMobile) await more.click()
    await expect(justicaTab).toHaveAttribute(selectionAttribute, "true")
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "profile-tab-justica")

    if (isMobile) await page.keyboard.press("Escape")
    await page.goBack()
    if (isMobile) await more.click()
    await expect(dinheiroTab).toHaveAttribute(selectionAttribute, "true")
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "profile-tab-dinheiro")
  })

  test("tab bar sticks to top after scroll — no gap below navbar", async ({
    page,
  }) => {
    await page.goto("/candidato/fixture-alfa")
    await page.waitForLoadState("networkidle")

    // Scroll past the hero (wheel not supported on mobile WebKit)
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(300)

    // Locate the sticky tab bar by its role and content
    const tabBar = page.getByRole("navigation", { name: /se(?:ções|coes) do perfil/i }).locator("..")
    const navbar = page.locator("header").first()

    await expect(tabBar).toBeVisible()

    const tabRect = await tabBar.boundingBox()
    const navRect = await navbar.boundingBox()

    if (tabRect && navRect) {
      // Tab bar top should be >= navbar bottom (flush, no gap or overlap)
      // Allow 2px tolerance for sub-pixel rendering
      expect(tabRect.y).toBeGreaterThanOrEqual(navRect.y + navRect.height - 2)
    }
  })
})

// ---------------------------------------------------------------------------
// BrazilMap — navigation
// ---------------------------------------------------------------------------

test.describe("BrazilMap", () => {
  test("clicking a state navigates to its UF hub", async ({ page }) => {
    await page.goto("/governadores")
    await page.waitForLoadState("networkidle")

    // Use the directory links (more reliable than SVG clicks)
    const spLink = page.locator('a[href="/uf/sp"]').first()
    await expect(spLink).toBeVisible()
    await spLink.click()

    await expect(page).toHaveURL(/\/uf\/sp/i)
  })

  test("directory links are all present", async ({ page }) => {
    await page.goto("/governadores")
    await page.waitForLoadState("networkidle")

    // All 27 UFs should have a link in the right-side directory (not nav)
    const stateLinks = page.locator("a[href^='/uf/']")
    const count = await stateLinks.count()
    // 27 UFs × 2 (map SVG <g role=link> is not an <a>) = 27 <a> links in directory
    expect(count).toBeGreaterThanOrEqual(27)
  })
})

// ---------------------------------------------------------------------------
// Cross-cutting: no horizontal overflow at 375px
// ---------------------------------------------------------------------------

test.describe("No horizontal overflow", () => {
  const pages = ["/", "/comparar", "/governadores", "/sobre", "/candidato/fixture-alfa", "/quiz"]

  for (const path of pages) {
    test(`${path} — no overflow at 375px`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 812 },
      })
      const page = await ctx.newPage()
      await page.goto(path)
      await page.waitForLoadState("networkidle")

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(overflow).toBe(false)
      await ctx.close()
    })
  }
})
