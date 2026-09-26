/**
 * Coleta nominal de checagens (política pf-checagens-v1).
 *
 * O acervo de checagens atribuídas nasceu de pacotes de leads por veículo, sem
 * recibo por candidato. Por isso uma ficha sem aba "Checagens" não dizia se a
 * busca foi feita. Este módulo faz a busca candidato a candidato, agência a
 * agência, e devolve um recibo que separa três estados:
 *
 *   - encontrado: pelo menos uma matéria de agência cita o nome no título
 *     (lead para revisão editorial, nunca publicação automática);
 *   - vazio_confirmado: todas as agências responderam e nenhuma matéria
 *     citou o nome no título;
 *   - erro: pelo menos uma agência não respondeu. Nesse caso nada no site pode
 *     afirmar ausência.
 *
 * Módulo puro: sem rede, fs ou Supabase. O runner injeta `fetchText`.
 */

import { stripAccents } from "../../src/lib/strip-accents"
import { isValidGoogleNewsRss } from "../../src/lib/news/google-news"
import { newsTitleMentionsCandidate } from "../../src/lib/news/name-match"
import type { EntradaColeta } from "./coleta-log"

export const FONTE_CHECAGENS_AGENCIAS = "checagens-agencias"
export const SCHEMA_RECIBOS_CHECAGENS = "checagens-recibos-v1" as const
export const POLITICA_CHECAGENS = "pf-checagens-v1"
/** O Google News devolve no máximo 100 itens por consulta. */
export const TETO_ITENS_POR_CONSULTA = 100

export interface AgenciaChecagem {
  id: string
  /** Nome canônico, o mesmo gravado em `publisher` no catálogo público. */
  nome: string
  /** Filtros `site:` da consulta. Caminho restringe a seção de checagem. */
  sites: readonly string[]
  /** Domínios aceitos no atributo `source url` do item devolvido. */
  dominios: readonly string[]
  /**
   * Busca nativa da própria agência (WordPress REST `/wp-json/wp/v2/search`).
   * Quando existe, é a primeira via: devolve a URL original e não depende do
   * Google. O Google News fica como segunda via.
   */
  wpSearch?: string
  /**
   * Busca do próprio site com HTML renderizado no servidor (`?q=NOME&page=N`),
   * 12 resultados por página. Primeira via; o Google News é a segunda.
   */
  buscaSite?: string
  /**
   * Arquivo completo da seção de checagem, lido uma vez por rodada e casado
   * localmente com cada candidatura. Primeira via; o Google News é a segunda.
   */
  arquivo?: ArquivoSecao
}

/**
 * - `falkor`: feed paginado da seção no g1 (10 itens por página, do mais novo
 *   ao mais antigo, até a página vazia);
 * - `arc`: consulta `story-feed-query` do Arc Publishing (100 itens por
 *   página, com o total em `count`).
 */
export type ArquivoSecao =
  | { tipo: "falkor"; url: string; confirmarNaPagina?: boolean }
  | { tipo: "arc"; url: string; site: string; website: string; secaoRegex: string }

export type TransporteBusca = "wp-rest" | "busca-site" | "arquivo-secao" | "google-news"
/** Páginas de 100 resultados lidas na busca nativa. */
export const PAGINAS_WP = 3
/** Páginas de 12 resultados lidas na busca do site (108 itens, perto do teto do Google News). */
export const PAGINAS_BUSCA_SITE = 9
export const ITENS_POR_PAGINA_BUSCA_SITE = 12
/** Nome que sempre tem checagem: se a sonda não acha nada, o leitor da página quebrou. */
export const SONDA_BUSCA_SITE = "Lula"
/** Teto de páginas do arquivo, contra paginação que nunca termina. */
export const MAX_PAGINAS_ARQUIVO = 2_000
export const ITENS_POR_PAGINA_ARC = 100
/** Teto de matérias abertas por rodada para confirmar título com só parte do nome. */
// Dry-run de 26/09: 118 matérias abertas em 20 candidaturas (~1.200 projetadas em 204).
export const MAX_PAGINAS_CONFIRMACAO = 3_000

/**
 * Agências já usadas no catálogo e as que o contrato editorial lista. A ordem
 * é a do recibo. Mudar um nome aqui exige mudar o catálogo, e o teste de
 * nome canônico por domínio pega a divergência.
 */
export const AGENCIAS_CHECAGEM: readonly AgenciaChecagem[] = Object.freeze([
  { id: "lupa", nome: "Lupa", sites: ["agencialupa.org", "piaui.folha.uol.com.br/lupa"], dominios: ["agencialupa.org", "piaui.folha.uol.com.br"], wpSearch: "https://www.agencialupa.org/wp-json/wp/v2/search" },
  { id: "aos-fatos", nome: "Aos Fatos", sites: ["aosfatos.org"], dominios: ["aosfatos.org"], buscaSite: "https://www.aosfatos.org/noticias/" },
  {
    id: "fato-ou-fake", nome: "Fato ou Fake", sites: ["g1.globo.com/fato-ou-fake"], dominios: ["g1.globo.com"],
    // Instância do feed da página https://g1.globo.com/fato-ou-fake/ (arquivo desde 2018).
    // O feed só traz título e resumo: título com parte do nome abre a matéria para confirmar.
    arquivo: { tipo: "falkor", url: "https://falkor-cda.bastian.globo.com/tenants/g1/instances/9a0574d8-bc61-4d35-9488-7733f754f881/posts/page/", confirmarNaPagina: true },
  },
  {
    id: "estadao-verifica", nome: "Estadão Verifica", sites: ["estadao.com.br/estadao-verifica"], dominios: ["estadao.com.br"],
    // Mesma consulta que a página https://www.estadao.com.br/estadao-verifica/ faz.
    arquivo: { tipo: "arc", url: "https://www.estadao.com.br/pf/api/v3/content/fetch/story-feed-query", site: "https://www.estadao.com.br", website: "estadao", secaoRegex: ".*estadao-verifica.*" },
  },
  // UOL Confere e AFP Checamos respondem 403 (Akamai) a acesso automatizado,
  // inclusive em robots.txt, sitemap e RSS: só o Google News chega a elas.
  { id: "uol-confere", nome: "UOL Confere", sites: ["noticias.uol.com.br/confere"], dominios: ["uol.com.br"] },
  { id: "afp-checamos", nome: "AFP Checamos", sites: ["checamos.afp.com"], dominios: ["afp.com"] },
  { id: "comprova", nome: "Comprova", sites: ["projetocomprova.com.br"], dominios: ["projetocomprova.com.br"], wpSearch: "https://projetocomprova.com.br/wp-json/wp/v2/search" },
])

/** Nome canônico do veículo pelo host da checagem original. */
export function publisherCanonicoPorHost(host: string): string | null {
  const normalized = host.toLowerCase().replace(/^www\./, "")
  for (const agencia of AGENCIAS_CHECAGEM) {
    if (agencia.dominios.some((dominio) => normalized === dominio || normalized.endsWith(`.${dominio}`))) return agencia.nome
  }
  return null
}

