import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { buildShortcutItems } from "@/components/GlobalSearchProvider"

function read(relativePath: string): string {
  return readFileSync(relativePath, "utf8")
}

// Comportamento da página /parlamentares por flag (mapa, links /uf/xx/senado,
// metadata completa, JSON-LD, hero, nota de fontes e atalho da busca) é exercitado
// renderizando e executando o código real em tests/senado-flag-parlamentares.test.tsx;
// o guard do middleware, em tests/senado-flag-middleware.test.ts. Os contratos de
// arquivo abaixo continuam como rede de segurança barata.
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

  test("a rota abre em Senadores atrás da flag, com mapa por UF, e oferece Deputados", () => {
    const page = read("src/app/(site)/parlamentares/page.tsx")
    const map = read("src/components/BrazilMap.tsx")
    const statePreference = read("src/components/StatePreference.tsx")

    assert.match(page, /href="\/parlamentares\/deputados"/)
    assert.match(page, /Senadores/)
    assert.match(page, /Deputados/)
    assert.match(page, /isSenadoEnabled/)
    // O mapa só precisa da contagem por UF: loader enxuto, não a lista completa
    // (que passava de 2 MB e não entrava no Data Cache).
    assert.match(page, /getCandidatoCountByEstadoResource\("Senador"\)/)
    assert.doesNotMatch(page, /getCandidatosResource\(/)
    assert.match(page, /BrazilMap/)
    assert.match(page, /stateRouteSuffix="\/senado"/)
    assert.match(page, /candidateOfficeLabel="senador"/)
    assert.match(page, /variant="parlamentares"/)
    assert.match(map, /StatePreference stateRouteSuffix=\{stateRouteSuffix\}/)
    assert.match(statePreference, /stateRouteSuffix = ""/)
    assert.match(statePreference, /\$\{state\.sigla\.toLowerCase\(\)\}\$\{stateRouteSuffix\}/)
    assert.doesNotMatch(page, /Escolha o que você quer consultar|01 Parlamentares/)
  })

  test("a subpágina de Deputados mantém os números com fonte e não cita senador", () => {
    const deputados = read("src/app/(site)/parlamentares/deputados/page.tsx")

    assert.match(deputados, /canonical:\s*"\/parlamentares\/deputados"/)
    assert.match(deputados, /Fonte: Agência Senado/)
    assert.match(deputados, /18\.717 registros de candidatura/)
    assert.match(deputados, /11\.090/)
    assert.match(deputados, /7\.627/)
    assert.doesNotMatch(deputados, /19\.031|314|senador/i)
    assert.match(deputados, /https:\/\/apoia\.se\/puxaficha/)
    assert.match(deputados, /target="_blank"/)
    assert.match(deputados, /rel="noopener noreferrer"/)
    assert.doesNotMatch(deputados, /getCandidatosResource|from "@\/lib\/api"/)
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

    assert.match(sitemap, /\$\{SITE_ORIGIN\}\/parlamentares/)
    assert.match(cache, /"\/parlamentares"/)
    assert.match(search, /href: "\/parlamentares"/)
  })

  test("busca rápida oferece /parlamentares com texto que segue a flag do Senado", () => {
    const off = buildShortcutItems(false).find((item) => item.href === "/parlamentares")
    const on = buildShortcutItems(true).find((item) => item.href === "/parlamentares")

    assert.equal(off?.title, "Parlamentares")
    assert.equal(off?.subtitle, "Fichas de deputados e senadores ainda não estão prontas")
    assert.equal(on?.subtitle, "Fichas de deputados ainda não estão prontas")
  })
})
