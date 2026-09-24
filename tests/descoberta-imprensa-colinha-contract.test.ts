import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { getEstadoUFs } from "@/lib/br-uf"

function read(relativePath: string): string {
  return readFileSync(relativePath, "utf8")
}

// /imprensa (Mesa de apuração) e /colinha declaram `robots: { index: false }`
// no próprio metadata (ver docs/imprensa.md: "página é pública por link") e por
// isso ficam fora do sitemap por design — não é um esquecimento. A colinha
// segue no menu e no rodapé porque tem OG/Twitter completos e recursos de
// compartilhamento (WhatsApp, imagem, impressão), sinal de que é feita para
// ser descoberta; só o índice de busca que ela dispensa.
describe("descoberta de /colinha e /deputados/[uf]", () => {
  test("Navbar oferece Colinha e não expõe a Mesa de apuração", () => {
    const navbar = read("src/components/Navbar.tsx")
    assert.match(navbar, /\{ href: "\/colinha", label: "Colinha" \}/)
    assert.doesNotMatch(navbar, /href: "\/imprensa"/)
  })

  test("Footer oferece Colinha e não expõe a Mesa de apuração", () => {
    const footer = read("src/components/Footer.tsx")
    assert.match(footer, /\{ href: "\/colinha", label: "Colinha" \}/)
    assert.doesNotMatch(footer, /href: "\/imprensa"/)
  })

  test("imprensa e colinha declaram noindex no próprio metadata", () => {
    const imprensa = read("src/app/(site)/imprensa/page.tsx")
    const atualizacoes = read("src/app/(site)/imprensa/atualizacoes/page.tsx")
    const frescor = read("src/app/(site)/imprensa/frescor/page.tsx")
    const colinha = read("src/app/(site)/colinha/page.tsx")

    for (const source of [imprensa, atualizacoes, frescor, colinha]) {
      assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/)
    }
  })

  test("sitemap inclui /deputados/{uf} para toda UF válida e não inclui imprensa nem colinha", () => {
    const sitemap = read("src/app/sitemap.ts")
    const ufs = getEstadoUFs()

    assert.ok(ufs.length >= 26, "getEstadoUFs deveria cobrir as 27 unidades federativas")
    assert.match(sitemap, /deputadosUrls[\s\S]*url:\s*`\$\{SITE_ORIGIN\}\/deputados\/\$\{uf\}`/)
    assert.match(sitemap, /\.\.\.deputadosUrls/)
    assert.doesNotMatch(sitemap, /\/imprensa/)
    assert.doesNotMatch(sitemap, /\/colinha/)
  })

  test("deputados/[uf] não declara noindex e usa a mesma fonte de UFs do sitemap", () => {
    const page = read("src/app/(site)/deputados/[uf]/page.tsx")
    assert.doesNotMatch(page, /robots:\s*\{\s*index:\s*false/)
    assert.match(page, /getEstadoUFs\(\)\.map\(\(uf\) => \(\{ uf \}\)\)/)
  })
})
