import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, it } from "node:test"
import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { isHTTPAccessFallbackError, getAccessFallbackHTTPStatus } from "next/dist/client/components/http-access-fallback/http-access-fallback"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { getRedirectStatusCodeFromError, getURLFromRedirectError } from "next/dist/client/components/redirect"
import type { Metadata } from "next"
import { buildTwitterMetadata } from "@/lib/metadata"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
// CSS modules importados pelas páginas viram mapa identidade de classes.
;(require.extensions as unknown as Record<string, (module: { exports: unknown }) => void>)[".css"] = (module) => {
  module.exports = new Proxy({}, { get: (_target, key) => String(key) })
}

// @/lib/api fala com o banco. As páginas recebem um stub que registra o cargo
// consultado; UF e nomes de estado continuam vindo do módulo real.
const apiCalls: string[] = []
const brUf = require("../src/lib/br-uf") as typeof import("../src/lib/br-uf")
const apiPath = require.resolve("../src/lib/api")
require.cache[apiPath] = {
  id: apiPath,
  filename: apiPath,
  loaded: true,
  exports: {
    getEstadoNome: brUf.getEstadoNome,
    getEstadoUFs: brUf.getEstadoUFs,
    async getIndicadoresAllEstadosResource() {
      apiCalls.push("indicadores")
      return { data: [], sourceStatus: "live" }
    },
    async getCandidatoCountByEstadoResource(cargo: string) {
      apiCalls.push(`contagem:${cargo}`)
      return { data: { SP: 2, RJ: 1 }, sourceStatus: "live" }
    },
    async getCandidatosResource(cargo?: string) {
      apiCalls.push(`candidatos:${cargo}`)
      return { data: [{ estado: "SP" }, { estado: "SP" }, { estado: "RJ" }], sourceStatus: "live" }
    },
  },
} as never

const parlamentares = require("../src/app/(site)/parlamentares/page") as {
  default: () => Promise<ReactElement>
  generateMetadata?: () => Metadata | Promise<Metadata>
  metadata?: Metadata
}
const senadoUf = require("../src/app/(site)/uf/[uf]/senado/page") as {
  default: (props: { params: Promise<{ uf: string }> }) => Promise<ReactElement>
}
const { PublicDataSourcesNote } = require("../src/components/PublicDataSourcesNote") as typeof import("../src/components/PublicDataSourcesNote")
const { buildShortcutItems, GlobalSearchProvider } = require("../src/components/GlobalSearchProvider") as typeof import("../src/components/GlobalSearchProvider")
const siteLayout = require("../src/app/(site)/layout") as {
  default: (props: { children: ReactElement | null }) => ReactElement | Promise<ReactElement>
}

/** Percorre a árvore de elementos devolvida pelo layout sem renderizar clientes. */
function findElementByType(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByType(child, type)
      if (found) return found
    }
    return null
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null
  const element = node as ReactElement<Record<string, unknown>>
  if (element.type === type) return element
  return findElementByType(element.props.children, type)
}

const env = process.env as Record<string, string | undefined>
let savedFlag: string | undefined

function setFlag(enabled: boolean) {
  if (enabled) env.SENADO_ENABLED = "true"
  else delete env.SENADO_ENABLED
}

const router = {
  back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {},
}

async function renderParlamentares(): Promise<string> {
  const element = await parlamentares.default()
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={router as never}>{element}</AppRouterContext.Provider>,
  )
}

async function parlamentaresMetadata(): Promise<Metadata> {
  if (typeof parlamentares.generateMetadata === "function") return parlamentares.generateMetadata()
  return parlamentares.metadata ?? {}
}

function jsonLd(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  assert.ok(match, "JSON-LD ausente")
  return JSON.parse(match[1]) as Record<string, unknown>
}

async function captureNavigation(uf: string): Promise<{ status: number; location?: string }> {
  try {
    await senadoUf.default({ params: Promise.resolve({ uf }) })
  } catch (error) {
    if (isRedirectError(error)) {
      return { status: getRedirectStatusCodeFromError(error), location: getURLFromRedirectError(error) }
    }
    if (isHTTPAccessFallbackError(error)) return { status: getAccessFallbackHTTPStatus(error) }
    throw error
  }
  return { status: 200 }
}