export interface CandidatoChecagem {
  id: string
  slug: string
  nome_urna: string
  nome_completo?: string | null
  cargo_disputado: "Presidente" | "Governador"
  estado: string | null
}

export interface ItemBusca {
  titulo: string
  link: string
  fonte: string
  fonte_url: string | null
  data_publicacao: string | null
  /** Texto da matéria já normalizado (arquivos de seção), para confirmar menção fraca no título. */
  texto?: string
}

export interface LeadChecagem {
  agencia: string
  titulo: string
  link: string
  data_publicacao: string | null
}

export type EstadoAgencia =
  | { status: "ok"; itens: number; leads: LeadChecagem[]; transporte?: TransporteBusca; falhas?: string[] }
  | { status: "erro"; erro: string }

/**
 * `homonimo`: todas as agências responderam e houve matéria com o nome de urna,
 * mas outra candidatura usa o mesmo nome e nenhum título trouxe marca que
 * separe as duas. Não é ausência nem achado; não entra no catálogo público.
 */
export type ResultadoRecibo = "encontrado" | "vazio_confirmado" | "erro" | "homonimo"

export interface ReciboChecagem {
  schema_version: typeof SCHEMA_RECIBOS_CHECAGENS
  candidate_id: string
  candidate_slug: string
  candidate_name: string
  office: CandidatoChecagem["cargo_disputado"]
  uf: string | null
  searched_at: string
  result: ResultadoRecibo
  leads: LeadChecagem[]
  agencias: Record<string, { status: "ok" | "erro"; itens?: number; leads?: number; erro?: string; transporte?: TransporteBusca; falhas?: string[] }>
  escopo: string
  /** Presente quando o nome de urna é compartilhado com outra candidatura do cadastro. */
  homonimo?: {
    grupo: string[]
    descartados: number
    marcadores: string[]
    /** Leads antes da regra. A regra sempre recalcula a partir daqui, então reimportar não perde lead. */
    leads_brutos: LeadChecagem[]
  }
}

const UF_NOMES: Readonly<Record<string, string>> = Object.freeze({
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
})

const PARTICULAS_NOME = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "van", "von", "la", "le", "filho", "filha", "junior", "neto", "neta", "sobrinho"])

function normalizarNome(value: string | null | undefined): string {
  return value ? stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : ""
}

/** Candidaturas que dividem o nome de urna normalizado, por identidade. */
export function gruposDeHomonimos(roster: readonly CandidatoChecagem[]): Map<string, CandidatoChecagem[]> {
  const porNome = new Map<string, CandidatoChecagem[]>()
  for (const candidato of roster) {
    const chave = normalizarNome(candidato.nome_urna)
    porNome.set(chave, [...(porNome.get(chave) ?? []), candidato])
  }
  const grupos = new Map<string, CandidatoChecagem[]>()
  for (const membros of porNome.values()) {
    if (membros.length < 2) continue
    for (const membro of membros) grupos.set(`${membro.id}\u0000${membro.slug}`, membros)
  }
  return grupos
}

/**
 * Marcas que, no título, separam esta candidatura das homônimas: token do nome
 * completo que não está no nome de urna nem no nome completo das outras, e o
 * nome do estado quando nenhuma outra disputa pela mesma UF. Estado só conta
 * se o grupo inteiro disputa o mesmo cargo: com um presidenciável no grupo
 * (estado null), uma matéria sobre ele pode citar qualquer estado.
 */
export function marcadoresDistintivos(candidato: CandidatoChecagem, grupo: readonly CandidatoChecagem[]): string[] {
  const outros = grupo.filter((membro) => membro.id !== candidato.id || membro.slug !== candidato.slug)
  const urna = new Set(normalizarNome(candidato.nome_urna).split(" "))
  const deOutros = new Set(outros.flatMap((membro) => normalizarNome(membro.nome_completo).split(" ")))
  const marcadores = normalizarNome(candidato.nome_completo).split(" ")
    .filter((token) => token.length >= 4 && !PARTICULAS_NOME.has(token) && !urna.has(token) && !deOutros.has(token))
  const mesmoCargo = grupo.every((membro) => membro.cargo_disputado === candidato.cargo_disputado)
  const uf = candidato.estado
  if (mesmoCargo && uf && UF_NOMES[uf] && !outros.some((membro) => membro.estado === uf)) marcadores.push(normalizarNome(UF_NOMES[uf]))
  return [...new Set(marcadores)]
}

function tituloTemMarcador(titulo: string, marcadores: readonly string[]): boolean {
  const normalizado = ` ${normalizarNome(titulo)} `
  return marcadores.some((marcador) => normalizado.includes(` ${marcador} `))
}

/**
 * Aplica a regra de homônimo a um recibo já montado, sempre a partir dos leads
 * crus (`homonimo.leads_brutos`, ou `leads` na primeira aplicação). Pura,
 * idempotente e sem perda: reimportar com outro cadastro recalcula do zero, e
 * um recibo que deixa de ter homônimo recupera os leads originais.
 */
export function aplicarRegraHomonimo(recibo: ReciboChecagem, candidato: CandidatoChecagem, grupo: readonly CandidatoChecagem[] | undefined): ReciboChecagem {
  // Formato antigo: a regra já filtrou `leads` e não guardou os crus. Recalcular
  // a partir do que sobrou transformaria homônimo em "nada encontrado".
  if (recibo.homonimo && !Array.isArray(recibo.homonimo.leads_brutos)) {
    throw new Error(`Recibo de ${recibo.candidate_slug} tem regra de homônimo sem leads crus (formato antigo); refaça a busca dessa candidatura`)
  }
  const brutos = recibo.homonimo?.leads_brutos ?? recibo.leads
  const semHomonimo = !grupo || grupo.length < 2
  if (semHomonimo && !recibo.homonimo) return recibo
  const marcadores = semHomonimo ? [] : marcadoresDistintivos(candidato, grupo)
  const leads = semHomonimo ? brutos : brutos.filter((lead) => tituloTemMarcador(lead.titulo, marcadores))
  const descartados = brutos.length - leads.length
  const agencias: ReciboChecagem["agencias"] = {}
  for (const [id, estado] of Object.entries(recibo.agencias)) {
    agencias[id] = estado.status === "ok" ? { ...estado, leads: leads.filter((lead) => lead.agencia === id).length } : estado
  }
  const algumaFalhou = Object.values(agencias).some((estado) => estado.status === "erro")
  const result: ResultadoRecibo = leads.length > 0 ? "encontrado" : algumaFalhou ? "erro" : descartados > 0 ? "homonimo" : "vazio_confirmado"
  const { homonimo: _anterior, ...base } = recibo
  void _anterior
  if (semHomonimo) return { ...base, leads, agencias, result }
  return {
    ...base, leads, agencias, result,
    homonimo: { grupo: grupo.map((membro) => membro.slug).sort(), descartados, marcadores, leads_brutos: brutos },
  }
}

