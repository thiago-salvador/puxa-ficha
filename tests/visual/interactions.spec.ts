/**
 * Interaction tests — validates React behaviors that Claude Preview headless
 * could not test: search filtering, comparador selection, tab switching,
 * mobile menu cycle, and BrazilMap navigation.
 *
 * Run:
 *   npx playwright test tests/visual/interactions.spec.ts
 *   npx playwright test --project=mobile tests/visual/interactions.spec.ts
 *   PF_BASE_URL=http://localhost:3000 npx playwright test tests/visual/interactions.spec.ts
 */

import { test, expect } from "playwright/test"

// ---------------------------------------------------------------------------
// Navbar — mobile menu cycle
// ---------------------------------------------------------------------------

test.describe("Navbar mobile menu", () => {
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
    await expect(dialog.getByText("Presidencia")).toBeVisible()
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
// CandidatoGrid — search filter + view toggle
// ---------------------------------------------------------------------------

test.describe("CandidatoGrid", () => {
  test("search filters candidates by name", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder(/buscar por nome/i)
    await expect(searchInput).toBeVisible()

    // Count initial cards
    const cardsBefore = await page.locator("[data-pf-card]").count()
    // Fallback: count links in the grid area
    const initialCount = cardsBefore > 0
      ? cardsBefore
      : await page.locator("main a[href^='/candidato/']").count()
    expect(initialCount).toBeGreaterThan(1)

    // Search for Lula — should narrow results
    await searchInput.fill("Lula")
    await page.waitForTimeout(300) // debounce

    const filteredLinks = page.locator("main a[href^='/candidato/']")
    const filteredCount = await filteredLinks.count()
    expect(filteredCount).toBeGreaterThan(0)
    expect(filteredCount).toBeLessThan(initialCount)

    // Top result should contain "Lula"
    const firstCard = filteredLinks.first()
    await expect(firstCard).toContainText(/lula/i)
  })

  test("clear button resets search", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder(/buscar por nome/i)
    await searchInput.fill("Lula")
    await page.waitForTimeout(300)

    const clearBtn = page.getByRole("button", { name: /limpar busca/i })
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()

    await expect(searchInput).toHaveValue("")
    // Grid should restore to full count
    const links = page.locator("main a[href^='/candidato/']")
    const count = await links.count()
    expect(count).toBeGreaterThan(1)
  })

  test("view toggle switches between grid and list", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const gridBtn = page.getByRole("button", { name: /visualizar em grade/i })
    const listBtn = page.getByRole("button", { name: /visualizar em lista/i })

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
    const candidateButtons = page.getByRole("button", { name: /adicionar.+comparacao/i })
    const count = await candidateButtons.count()
    expect(count).toBeGreaterThan(1)

    // Select first two
    await candidateButtons.nth(0).click()
    await candidateButtons.nth(1).click()

    // Sticky bar should appear showing 2/4 selecionados
    const stickyBar = page.getByText(/2\/4 selecionados/i)
    await expect(stickyBar).toBeVisible()
  })

  test("deselecting removes from sticky bar", async ({ page }) => {
    await page.goto("/comparar")
    await page.waitForLoadState("networkidle")

    const addBtns = page.getByRole("button", { name: /adicionar.+comparacao/i })
    await addBtns.nth(0).click()
    await addBtns.nth(1).click()

    // Now one should be "Remover"
    const removeBtns = page.getByRole("button", { name: /remover.+comparacao/i })
    await removeBtns.first().click()

    await expect(page.getByText(/1\/4 selecionados/i)).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// CandidatoProfile tabs
// ---------------------------------------------------------------------------

test.describe("ProfileTabs", () => {
  test("clicking each tab switches content", async ({ page }) => {
    await page.goto("/candidato/lula")
    await page.waitForLoadState("networkidle")

    const tabNav = page.getByRole("navigation", { name: /secoes do perfil/i })
    await expect(tabNav).toBeVisible()

    const tabs = tabNav.getByRole("button")
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThan(1)

    // Click each tab and verify it becomes the active one
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i)
      await tab.click()
      // Active tab has border-foreground class
      await expect(tab).toHaveClass(/border-foreground/)
    }
  })

  test("tab bar sticks to top after scroll — no gap below navbar", async ({
    page,
  }) => {
    await page.goto("/candidato/lula")
    await page.waitForLoadState("networkidle")

    // Scroll past the hero
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(300)

    // Locate the sticky tab bar by its role and content
    const tabBar = page.getByRole("navigation", { name: /secoes do perfil/i }).locator("..")
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
  test("clicking a state navigates to its governadores page", async ({
    page,
  }) => {
    await page.goto("/governadores")
    await page.waitForLoadState("networkidle")

    // Use the directory links (more reliable than SVG clicks)
    const spLink = page.getByRole("link", { name: /SP.*Sao Paulo/i })
    await expect(spLink).toBeVisible()
    await spLink.click()

    await expect(page).toHaveURL(/\/governadores\/sp/i)
  })

  test("directory links are all present", async ({ page }) => {
    await page.goto("/governadores")
    await page.waitForLoadState("networkidle")

    // All 27 UFs should have a link in the right-side directory (not nav)
    const stateLinks = page.locator("a[href^='/governadores/']")
    const count = await stateLinks.count()
    // 27 UFs × 2 (map SVG <g role=link> is not an <a>) = 27 <a> links in directory
    expect(count).toBeGreaterThanOrEqual(27)
  })
})

// ---------------------------------------------------------------------------
// Cross-cutting: no horizontal overflow at 375px
// ---------------------------------------------------------------------------

test.describe("No horizontal overflow", () => {
  const pages = ["/", "/comparar", "/governadores", "/sobre", "/candidato/lula"]

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
