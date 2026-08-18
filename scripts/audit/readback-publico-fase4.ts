/**
 * Readback publico final da PF Ajustes (itens 1 a 17).
 *
 * Mede o deployment real, a API publica e o DOM servido das 194 fichas em
 * desktop e mobile. O banco continua coberto pelos readbacks SQL e pelos
 * auditores de dominio chamados pelo runner `readback-publico-fase4.sh`.
 *
 * Uso:
 *   PF_DRY_RUN=1 npx tsx scripts/audit/readback-publico-fase4.ts \
 *     --public-url=https://puxaficha.com.br --expected-sha=<sha> \
 *     --json=output/readback-publico-fase4.json
 */
import { writeFileSync } from "node:fs"
import { isIP } from "node:net"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { chromium, type Locator, type Page } from "playwright"
import { CandidatoProfile } from "../../src/components/CandidatoProfile"
import type { LegislationSubtabId } from "../../src/components/CandidatoProfileSections"
import { montarDestaquesDaFicha, type DestaquesDaFicha } from "../../src/lib/destaques-ficha"
import type { FinanciamentoEleicaoPublico } from "../../src/lib/financiamento-eleicoes"
import { groupLegislacaoProfileItems } from "../../src/lib/legislacao-profile-groups"
import { agruparProposicoesPorEmenta } from "../../src/lib/proposicao-dedupe"
import type { PatrimonioEleicaoPublico } from "../../src/lib/public-profile-dto"
import { assinaturaConteudoDestaques } from "./lib/destaques-proof"
import { assinaturasSuperficie } from "./lib/surface-proof"
import type {
  FichaCandidato,
  HistoricoPolitico,
  LegislacaoMandatoExecutivo,
  PontoAtencao,
  Processo,
  ProjetoLei,
  SancaoAdministrativa,
  SancoesVerificacao,
  VotoCandidato,
} from "../../src/lib/types"

const UNIVERSO_ESPERADO = 194
const PUBLIC_URL_CANONICA = "https://puxaficha.com.br"
const FETCH_TIMEOUT_MS = 20_000
const CASOS_OBRIGATORIOS = [
  "cabo-daciolo",
  "flavio-bolsonaro",
  "hertz-dias",
  "lula",
  "renan-santos",
  "romeu-zema",
  "rui-costa-pimenta",
  "samara-martins",
] as const
const AMOSTRA_ADVERSARIAL = ["omar-aziz", "roberio-paulino"] as const
const ESTADOS_SILENCIOSOS = new Set(["nunca_verificado", "nao_coletado"])
const LEGISLACAO_SUBABAS = [
  "destaques",
  "todas",
  "propostas",
  "votadas",
  "aprovadas",
  "executivo",
] as const satisfies readonly LegislationSubtabId[]

type Perfil = {
  id: string
  slug: string
  cargo_disputado?: string | null
  total_processos?: number | null
  processos?: Processo[]
  historico?: HistoricoPolitico[]
  pontos_atencao?: PontoAtencao[]
  sancoes_administrativas?: SancaoAdministrativa[]
  patrimonio?: Array<{ id?: string; ano_eleicao: number; valor_total: number }>
  patrimonio_eleicoes?: PatrimonioEleicaoPublico[]
  financiamento?: Array<{ id: string }>
  financiamento_eleicoes?: FinanciamentoEleicaoPublico[]
  votos?: VotoCandidato[]
  gastos_parlamentares?: Array<{ id: string }>
  projetos_lei?: ProjetoLei[]
  projetos_lei_total?: number
  projetos_lei_truncados?: boolean
  legislacao_mandato_executivo?: LegislacaoMandatoExecutivo[]
  legislacao_mandato_executivo_total?: number
  legislacao_mandato_executivo_truncados?: boolean
  sancoes_verificacao?: SancoesVerificacao | null
  processos_verificacao?: SancoesVerificacao | null
  trajetoria_verificacao?: SancoesVerificacao | null
  patrimonio_verificacao?: SancoesVerificacao | null
  votacoes_verificacao?: SancoesVerificacao | null
}

type Defeito = {
  slug: string
  viewport: "desktop" | "mobile"
  frente: "http" | "api" | "dinheiro" | "judicial" | "destaques" | "classificacao"
  detalhe: string
}

type LegislacaoListaEsperada = {
  kind: "executivo" | "projetos"
  total: number
  pageSize: number
  proofs: string[]
  paginas: PainelEsperado[]
}
type PainelEsperado = {
  texto: string
  hrefs: string[]
  listasLegislacao?: LegislacaoListaEsperada[]
}
type PaineisEsperados = {
  geral: PainelEsperado
  dinheiro: PainelEsperado
  justica: PainelEsperado
  trajetoria: PainelEsperado
  timeline: PainelEsperado
  votos: PainelEsperado
  legislacao: PainelEsperado
  alertas: PainelEsperado
}
type LegislacaoSubabasEsperadas = Record<LegislationSubtabId, PainelEsperado | null>

function arg(nome: string): string | null {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

function normalizarUrl(valor: string): string {
  let url: URL
  try {
    url = new URL(valor)
  } catch {
    throw new Error("PF_PUBLIC_SITE_URL invalida")
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "puxaficha.com.br" ||
    url.port ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(`PF_PUBLIC_SITE_URL deve ser exatamente ${PUBLIC_URL_CANONICA}`)
  }
  return PUBLIC_URL_CANONICA
}

function urlsIguais(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    ua.hash = ""
    ub.hash = ""
    return ua.toString() === ub.toString()
  } catch {
    return a === b
  }
}