export function descricaoEscopo(): string {
  const nomes = (filtro: (agencia: AgenciaChecagem) => boolean) => AGENCIAS_CHECAGEM.filter(filtro).map((a) => a.nome).join(", ")
  const soGoogle = nomes((a) => !a.wpSearch && !a.buscaSite && !a.arquivo)
  return `uma consulta por agência (${AGENCIAS_CHECAGEM.map((a) => a.nome).join(", ")}) com o nome de urna; busca nativa WordPress em ${nomes((a) => Boolean(a.wpSearch))} (até ${PAGINAS_WP * 100} resultados); busca do site em ${nomes((a) => Boolean(a.buscaSite))} (até ${PAGINAS_BUSCA_SITE * ITENS_POR_PAGINA_BUSCA_SITE} resultados); arquivo completo da seção em ${nomes((a) => Boolean(a.arquivo))}, lido uma vez por rodada (título com só parte do nome exige o nome inteiro no texto da matéria); Google News RSS em ${soGoogle} e como segunda via das demais (teto de ${TETO_ITENS_POR_CONSULTA} itens); sem limite de data; lead exige o nome no título`
}

export function urlBuscaSite(nomeUrna: string, agencia: AgenciaChecagem, pagina: number): string | null {
  if (!agencia.buscaSite) return null
  return `${agencia.buscaSite}?q=${encodeURIComponent(nomeUrna.replace(/"/g, "").trim())}&page=${pagina}`
}

function atributo(tag: string, nome: string): string | null {
  return tag.match(new RegExp(`\\s${nome}="([^"]*)"`))?.[1] ?? null
}

/**
 * Página de resultados da busca do Aos Fatos: cada cartão tem um link
 * `/noticias/<slug>/` com o título no atributo `title`. `ultimaPagina` vem
 * dos links de paginação da mesma consulta.
 */
export function parseBuscaSite(html: string, base: string): { itens: ItemBusca[]; ultimaPagina: number | null } {
  const itens: ItemBusca[] = []
  const vistos = new Set<string>()
  let ultimaPagina: number | null = null
  for (const match of html.matchAll(/<a\s[^>]*>/g)) {
    const href = atributo(match[0], "href")
    if (!href) continue
    const pagina = href.match(/[?&](?:amp;)?page=(\d+)/)
    if (pagina && /[?&]q=/.test(href)) ultimaPagina = Math.max(ultimaPagina ?? 0, Number(pagina[1]))
    const titulo = atributo(match[0], "title")
    if (!titulo || !/^\/noticias\/[a-z0-9-]+\/$/.test(href)) continue
    const link = new URL(href, base).toString()
    if (vistos.has(link)) continue
    vistos.add(link)
    itens.push({ titulo: decodeEntities(titulo), link, fonte: "", fonte_url: link, data_publicacao: null })
  }
  return { itens, ultimaPagina }
}

function dataIso(value: unknown): string | null {
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

/** Página do feed Falkor do g1. Lança se não vier `items` em lista. */
export function parseArquivoFalkor(body: string): { itens: ItemBusca[]; proxima: number | null } {
  const data = JSON.parse(body) as { items?: unknown; nextPage?: unknown }
  if (!data || !Array.isArray(data.items)) throw new Error("feed do g1 sem lista de itens")
  const itens: ItemBusca[] = []
  for (const row of data.items) {
    const content = (row as { content?: Record<string, unknown> })?.content
    const titulo = typeof content?.title === "string" ? content.title.trim() : ""
    const url = typeof content?.url === "string" ? content.url : ""
    if (!titulo || !url.startsWith("https://")) continue
    const resumo = typeof content?.summary === "string" ? content.summary : ""
    itens.push({ titulo, link: url, fonte: "", fonte_url: url, data_publicacao: dataIso((row as { publication?: unknown }).publication), texto: normalizarNome(`${titulo} ${resumo}`) })
  }
  return { itens, proxima: typeof data.nextPage === "number" ? data.nextPage : null }
}

export function urlArquivoArc(arquivo: Extract<ArquivoSecao, { tipo: "arc" }>, offset: number): string {
  const body = JSON.stringify({ query: { bool: { must: [
    { term: { type: "story" } },
    { term: { "revision.published": 1 } },
    { nested: { path: "taxonomy.sections", query: { bool: { must: [{ regexp: { "taxonomy.sections._id": arquivo.secaoRegex } }] } } } },
  ] } } })
  const query = { body, headlineSearch: "", included_fields: "headlines.basic,canonical_url,display_date", offset: String(offset), query: "", size: ITENS_POR_PAGINA_ARC, sort: "display_date:desc, first_publish_date:desc" }
  return `${arquivo.url}?query=${encodeURIComponent(JSON.stringify(query))}&_website=${encodeURIComponent(arquivo.website)}`
}

/** Título, linha fina, descrição e parágrafos de uma história do Arc, sem HTML. */
function textoArc(row: Record<string, unknown>): string {
  const partes: string[] = []
  for (const campo of ["headlines", "subheadlines", "description"]) {
    const basic = (row[campo] as { basic?: unknown } | undefined)?.basic
    if (typeof basic === "string") partes.push(basic)
  }
  for (const elemento of Array.isArray(row.content_elements) ? row.content_elements as Array<Record<string, unknown>> : []) {
    if ((elemento?.type === "text" || elemento?.type === "header") && typeof elemento.content === "string") partes.push(elemento.content.replace(/<[^>]+>/g, " "))
  }
  return decodeEntities(partes.join(" "))
}

/** Página do `story-feed-query` do Arc. Lança se faltar `count` ou `content_elements`. */
export function parseArquivoArc(body: string, site: string): { itens: ItemBusca[]; total: number; lidos: number } {
  const data = JSON.parse(body) as { count?: unknown; content_elements?: unknown }
  if (!data || typeof data.count !== "number" || !Array.isArray(data.content_elements)) throw new Error("arquivo Arc sem count ou content_elements")
  const itens: ItemBusca[] = []
  for (const row of data.content_elements as Array<Record<string, unknown>>) {
    const headlines = row?.headlines as { basic?: unknown } | undefined
    const titulo = typeof headlines?.basic === "string" ? headlines.basic.trim() : ""
    const caminho = typeof row?.canonical_url === "string" ? row.canonical_url : ""
    if (!titulo || !caminho) continue
    const link = new URL(caminho, site).toString()
    if (!link.startsWith("https://")) continue
    itens.push({ titulo, link, fonte: "", fonte_url: link, data_publicacao: dataIso(row.display_date), texto: normalizarNome(textoArc(row)) })
  }
  return { itens, total: data.count, lidos: data.content_elements.length }
}

export function urlBuscaNativa(nomeUrna: string, agencia: AgenciaChecagem, pagina: number): string | null {
  if (!agencia.wpSearch) return null
  return `${agencia.wpSearch}?search=${encodeURIComponent(nomeUrna.replace(/"/g, ""))}&per_page=100&page=${pagina}`
}

/** Resposta de `/wp-json/wp/v2/search`: lista de `{ title, url }`. Lança se não for lista. */
export function parseBuscaNativa(body: string): ItemBusca[] {
  const data = JSON.parse(body) as unknown
  if (!Array.isArray(data)) throw new Error("busca nativa não devolveu lista")
  const itens: ItemBusca[] = []
  for (const row of data) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const titulo = typeof record.title === "string" ? decodeEntities(record.title) : null
    const url = typeof record.url === "string" ? record.url : null
    if (!titulo || !url || !url.startsWith("https://")) continue
    itens.push({ titulo, link: url, fonte: "", fonte_url: url, data_publicacao: null })
  }
  return itens
}

