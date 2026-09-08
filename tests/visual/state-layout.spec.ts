import { expect, test } from "playwright/test"

const states = "ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to".split(" ")

for (const uf of states) {
  test(`${uf}: state metrics and sections follow the requested hierarchy`, async ({ page }) => {
    await page.goto(`/uf/${uf}`)
    const hero = page.locator("[data-pf-state-hero-metrics]")
    await expect(hero).toContainText("candidatos mapeados")
    await expect(hero).toContainText("processos")
    await expect(hero).toContainText("patrimônio declarado")
    await expect(hero).not.toContainText("POPULAÇÃO")
    await expect(page.locator("#ranking")).toBeVisible()
    const ids = await page.locator("section[id]").evaluateAll(nodes => nodes.map(node => node.id).filter(id => ["programas", "pesquisas", "indicadores", "ranking", "comparador", "compartilhar"].includes(id)))
    const expected = ["programas", "pesquisas", "indicadores", "ranking", "compartilhar"]
    if (ids.includes("comparador")) expected.splice(4, 0, "comparador")
    expect(ids).toEqual(expected)
    const boxes = page.locator("[data-pf-state-indicator-card]")
    if (await boxes.count()) {
      await expect(boxes).toHaveCount(6)
      await expect(boxes.last()).toBeVisible()
      await expect(page.locator("#candidatos")).toBeVisible()
      const lastBox = await boxes.last().boundingBox()
      const candidates = await page.locator("#candidatos").boundingBox()
      expect(lastBox!.y + lastBox!.height).toBeLessThan(candidates!.y)
      const overflow = await boxes.locator("summary").evaluateAll(nodes => nodes.some(node => node.scrollWidth > node.clientWidth))
      expect(overflow).toBe(false)
    }
  })
}