describe("flag do Senado nas superfícies públicas restantes", () => {
  beforeEach(() => {
    savedFlag = env.SENADO_ENABLED
    apiCalls.length = 0
  })

  afterEach(() => {
    if (savedFlag === undefined) delete env.SENADO_ENABLED
    else env.SENADO_ENABLED = savedFlag
  })

  describe("/parlamentares", () => {
    it("com a flag desligada não renderiza mapa nem links /uf/xx/senado e não consulta senadores", async () => {
      setFlag(false)
      const html = await renderParlamentares()
      assert.doesNotMatch(html, /\/uf\/[a-z]{2}\/senado/)
      assert.doesNotMatch(html, /id="diretorio-estados"/)
      assert.match(html, /A cobertura de senadores está em preparação/)
      assert.match(html, /href="\/parlamentares\/deputados"/)
      assert.equal(apiCalls.includes("contagem:Senador"), false)
      assert.equal(apiCalls.includes("candidatos:Senador"), false)
    })

    it("com a flag ligada renderiza o mapa com links /uf/xx/senado", async () => {
      setFlag(true)
      const html = await renderParlamentares()
      assert.match(html, /href="\/uf\/sp\/senado"/)
      assert.match(html, /href="\/uf\/rj\/senado"/)
      assert.doesNotMatch(html, /A cobertura de senadores está em preparação/)
      assert.ok(apiCalls.includes("contagem:Senador"))
      assert.equal(apiCalls.includes("candidatos:Senador"), false)
    })

    it("metadata e JSON-LD não anunciam Senado com a flag desligada", async () => {
      setFlag(false)
      const metadata = await parlamentaresMetadata()
      const serialized = JSON.stringify(metadata)
      assert.doesNotMatch(serialized, /senado|senador/i)
      assert.equal(metadata.alternates?.canonical, "/parlamentares")

      const ld = jsonLd(await renderParlamentares())
      assert.doesNotMatch(JSON.stringify(ld), /senado|senador/i)
      assert.equal(ld.url, "https://puxaficha.com.br/parlamentares")
    })

    it("metadata e JSON-LD anunciam Senado por estado com a flag ligada", async () => {
      setFlag(true)
      const metadata = await parlamentaresMetadata()
      assert.match(String(metadata.description), /Senado/)
      assert.equal(metadata.alternates?.canonical, "/parlamentares")
      const ld = jsonLd(await renderParlamentares())
      assert.equal(ld.name, "Senadores por estado")
      assert.match(String(ld.description), /Senado/)
    })
    for (const enabled of [false, true]) {
      it(`metadata completa (canonical, openGraph e twitter) com a flag ${enabled ? "ligada" : "desligada"}`, async () => {
        setFlag(enabled)
        const metadata = await parlamentaresMetadata()
        const description = String(metadata.description)
        assert.equal(metadata.title, "Parlamentares | Puxa Ficha")
        assert.equal(metadata.alternates?.canonical, "/parlamentares")
        const openGraph = metadata.openGraph as { url?: unknown; description?: unknown; images?: unknown }
        assert.equal(openGraph.url, "https://puxaficha.com.br/parlamentares")
        assert.equal(openGraph.description, description)
        assert.deepEqual(openGraph.images, [
          { url: "/opengraph-image", width: 1200, height: 630, alt: "Parlamentares | Puxa Ficha" },
        ])
        assert.deepEqual(
          metadata.twitter,
          buildTwitterMetadata({ title: "Parlamentares | Puxa Ficha", description, image: "/opengraph-image" }),
        )
      })

      it(`hero, aba de Deputados e ausência da copy antiga com a flag ${enabled ? "ligada" : "desligada"}`, async () => {
        setFlag(enabled)
        const html = await renderParlamentares()
        assert.match(html, /sobre-congresso\.webp/)
        assert.match(html, /href="\/parlamentares\/deputados"/)
        assert.match(html, />Senadores</)
        assert.match(html, />Deputados</)
        assert.doesNotMatch(html, /Escolha o que você quer consultar|01 Parlamentares/)
      })
    }
  })

  describe("PublicDataSourcesNote", () => {
    it("variant parlamentares só cita candidatos a senador com a flag ligada", () => {
      setFlag(false)
      const off = renderToStaticMarkup(<PublicDataSourcesNote variant="parlamentares" />)
      assert.doesNotMatch(off, /senador/i)
      assert.match(off, /href="\/metodologia"/)

      setFlag(true)
      const on = renderToStaticMarkup(<PublicDataSourcesNote variant="parlamentares" />)
      assert.match(on, /Candidatos a senador: TSE/)
      assert.match(on, /href="\/metodologia"/)
    })
  })

  describe("busca rápida", () => {
    it("atalho de Parlamentares reflete a flag", () => {
      const off = buildShortcutItems(false).find((item) => item.href === "/parlamentares")
      assert.equal(off?.subtitle, "Fichas de deputados e senadores ainda não estão prontas")
      const on = buildShortcutItems(true).find((item) => item.href === "/parlamentares")
      assert.equal(on?.subtitle, "Fichas de deputados ainda não estão prontas")
      assert.match(on?.searchText ?? "", /deputados/)
      assert.doesNotMatch(on?.subtitle ?? "", /senadores/)
    })
  })

  describe("layout do site", () => {
    // O layout (src/app/(site)/layout.tsx) é quem entrega a flag ao provider de
    // busca, que roda no cliente e não lê SENADO_ENABLED.
    for (const enabled of [false, true]) {
      it(`entrega a flag ${enabled ? "ligada" : "desligada"} ao GlobalSearchProvider`, async () => {
        setFlag(enabled)
        const tree = await siteLayout.default({ children: null })
        const provider = findElementByType(tree, GlobalSearchProvider)
        assert.ok(provider, "GlobalSearchProvider ausente no layout")
        assert.equal(provider.props.senadoEnabled, enabled)
      })
    }
  })

  describe("/uf/[uf]/senado", () => {
    it("responde notFound com a flag desligada, mesmo para UF válida", async () => {
      setFlag(false)
      assert.deepEqual(await captureNavigation("sp"), { status: 404 })
      assert.deepEqual(await captureNavigation("SP"), { status: 404 })
    })

    it("responde notFound para UF inválida com a flag ligada", async () => {
      setFlag(true)
      assert.deepEqual(await captureNavigation("zz"), { status: 404 })
      assert.deepEqual(await captureNavigation("s"), { status: 404 })
    })

    it("redireciona permanentemente caixa alta para a URL canônica em minúsculas", async () => {
      setFlag(true)
      assert.deepEqual(await captureNavigation("SP"), { status: 308, location: "/uf/sp/senado" })
      assert.deepEqual(await captureNavigation("Rj"), { status: 308, location: "/uf/rj/senado" })
      assert.equal(apiCalls.length, 0)
    })
  })
})