export function consultaDaAgencia(nomeUrna: string, agencia: AgenciaChecagem): string {
  const sites = agencia.sites.map((site) => `site:${site}`)
  const filtro = sites.length === 1 ? sites[0] : `(${sites.join(" OR ")})`
  return `"${nomeUrna.replace(/"/g, "")}" ${filtro}`
}

export function urlDeBusca(nomeUrna: string, agencia: AgenciaChecagem): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(consultaDaAgencia(nomeUrna, agencia))}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .trim()
}

/** Parser dos itens do RSS preservando o domínio declarado em `<source url>`. */
export function parseItensBusca(xml: string): ItemBusca[] {
  const itens: ItemBusca[] = []
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = match[1]
    const titulo = body.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    const link = body.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
    if (!titulo || !link || !link.startsWith("https://")) continue
    const source = body.match(/<source([^>]*)>([\s\S]*?)<\/source>/)
    const fonteUrl = source?.[1].match(/url="([^"]*)"/)?.[1] ?? null
    const pubDate = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()
    const parsed = pubDate ? new Date(pubDate) : null
    itens.push({
      titulo: decodeEntities(titulo),
      link: decodeEntities(link),
      fonte: source ? decodeEntities(source[2]) : "",
      fonte_url: fonteUrl ? decodeEntities(fonteUrl) : null,
      data_publicacao: parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null,
    })
  }
  return itens
}

function hostDe(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

/** Sufixo " - Veículo" que o Google News acrescenta ao título. */
export function tituloSemVeiculo(titulo: string, fonte: string): string {
  const suffix = ` - ${fonte}`
  return fonte && titulo.endsWith(suffix) ? titulo.slice(0, -suffix.length).trim() : titulo.trim()
}

/**
 * Leads de uma resposta: item do domínio da agência cujo título cita o
 * candidato. O critério de nome é o mesmo das notícias da ficha
 * (`newsTitleMentionsCandidate`), frouxo na direção de manter o lead: a
 * revisão editorial é quem descarta.
 */
export function leadsDaResposta(itens: readonly ItemBusca[], candidato: CandidatoChecagem, agencia: AgenciaChecagem): LeadChecagem[] {
  const vistos = new Set<string>()
  const leads: LeadChecagem[] = []
  for (const item of itens) {
    const host = hostDe(item.fonte_url)
    if (!host || !agencia.dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))) continue
    const titulo = tituloSemVeiculo(item.titulo, item.fonte)
    if (!newsTitleMentionsCandidate(titulo, { nome_urna: candidato.nome_urna, nome_completo: candidato.nome_completo })) continue
    const chave = stripAccents(titulo).toLowerCase()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    leads.push({ agencia: agencia.id, titulo, link: item.link, data_publicacao: item.data_publicacao })
  }
  return leads
}

export function montarRecibo(candidato: CandidatoChecagem, estados: Record<string, EstadoAgencia>, searchedAt: Date): ReciboChecagem {
  const agencias: ReciboChecagem["agencias"] = {}
  const leads: LeadChecagem[] = []
  let erro = false
  for (const agencia of AGENCIAS_CHECAGEM) {
    const estado = estados[agencia.id]
    if (!estado) {
      erro = true
      agencias[agencia.id] = { status: "erro", erro: "agência não consultada" }
      continue
    }
    if (estado.status === "erro") {
      erro = true
      agencias[agencia.id] = { status: "erro", erro: estado.erro.slice(0, 200) }
      continue
    }
    agencias[agencia.id] = {
      status: "ok", itens: estado.itens, leads: estado.leads.length,
      ...(estado.transporte ? { transporte: estado.transporte } : {}),
      ...(estado.falhas?.length ? { falhas: estado.falhas.map((falha) => falha.slice(0, 200)) } : {}),
    }
    leads.push(...estado.leads)
  }
  return {
    schema_version: SCHEMA_RECIBOS_CHECAGENS,
    candidate_id: candidato.id,
    candidate_slug: candidato.slug,
    candidate_name: candidato.nome_urna,
    office: candidato.cargo_disputado,
    uf: candidato.estado,
    searched_at: searchedAt.toISOString(),
    // Lead achado vale mesmo com outra agência em erro; ausência só com todas respondendo.
    result: leads.length > 0 ? "encontrado" : erro ? "erro" : "vazio_confirmado",
    leads,
    agencias,
    escopo: descricaoEscopo(),
  }
}

/** Linha de `coleta_log` do recibo. Volume é o número de leads, não de checagens publicadas. */
export function entradaColetaDoRecibo(recibo: ReciboChecagem): EntradaColeta {
  const porAgencia = AGENCIAS_CHECAGEM.map((agencia) => {
    const estado = recibo.agencias[agencia.id]
    return estado?.status === "ok" ? `${agencia.id}=${estado.leads ?? 0}/${estado.itens ?? 0}(${estado.transporte ?? "?"})` : `${agencia.id}=erro(${estado?.erro ?? "não consultada"})`
  }).join(" ")
  const homonimo = recibo.homonimo
    ? `; homônimo de ${recibo.homonimo.grupo.join(", ")}: ${recibo.homonimo.descartados} lead(s) sem marca distintiva no título`
    : ""
  return {
    fonte: FONTE_CHECAGENS_AGENCIAS,
    alvo: recibo.candidate_slug,
    escopo: "candidato",
    // Homônimo não prova achado nem ausência: fica indeterminado no log.
    resultado: recibo.result === "homonimo" ? "indeterminado" : recibo.result,
    volume: recibo.result === "encontrado" || recibo.result === "erro" ? recibo.leads.length : 0,
    detalhe: `${POLITICA_CHECAGENS}; leads/itens por agência: ${porAgencia}${homonimo}; ${recibo.escopo}`.slice(0, 1000),
  }
}

/** Forma pública, versionada no repositório e lida pelo site no build. */
export interface ReciboChecagemPublico {
  candidate_id: string
  candidate_slug: string
  searched_at: string
  result: "encontrado" | "vazio_confirmado"
  leads: number
  /** Agências que responderam nesta busca. Só elas podem aparecer no texto do site. */
  agencias: string[]
}

export interface CatalogoRecibosChecagens {
  schema_version: typeof SCHEMA_RECIBOS_CHECAGENS
  policy: typeof POLITICA_CHECAGENS
  agencias: string[]
  escopo: string
  updated_at: string
  receipts: ReciboChecagemPublico[]
}

/**
 * Consolida recibos novos sobre o catálogo anterior. Recibo com erro nunca
 * substitui um recibo válido anterior e nunca entra no catálogo público: o
 * site não pode afirmar ausência a partir de uma busca que falhou.
 *
 * `homonimos` são as chaves (id + slug) que o cadastro completo põe em grupo
 * de mesmo nome de urna. Para elas, só fica no catálogo o recibo desta rodada
 * que passou pela regra; entrada anterior sai mesmo quando a busca nova deu
 * erro, porque pode ter sido contada antes da regra.
 */
