import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { buildCandidateBoxCard, buildComparatorBoxCard } from "../../src/lib/box-card-model"
import { makeBoxCardCandidate, makeBoxCardComparables } from "../fixtures/box-card"

const boxes = [
  { kind: "patrimonio-resumo", slug: "fixture-boxes-single", tab: "geral" },
  { kind: "evolucao-patrimonial-resumo", slug: "fixture-boxes", tab: "geral" },
  { kind: "financiamento-resumo", slug: "fixture-boxes", tab: "geral" },
  { kind: "cota-resumo", slug: "fixture-boxes", tab: "geral" },
  { kind: "votacoes-resumo", slug: "fixture-boxes", tab: "geral" },
  { kind: "despesas-campanha", slug: "fixture-boxes", tab: "dinheiro" },
  { kind: "cargos-mandatos", slug: "fixture-boxes", tab: "trajetoria" },
  { kind: "historico-partidario", slug: "fixture-boxes", tab: "trajetoria" },
  { kind: "comparador", slug: "", tab: "" },
] as const

function pathFor(box: (typeof boxes)[number]) {
  return box.kind === "comparador"
    ? "/comparar?c1=fixture-alfa&c2=fixture-beta&eixo=patrimonio#box-comparador"
    : `/candidato/${box.slug}?tab=${box.tab}#box-${box.kind}`
}

function textValue(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

for (const box of boxes) {
  test(`${box.kind}: link hidratado e PNG feed/story`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "Os 18 PNGs são inspecionados uma vez no desktop")
    await page.goto(pathFor(box), { waitUntil: "domcontentloaded" })
    const anchor = page.locator(`#box-${box.kind}`)
    const button = page.locator(`[data-pf-box-share="${box.kind}"]`)
    await expect(anchor).toBeVisible({ timeout: 30_000 })
    await expect(button).toHaveCount(1)
    await expect(button).toHaveAccessibleName(/^Compartilhar /)
    const ficha = makeBoxCardCandidate({ slug: box.slug })
    if (box.slug === "fixture-boxes-single") ficha.patrimonio = ficha.patrimonio.slice(-1)
    const projection = box.kind === "comparador"
      ? buildComparatorBoxCard(
          makeBoxCardComparables().slice(0, 2).map((candidate, index) => ({
            ...candidate,
            nome_urna: index === 0 ? "Pessoa Alfa" : "Pessoa Beta",
            partido_sigla: "PT",
            cargo_disputado: "Presidente",
            estado: null,
          })),
          { slugs: ["fixture-alfa", "fixture-beta"], axis: "patrimonio" },
        )
      : buildCandidateBoxCard(box.kind, ficha)
    expect(projection).not.toBeNull()
    const visibleText = textValue(await anchor.evaluate((node) => {
      const clone = node.cloneNode(true) as HTMLElement
      clone.querySelectorAll(".sr-only, [hidden]").forEach((hidden) => hidden.remove())
      return clone.textContent ?? ""
    }))
    for (const row of projection!.rows) {
      expect(visibleText, `UI e PNG divergem em ${box.kind}: ${row.value}`).toContain(textValue(row.value))
    }
    await expect.poll(async () => {
      const rect = await anchor.boundingBox()
      return Boolean(rect && rect.y < 900 && rect.y + rect.height > 0)
    }).toBe(true)
    await page.screenshot({ path: info.outputPath(`${box.kind}-deep-link.png`) })

    await button.click()
    const dialog = page.getByRole("dialog", { name: "Gerar card para redes sociais" })
    await expect(dialog).toBeVisible()
    const output = join(process.cwd(), "output", "box-sharing", "png")
    await mkdir(output, { recursive: true })
    for (const format of ["feed", "story"] as const) {
      await dialog.getByRole("button", { name: format === "feed" ? "Feed" : "Story", exact: true }).click()
      const preview = dialog.locator("img")
      await expect.poll(async () => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1080)).toBe(true)
      const src = await preview.getAttribute("src")
      expect(src).toContain(`/api/card/box/${box.kind}/`)
      expect(new URL(src!, page.url()).searchParams.get("v")).toBe(projection!.revision)
      const response = await page.request.get(src!)
      expect(response.status()).toBe(200)
      expect(response.headers()["content-type"]).toMatch(/^image\/png/)
      const buffer = await response.body()
      expect(buffer.subarray(1, 4).toString()).toBe("PNG")
      expect(buffer.readUInt32BE(16)).toBe(1080)
      expect(buffer.readUInt32BE(20)).toBe(format === "feed" ? 1350 : 1920)
      await writeFile(join(output, `${box.kind}-${format}.png`), buffer)
    }
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(button).toBeFocused()
  })
}

test("modal acessível, foco preso, retorno e layout em 375 px e desktop", async ({ page, context }, info) => {
  await page.goto(pathFor(boxes[2]), { waitUntil: "domcontentloaded" })
  const button = page.locator('[data-pf-box-share="financiamento-resumo"]')
  await expect(button).toBeVisible({ timeout: 30_000 })
  await button.focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("dialog", { name: "Gerar card para redes sociais" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Fechar", exact: true })).toBeFocused()
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let step = 0; step < 18; step += 1) {
      await page.keyboard.press(key)
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    }
  }
  const violations = (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations
  expect(violations, JSON.stringify(violations)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await expect.poll(async () => dialog.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight === 1350)).toBe(true)
  await page.screenshot({ path: info.outputPath(`modal-${info.project.name}-feed.png`) })
  await dialog.getByRole("button", { name: "Story", exact: true }).click()
  await expect.poll(async () => dialog.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight === 1920)).toBe(true)
  await page.screenshot({ path: info.outputPath(`modal-${info.project.name}-story.png`) })
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await dialog.getByRole("button", { name: "Copiar link do box", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("/candidato/fixture-boxes?tab=geral#box-financiamento-resumo")
  const downloadPromise = page.waitForEvent("download")
  await dialog.getByRole("button", { name: "Baixar imagem", exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/story\.png$/)
  expect(await download.failure()).toBeNull()
  await download.saveAs(info.outputPath("download-story.png"))
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(button).toBeFocused()
})

test("comparador da UF restaura seleção e eixo", async ({ page }, info) => {
  await page.goto("/uf/sp?c1=fixture-gama&c2=fixture-delta&eixo=patrimonio&cargo=Governador&uf=SP#box-comparador", { waitUntil: "domcontentloaded" })
  const anchor = page.locator("#box-comparador")
  await expect(anchor).toBeVisible({ timeout: 30_000 })
  await expect(anchor).toHaveAttribute("data-pf-comparacao-count", "2")
  await expect(anchor).toHaveAttribute("data-pf-comparacao-eixo", "patrimonio")
  await expect(page.locator('[data-pf-box-share="comparador"]')).toBeVisible()
  await page.screenshot({ path: info.outputPath(`comparador-uf-${info.project.name}.png`) })
})

test("ficha vazia não oferece compartilhamento de box", async ({ page }) => {
  await page.goto("/candidato/fixture-alfa?tab=geral", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("tab", { name: /^Visão(?: Geral)?$/ })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 })
  await expect(page.getByRole("tabpanel", { name: "Visão", exact: true })).toBeVisible()
  await expect(page.locator("[data-pf-box-share]")).toHaveCount(0)
})