async function candidatosPublicos(publicUrl: string): Promise<Array<{ slug: string }>> {
  const response = await fetch(`${publicUrl}/api/candidato-slugs`, {
    cache: "no-store",
    redirect: "error",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`candidato-slugs HTTP ${response.status}`)
  const payload = (await response.json()) as { slugs?: unknown }
  if (!Array.isArray(payload.slugs) || payload.slugs.some((slug) => typeof slug !== "string" || !slug)) {
    throw new Error("candidato-slugs devolveu payload invalido")
  }
  const slugs = payload.slugs as string[]
  if (new Set(slugs).size !== slugs.length) throw new Error("candidato-slugs devolveu duplicatas")
  return [...slugs].sort().map((slug) => ({ slug }))
}

async function perfilPublico(publicUrl: string, slug: string): Promise<Perfil> {
  const response = await fetch(`${publicUrl}/api/candidato-profile/${encodeURIComponent(slug)}`, {
    cache: "no-store",
    redirect: "error",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${slug}: API HTTP ${response.status}`)
  const cacheControl = response.headers.get("cache-control") ?? ""
  if (!/no-store/i.test(cacheControl)) {
    throw new Error(`${slug}: API sem cache-control no-store (${cacheControl || "ausente"})`)
  }
  const payload = (await response.json()) as { data?: Perfil | null; sourceStatus?: string }
  if (payload.sourceStatus !== "live" || !payload.data || payload.data.slug !== slug) {
    throw new Error(`${slug}: API sem payload live da identidade pedida`)
  }
  return payload.data
}

async function inventariosLegislativosPublicos(
  publicUrl: string,
  slug: string,
): Promise<Pick<
  Perfil,
  | "projetos_lei"
  | "projetos_lei_total"
  | "projetos_lei_truncados"
  | "legislacao_mandato_executivo"
  | "legislacao_mandato_executivo_total"
  | "legislacao_mandato_executivo_truncados"
>> {
  const projetos: ProjetoLei[] = []
  let totalProjetos = Number.POSITIVE_INFINITY
  for (let offset = 0; offset < totalProjetos; offset += 100) {
    const url = `${publicUrl}/api/candidato-profile/${encodeURIComponent(slug)}/projetos-lei?offset=${offset}&limit=100`
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok || response.url !== url) throw new Error(`${slug}: projetos-lei HTTP/URL divergente`)
    const payload = (await response.json()) as {
      data?: { rows?: ProjetoLei[]; total?: number } | null
      sourceStatus?: string
    }
    if (payload.sourceStatus !== "live" || !payload.data || !Array.isArray(payload.data.rows)) {
      throw new Error(`${slug}: projetos-lei não está live`)
    }
    totalProjetos = payload.data.total ?? payload.data.rows.length
    projetos.push(...payload.data.rows)
    if (payload.data.rows.length === 0) break
  }
  if (projetos.length !== totalProjetos) {
    throw new Error(`${slug}: projetos-lei incompleto ${projetos.length}/${totalProjetos}`)
  }

  const executivoUrl = `${publicUrl}/api/candidato-profile/${encodeURIComponent(slug)}/legislacao-executivo`
  const executivoResponse = await fetch(executivoUrl, {
    cache: "no-store",
    redirect: "error",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!executivoResponse.ok || executivoResponse.url !== executivoUrl) {
    throw new Error(`${slug}: legislação-executivo HTTP/URL divergente`)
  }
  const executivo = (await executivoResponse.json()) as {
    data?: { rows?: LegislacaoMandatoExecutivo[]; total?: number } | null
    sourceStatus?: string
  }
  if (executivo.sourceStatus !== "live" || !executivo.data || !Array.isArray(executivo.data.rows)) {
    throw new Error(`${slug}: legislação-executivo não está live`)
  }
  const totalExecutivo = executivo.data.total ?? executivo.data.rows.length
  if (executivo.data.rows.length !== totalExecutivo) {
    throw new Error(`${slug}: legislação-executivo incompleta ${executivo.data.rows.length}/${totalExecutivo}`)
  }
  return {
    projetos_lei: projetos,
    projetos_lei_total: totalProjetos,
    projetos_lei_truncados: false,
    legislacao_mandato_executivo: executivo.data.rows,
    legislacao_mandato_executivo_total: totalExecutivo,
    legislacao_mandato_executivo_truncados: false,
  }
}

async function abrirAba(page: Page, aba: string): Promise<void> {
  const botao = page.locator(`#profile-tab-${aba}`)
  if ((await botao.count()) === 0) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  }
  await botao.waitFor({ state: "attached", timeout: 15_000 })
  if ((await botao.count()) !== 1) throw new Error(`aba ${aba} ausente ou duplicada`)
  await botao.click()
  await page.locator(`#profile-panel-${aba}`).waitFor({ state: "visible" })
}

async function aguardarPainelResolvido(page: Page, aba: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const painel = document.querySelector(id)
      return painel != null && painel.querySelector(".animate-pulse") == null
    },
    `#profile-panel-${aba}`,
    { timeout: 20_000 },
  )
  if (aba === "legislacao") {
    await page.waitForFunction(
      () => {
        const painel = document.querySelector("#profile-panel-legislacao")
        const raiz = painel?.querySelector("[data-pf-projetos-load-state]")
        return (
          raiz?.getAttribute("data-pf-projetos-load-state") === "loaded" &&
          raiz.getAttribute("data-pf-executivo-load-state") === "loaded"
        )
      },
      undefined,
      { timeout: 60_000 },
    )
  }
}