export function consolidarCatalogoRecibos(
  anterior: CatalogoRecibosChecagens | null,
  recibos: readonly ReciboChecagem[],
  now: Date,
  homonimos: ReadonlySet<string> = new Set(),
): CatalogoRecibosChecagens {
  const porChave = new Map<string, ReciboChecagemPublico>()
  for (const recibo of anterior?.receipts ?? []) {
    const chave = `${recibo.candidate_id}\u0000${recibo.candidate_slug}`
    if (!homonimos.has(chave)) porChave.set(chave, recibo)
  }
  for (const recibo of recibos) {
    if (recibo.result === "erro") continue
    const chave = `${recibo.candidate_id}\u0000${recibo.candidate_slug}`
    if (homonimos.has(chave) && !recibo.homonimo) continue
    const atual = porChave.get(chave)
    if (atual && atual.searched_at > recibo.searched_at) continue
    // Homônimo mais recente derruba o recibo público anterior: a contagem não é atribuível.
    if (recibo.result === "homonimo") {
      porChave.delete(chave)
      continue
    }
    porChave.set(chave, {
      candidate_id: recibo.candidate_id,
      candidate_slug: recibo.candidate_slug,
      searched_at: recibo.searched_at,
      result: recibo.result === "encontrado" ? "encontrado" : "vazio_confirmado",
      leads: recibo.result === "encontrado" ? recibo.leads.length : 0,
      agencias: AGENCIAS_CHECAGEM.filter((agencia) => recibo.agencias[agencia.id]?.status === "ok").map((agencia) => agencia.nome),
    })
  }
  return {
    schema_version: SCHEMA_RECIBOS_CHECAGENS,
    policy: POLITICA_CHECAGENS,
    agencias: AGENCIAS_CHECAGEM.map((agencia) => agencia.nome),
    escopo: descricaoEscopo(),
    updated_at: now.toISOString(),
    receipts: [...porChave.values()].sort((a, b) => a.candidate_slug.localeCompare(b.candidate_slug) || a.candidate_id.localeCompare(b.candidate_id)),
  }
}

export interface OpcoesColeta {
  /** Candidaturas a buscar nesta execução (pode ser recorte por --slugs ou --retomar). */
  roster: readonly CandidatoChecagem[]
  /**
   * Cadastro vivo inteiro, sem recorte. Os grupos de homônimos saem daqui:
   * buscar só uma Vera Lúcia não pode esquecer que existe a outra. Omitido,
   * vale `roster` (recorte nenhum).
   */
  rosterCompleto?: readonly CandidatoChecagem[]
  fetchText: (url: string) => Promise<{ status: number; body: string }>
  now?: () => Date
  /** Pausa entre consultas do mesmo trabalhador, para não martelar a fonte. */
  pausaMs?: number
  concorrencia?: number
  tentativas?: number
  /** Espera base depois de 429/503, multiplicada pela tentativa. */
  esperaBloqueioMs?: number
  /** Desliga a via Google News (ex.: IP bloqueado). Agência sem via nativa vira erro declarado. */
  semGoogle?: boolean
  /** Interrompe a rodada no primeiro 429/503 do Google, sem insistir. Recibos já concluídos ficam. */
  pararNoBloqueio?: boolean
  /** Limites de taxa seguidos que abrem o disjuntor: o Google deixa de ser consultado na rodada. */
  limiteBloqueiosSeguidos?: number
  /** Orçamento total de espera por limite de taxa na rodada inteira. */
  orcamentoEsperaMs?: number
  /** Teto de matérias abertas na rodada para confirmar menção fraca no título (arquivo do g1). */
  orcamentoPaginasConfirmacao?: number
  /** Intervalo mínimo entre pedidos ao mesmo host, somado a todos os trabalhadores. 0 desliga. */
  intervaloHostMs?: number
  /** Relógio do intervalo por host (testes). */
  relogio?: () => number
  sleep?: (ms: number) => Promise<void>
  onRecibo?: (recibo: ReciboChecagem, indice: number) => void
}

/** Estado compartilhado da via Google na rodada. Aberto, a via responde erro sem pedido. */
export interface DisjuntorGoogle {
  bloqueiosSeguidos: number
  esperaGastaMs: number
  aberto: string | null
}

type OpcoesConsulta = Required<Pick<OpcoesColeta, "fetchText" | "tentativas" | "sleep" | "pausaMs" | "esperaBloqueioMs" | "semGoogle" | "pararNoBloqueio" | "limiteBloqueiosSeguidos" | "orcamentoEsperaMs">> & {
  disjuntor: DisjuntorGoogle
  /** Arquivo de cada agência, lido uma vez por rodada e compartilhado entre trabalhadores. */
  arquivos: Map<string, Promise<ArquivoLido>>
  /** Resultado da sonda da busca do site por agência: null quando o leitor funciona. */
  sondas: Map<string, Promise<string | null>>
  /** Rodada interrompida: leituras de arquivo em curso param na próxima página. */
  parada: { abortada: boolean }
  /** Texto de matérias abertas para confirmar menção, compartilhado entre candidaturas. */
  paginas: Map<string, Promise<{ texto: string } | { erro: string }>>
  orcamentoPaginas: { total: number; restantes: number }
}

type ArquivoLido = { status: "ok"; itens: ItemBusca[] } | { status: "erro"; erro: string }

/**
 * Intervalo mínimo por host. A vez é reservada de forma síncrona, então
 * trabalhadores concorrentes nunca pedem ao mesmo host no mesmo instante.
 */
export function comIntervaloPorHost(
  fetchText: OpcoesColeta["fetchText"],
  intervaloMs: number,
  sleep: (ms: number) => Promise<void>,
  relogio: () => number = Date.now,
): OpcoesColeta["fetchText"] {
  if (intervaloMs <= 0) return fetchText
  const proximaVez = new Map<string, number>()
  return async (url) => {
    const host = new URL(url).host
    const agora = relogio()
    const vez = Math.max(agora, proximaVez.get(host) ?? 0)
    proximaVez.set(host, vez + intervaloMs)
    if (vez > agora) await sleep(vez - agora)
    return fetchText(url)
  }
}

/** Um pedido com novas tentativas em erro de rede ou HTTP fora de 2xx; `aceitar` devolve status tratados como resposta. */
async function pedirComTentativas(url: string, opcoes: OpcoesConsulta, aceitar: (status: number) => boolean = () => false): Promise<{ status: number; body: string } | { erro: string }> {
  let ultimoErro = "sem resposta"
  for (let tentativa = 0; tentativa < opcoes.tentativas; tentativa++) {
    if (tentativa > 0) await opcoes.sleep(opcoes.pausaMs * 4 * tentativa)
    try {
      const resposta = await opcoes.fetchText(url)
      if ((resposta.status >= 200 && resposta.status < 300) || aceitar(resposta.status)) return resposta
      ultimoErro = `HTTP ${resposta.status}`
    } catch (error) {
      ultimoErro = error instanceof Error ? error.message : String(error)
    }
  }
  return { erro: ultimoErro }
}

