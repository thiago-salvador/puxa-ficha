/** Parsers das buscas nativas UOL Confere e AFP Checamos. */

import type { ItemBusca } from "./checagens-coleta"

export const UOL_CONFERE_ARQUIVO_URL = "https://noticias.uol.com.br/confere/"
export const AFP_CHECAMOS_BUSCA_URL = "https://checamos.afp.com/fact-checking-search-results"
const AFP_RESULTADOS_POR_PAGINA = 20

function decodificarHtml(valor: string): string {
  return valor.replace(/&(?:amp|quot|apos|nbsp|#39|#\d+|#x[\da-f]+);/gi, (entidade) => {
    const codigo = entidade.toLowerCase()
    if (codigo === "&amp;") return "&"
    if (codigo === "&quot;") return "\""
    if (codigo === "&apos;" || codigo === "&#39;") return "'"
    if (codigo === "&nbsp;") return " "
    const numero = codigo.startsWith("&#x") ? Number.parseInt(codigo.slice(3, -1), 16) : Number(codigo.slice(2, -1))
    return Number.isInteger(numero) && numero >= 0 && numero <= 0x10ffff && !(numero >= 0xd800 && numero <= 0xdfff)
      ? String.fromCodePoint(numero) : entidade
  })
}

function textoHtml(valor: string): string {
  return decodificarHtml(valor.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim()
}

function conteudoTag(html: string, nome: string, desde = 0, corresponde: (abertura: string) => boolean = () => true): string | null {
  const aberturas = new RegExp("<" + nome + "\\b[^>]*>", "gi")
  aberturas.lastIndex = desde
  let abertura: RegExpExecArray | null
  while ((abertura = aberturas.exec(html))) {
    if (!corresponde(abertura[0])) continue
    const marcas = new RegExp("<" + nome + "\\b[^>]*>|</" + nome + "\\s*>", "gi")
    marcas.lastIndex = abertura.index + abertura[0].length
    let profundidade = 1
    for (let marca = marcas.exec(html); marca; marca = marcas.exec(html)) {
      profundidade += marca[0].startsWith("</") ? -1 : 1
      if (profundidade === 0) return html.slice(abertura.index + abertura[0].length, marca.index)
    }
    return null
  }
  return null
}

function paragrafos(html: string): string[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => textoHtml(match[1])).filter(Boolean)
}

