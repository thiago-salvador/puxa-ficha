import { registerHooks } from "node:module"

const scenario = process.env.PF_FIXTURE_SCENARIO ?? "ok"
const expectedSha = process.env.PF_FIXTURE_SHA ?? ""
const mandatory = [
  "cabo-daciolo",
  "flavio-bolsonaro",
  "hertz-dias",
  "lula",
  "renan-santos",
  "romeu-zema",
  "rui-costa-pimenta",
  "samara-martins",
  "omar-aziz",
  "roberio-paulino",
]
const slugs = [...mandatory, ...Array.from({ length: 184 }, (_, index) => `fixture-${index + 1}`)]
if (scenario === "universe_193") slugs.pop()
let deploymentReads = 0

function profile(slug) {
  const verification = (fonte) => ({
    fonte,
    resultado: "vazio_confirmado",
    executado_em: "2026-08-11T12:00:00.000Z",
    detalhe: "fixture executável",
    url: `https://example.test/${fonte}`,
  })
  const base = {
    id: `id-${slug}`,
    slug,
    total_processos: 0,
    processos: [],
    historico: [],
    pontos_atencao: [],
    sancoes_administrativas: [],
    patrimonio: [],
    patrimonio_eleicoes: [],
    financiamento: [],
    financiamento_eleicoes: [],
    votos: [],
    gastos_parlamentares: [],
    sancoes_verificacao: verification("fixture-sancoes"),
    processos_verificacao: verification("fixture-processos"),
    trajetoria_verificacao: verification("fixture-trajetoria"),
    patrimonio_verificacao: verification("fixture-patrimonio"),
    votacoes_verificacao: verification("fixture-votacoes"),
  }
  if (scenario === "silent_state" && slug === slugs[0]) base.votacoes_verificacao = null
  if (scenario === "process_without_source" && slug === slugs[0]) {
    return {
      ...base,
      total_processos: 1,
      processos: [{ id: "processo-sem-fonte", url_fonte: null }],
    }
  }
  if (
    (scenario === "process_private_source" || scenario === "process_trailing_dot_source") &&
    slug === slugs[0]
  ) {
    return {
      ...base,
      total_processos: 1,
      processos: [
        {
          id: "processo-fonte-invalida",
          candidato_id: base.id,
          numero_processo: "0000000-00.0000.0.00.0000",
          tipo: "civil",
          tribunal: "Fixture",
          descricao: "Fixture",
          status: "em_andamento",
          data_inicio: null,
          data_decisao: null,
          gravidade: null,
          url_fonte:
            scenario === "process_private_source"
              ? "https://127.0.0.1/processo"
              : "https://comunicaapi.pje.jus.br./api/v1/comunicacao?numeroProcesso=99999999999999999999",
        },
      ],
    }
  }
  return base
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (scenario === "redirected_api" && url.pathname.includes("/api/")) {
    if (init.redirect === "error") throw new TypeError("redirect recusado")
  }
  const resposta = (body, options) => {
    const response = Response.json(body, options)
    Object.defineProperty(response, "url", { value: url.toString() })
    return response
  }
  if (url.pathname === "/api/deployment-info") {
    deploymentReads += 1
    return resposta({
      ok: scenario !== "deployment_missing_ok",
      commitSha:
        scenario === "sha_mismatch" || (scenario === "deployment_changed" && deploymentReads > 1)
          ? "f".repeat(40)
          : expectedSha,
      environment: scenario === "preview" ? "preview" : "production",
      commitRef: scenario === "deployment_wrong_ref" ? "preview" : "main",
    })
  }
  if (url.pathname === "/api/candidato-slugs") return resposta({ slugs })
  if (/^\/api\/candidato-profile\/[^/]+\/projetos-lei$/.test(url.pathname)) {
    if (scenario === "legislation_api_failed") {
      return resposta({ data: null, sourceStatus: "degraded" }, { status: 503 })
    }
    if (scenario === "legislation_incomplete") {
      return resposta({ data: { rows: [], total: 1 }, sourceStatus: "live" })
    }
    return resposta({ data: { rows: [], total: 0 }, sourceStatus: "live" })
  }
  if (/^\/api\/candidato-profile\/[^/]+\/legislacao-executivo$/.test(url.pathname)) {
    if (
      [
        "legislation_page2_mismatch",
        "legislation_next_broken",
        "legislation_page2_hidden",
        "legislation_page2_text_mismatch",
        "legislation_page2_href_mismatch",
      ].includes(scenario)
    ) {
      return resposta({
        data: {
          rows: Array.from({ length: 26 }, (_, index) => ({
            id: `lei-${index + 1}`,
            tipo_relacao: "ato_executivo",
            tipo_norma: "Decreto",
            numero: String(index + 1),
            ano: 2026,
          })),
          total: 26,
        },
        sourceStatus: "live",
      })
    }
    return resposta({ data: { rows: [], total: 0 }, sourceStatus: "live" })
  }
  const match = url.pathname.match(/^\/api\/candidato-profile\/(.+)$/)
  if (match) {
    const slug = decodeURIComponent(match[1])
    return resposta(
      { data: profile(slug), sourceStatus: "live" },
      {
        headers: {
          "cache-control": scenario === "cacheable_profile" ? "public, max-age=300" : "no-store",
        },
      },
    )
  }
  throw new Error(`fetch inesperado: ${url}`)
}