async function lerPaginaBuscaSite(nome: string, agencia: AgenciaChecagem, pagina: number, opcoes: OpcoesConsulta): Promise<{ itens: ItemBusca[]; ultimaPagina: number | null; fim: boolean } | { erro: string }> {
  // Página além da última responde 404; na primeira, 404 é erro.
  const resposta = await pedirComTentativas(urlBuscaSite(nome, agencia, pagina)!, opcoes, (status) => pagina > 1 && status === 404)
  if ("erro" in resposta) return resposta
  if (resposta.status === 404) return { itens: [], ultimaPagina: null, fim: true }
  return { ...parseBuscaSite(resposta.body, agencia.buscaSite!), fim: false }
}

async function consultarBuscaSite(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  // Página vazia não se distingue de leitor quebrado; a sonda prova que o leitor acha resultado.
  let sonda = opcoes.sondas.get(agencia.id)
  if (!sonda) {
    sonda = lerPaginaBuscaSite(SONDA_BUSCA_SITE, agencia, 1, opcoes).then((lida) =>
      "erro" in lida ? `sonda: ${lida.erro}` : lida.itens.length === 0 ? `sonda "${SONDA_BUSCA_SITE}" sem resultado: leitor da página quebrado` : null)
    opcoes.sondas.set(agencia.id, sonda)
  }
  const falhaSonda = await sonda
  if (falhaSonda) {
    // Falha não fica em cache: a próxima candidatura sonda de novo (erro transitório não derruba a rodada).
    if (opcoes.sondas.get(agencia.id) === sonda) opcoes.sondas.delete(agencia.id)
    return { status: "erro", erro: `busca do site: ${falhaSonda}` }
  }
  const itens: ItemBusca[] = []
  for (let pagina = 1; pagina <= PAGINAS_BUSCA_SITE; pagina++) {
    if (pagina > 1) await opcoes.sleep(opcoes.pausaMs)
    const lida = await lerPaginaBuscaSite(candidato.nome_urna, agencia, pagina, opcoes)
    if ("erro" in lida) return { status: "erro", erro: `busca do site: ${lida.erro}` }
    itens.push(...lida.itens)
    if (lida.fim || lida.itens.length < ITENS_POR_PAGINA_BUSCA_SITE || !lida.ultimaPagina || pagina >= lida.ultimaPagina) break
  }
  return { status: "ok", itens: itens.length, leads: leadsDaResposta(itens, candidato, agencia), transporte: "busca-site" }
}

