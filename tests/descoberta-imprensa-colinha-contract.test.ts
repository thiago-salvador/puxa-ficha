import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { getEstadoUFs } from "@/lib/br-uf"

function read(relativePath: string): string {
  return readFileSync(relativePath, "utf8")
}

// A Sala em /imprensa, /imprensa/atualizacoes e /imprensa/frescor são indexáveis.
// A Mesa em /imprensa/mesa e /colinha
// declaram `robots: { index: false }` e ficam fora do sitemap. A colinha
// segue no menu e no rodapé porque tem OG/Twitter completos e recursos de
// compartilhamento (WhatsApp, imagem, impressão), sinal de que é feita para
// ser descoberta; só o índice de busca que ela dispensa.
describe("descoberta de /colinha e /deputados/[uf]", () => {
  // Desde 06/10/2026 a Colinha saiu do menu (2º turno); a descoberta segue pelo rodapé.
  test("Navbar não oferece Colinha nem expõe a Mesa de apuração", () => {
    const navbar = read("src/components/Navbar.tsx")
    assert.doesNotMatch(navbar, /href: "\/colinha"/)
    assert.doesNotMatch(navbar, /href: "\/imprensa"/)
  })

  test("Footer oferece Colinha e não expõe a Mesa de apuração", () => {
    const footer = read("src/components/Footer.tsx")
    assert.match(footer, /\{ href: "\/colinha", label: "Colinha" \}/)
    assert.doesNotMatch(footer, /href: "\/imprensa"/)
  })

  test("Sala, atualizações e frescor são indexáveis; Mesa e colinha declaram noindex", () => {
    const sala = read("src/app/(site)/imprensa/page.tsx")
    const mesa = read("src/app/(site)/imprensa/mesa/page.tsx")
    const atualizacoes = read("src/app/(site)/imprensa/atualizacoes/page.tsx")
    const frescor = read("src/app/(site)/imprensa/frescor/page.tsx")
    const colinha = read("src/app/(site)/colinha/page.tsx")

    assert.doesNotMatch(sala, /robots:\s*\{\s*index:\s*false/)
    assert.match(sala, /canonical:\s*["']\/imprensa["']/)
    for (const source of [atualizacoes, frescor]) {
      assert.doesNotMatch(source, /robots:\s*\{\s*index:\s*false/)
    }
    for (const source of [mesa, colinha]) {
      assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/)
    }
  })

  test("sitemap inclui Sala e /deputados/{uf}, sem Mesa ou colinha", () => {
    const sitemap = read("src/app/sitemap.ts")
    const ufs = getEstadoUFs()

    assert.ok(ufs.length >= 26, "getEstadoUFs deveria cobrir as 27 unidades federativas")
    assert.match(sitemap, /deputadosUrls[\s\S]*url:\s*`\$\{SITE_ORIGIN\}\/deputados\/\$\{uf\}`/)
    assert.match(sitemap, /\.\.\.deputadosUrls/)
    assert.match(sitemap, /url:\s*`\$\{SITE_ORIGIN\}\/imprensa`/)
    assert.match(sitemap, /url:\s*`\$\{SITE_ORIGIN\}\/imprensa\/atualizacoes`/)
    assert.match(sitemap, /url:\s*`\$\{SITE_ORIGIN\}\/imprensa\/frescor`/)
    assert.doesNotMatch(sitemap, /\/imprensa\/mesa/)
    assert.doesNotMatch(sitemap, /\/colinha/)
  })

  test("deputados/[uf] não declara noindex e usa a mesma fonte de UFs do sitemap", () => {
    const page = read("src/app/(site)/deputados/[uf]/page.tsx")
    assert.doesNotMatch(page, /robots:\s*\{\s*index:\s*false/)
    assert.match(page, /getEstadoUFs\(\)\.map\(\(uf\) => \(\{ uf \}\)\)/)
  })
})