async function renderizarPainelEsperado(
  pagina: Page,
  slug: string,
  perfil: Perfil,
  aba: keyof PaineisEsperados,
): Promise<PainelEsperado> {
  let html = ""
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    html = renderToStaticMarkup(
      createElement(CandidatoProfile, {
        ficha: perfil as unknown as FichaCandidato,
        initialTab: aba,
      }),
    )
    if (!html.includes("animate-pulse")) break
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (html.includes("animate-pulse")) throw new Error(`${slug}: ${aba} permaneceu no skeleton local`)
  await pagina.setContent(html)
  const seletor = aba === "alertas" ? "[data-pf-destaques-conteudo]" : `#profile-panel-${aba}`
  const raiz = pagina.locator(seletor)
  if ((await raiz.count()) !== 1) throw new Error(`${slug}: render local de ${aba} ausente ou duplicado`)
  return {
    texto: textoVisivel(await raiz.innerText()),
    hrefs: await hrefsDoPainel(pagina, seletor),
  }
}

async function renderizarSubabaLegislacaoEsperada(
  pagina: Page,
  slug: string,
  perfil: Perfil,
  subaba: LegislationSubtabId,
): Promise<PainelEsperado | null> {
  let html = ""
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    html = renderToStaticMarkup(
      createElement(CandidatoProfile, {
        ficha: perfil as unknown as FichaCandidato,
        initialTab: "legislacao",
        initialLegislationSubtab: subaba,
      }),
    )
    if (!html.includes("animate-pulse")) break
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (html.includes("animate-pulse")) {
    throw new Error(`${slug}: legislação/${subaba} permaneceu no skeleton local`)
  }
  await pagina.setContent(html)
  const seletor = `[data-pf-legislation-content="${subaba}"]`
  const raiz = pagina.locator(seletor)
  const contagem = await raiz.count()
  if (contagem === 0 && subaba === "destaques") return null
  if (contagem !== 1) throw new Error(`${slug}: render local de legislação/${subaba} divergente`)
  const texto = textoVisivel(await raiz.innerText())
  const hrefs = await hrefsDoPainel(pagina, seletor)
  const listasLegislacao = listasLegislacaoEsperadas(perfil, subaba)
  for (let indice = 0; indice < listasLegislacao.length; indice += 1) {
    const lista = listasLegislacao[indice]
    const totalPaginas = Math.max(1, Math.ceil(lista.proofs.length / lista.pageSize))
    for (let numeroPagina = 1; numeroPagina <= totalPaginas; numeroPagina += 1) {
      const htmlPagina = renderToStaticMarkup(
        createElement(CandidatoProfile, {
          ficha: perfil as unknown as FichaCandidato,
          initialTab: "legislacao",
          initialLegislationSubtab: subaba,
          initialLegislationPage: numeroPagina,
        }),
      )
      await pagina.setContent(htmlPagina)
      const listas = pagina.locator(`${seletor} [data-pf-legislation-list-kind]`)
      if ((await listas.count()) !== listasLegislacao.length) {
        throw new Error(`${slug}: listas locais de legislação/${subaba} divergentes`)
      }
      const listaRenderizada = listas.nth(indice)
      lista.paginas.push({
        texto: textoVisivel(await listaRenderizada.innerText()),
        hrefs: await hrefsDaRaiz(listaRenderizada),
      })
    }
  }
  return {
    texto,
    hrefs,
    listasLegislacao,
  }
}

function provasProjetos(items: ProjetoLei[]): string[] {
  const ordenados = [...items].sort((a, b) => {
    if (a.destaque && !b.destaque) return -1
    if (!a.destaque && b.destaque) return 1
    return (b.ano ?? 0) - (a.ano ?? 0)
  })
  return agruparProposicoesPorEmenta(ordenados).map((grupo) => JSON.stringify(grupo))
}

function listasLegislacaoEsperadas(
  perfil: Perfil,
  subaba: LegislationSubtabId,
): LegislacaoListaEsperada[] {
  const groups = groupLegislacaoProfileItems({
    projetosLei: perfil.projetos_lei ?? [],
    legislacaoMandatoExecutivo: perfil.legislacao_mandato_executivo ?? [],
    legislacaoMandatoExecutivoTotal: perfil.legislacao_mandato_executivo_total,
    votos: perfil.votos ?? [],
    cargoDisputado: perfil.cargo_disputado,
  })
  const executivo = (items: LegislacaoMandatoExecutivo[]): LegislacaoListaEsperada[] =>
    items.length === 0
      ? []
      : [{ kind: "executivo", total: items.length, pageSize: 25, proofs: items.map((item) => JSON.stringify(item)), paginas: [] }]
  const projetos = (items: ProjetoLei[]): LegislacaoListaEsperada[] =>
    items.length === 0
      ? []
      : [{ kind: "projetos", total: items.length, pageSize: 25, proofs: provasProjetos(items), paginas: [] }]

  if (subaba === "destaques") {
    return [...executivo(groups.destaquesExecutivo), ...projetos(groups.destaquesParlamentares)]
  }
  if (subaba === "todas") {
    return [...executivo(groups.executivo), ...projetos(groups.propostasParlamentares)]
  }
  if (subaba === "propostas") {
    return [...executivo(groups.propostasExecutivo), ...projetos(groups.propostasParlamentares)]
  }
  if (subaba === "aprovadas") {
    return [...executivo(groups.leisSancionadas), ...projetos(groups.projetosAprovados)]
  }
  if (subaba === "executivo") return executivo(groups.executivo)
  return []
}

