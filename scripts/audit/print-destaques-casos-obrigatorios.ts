/**
 * Prova visual dos dois casos obrigatórios dos itens 4 e 14, na ficha REAL.
 *
 * Não monta componente à mão nem inventa fixture: abre a página do produto no
 * servidor local, na aba Destaques, e fotografa. É a diferença entre mostrar o
 * que o código deveria produzir e mostrar o que ele produz.
 *
 * Casos:
 *   1. uma ficha pública com Destaques (0), para o vazio honesto por fonte;
 *   2. `renan-santos`, que continua com 1 depois da regra positiva de trajetória.
 *
 * Confere, ANTES de salvar cada print, que o card superior, a badge da aba e o
 * cabeçalho mostram o MESMO número esperado. Os três divergindo foi o defeito
 * que invalidou a evidência de `ataides-oliveira` na rodada anterior.
 *
 * Uso, com o dev server já de pé a partir do SHA que se quer provar:
 *   npx tsx scripts/audit/print-destaques-casos-obrigatorios.ts --base=http://localhost:3030
 */
import { execSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { chromium } from "playwright"

const DESTINO = "QA/evidencias/2026-08-10-item4-14-destaques"

const CASOS = [
  { slug: "ben-mendes", arquivo: "caso-destaques-zero.png", esperado: 0 },
  { slug: "renan-santos", arquivo: "caso-renan-santos-um.png", esperado: 1 },
  /**
   * Terceiro caso, que não é obrigatório e existe por outro motivo: prova que
   * as três fontes novas (mandato, patrimônio, votação-chave) têm CARD, e não
   * só linha na contagem. Era exatamente esse o defeito do `d5e83eb`.
   */
  { slug: "ataides-oliveira", arquivo: "caso-tres-fontes-com-card.png", esperado: 5 },
]

async function main() {
  const base =
    process.argv.slice(2).find((a) => a.startsWith("--base="))?.split("=")[1] ??
    "http://localhost:3030"
  mkdirSync(DESTINO, { recursive: true })

  // Registra o SHA que gerou os prints. Evidência sem SHA não diz de qual
  // código ela é prova.
  const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim()
  const sujo = execSync("git status --porcelain", { encoding: "utf8" }).trim()
  console.log(`SHA em prova: ${sha}${sujo ? " (worktree SUJO)" : " (worktree limpo)"}`)

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1400 },
    colorScheme: "light",
  })

  for (const caso of CASOS) {
    await page.goto(`${base}/candidato/${caso.slug}?tab=alertas`, { waitUntil: "networkidle" })
    // O perfil é deferido: só monta quando entra em viewport ou no idle.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const cabecalho = page.locator("text=/Destaques \\(\\d+\\)/").first()
    await cabecalho.waitFor({ state: "visible", timeout: 30_000 })
    await cabecalho.scrollIntoViewIfNeeded()

    /**
     * Confere os TRÊS números antes de salvar, e não só o do cabeçalho.
     *
     * O print de `ataides-oliveira` da rodada anterior foi salvo com o card
     * superior em 1 e a aba em 5, porque o script só olhava o cabeçalho e a
     * tela tinha sido capturada antes da correção do card. Print de tela errada
     * é pior que print nenhum, porque parece prova.
     */
    const cardSuperior = Number(
      (await page.locator("[data-pf-overview-destaques]").first().getAttribute(
        "data-pf-overview-destaques"
      )) ?? "-1"
    )
    const badgeTexto =
      (await page.locator("[role=tab]", { hasText: "DESTAQUES" }).first().textContent()) ?? ""
    const badge = Number(badgeTexto.match(/\b(\d+)\b/)?.[1] ?? "-1")
    const textoCabecalho = (await cabecalho.textContent()) ?? ""
    const noCabecalho = Number(textoCabecalho.match(/\((\d+)\)/)?.[1] ?? "-1")

    const lidos = { cardSuperior, badge, noCabecalho }
    for (const [onde, valor] of Object.entries(lidos)) {
      if (valor !== caso.esperado) {
        throw new Error(
          `${caso.slug}: ${onde} mostra ${valor} e o caso exige ${caso.esperado}. ` +
            `Lidos: ${JSON.stringify(lidos)}`
        )
      }
    }

    const secao = page.locator("main").first()
    const destino = path.join(DESTINO, caso.arquivo)
    await secao.screenshot({ path: destino })
    console.log(
      `${caso.slug}: card ${cardSuperior}, badge ${badge}, cabeçalho ${noCabecalho} -> ${destino}`
    )
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
