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

  test("Navbar abre com 2º Turno e 1º Turno, sem Governadores, Comparar e Listas; Footer mantém Governadores; nenhum tem /2o-turno nem Parlamentares", () => {
    const navbar = read("src/components/Navbar.tsx")
    const footer = read("src/components/Footer.tsx")

    // Navbar enxuto (pedido de 05/10): 2º Turno, 1º Turno e direto Doadores; sem Governadores, Comparar e Listas.
    assert.match(navbar, /href: "\/", label: "2º Turno" \},\s*\{ href: "\/1o-turno", label: "1º Turno" \},\s*\{ href: "\/doadores", label: "Doadores" \}/)
    assert.doesNotMatch(navbar, /\/governadores|\/comparar"|\/rankings/)
    assert.match(footer, /href: "\/", label: "2º Turno" \},\s*\{ href: "\/1o-turno", label: "1º Turno" \},\s*\{ href: "\/governadores", label: "Governadores" \}/)
    for (const source of [navbar, footer]) {
      assert.doesNotMatch(source, /\/parlamentares/)
      assert.doesNotMatch(source, /\/2o-turno/)
    }
  })

  test("sitemap e cache público mantêm a rota; a busca rápida não a oferece mais", () => {
    const sitemap = read("src/app/sitemap.ts")
    const cache = read("scripts/aquecer-cache-publico.ts")
    const search = read("src/components/GlobalSearchProvider.tsx")

    assert.match(sitemap, /\$\{SITE_ORIGIN\}\/parlamentares/)
    assert.match(cache, /"\/parlamentares"/)
    // /1o-turno entra (arquivo do 1º turno); /2o-turno só redireciona para a home e sai; as UFs ficam.
    assert.match(sitemap, /\$\{SITE_ORIGIN\}\/1o-turno`/)
    assert.doesNotMatch(sitemap, /\$\{SITE_ORIGIN\}\/2o-turno/)
    assert.match(sitemap, /\$\{SITE_ORIGIN\}\/1o-turno\/\$\{uf\}/)
    assert.match(cache, /"\/1o-turno"/)
    assert.doesNotMatch(cache, /"\/2o-turno"/)
    assert.doesNotMatch(search, /href: "\/parlamentares"/)
    assert.match(search, /href: "\/",\s*title: "2º Turno"/)
    assert.match(search, /href: "\/1o-turno",\s*title: "1º Turno"/)
    assert.doesNotMatch(search, /\/2o-turno/)
  })

  test("busca rápida abre com Home (/) e 1º Turno no lugar de /parlamentares, com ou sem a flag do Senado", () => {
    for (const flag of [false, true]) {
      const items = buildShortcutItems(flag)
      assert.equal(items.find((item) => item.href === "/parlamentares"), undefined)
      assert.deepEqual(items.slice(0, 2).map((item) => [item.href, item.title]), [["/", "2º Turno"], ["/1o-turno", "1º Turno"]])
      assert.equal(items.find((item) => item.href === "/2o-turno"), undefined)
    }
  })
})