async function auditarPaginacaoLegislacao(
  page: Page,
  seletorPainel: string,
  esperadas: LegislacaoListaEsperada[],
): Promise<string | null> {
  const seletorListas = `${seletorPainel} [data-pf-legislation-list-kind]`
  const listas = page.locator(seletorListas)
  const quantidade = await listas.count()
  if (quantidade !== esperadas.length) {
    return `listas paginadas ${quantidade}/${esperadas.length}`
  }

  for (let indice = 0; indice < esperadas.length; indice += 1) {
    const esperada = esperadas[indice]
    const lista = listas.nth(indice)
    const kind = await lista.getAttribute("data-pf-legislation-list-kind")
    const total = Number(await lista.getAttribute("data-pf-legislation-total"))
    const pageSize = Number(await lista.getAttribute("data-pf-legislation-page-size"))
    if (
      kind !== esperada.kind ||
      total !== esperada.total ||
      pageSize !== esperada.pageSize
    ) {
      return `contrato da lista ${indice + 1} divergente`
    }

    const totalPaginas = Math.max(1, Math.ceil(esperada.proofs.length / pageSize))
    const coletadas: string[] = []
    for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
      const paginaAtual = Number(await lista.getAttribute("data-pf-legislation-current-page"))
      if (paginaAtual !== pagina) return `lista ${indice + 1} parou na página ${paginaAtual}/${pagina}`
      const provasVisiveis = await lista
        .locator("[data-pf-legislation-card-proof]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-pf-legislation-card-proof") ?? ""),
        )
      if (provasVisiveis.some((proof) => !proof)) return `lista ${indice + 1} tem card sem prova`
      coletadas.push(...provasVisiveis)
      const paginaEsperada = esperada.paginas[pagina - 1]
      if (
        !paginaEsperada ||
        textoVisivel(await lista.innerText()) !== paginaEsperada.texto ||
        JSON.stringify(await hrefsDaRaiz(lista)) !== JSON.stringify(paginaEsperada.hrefs)
      ) {
        return `conteúdo visível da lista ${indice + 1}, página ${pagina}, diverge`
      }

      if (pagina < totalPaginas) {
        await lista.getByRole("button", { name: "Próxima", exact: true }).first().click()
        await page.waitForFunction(
          ({ selector, listIndex, nextPage }) =>
            document
              .querySelectorAll(selector)
              .item(listIndex)
              ?.getAttribute("data-pf-legislation-current-page") === String(nextPage),
          { selector: seletorListas, listIndex: indice, nextPage: pagina + 1 },
          { timeout: 5_000 },
        )
      }
    }
    if (JSON.stringify(coletadas) !== JSON.stringify(esperada.proofs)) {
      return `payload paginado da lista ${indice + 1} diverge (${coletadas.length}/${esperada.proofs.length})`
    }
  }
  return null
}

function totalCardsDinheiroEsperado(perfil: Perfil): number {
  const patrimonioSemDado = (perfil.patrimonio_eleicoes ?? []).filter((row) => row.estado !== "publicado").length
  const financiamentoSemDado = (perfil.financiamento_eleicoes ?? []).filter(
    (row) => row.estado !== "publicado",
  ).length
  return (
    (perfil.patrimonio?.length ?? 0) +
    patrimonioSemDado +
    (perfil.financiamento?.length ?? 0) +
    financiamentoSemDado +
    (perfil.gastos_parlamentares?.length ?? 0)
  )
}

function destaquesDoPerfil(perfil: Perfil): DestaquesDaFicha {
  return montarDestaquesDaFicha({
    pontosAtencao: perfil.pontos_atencao ?? [],
    sancoes: perfil.sancoes_administrativas ?? [],
    processos: perfil.processos ?? [],
    historico: perfil.historico ?? [],
    patrimonioEleicoes: perfil.patrimonio_eleicoes ?? [],
    patrimonio: perfil.patrimonio ?? [],
    votos: perfil.votos ?? [],
    sancoesVerificacao: perfil.sancoes_verificacao,
    processosVerificacao: perfil.processos_verificacao,
    trajetoriaVerificacao: perfil.trajetoria_verificacao,
    patrimonioVerificacao: perfil.patrimonio_verificacao,
    votacoesVerificacao: perfil.votacoes_verificacao,
  })
}

function textoVisivel(valor: string): string {
  return valor.replace(/\s+/g, " ").trim()
}

async function valoresDeAtributo(page: Page, seletor: string, atributo: string): Promise<string[]> {
  return page.locator(seletor).evaluateAll(
    (nodes, nome) => nodes.map((node) => node.getAttribute(nome) ?? "").sort(),
    atributo,
  )
}