/** Extrai apenas os parágrafos do componente de matéria UOL, nunca texto de navegação/sidebars. */
export function trechosUol(html: string): string[] | null {
  const article = conteudoTag(html, "article", 0, (tag) => /\bdata-v-d559f1f7\b/i.test(tag))
  if (!article) return null
  const body = conteudoTag(article, "div", 0, (tag) => /\bclass=["'][^"']*\bbody-container\b[^"']*["']/i.test(tag) && !/\bjupiter-headline\b/i.test(tag))
  if (!body) return null
  const fragments = [...body.matchAll(/<div\b[^>]*class=["'][^"']*\bjupiter-paragraph-fragment\b[^"']*["'][^>]*>/gi)]
  if (!fragments.length) return null
  const result: string[] = []
  for (let i = 0; i < fragments.length; i++) {
    const from = fragments[i].index! + fragments[i][0].length
    const next = fragments[i + 1]?.index ?? body.length
    const fragment = conteudoTag(body, "div", fragments[i].index!, (tag) => /\bjupiter-paragraph-fragment\b/i.test(tag))
    if (!fragment) return null
    result.push(...paragrafos(fragment))
    if (next <= from) return null
  }
  return result.length ? result : null
}

/** Extrai os parágrafos do campo Drupal de corpo AFP, sem cabeçalho ou navegação. */
export function trechosAfp(html: string): string[] | null {
  const article = conteudoTag(html, "article", 0, (tag) => /\bnode--view-mode-full\b/i.test(tag))
  if (!article) return null
  const wrapper = conteudoTag(article, "div", 0, (tag) => /\bclass=["'][^"']*\bwrapper-body\b[^"']*["']/i.test(tag))
  if (!wrapper) return null
  const field = conteudoTag(wrapper, "div", 0, (tag) => /\bfield--name-body\b/i.test(tag) && /\bfield__item\b/i.test(tag))
  if (!field) return null
  const innerBody = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(field)?.[1]
  if (!innerBody) return null
  const result = paragrafos(innerBody)
  return result.length ? result : null
}

function atributo(tag: string, nome: string): string | null {
  const match = tag.match(new RegExp("\\b" + nome + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"))
  return match ? decodificarHtml(match[1] ?? match[2] ?? match[3] ?? "") : null
}

function dataIsoPt(texto: string): string | null {
  const m = texto.match(/(?:Publicado em\s+)?(\d{1,2}) de ([a-zç]+) de (\d{4})(?: às (\d{1,2}):(\d{2}))?/i)
  if (!m) {
    const breve = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    return breve ? mdy(breve[3], breve[2], breve[1]) : null
  }
  const meses: Record<string, string> = { janeiro: "01", fevereiro: "02", março: "03", abril: "04", maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" }
  const mes = meses[m[2].toLocaleLowerCase("pt-BR")]
  return mes ? mdy(m[3], mes, m[1]) : null
}

function mdy(ano: string, mes: string, dia: string): string {
  return ano + "-" + mes.padStart(2, "0") + "-" + dia.padStart(2, "0")
}

export function urlArquivoUol(): string {
  return UOL_CONFERE_ARQUIVO_URL
}

/** Monta a continuação nativa publicada pelo botão do arquivo UOL. */
export function urlProximaUol(request: Record<string, unknown>): string {
  if (request.hasNext !== true) throw new Error("arquivo UOL sem próxima página")
  const params = (request.busca as { params?: Record<string, unknown> } | undefined)?.params
  if (params?.repository !== "mix2" || !Array.isArray(params.tags) || !params.tags.some((tag) => (tag as { id?: unknown })?.id === 78333)) {
    throw new Error("arquivo UOL fora do arquivo nativo de checagens")
  }
  if (typeof params.next !== "string" || !params.next) throw new Error("arquivo UOL sem cursor de continuação")
  const url = new URL("https://noticias.uol.com.br/service/")
  url.searchParams.set("loadComponent", "results-index")
  url.searchParams.set("data", JSON.stringify(request))
  url.searchParams.set("configPath", "noticias/noticias.confere")
  url.searchParams.set("json", "")
  return url.toString()
}

export interface PaginaArquivoUol {
  itens: ItemBusca[]
  /** Cards encontrados antes de filtrar os itens Comprova que compartilham o arquivo. */
  brutos: number
  hasNext: boolean
  cursor: string | null
  /** Descritor publicado pelo botão nativo de continuação. */
  request: Record<string, unknown>
  pageSize: number
}

/** Lê o arquivo do UOL e preserva o cursor opaco emitido pelo próprio site. */
export function parseArquivoUol(html: string): PaginaArquivoUol {
  let listHtml = html
  let nativeFragment = false
  if (!/<title\b/i.test(html)) {
    let envelope: { type?: unknown; body?: unknown }
    try { envelope = JSON.parse(html) as { type?: unknown; body?: unknown } } catch { throw new Error("arquivo UOL sem título canônico UOL Confere") }
    if (envelope.type !== "results-index" || typeof envelope.body !== "string") throw new Error("arquivo UOL sem resposta results-index completa")
    listHtml = envelope.body
    nativeFragment = true
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  if (!nativeFragment && (!title || !/UOL Confere/i.test(textoHtml(title)))) throw new Error("arquivo UOL sem título canônico UOL Confere")
  const button = [...listHtml.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)].map((m) => m[0])
    .find((tag) => /(?:ver-mais|btn-more)/i.test(atributo(tag.slice(0, tag.indexOf(">") + 1), "class") ?? ""))
  // A última resposta da API não tem botão: só é fim válido quando a lista
  // declarada no JSON-LD é curta e bate com os cartões recebidos.
  const terminalCount = !button && nativeFragment && /<section\b[^>]*class="[^"]*results-index/i.test(listHtml)
    ? Number(/"numberOfItems":(\d+)/.exec(listHtml)?.[1]) : null
  if (!button && (terminalCount === null || !Number.isInteger(terminalCount) || terminalCount < 1 || terminalCount >= 12 || /data-request|data-next/i.test(listHtml))) {
    throw new Error("arquivo UOL sem controle de paginação nativo")
  }
  const opening = button ? button.slice(0, button.indexOf(">") + 1) : ""
  const rawRequest = button ? atributo(opening, "data-request") : null
  if (button && !rawRequest) throw new Error("arquivo UOL sem descritor data-request")
  let request: Record<string, unknown> = {}
  if (rawRequest) {
    try { request = JSON.parse(rawRequest) as Record<string, unknown> } catch { throw new Error("arquivo UOL com data-request inválido") }
  }
  const params = (request.busca as { params?: Record<string, unknown> } | undefined)?.params
  const pageSize = button ? Number(params?.size) : 12
  const tags = params?.tags
  if (button && request.hasNext !== true && request.hasNext !== false) throw new Error("arquivo UOL sem sinal hasNext")
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("arquivo UOL com page size inválido")
  if (button && (params?.repository !== "mix2" || !Array.isArray(tags) || !tags.some((tag) => (tag as { id?: unknown })?.id === 78333))) {
    throw new Error("arquivo UOL fora do arquivo nativo de checagens")
  }
  const cursor = typeof params?.next === "string" && params.next.length > 0 ? params.next : null
  const dataNext = button ? atributo(opening, "data-next") : null
  if (request.hasNext === true && !cursor) throw new Error("arquivo UOL tem continuação sem cursor")
  if (dataNext && cursor && dataNext !== cursor) throw new Error("arquivo UOL com cursores divergentes")

  const rows = new Map<string, { title: string; date: string | null }>()
  for (const match of listHtml.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const openingAnchor = match[0].slice(0, match[0].indexOf(">") + 1)
    const href = atributo(openingAnchor, "href")
    if (!href) continue
    const link = new URL(href, UOL_CONFERE_ARQUIVO_URL).toString()
    const url = new URL(link)
    if (!url.hostname.endsWith(".uol.com.br") || !/\.g?htm$/.test(url.pathname)) continue
    const titleMatch = /<h3\b[^>]*class=["'][^"']*thumb-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i.exec(match[0])
    if (!titleMatch) continue
    const date = /<time\b[^>]*>([\s\S]*?)<\/time>/i.exec(match[0])?.[1] ?? ""
    rows.set(link, { title: textoHtml(titleMatch[1]), date: dataIsoPt(textoHtml(date)) })
  }
  const brutos = rows.size
  if (brutos === 0) throw new Error("arquivo UOL sem cards de checagem; leitura parcial ou template alterado")
  if (brutos > pageSize) throw new Error("arquivo UOL retornou mais cards que o page size declarado")
  if (terminalCount !== null && brutos !== terminalCount) throw new Error("arquivo UOL com última página truncada")
  const itens: ItemBusca[] = [...rows].flatMap(([link, row]) => {
    if (new URL(link).pathname.startsWith("/comprova/")) return []
    return [{ titulo: row.title, link, fonte: "UOL Confere", fonte_url: link, data_publicacao: row.date, corpo: { url: link, formato: "html-uol" } }]
  })
  return { itens, brutos, hasNext: request.hasNext === true, cursor, request, pageSize }
}

export function urlBuscaAfp(nome: string, pagina = 0): string {
  if (!nome.trim()) throw new Error("busca AFP exige nome")
  if (!Number.isInteger(pagina) || pagina < 0) throw new Error("página AFP inválida")
  const url = new URL(AFP_CHECAMOS_BUSCA_URL)
  url.searchParams.set("search_api_fulltext", nome.trim())
  if (pagina > 0) url.searchParams.set("page", String(pagina))
  return url.toString()
}

export interface PaginaBuscaAfp {
  itens: ItemBusca[]
  total: number
  brutos: number
  pagina: number
  proxima: number | null
}

/** Lê resultados AFP e falha se o contador, a página ou a paginação estiverem truncados. */
export function parseBuscaAfp(html: string, nome: string, pagina = 0): PaginaBuscaAfp {
  if (!Number.isInteger(pagina) || pagina < 0) throw new Error("página AFP inválida")
  const input = [...html.matchAll(/<input\b[^>]*>/gi)].map((m) => m[0]).find((tag) => atributo(tag, "name") === "search_api_fulltext")
  if (!input || atributo(input, "value")?.trim().toLocaleLowerCase("pt-BR") !== nome.trim().toLocaleLowerCase("pt-BR")) {
    throw new Error("busca AFP sem eco do termo consultado")
  }
  const totalRaw = /\bResultado\s+([\d.,]+)/i.exec(textoHtml(html))?.[1]
  const vazioExplicito = /<div\b[^>]*class="[^"]*view-empty[^"]*"[^>]*>\s*<p>\s*Nenhum resultado\.\s*<\/p>\s*<\/div>/i.test(html)
  if (!totalRaw && !vazioExplicito) throw new Error("busca AFP sem contador de resultados")
  if (vazioExplicito && pagina > 0) throw new Error("busca AFP terminou antes do total declarado")
  const total = totalRaw ? Number(totalRaw.replace(/[.,](?=\d{3}(?:\D|$))/g, "")) : 0
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("busca AFP com contador inválido")
  const itens: ItemBusca[] = []
  const vistos = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const href = atributo(match[0].slice(0, match[0].indexOf(">") + 1), "href")
    if (!href) continue
    const url = new URL(href, AFP_CHECAMOS_BUSCA_URL)
    const title = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(match[0])?.[1]
    if (!title) continue
    if (url.hostname !== "checamos.afp.com" || url.pathname === "/fact-checking-search-results" || url.pathname === "/" || url.search || vistos.has(url.toString())) continue
    vistos.add(url.toString())
    const date = /<span\b[^>]*class="date"[^>]*>([\s\S]*?)<\/span>/i.exec(match[0])?.[1] ?? ""
    itens.push({ titulo: textoHtml(title), link: url.toString(), fonte: "AFP Checamos", fonte_url: url.toString(), data_publicacao: dataIsoPt(textoHtml(date)), corpo: { url: url.toString(), formato: "html-afp" } })
  }
  const expected = Math.min(AFP_RESULTADOS_POR_PAGINA, Math.max(0, total - pagina * AFP_RESULTADOS_POR_PAGINA))
  if (itens.length !== expected) throw new Error("busca AFP com " + itens.length + " itens, esperado " + expected + ": leitura parcial")
  let proxima: number | null = null
  for (const match of html.matchAll(/<a\b[^>]*rel="next"[^>]*>[\s\S]*?<\/a>/gi)) {
    const href = atributo(match[0].slice(0, match[0].indexOf(">") + 1), "href")
    if (!href) throw new Error("busca AFP sem URL para a página seguinte")
    const next = new URL(href, AFP_CHECAMOS_BUSCA_URL)
    if (next.searchParams.get("search_api_fulltext")?.toLocaleLowerCase("pt-BR") !== nome.trim().toLocaleLowerCase("pt-BR")) throw new Error("busca AFP com paginação para outro termo")
    proxima = Number(next.searchParams.get("page"))
    if (!Number.isInteger(proxima) || proxima <= pagina) throw new Error("busca AFP com cursor de página inválido")
    break
  }
  if (total > (pagina + 1) * AFP_RESULTADOS_POR_PAGINA && proxima === null) throw new Error("busca AFP sem próxima página antes do fim declarado")
  if (proxima !== null && proxima !== pagina + 1) throw new Error("busca AFP pulou uma página")
  return { itens, total, brutos: itens.length, pagina, proxima }
}
