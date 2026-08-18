import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

function read(relativePath: string): string {
  return readFileSync(relativePath, "utf8")
}

describe("página /parlamentares", () => {
  test("a rota pública existe com loading e metadata canônica", () => {
    const page = read("src/app/(site)/parlamentares/page.tsx")
    const loading = read("src/app/(site)/parlamentares/loading.tsx")

    assert.match(page, /canonical:\s*"\/parlamentares"/)
    assert.match(page, /url:\s*"https:\/\/puxaficha\.com\.br\/parlamentares"/)
    assert.match(page, /buildTwitterMetadata/)
    assert.match(page, /src="\/images\/sobre-congresso\.webp"/)
    assert.match(loading, /eyebrow="Parlamentares"/)
  })

  test("o texto editorial cita a Agência Senado, os totais e o APOIA.se", () => {
    const page = read("src/app/(site)/parlamentares/page.tsx")

    assert.match(page, /Fonte: Agência Senado/)
    assert.match(page, /19\.031 registros de candidatura/)
    assert.match(page, /11\.090/)
    assert.match(page, /7\.627/)
    assert.match(page, /314/)
    assert.match(page, /https:\/\/apoia\.se\/puxaficha/)
    assert.match(page, /target="_blank"/)
    assert.match(page, /rel="noopener noreferrer"/)
    assert.doesNotMatch(page, /getCandidatosResource|from "@\/lib\/api"/)
  })

  test("Navbar e Footer expõem /parlamentares depois de Governadores", () => {
    const navbar = read("src/components/Navbar.tsx")
    const footer = read("src/components/Footer.tsx")

    assert.match(
      navbar,
      /href: "\/governadores", label: "Governadores" \},\s*\{ href: "\/parlamentares", label: "Parlamentares"/,
    )
    assert.match(
      footer,
      /href: "\/governadores", label: "Governadores" \},\s*\{ href: "\/parlamentares", label: "Parlamentares"/,
    )
  })

  test("sitemap, cache público e busca rápida incluem a rota", () => {
    const sitemap = read("src/app/sitemap.ts")
    const cache = read("scripts/aquecer-cache-publico.ts")
    const search = read("src/components/GlobalSearchProvider.tsx")

    assert.match(sitemap, /https:\/\/puxaficha\.com\.br\/parlamentares/)
    assert.match(cache, /"\/parlamentares"/)
    assert.match(search, /href: "\/parlamentares"/)
    assert.match(search, /Fichas de deputados e senadores ainda não estão prontas/)
  })
})