async function hrefsDoPainel(page: Page, seletor: string): Promise<string[]> {
  return page
    .locator(`${seletor} a[href]`)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? "").sort())
}

async function hrefsDaRaiz(raiz: Locator): Promise<string[]> {
  return raiz
    .locator("a[href]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? "").sort())
}

async function compararPainel(
  page: Page,
  seletor: string,
  esperado: PainelEsperado,
): Promise<"texto" | "links" | null> {
  const raiz = page.locator(seletor)
  if ((await raiz.count()) !== 1) return "texto"
  if (textoVisivel(await raiz.innerText()) !== esperado.texto) return "texto"
  if (JSON.stringify(await hrefsDoPainel(page, seletor)) !== JSON.stringify(esperado.hrefs)) return "links"
  return null
}

function fonteProcessoValida(processo: Processo): string | null {
  if (!processo.url_fonte) return "url_fonte ausente"
  let url: URL
  try {
    url = new URL(processo.url_fonte)
  } catch {
    return "url_fonte invalida"
  }
  const hostname = url.hostname.toLowerCase()
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    hostname.endsWith(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isIP(hostname.replace(/^\[|\]$/g, "")) !== 0 ||
    !hostname.includes(".")
  ) {
    return "url_fonte nao e HTTPS publica"
  }

  if (hostname === "comunicaapi.pje.jus.br") {
    const cnj = (processo.numero_processo ?? "").replace(/\D/g, "")
    const numero = url.searchParams.getAll("numeroProcesso")
    if (
      !/^\d{20}$/.test(cnj) ||
      url.pathname !== "/api/v1/comunicacao" ||
      numero.length !== 1 ||
      numero[0]?.replace(/\D/g, "") !== cnj
    ) {
      return "fonte Comunica PJe nao prova o proprio CNJ"
    }
  }
  return null
}

async function auditarFicha(
  page: Page,
  publicUrl: string,
  perfil: Perfil,
  viewport: Defeito["viewport"],
  expectFinal: boolean,
  paineisEsperados: PaineisEsperados,
  legislacaoSubabasEsperadas: LegislacaoSubabasEsperadas,
): Promise<Defeito[]> {
  const defeitos: Defeito[] = []
  const falha = (frente: Defeito["frente"], detalhe: string) =>
    defeitos.push({ slug: perfil.slug, viewport, frente, detalhe })

  const fichaUrl = `${publicUrl}/candidato/${encodeURIComponent(perfil.slug)}`
  const response = await page.goto(fichaUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })
  if (!response?.ok()) {
    falha("http", `ficha HTTP ${response?.status() ?? "sem resposta"}`)
    return defeitos
  }
  if (response.url() !== fichaUrl || page.url() !== fichaUrl) {
    falha("http", `ficha redirecionada para ${page.url()}`)
    return defeitos
  }
  await page.locator("[data-pf-overview-processos]").waitFor({ state: "visible" })
  const geralDivergente = expectFinal
    ? await compararPainel(page, "#profile-panel-geral", paineisEsperados.geral)
    : null
  if (geralDivergente) {
    falha("classificacao", `${geralDivergente} da visão geral divergem do SHA publicado`)
  }

  const processosOverview = Number(
    (await page.locator("[data-pf-overview-processos]").getAttribute("data-pf-overview-raw")) ?? "NaN",
  )
  const processosEsperados = perfil.total_processos ?? perfil.processos?.length ?? 0
  if (processosOverview !== processosEsperados) {
    falha("judicial", `overview ${processosOverview}, API ${processosEsperados}`)
  }

  await abrirAba(page, "dinheiro")
  await aguardarPainelResolvido(page, "dinheiro")
  const dinheiroDivergente = expectFinal
    ? await compararPainel(page, "#profile-panel-dinheiro", paineisEsperados.dinheiro)
    : null
  if (dinheiroDivergente) {
    falha("dinheiro", `${dinheiroDivergente} divergem do componente no SHA publicado`)
  }
  const geometria = await page.locator("[data-pf-money-card]").evaluateAll((cards) => {
    const visiveis = cards.filter((card) => {
      const style = getComputedStyle(card)
      const rect = card.getBoundingClientRect()
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
    })
    const rects = visiveis.map((card) => {
      const rect = card.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        overflow: card.scrollWidth > card.clientWidth + 2,
        fora: rect.left < -2 || rect.right > window.innerWidth + 2,
      }
    })
    let sobreposicoes = 0
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]!
        const b = rects[j]!
        const intersecao = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
        if (intersecao) sobreposicoes += 1
      }
    }
    return {
      total: cards.length,
      cards: rects.length,
      ocultos: cards.length - rects.length,
      overflow: rects.filter((item) => item.overflow).length,
      fora: rects.filter((item) => item.fora).length,
      sobreposicoes,
      viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }
  })
  const cardsEsperados = totalCardsDinheiroEsperado(perfil)
  if (
    geometria.total !== cardsEsperados ||
    geometria.cards !== cardsEsperados ||
    geometria.ocultos ||
    geometria.overflow ||
    geometria.fora ||
    geometria.sobreposicoes ||
    geometria.viewportOverflow
  ) {
    falha("dinheiro", `geometria divergente: ${JSON.stringify(geometria)}`)
  }

  await abrirAba(page, "justica")
  await aguardarPainelResolvido(page, "justica")
  const justicaDivergente = expectFinal
    ? await compararPainel(page, "#profile-panel-justica", paineisEsperados.justica)
    : null
  if (justicaDivergente) {
    falha("judicial", `${justicaDivergente} da justiça divergem do SHA publicado`)
  }
  const idsProcessosDom = await page
    .locator('[data-pf-timeline-ref^="processo-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-pf-timeline-ref")?.slice(9) ?? ""))
  const idsProcessosApi = (perfil.processos ?? []).map((processo) => processo.id)
  if (JSON.stringify([...idsProcessosDom].sort()) !== JSON.stringify([...idsProcessosApi].sort())) {
    falha("judicial", `IDs DOM/API divergentes (${idsProcessosDom.length}/${idsProcessosApi.length})`)
  }
  for (const processo of perfil.processos ?? []) {
    if (expectFinal) {
      const fonteInvalida = fonteProcessoValida(processo)
      if (fonteInvalida) {
        falha("judicial", `processo ${processo.id}: ${fonteInvalida}`)
        continue
      }
    } else if (!processo.url_fonte) {
      continue
    }
    const hrefs = await page
      .locator(`[data-pf-timeline-ref="processo-${processo.id}"] a[href]`)
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href))
    if (!hrefs.some((href) => urlsIguais(href, processo.url_fonte!))) {
      falha("judicial", `processo ${processo.id} sem a própria fonte no DOM`)
    }
  }

  await abrirAba(page, "trajetoria")
  await aguardarPainelResolvido(page, "trajetoria")
  const trajetoriaDivergente = expectFinal
    ? await compararPainel(page, "#profile-panel-trajetoria", paineisEsperados.trajetoria)
    : null
  if (trajetoriaDivergente) {
    falha("classificacao", `${trajetoriaDivergente} da trajetória divergem do SHA publicado`)
  }

  const trajetoriaDeclarada =
    (await page.locator("[data-pf-trajetoria-count]").first().getAttribute("data-pf-trajetoria-count")) ?? ""
  if (trajetoriaDeclarada !== "nao_coletado" && !/^\d+$/.test(trajetoriaDeclarada)) {
    falha("classificacao", `estado da trajetória inválido: ${trajetoriaDeclarada || "ausente"}`)
  }
  const contagemDeclarada = trajetoriaDeclarada === "nao_coletado" ? 0 : Number(trajetoriaDeclarada)
  const partidosDeclarados =
    (await page.locator("[data-pf-partidos-count]").first().getAttribute("data-pf-partidos-count")) ?? ""
  if (partidosDeclarados !== "nao_coletado" && !/^\d+$/.test(partidosDeclarados)) {
    falha("classificacao", `estado das trocas partidárias inválido: ${partidosDeclarados || "ausente"}`)
  }
  if (contagemDeclarada > 0) {
    await page
      .waitForFunction(
        (esperada) => document.querySelectorAll('[data-pf-timeline-ref^="cargo-"]').length >= esperada,
        contagemDeclarada,
        { timeout: 15_000 },
      )
      .catch(() => undefined)
  }
  const idsTrajetoriaDom = await page
    .locator('[data-pf-timeline-ref^="cargo-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-pf-timeline-ref")?.slice(6) ?? ""))
  const idsTrajetoriaApi = (perfil.historico ?? []).map((item) => item.id)
  if (contagemDeclarada !== idsTrajetoriaDom.length) {
    falha("classificacao", `trajetória declarada/DOM ${contagemDeclarada}/${idsTrajetoriaDom.length}`)
  }
  if (JSON.stringify([...idsTrajetoriaDom].sort()) !== JSON.stringify([...idsTrajetoriaApi].sort())) {
    falha("classificacao", `IDs DOM/API divergentes (${idsTrajetoriaDom.length}/${idsTrajetoriaApi.length})`)
  }

  for (const aba of ["votos", "legislacao"] as const) {
    await abrirAba(page, aba)
    await aguardarPainelResolvido(page, aba)
    const divergencia = expectFinal
      ? await compararPainel(page, `#profile-panel-${aba}`, paineisEsperados[aba])
      : null
    if (divergencia) {
      falha("classificacao", `${divergencia} de ${aba} divergem do SHA publicado`)
    }
  }
  if (expectFinal) {
    for (const subaba of LEGISLACAO_SUBABAS) {
      const esperado = legislacaoSubabasEsperadas[subaba]
      const gatilho = page.locator(`[data-pf-legislation-subtab="${subaba}"]`)
      const gatilhos = await gatilho.count()
      if (!esperado) {
        if (gatilhos !== 0) falha("classificacao", `legislação/${subaba} inesperada no DOM`)
        continue
      }
      if (gatilhos !== 1) {
        falha("classificacao", `legislação/${subaba} ausente ou duplicada`)
        continue
      }
      await gatilho.click()
      const seletor = `[data-pf-legislation-content="${subaba}"]`
      await page.locator(seletor).waitFor({ state: "visible" })
      const divergencia = await compararPainel(page, seletor, esperado)
      if (divergencia) {
        falha("classificacao", `${divergencia} de legislação/${subaba} divergem do SHA publicado`)
      }
      const divergenciaPaginacao = await auditarPaginacaoLegislacao(
        page,
        seletor,
        esperado.listasLegislacao ?? [],
      )
      if (divergenciaPaginacao) {
        falha("classificacao", `${divergenciaPaginacao} em legislação/${subaba}`)
      }
    }
  }

  await abrirAba(page, "alertas")
  const estados = await page.locator("[data-pf-destaque-fonte]").evaluateAll((nodes) => {
    const unicos = new Map<string, { chave: string; estado: string; proveniencia: string }>()
    for (const node of nodes) {
      const chave = node.getAttribute("data-pf-destaque-fonte") ?? ""
      if (!chave) continue
      unicos.set(chave, {
        chave,
        estado: node.getAttribute("data-pf-destaque-estado") ?? "",
        proveniencia: node.getAttribute("data-pf-destaque-proveniencia") ?? "",
      })
    }
    return [...unicos.values()].sort((a, b) => a.chave.localeCompare(b.chave))
  })
  if (expectFinal) {
    const destaques = destaquesDoPerfil(perfil)
    const esperadosSemConteudo = destaques.fontes
      .filter((fonte) => fonte.categoria === "factual" && fonte.estado.tipo !== "tem_conteudo")
      .map((fonte) => ({
        chave: fonte.chave,
        estado: fonte.estado.tipo,
        proveniencia: fonte.proveniencia?.fonte ?? "",
      }))
      .sort((a, b) => a.chave.localeCompare(b.chave))
    const estadosFactuais = estados.filter((estado) => estado.chave !== "pontos_atencao")
    if (JSON.stringify(estadosFactuais) !== JSON.stringify(esperadosSemConteudo)) {
      falha("destaques", "estados/proveniência DOM divergentes da API")
    }
    for (const fonte of destaques.fontes.filter((item) => item.categoria === "factual")) {
      if (ESTADOS_SILENCIOSOS.has(fonte.estado.tipo)) {
        falha("destaques", `${fonte.chave} permaneceu ${fonte.estado.tipo}`)
      }
      if (fonte.estado.tipo !== "tem_conteudo" && !fonte.proveniencia) {
        falha("destaques", `${fonte.chave} sem proveniência`)
      }
    }
    const conteudoEsperado: Array<[string, string, string[]]> = [
      ["[data-pf-ponto-destaque]", "data-pf-ponto-destaque", destaques.pontosAtencao.map((item) => item.id)],
      [
        "[data-pf-sancao-destaque]",
        "data-pf-sancao-destaque",
        [...destaques.sancoesVigentes, ...destaques.sancoesExpiradas].map((item) => item.id),
      ],
      ["[data-pf-processo-destaque]", "data-pf-processo-destaque", destaques.processos.map((item) => item.id)],
      ["[data-pf-mandato-destaque]", "data-pf-mandato-destaque", destaques.mandatos.map((item) => item.id)],
      [
        "[data-pf-patrimonio-destaque]",
        "data-pf-patrimonio-destaque",
        destaques.patrimonioPublicado.map((item) => String(item.ano)),
      ],
      [
        "[data-pf-votacao-destaque]",
        "data-pf-votacao-destaque",
        destaques.votacoes.map((item) => item.votacao_id),
      ],
    ]
    for (const [selector, atributo, esperado] of conteudoEsperado) {
      const recebido = await valoresDeAtributo(page, selector, atributo)
      const esperadoOrdenado = [...esperado].sort()
      if (JSON.stringify(recebido) !== JSON.stringify(esperadoOrdenado)) {
        falha("destaques", `${selector} identidades DOM divergentes da API`)
      }
    }
    const destaquesDivergentes = await compararPainel(
      page,
      "[data-pf-destaques-conteudo]",
      paineisEsperados.alertas,
    )
    if (destaquesDivergentes) {
      falha("destaques", `${destaquesDivergentes} divergem do componente no SHA publicado`)
    }
  }

  const timelineUrl = `${fichaUrl}/timeline`
  const timelineResponse = await page.goto(timelineUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })
  if (!timelineResponse?.ok() || timelineResponse.url() !== timelineUrl || page.url() !== timelineUrl) {
    falha("http", `timeline redirecionada para ${page.url()}`)
  } else {
    await page.locator("#profile-panel-timeline").waitFor({ state: "visible" })
    await aguardarPainelResolvido(page, "timeline")
    const timelineDivergente = expectFinal
      ? await compararPainel(page, "#profile-panel-timeline", paineisEsperados.timeline)
      : null
    if (timelineDivergente) {
      falha("classificacao", `${timelineDivergente} da timeline divergem do SHA publicado`)
    }
  }
  if (page.url() !== timelineUrl) {
    falha("http", `ficha terminou redirecionada para ${page.url()}`)
  }
  return defeitos
}