class Locator {
  constructor(page, selector, index = 0) {
    this.page = page
    this.selector = selector
    this.index = index
  }

  first() {
    return this
  }

  nth(index) {
    return new Locator(this.page, this.selector, index)
  }

  locator(selector) {
    return new Locator(this.page, `${this.selector} ${selector}`, this.index)
  }

  getByRole(role, options = {}) {
    return new Locator(
      this.page,
      `${this.selector} >> role=${role}[name="${options.name ?? ""}"]`,
      this.index,
    )
  }

  legislationListKey() {
    if (this.selector.includes('data-pf-legislation-content="executivo"')) return "executivo"
    return "todas"
  }

  async count() {
    if (this.selector.endsWith(" [data-pf-legislation-list-kind]")) {
      return /data-pf-legislation-content="(?:todas|executivo)"/.test(this.selector) &&
        [
          "legislation_page2_mismatch",
          "legislation_next_broken",
          "legislation_page2_hidden",
          "legislation_page2_text_mismatch",
          "legislation_page2_href_mismatch",
        ].includes(scenario)
        ? 1
        : 0
    }
    if (/^\[data-pf-(?:ponto|sancao|processo|mandato|patrimonio|votacao)-destaque\]$/.test(this.selector)) {
      return 0
    }
    return 1
  }

  async innerText() {
    if (this.selector.endsWith(" [data-pf-legislation-list-kind]")) {
      const page = this.page.legislationPages?.[this.legislationListKey()] ?? 1
      if (
        this.page.viewportName !== "expected" &&
        page === 2 &&
        ["legislation_page2_hidden", "legislation_page2_text_mismatch"].includes(scenario)
      ) {
        return "conteúdo público adulterado na página 2"
      }
      return `lista ${this.legislationListKey()} página ${page}`
    }
    if (/^\[data-pf-legislation-content=".+"\]$/.test(this.selector)) {
      if (
        this.page.viewportName !== "expected" &&
        scenario === "legislation_subtab_mismatch" &&
        this.page.slug === slugs[0] &&
        this.selector === '[data-pf-legislation-content="todas"]'
      ) {
        return "subaba pública adulterada"
      }
      return `conteúdo esperado ${this.selector}`
    }
    if (
      this.selector === "[data-pf-destaques-conteudo]" ||
      /^#profile-panel-(?:geral|dinheiro|justica|trajetoria|timeline|votos|legislacao)$/.test(this.selector)
    ) {
      if (
        this.page.viewportName !== "expected" &&
        this.page.slug === slugs[0] &&
        ((scenario === "timeline_content_mismatch" && this.selector === "#profile-panel-timeline") ||
          (scenario === "votes_content_mismatch" && this.selector === "#profile-panel-votos") ||
          (scenario === "legislation_content_mismatch" && this.selector === "#profile-panel-legislacao"))
      ) {
        return `conteúdo público adulterado ${this.selector}`
      }
      if (
        this.page.viewportName !== "expected" &&
        scenario === "justice_content_mismatch" &&
        this.page.slug === slugs[0] &&
        this.selector === "#profile-panel-justica"
      ) {
        return "justiça pública adulterada"
      }
      if (
        this.page.viewportName !== "expected" &&
        scenario === "dom_content_mismatch" &&
        this.page.slug === slugs[0] &&
        this.selector === "[data-pf-destaques-conteudo]"
      ) {
        return "conteúdo público adulterado"
      }
      if (
        this.page.viewportName !== "expected" &&
        scenario === "money_content_mismatch" &&
        this.page.slug === slugs[0] &&
        this.selector === "#profile-panel-dinheiro"
      ) {
        return "dinheiro público adulterado"
      }
      if (
        this.page.viewportName !== "expected" &&
        scenario === "trajectory_content_mismatch" &&
        this.page.slug === slugs[0] &&
        this.selector === "#profile-panel-trajetoria"
      ) {
        return "trajetória pública adulterada"
      }
      return `conteúdo esperado ${this.selector}`
    }
    return ""
  }