async function lerArquivo(arquivo: ArquivoSecao, opcoes: OpcoesConsulta): Promise<ArquivoLido> {
  const porLink = new Map<string, ItemBusca>()
  try {
    if (arquivo.tipo === "falkor") {
      let pagina: number | null = 1
      let lidas = 0
      while (pagina !== null) {
        if (opcoes.parada.abortada) return { status: "erro", erro: "rodada interrompida" }
        if (++lidas > MAX_PAGINAS_ARQUIVO) return { status: "erro", erro: `arquivo sem fim depois de ${MAX_PAGINAS_ARQUIVO} páginas` }
        const resposta = await pedirComTentativas(`${arquivo.url}${pagina}`, opcoes)
        if ("erro" in resposta) return { status: "erro", erro: `arquivo, página ${pagina}: ${resposta.erro}` }
        const lida = parseArquivoFalkor(resposta.body)
        for (const item of lida.itens) porLink.set(item.link, item)
        // Página vazia é o fim do arquivo.
        pagina = lida.itens.length === 0 ? null : lida.proxima
      }
    } else {
      let offset = 0
      let total = Number.POSITIVE_INFINITY
      for (let lidas = 1; offset < total; lidas++) {
        if (opcoes.parada.abortada) return { status: "erro", erro: "rodada interrompida" }
        if (lidas > MAX_PAGINAS_ARQUIVO) return { status: "erro", erro: `arquivo sem fim depois de ${MAX_PAGINAS_ARQUIVO} páginas` }
        const resposta = await pedirComTentativas(urlArquivoArc(arquivo, offset), opcoes)
        if ("erro" in resposta) return { status: "erro", erro: `arquivo, offset ${offset}: ${resposta.erro}` }
        const lida = parseArquivoArc(resposta.body, arquivo.site)
        total = lida.total
        for (const item of lida.itens) porLink.set(item.link, item)
        if (lida.lidos === 0 && offset < total) return { status: "erro", erro: `arquivo parou no offset ${offset} de ${total}` }
        offset += lida.lidos
      }
    }
  } catch (error) {
    return { status: "erro", erro: `arquivo: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (porLink.size === 0) return { status: "erro", erro: "arquivo vazio: rota mudou" }
  return { status: "ok", itens: [...porLink.values()] }
}

/** Nome de urna ou nome completo inteiro, como sequência de palavras, num texto já normalizado. */
export function textoCitaNomeInteiro(textoNormalizado: string, candidato: CandidatoChecagem): boolean {
  const alvo = ` ${textoNormalizado} `
  return [candidato.nome_urna, candidato.nome_completo].some((nome) => {
    const normalizado = normalizarNome(nome)
    return normalizado.length > 0 && alvo.includes(` ${normalizado} `)
  })
}

/** Texto do corpo da matéria (região `<article>`), normalizado. */
export function textoDaPagina(html: string): string {
  const inicio = html.indexOf("<article")
  const fim = html.lastIndexOf("</article>")
  const corpo = inicio >= 0 && fim > inicio ? html.slice(inicio, fim) : html
  return normalizarNome(decodeEntities(corpo.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")))
}

async function textoConfirmado(link: string, opcoes: OpcoesConsulta): Promise<{ texto: string } | { erro: string }> {
  let pagina = opcoes.paginas.get(link)
  if (!pagina) {
    if (opcoes.orcamentoPaginas.restantes <= 0) return { erro: `teto de ${opcoes.orcamentoPaginas.total} páginas de confirmação na rodada` }
    opcoes.orcamentoPaginas.restantes--
    pagina = pedirComTentativas(link, opcoes).then((resposta) => "erro" in resposta ? resposta : { texto: textoDaPagina(resposta.body) })
    opcoes.paginas.set(link, pagina)
  }
  return pagina
}

/**
 * Leads de um arquivo de seção. O arquivo não passou por busca com o nome,
 * então o critério frouxo de título (`newsTitleMentionsCandidate`) sozinho
 * aceitaria "Felipe Neto" para "ACM Neto". Título com o nome inteiro vale;
 * título só com parte do nome exige o nome inteiro no texto da matéria, que
 * é o que a frase entre aspas garantia na busca do Google.
 */
async function leadsDoArquivo(itens: readonly ItemBusca[], candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<{ leads: LeadChecagem[] } | { erro: string }> {
  const confirmarNaPagina = agencia.arquivo?.tipo === "falkor" && agencia.arquivo.confirmarNaPagina === true
  const vistos = new Set<string>()
  const leads: LeadChecagem[] = []
  for (const item of itens) {
    const host = hostDe(item.fonte_url)
    if (!host || !agencia.dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))) continue
    if (!newsTitleMentionsCandidate(item.titulo, { nome_urna: candidato.nome_urna, nome_completo: candidato.nome_completo })) continue
    const chave = stripAccents(item.titulo).toLowerCase()
    if (vistos.has(chave)) continue
    let confirmado = textoCitaNomeInteiro(normalizarNome(item.titulo), candidato) || (item.texto !== undefined && textoCitaNomeInteiro(item.texto, candidato))
    if (!confirmado && confirmarNaPagina) {
      const pagina = await textoConfirmado(item.link, opcoes)
      if ("erro" in pagina) return { erro: `confirmação de ${item.link}: ${pagina.erro}` }
      confirmado = textoCitaNomeInteiro(pagina.texto, candidato)
    }
    if (!confirmado) continue
    vistos.add(chave)
    leads.push({ agencia: agencia.id, titulo: item.titulo, link: item.link, data_publicacao: item.data_publicacao })
  }
  return { leads }
}

async function consultarArquivo(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  let lido = opcoes.arquivos.get(agencia.id)
  if (!lido) {
    lido = lerArquivo(agencia.arquivo!, opcoes)
    opcoes.arquivos.set(agencia.id, lido)
  }
  const arquivo = await lido
  if (arquivo.status === "erro") return { status: "erro", erro: `arquivo da seção: ${arquivo.erro}` }
  const leads = await leadsDoArquivo(arquivo.itens, candidato, agencia, opcoes)
  if ("erro" in leads) return { status: "erro", erro: `arquivo da seção: ${leads.erro}` }
  return { status: "ok", itens: arquivo.itens.length, leads: leads.leads, transporte: "arquivo-secao" }
}

/** Limite de taxa com `pararNoBloqueio`: a rodada para e a candidatura em curso não gera recibo. */
export class BloqueioDeTaxa extends Error {
  constructor(readonly status: number, readonly candidateSlug: string) {
    super(`limite de taxa (HTTP ${status}) em ${candidateSlug}`)
  }
}

async function consultarNativa(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  const itens: ItemBusca[] = []
  for (let pagina = 1; pagina <= PAGINAS_WP; pagina++) {
    let ultimoErro = "sem resposta"
    let lidos: ItemBusca[] | null = null
    for (let tentativa = 0; tentativa < opcoes.tentativas && !lidos; tentativa++) {
      if (tentativa > 0) await opcoes.sleep(opcoes.pausaMs * 4 * tentativa)
      try {
        const resposta = await opcoes.fetchText(urlBuscaNativa(candidato.nome_urna, agencia, pagina)!)
        // WordPress responde 400 ao pedir página além da última.
        if (pagina > 1 && resposta.status === 400) { lidos = []; break }
        if (resposta.status < 200 || resposta.status >= 300) { ultimoErro = `HTTP ${resposta.status}`; continue }
        lidos = parseBuscaNativa(resposta.body)
      } catch (error) {
        ultimoErro = error instanceof Error ? error.message : String(error)
      }
    }
    if (!lidos) return { status: "erro", erro: `busca nativa: ${ultimoErro}` }
    itens.push(...lidos)
    if (lidos.length < 100) break
    await opcoes.sleep(opcoes.pausaMs)
  }
  return { status: "ok", itens: itens.length, leads: leadsDaResposta(itens, candidato, agencia), transporte: "wp-rest" }
}

function temViaDireta(agencia: AgenciaChecagem): boolean {
  return Boolean(agencia.wpSearch || agencia.buscaSite || agencia.arquivo)
}

async function consultarAgencia(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  if (!temViaDireta(agencia)) return consultarGoogle(candidato, agencia, opcoes)
  const direta = agencia.wpSearch
    ? await consultarNativa(candidato, agencia, opcoes)
    : agencia.buscaSite
      ? await consultarBuscaSite(candidato, agencia, opcoes)
      : await consultarArquivo(candidato, agencia, opcoes)
  if (direta.status === "ok") return direta
  const google = await consultarGoogle(candidato, agencia, opcoes)
  if (google.status === "ok") return { ...google, falhas: [direta.erro] }
  // `google.erro` já começa com "google-news:".
  return { status: "erro", erro: `${direta.erro}; ${google.erro}` }
}

async function consultarGoogle(
  candidato: CandidatoChecagem,
  agencia: AgenciaChecagem,
  opcoes: OpcoesConsulta,
): Promise<EstadoAgencia> {
  if (opcoes.semGoogle) return { status: "erro", erro: "google-news: via desligada nesta execução" }
  const disjuntor = opcoes.disjuntor
  let ultimoErro = "sem resposta"
  let bloqueado = false
  for (let tentativa = 0; tentativa < opcoes.tentativas; tentativa++) {
    if (disjuntor.aberto) return { status: "erro", erro: `google-news: ${disjuntor.aberto}` }
    if (tentativa > 0) {
      // Limite de taxa pede espera longa, descontada do orçamento da rodada; erro comum, pausa curta.
      const espera = bloqueado ? opcoes.esperaBloqueioMs * tentativa : opcoes.pausaMs * 4 * tentativa
      if (bloqueado && disjuntor.esperaGastaMs + espera > opcoes.orcamentoEsperaMs) {
        disjuntor.aberto = `orçamento de espera por limite de taxa esgotado (${Math.round(opcoes.orcamentoEsperaMs / 1000)} s)`
        return { status: "erro", erro: `google-news: ${disjuntor.aberto}` }
      }
      if (bloqueado) disjuntor.esperaGastaMs += espera
      await opcoes.sleep(espera)
    }
    try {
      const resposta = await opcoes.fetchText(urlDeBusca(candidato.nome_urna, agencia))
      if (resposta.status < 200 || resposta.status >= 300) {
        ultimoErro = `HTTP ${resposta.status}`
        bloqueado = resposta.status === 429 || resposta.status === 503
        if (bloqueado && opcoes.pararNoBloqueio) throw new BloqueioDeTaxa(resposta.status, candidato.slug)
        if (bloqueado && ++disjuntor.bloqueiosSeguidos >= opcoes.limiteBloqueiosSeguidos) {
          disjuntor.aberto = `disjuntor aberto após ${disjuntor.bloqueiosSeguidos} limites de taxa seguidos`
          return { status: "erro", erro: `google-news: ${disjuntor.aberto}` }
        }
        continue
      }
      disjuntor.bloqueiosSeguidos = 0
      if (!isValidGoogleNewsRss(resposta.body)) {
        ultimoErro = "resposta não é RSS válido"
        continue
      }
      const itens = parseItensBusca(resposta.body)
      return { status: "ok", itens: itens.length, leads: leadsDaResposta(itens, candidato, agencia), transporte: "google-news" }
    } catch (error) {
      if (error instanceof BloqueioDeTaxa) throw error
      ultimoErro = error instanceof Error ? error.message : String(error)
    }
  }
  return { status: "erro", erro: `google-news: ${ultimoErro}` }
}

export async function coletarChecagens(opcoes: OpcoesColeta): Promise<ReciboChecagem[]> {
  const now = opcoes.now ?? (() => new Date())
  const sleep = opcoes.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const pausaMs = opcoes.pausaMs ?? 400
  const tentativas = Math.max(1, opcoes.tentativas ?? 3)
  const esperaBloqueioMs = Math.max(0, opcoes.esperaBloqueioMs ?? 30_000)
  const disjuntor: DisjuntorGoogle = { bloqueiosSeguidos: 0, esperaGastaMs: 0, aberto: null }
  const orcamentoPaginas = Math.max(0, opcoes.orcamentoPaginasConfirmacao ?? MAX_PAGINAS_CONFIRMACAO)
  const completo = opcoes.rosterCompleto ?? opcoes.roster
  const noCompleto = new Set(completo.map((candidato) => `${candidato.id}\u0000${candidato.slug}`))
  const foraDoCadastro = opcoes.roster.filter((candidato) => !noCompleto.has(`${candidato.id}\u0000${candidato.slug}`))
  if (foraDoCadastro.length) throw new Error(`Recorte fora do cadastro completo: ${foraDoCadastro.map((candidato) => candidato.slug).join(", ")}`)
  const homonimos = gruposDeHomonimos(completo)
  const consulta: OpcoesConsulta = {
    fetchText: comIntervaloPorHost(opcoes.fetchText, Math.max(0, opcoes.intervaloHostMs ?? 0), sleep, opcoes.relogio),
    tentativas, sleep, pausaMs, esperaBloqueioMs,
    semGoogle: opcoes.semGoogle ?? false,
    pararNoBloqueio: opcoes.pararNoBloqueio ?? false,
    limiteBloqueiosSeguidos: Math.max(1, opcoes.limiteBloqueiosSeguidos ?? 3),
    orcamentoEsperaMs: Math.max(0, opcoes.orcamentoEsperaMs ?? 10 * 60_000),
    disjuntor,
    arquivos: new Map(),
    sondas: new Map(),
    parada: { abortada: false },
    paginas: new Map(),
    orcamentoPaginas: { total: orcamentoPaginas, restantes: orcamentoPaginas },
  }
  const concorrencia = Math.min(4, Math.max(1, opcoes.concorrencia ?? 2))
  const identidades = new Set<string>()
  for (const candidato of opcoes.roster) {
    if (!candidato.id || !candidato.slug || !candidato.nome_urna?.trim()) throw new Error("Roster inválido: candidatura sem id, slug ou nome de urna")
    if (candidato.cargo_disputado !== "Presidente" && candidato.cargo_disputado !== "Governador") throw new Error(`Cargo fora do escopo: ${candidato.slug}`)
    const chave = `${candidato.id}\u0000${candidato.slug}`
    if (identidades.has(chave)) throw new Error(`Candidatura duplicada no roster: ${candidato.slug}`)
    identidades.add(chave)
  }
  const recibos: ReciboChecagem[] = new Array(opcoes.roster.length)
  // Arquivos de seção começam já: correm em paralelo às buscas por candidatura (hosts diferentes).
  if (opcoes.roster.length > 0) {
    for (const agencia of AGENCIAS_CHECAGEM) if (agencia.arquivo) consulta.arquivos.set(agencia.id, lerArquivo(agencia.arquivo, consulta))
  }
  let proximo = 0
  // Abort compartilhado: um trabalhador que bate no limite para os outros também.
  let abortado = false
  const trabalhador = async () => {
    while (!abortado && proximo < opcoes.roster.length) {
      const indice = proximo++
      const candidato = opcoes.roster[indice]
      const estados: Record<string, EstadoAgencia> = {}
      for (const agencia of AGENCIAS_CHECAGEM) {
        if (abortado) return
        // Arquivo de seção não pede nada por candidatura; Google desligado ou em disjuntor também não.
        const semPedido = Boolean(agencia.arquivo) || (!temViaDireta(agencia) && (consulta.semGoogle || disjuntor.aberto !== null))
        try {
          estados[agencia.id] = await consultarAgencia(candidato, agencia, consulta)
        } catch (error) {
          if (error instanceof BloqueioDeTaxa) abortado = consulta.parada.abortada = true
          throw error
        }
        if (!semPedido) await sleep(pausaMs)
      }
      // Outro trabalhador bateu no limite enquanto este buscava: sem recibo tardio,
      // para o checkpoint e o resultado final serem o mesmo conjunto.
      if (abortado) return
      const recibo = aplicarRegraHomonimo(montarRecibo(candidato, estados, now()), candidato, homonimos.get(`${candidato.id}\u0000${candidato.slug}`))
      recibos[indice] = recibo
      opcoes.onRecibo?.(recibo, indice)
    }
  }
  await Promise.all(Array.from({ length: concorrencia }, trabalhador))
  return recibos.filter(Boolean)
}

export interface ResumoColeta {
  total: number
  encontrado: number
  vazio_confirmado: number
  homonimo: number
  erro: number
  encontrado_parcial: number
  leads: number
  erros_por_agencia: Record<string, number>
}

export function resumirColeta(recibos: readonly ReciboChecagem[]): ResumoColeta {
  const errosPorAgencia: Record<string, number> = {}
  for (const recibo of recibos) {
    for (const [agencia, estado] of Object.entries(recibo.agencias)) {
      if (estado.status === "erro") errosPorAgencia[agencia] = (errosPorAgencia[agencia] ?? 0) + 1
    }
  }
  return {
    total: recibos.length,
    encontrado: recibos.filter((recibo) => recibo.result === "encontrado").length,
    vazio_confirmado: recibos.filter((recibo) => recibo.result === "vazio_confirmado").length,
    homonimo: recibos.filter((recibo) => recibo.result === "homonimo").length,
    erro: recibos.filter((recibo) => recibo.result === "erro").length,
    encontrado_parcial: recibos.filter((recibo) => recibo.result === "encontrado" && Object.values(recibo.agencias).some((estado) => estado.status === "erro")).length,
    leads: recibos.reduce((total, recibo) => total + recibo.leads.length, 0),
    erros_por_agencia: errosPorAgencia,
  }
}

/** Recibo que precisa ser refeito: erro geral ou alguma agência sem resposta. */
export function reciboIncompleto(recibo: ReciboChecagem): boolean {
  return recibo.result === "erro" || Object.values(recibo.agencias).some((estado) => estado.status === "erro")
}

/**
 * Junta uma retomada à rodada anterior: o recibo novo substitui o antigo da
 * mesma candidatura, os demais ficam como estavam.
 */
export function mesclarRecibos(anteriores: readonly ReciboChecagem[], novos: readonly ReciboChecagem[]): ReciboChecagem[] {
  const novosPorChave = new Map(novos.map((recibo) => [`${recibo.candidate_id}\u0000${recibo.candidate_slug}`, recibo]))
  const mesclados = anteriores.map((recibo) => novosPorChave.get(`${recibo.candidate_id}\u0000${recibo.candidate_slug}`) ?? recibo)
  const existentes = new Set(anteriores.map((recibo) => `${recibo.candidate_id}\u0000${recibo.candidate_slug}`))
  for (const recibo of novos) if (!existentes.has(`${recibo.candidate_id}\u0000${recibo.candidate_slug}`)) mesclados.push(recibo)
  return mesclados
}