async function main(): Promise<void> {
  if (process.env.PF_DRY_RUN !== "1") throw new Error("PF_DRY_RUN=1 é obrigatório")
  const publicUrl = normalizarUrl(arg("public-url") ?? process.env.PF_PUBLIC_SITE_URL ?? "")
  const expectedSha = arg("expected-sha") ?? process.env.PF_EXPECTED_DEPLOY_SHA ?? ""
  const output = arg("json")
  const filtro = arg("slugs")?.split(",").filter(Boolean) ?? null
  const expectFinal = process.argv.includes("--expect-final")
  if (!publicUrl) throw new Error("--public-url ou PF_PUBLIC_SITE_URL é obrigatório")
  if (!expectedSha) throw new Error("--expected-sha ou PF_EXPECTED_DEPLOY_SHA é obrigatório")
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error("SHA esperado deve ter 40 caracteres hexadecimais")

  const deploymentResponse = await fetch(`${publicUrl}/api/deployment-info`, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!deploymentResponse.ok) throw new Error(`deployment-info HTTP ${deploymentResponse.status}`)
  const deployment = (await deploymentResponse.json()) as { commitSha?: string | null; environment?: string | null }
  if (deployment.commitSha !== expectedSha) {
    throw new Error(`SHA publicado divergente: ${deployment.commitSha ?? "nulo"} != ${expectedSha}`)
  }
  if (deployment.environment !== "production") {
    throw new Error(`ambiente publicado divergente: ${deployment.environment ?? "nulo"} != production`)
  }

  const candidatos = await candidatosPublicos(publicUrl)
  if (candidatos.length !== UNIVERSO_ESPERADO) {
    throw new Error(`universo público divergente: ${candidatos.length}/${UNIVERSO_ESPERADO}`)
  }
  const slugs = new Set(candidatos.map((item) => item.slug))
  for (const slug of [...CASOS_OBRIGATORIOS, ...AMOSTRA_ADVERSARIAL]) {
    if (!slugs.has(slug)) throw new Error(`caso obrigatório ausente do universo: ${slug}`)
  }
  const alvos = filtro ? candidatos.filter((item) => filtro.includes(item.slug)) : candidatos
  if (filtro && alvos.length !== filtro.length) throw new Error("--slugs contém ficha fora do universo")

  const perfis = new Map<string, Perfil>()
  for (const alvo of alvos) {
    const perfil = await perfilPublico(publicUrl, alvo.slug)
    Object.assign(perfil, await inventariosLegislativosPublicos(publicUrl, alvo.slug))
    perfis.set(alvo.slug, perfil)
  }

  const browser = await chromium.launch({ headless: true })
  const defeitos: Defeito[] = []
  const porViewport: Record<string, number> = {}
  const paineisEsperadosPorFicha = new Map<string, PaineisEsperados>()
  const legislacaoSubabasPorFicha = new Map<string, LegislacaoSubabasEsperadas>()
  try {
    await import("../../src/components/CandidatoProfileSections")
    const paginaEsperada = await browser.newPage()
    for (const [slug, perfil] of perfis) {
      const paineis = {} as PaineisEsperados
      for (const aba of [
        "geral",
        "dinheiro",
        "justica",
        "trajetoria",
        "timeline",
        "votos",
        "legislacao",
        "alertas",
      ] as const) {
        paineis[aba] = await renderizarPainelEsperado(paginaEsperada, slug, perfil, aba)
      }
      paineisEsperadosPorFicha.set(slug, paineis)
      const subabas = {} as LegislacaoSubabasEsperadas
      for (const subaba of LEGISLACAO_SUBABAS) {
        subabas[subaba] = await renderizarSubabaLegislacaoEsperada(
          paginaEsperada,
          slug,
          perfil,
          subaba,
        )
      }
      legislacaoSubabasPorFicha.set(slug, subabas)
    }
    await paginaEsperada.close()
    for (const viewport of [
      { nome: "desktop" as const, width: 1440, height: 900 },
      { nome: "mobile" as const, width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })
      for (const alvo of alvos) {
        defeitos.push(
          ...(await auditarFicha(
            page,
            publicUrl,
            perfis.get(alvo.slug)!,
            viewport.nome,
            expectFinal,
            paineisEsperadosPorFicha.get(alvo.slug)!,
            legislacaoSubabasPorFicha.get(alvo.slug)!,
          )),
        )
      }
      porViewport[viewport.nome] = alvos.length
      await page.close()
    }
  } finally {
    await browser.close()
  }

  const deploymentFinalResponse = await fetch(`${publicUrl}/api/deployment-info`, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!deploymentFinalResponse.ok || deploymentFinalResponse.url !== `${publicUrl}/api/deployment-info`) {
    throw new Error("deployment-info final HTTP/URL divergente")
  }
  const deploymentFinal = (await deploymentFinalResponse.json()) as {
    commitSha?: string | null
    environment?: string | null
  }
  if (deploymentFinal.commitSha !== expectedSha || deploymentFinal.environment !== "production") {
    throw new Error("deployment mudou durante o readback")
  }

  const resultado = {
    natureza: "somente_leitura",
    publicUrl,
    deployment,
    expectedSha,
    universo: candidatos.length,
    fichasMedidas: alvos.length,
    porViewport,
    casosObrigatorios: CASOS_OBRIGATORIOS,
    amostraAdversarial: AMOSTRA_ADVERSARIAL,
    destaquesPorFicha: [...perfis.entries()]
      .map(([slug, perfil]) => ({ slug, assinaturaConteudo: assinaturaConteudoDestaques(destaquesDoPerfil(perfil)) }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
    superficiePorFicha: [...perfis.entries()]
      .map(([slug, perfil]) => ({ slug, ...assinaturasSuperficie(perfil as unknown as FichaCandidato) }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
    expectFinal,
    defeitos,
  }
  if (output) writeFileSync(output, `${JSON.stringify(resultado, null, 2)}\n`)
  console.log(JSON.stringify(resultado, null, 2))
  if (defeitos.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