  async waitFor() {}

  async click() {
    if (this.selector.includes('>> role=button[name="Próxima"]')) {
      if (scenario !== "legislation_next_broken") {
        this.page.legislationPages ??= {}
        this.page.legislationPages[this.legislationListKey()] = 2
      }
      return
    }
    const match = this.selector.match(/^#profile-tab-(.+)$/)
    if (match && this.page.viewportName !== "expected") {
      const url = new URL(this.page.currentUrl)
      url.searchParams.set("tab", match[1])
      this.page.currentUrl = url.toString()
    }
  }

  async getAttribute(name) {
    if (
      /data-pf-legislation-content="(?:todas|executivo)"/.test(this.selector) &&
      this.selector.endsWith(" [data-pf-legislation-list-kind]") &&
      [
        "legislation_page2_mismatch",
        "legislation_next_broken",
        "legislation_page2_hidden",
        "legislation_page2_text_mismatch",
        "legislation_page2_href_mismatch",
      ].includes(scenario)
    ) {
      if (name === "data-pf-legislation-list-kind") return "executivo"
      if (name === "data-pf-legislation-total") return "26"
      if (name === "data-pf-legislation-page-size") return "25"
      if (name === "data-pf-legislation-current-page") {
        return String(this.page.legislationPages?.[this.legislationListKey()] ?? 1)
      }
    }
    if (this.selector === "[data-pf-overview-processos]" && name === "data-pf-overview-raw") {
      return scenario === "process_without_source" && this.page.slug === slugs[0] ? "1" : "0"
    }
    if (this.selector === "[data-pf-trajetoria-count]" && name === "data-pf-trajetoria-count") {
      return scenario === "extra_trajectory" && this.page.slug === slugs[0] ? "1" : "0"
    }
    if (this.selector === "[data-pf-partidos-count]" && name === "data-pf-partidos-count") {
      return "0"
    }
    return null
  }

  async evaluateAll() {
    if (this.selector.endsWith(" [data-pf-legislation-list-kind]")) return []
    if (this.selector.endsWith("[data-pf-legislation-card-proof]")) {
      const page = this.page.legislationPages?.[this.legislationListKey()] ?? 1
      const proof = (index) =>
        JSON.stringify({
          id: `lei-${index}`,
          tipo_relacao: "ato_executivo",
          tipo_norma: "Decreto",
          numero: String(index),
          ano: 2026,
        })
      if (page === 1) return Array.from({ length: 25 }, (_, index) => proof(index + 1))
      return [scenario === "legislation_page2_mismatch" ? "proof-adulterada" : proof(26)]
    }
    if (this.selector.endsWith("[data-pf-legislation-list-kind] a[href]")) {
      const page = this.page.legislationPages?.[this.legislationListKey()] ?? 1
      if (
        this.page.viewportName !== "expected" &&
        page === 2 &&
        scenario === "legislation_page2_href_mismatch"
      ) {
        return ["https://fonte-incorreta.example/pagina-2"]
      }
      return [`https://example.test/${this.legislationListKey()}/${page}`]
    }
    if (this.selector.endsWith(" a[href]")) {
      if (
        this.page.viewportName !== "expected" &&
        scenario === "href_mismatch" &&
        this.page.slug === slugs[0] &&
        this.selector.startsWith("[data-pf-destaques-conteudo]")
      ) {
        return ["https://fonte-incorreta.example/"]
      }
      return []
    }
    if (/^\[data-pf-(?:ponto|sancao|processo|mandato|patrimonio|votacao)-destaque\]$/.test(this.selector)) {
      return []
    }
    if (this.selector === "[data-pf-money-card]") {
      return {
        total: 0,
        cards: 0,
        ocultos: 0,
        overflow: scenario === "dom_defect" && this.page.slug === slugs[0] ? 1 : 0,
        fora: 0,
        sobreposicoes: 0,
        viewportOverflow: false,
      }
    }
    if (this.selector === '[data-pf-timeline-ref^="processo-"]') {
      return scenario === "process_without_source" && this.page.slug === slugs[0]
        ? ["processo-sem-fonte"]
        : []
    }
    if (this.selector === '[data-pf-timeline-ref^="cargo-"]') {
      return scenario === "extra_trajectory" && this.page.slug === slugs[0] ? ["cargo-extra"] : []
    }
    if (this.selector === "[data-pf-destaque-fonte]") {
      const states = ["patrimonio", "processos", "sancoes", "trajetoria", "votacoes"].map((chave) => ({
        chave,
        estado: "vazio_confirmado",
        proveniencia: `fixture-${chave}`,
      }))
      if (scenario === "missing_highlight_cell" && this.page.slug === slugs[0]) states.pop()
      if (scenario === "silent_state" && this.page.slug === slugs[0]) {
        states[4] = { chave: "votacoes", estado: "nunca_verificado", proveniencia: "" }
      }
      highlightCells[this.page.viewportName] += states.length
      return states
    }
    if (this.selector.includes('data-pf-timeline-ref="processo-')) return []
    throw new Error(`evaluateAll inesperado: ${this.selector}`)
  }
}

class Page {
  constructor(viewportName) {
    this.viewportName = viewportName
  }

  async goto(url) {
    this.currentUrl = scenario === "redirected_dom" ? "https://preview.example.test/redirecionado" : url
    const partes = new URL(url).pathname.split("/").filter(Boolean)
    this.slug = decodeURIComponent(partes.at(-1) === "timeline" ? partes.at(-2) : partes.at(-1))
    return { ok: () => true, status: () => 200, url: () => this.currentUrl }
  }

  url() {
    if (scenario === "delayed_redirect_dom") {
      this.urlReads = (this.urlReads ?? 0) + 1
      if (this.urlReads > 1) return "https://preview.example.test/redirecionado-tardio"
    }
    return this.currentUrl
  }

  async setContent(html) {
    if (typeof html !== "string") return
    const page = Number(html.match(/data-pf-legislation-current-page="(\d+)"/)?.[1] ?? 1)
    const key = html.includes('data-pf-legislation-content="executivo"') ? "executivo" : "todas"
    this.legislationPages ??= {}
    this.legislationPages[key] = page
  }

  locator(selector) {
    return new Locator(this, selector)
  }

  async evaluate() {}

  async waitForFunction() {}

  async close() {}
}

const viewports = []
const highlightCells = { desktop: 0, mobile: 0 }
globalThis.__PF_CHROMIUM = {
  async launch() {
    return {
      async newPage(options = {}) {
        const { viewport } = options
        if (!viewport) return new Page("expected")
        viewports.push(viewport)
        return new Page(viewport.width === 390 ? "mobile" : "desktop")
      },
      async close() {
        if (viewports.length === 0) return
        const measured = viewports.map(({ width, height }) => `${width}x${height}`).sort()
        const expected = ["1440x900", "390x844"].sort()
        if (JSON.stringify(measured) !== JSON.stringify(expected)) {
          throw new Error(`viewports divergentes: ${measured.join(",")}`)
        }
        for (const viewportName of ["desktop", "mobile"]) {
          if (highlightCells[viewportName] !== 970) {
            throw new Error(`células ${viewportName}: ${highlightCells[viewportName]}/970`)
          }
        }
      },
    }
  },
}

globalThis.__PF_SUPABASE = {
  from(table) {
    if (table !== "candidatos_publico") throw new Error(`tabela inesperada: ${table}`)
    const chain = {
      select() {
        return chain
      },
      order() {
        return chain
      },
      async range(from, to) {
        return {
          data: slugs.slice(from, to + 1).map((slug) => ({ id: `id-${slug}`, slug })),
          error: null,
        }
      },
    }
    return chain
  },
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "playwright") {
      return { shortCircuit: true, url: "pf-fixture:playwright" }
    }
    if (specifier === "../lib/supabase") {
      return { shortCircuit: true, url: "pf-fixture:supabase" }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url === "pf-fixture:playwright") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export const chromium = globalThis.__PF_CHROMIUM",
      }
    }
    if (url === "pf-fixture:supabase") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export const supabase = globalThis.__PF_SUPABASE",
      }
    }
    return nextLoad(url, context)
  },
})
