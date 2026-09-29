/**
 * Coleta nominal de checagens (política pf-checagens-v2).
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

import { load } from "cheerio"
import { stripAccents } from "../../src/lib/strip-accents"
import { isValidGoogleNewsRss } from "../../src/lib/news/google-news"
import { newsTitleMentionsCandidate } from "../../src/lib/news/name-match"
import type { EntradaColeta } from "./coleta-log"
import { decidirPublicacaoChecagem } from "../checagens-jev/decisao"
import { parseArquivoUol, parseBuscaAfp, trechosAfp, trechosUol, urlArquivoUol, urlBuscaAfp, urlProximaUol } from "./checagens-fontes-diretas"

export const FONTE_CHECAGENS_AGENCIAS = "checagens-agencias"
export const SCHEMA_RECIBOS_CHECAGENS = "checagens-recibos-v1" as const
export const POLITICA_CHECAGENS = "pf-checagens-v2"
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
  fonteDireta?: "uol-arquivo" | "afp-busca"
}

/**
 * - `falkor`: feed paginado da seção no g1 (10 itens por página, do mais novo
 *   ao mais antigo, até a página vazia);
 * - `arc`: consulta `story-feed-query` do Arc Publishing (100 itens por
 *   página, com o total em `count`).
 */
export type ArquivoSecao =
  | { tipo: "falkor"; url: string; piso: PisoArquivo }
  | { tipo: "arc"; url: string; site: string; website: string; secaoRegex: string; piso: PisoArquivo }

/**
 * Leitura parcial não pode virar ausência: o arquivo só vale com pelo menos
 * `itens` itens e com o mais antigo publicado até `maisAntigoAte` (AAAA-MM-DD).
 */
export interface PisoArquivo {
  itens: number
  maisAntigoAte: string
}

export type TransporteBusca = "wp-rest" | "busca-site" | "arquivo-secao" | "afp-busca" | "uol-arquivo" | "google-news"
/** Limite operacional: atingir o teto sem prova do fim marca a agência como parcial. */
export const PAGINAS_WP = 3
/** Limite operacional: a próxima página visível no teto marca a agência como parcial. */
export const PAGINAS_BUSCA_SITE = 9
export const ITENS_POR_PAGINA_BUSCA_SITE = 12
/** Nome que sempre tem checagem: se a sonda não acha nada, o leitor da página quebrou. */
export const SONDA_BUSCA_SITE = "Lula"
export const SONDA_BUSCA_WP = "Lula"
/** Teto de páginas do arquivo, contra paginação que nunca termina. */
export const MAX_PAGINAS_ARQUIVO = 2_000
export const ITENS_POR_PAGINA_ARC = 100
/** Itens por página do feed Falkor: página cheia sem `nextPage` é paginação que mudou. */
export const ITENS_POR_PAGINA_FALKOR = 10
/** Falhas seguidas da via direta de uma agência que abrem o disjuntor dela (sem cair no Google). */
export const LIMITE_FALHAS_DIRETAS = 3
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
    // Instância do feed da página https://g1.globo.com/fato-ou-fake/. Em 26/09/2026:
    // 408 páginas, 4.079 itens, o mais antigo de 27/03/2017; a última página tem 9 itens e não tem nextPage.
    // O feed só traz título e resumo: título com parte do nome abre a matéria para confirmar.
    arquivo: {
      tipo: "falkor", url: "https://falkor-cda.bastian.globo.com/tenants/g1/instances/9a0574d8-bc61-4d35-9488-7733f754f881/posts/page/",
      piso: { itens: 4_000, maisAntigoAte: "2018-12-31" },
    },
  },
  {
    id: "estadao-verifica", nome: "Estadão Verifica", sites: ["estadao.com.br/estadao-verifica"], dominios: ["estadao.com.br"],
    // Mesma consulta que a página https://www.estadao.com.br/estadao-verifica/ faz.
    // Em 26/09/2026: count 6.381; a data do item mais antigo sai no recibo (desde).
    arquivo: {
      tipo: "arc", url: "https://www.estadao.com.br/pf/api/v3/content/fetch/story-feed-query", site: "https://www.estadao.com.br", website: "estadao",
      secaoRegex: ".*estadao-verifica.*", piso: { itens: 6_000, maisAntigoAte: "2019-12-31" },
    },
  },
  { id: "uol-confere", nome: "UOL Confere", sites: ["noticias.uol.com.br/confere"], dominios: ["uol.com.br"], fonteDireta: "uol-arquivo" },
  { id: "afp-checamos", nome: "AFP Checamos", sites: ["checamos.afp.com"], dominios: ["afp.com"], fonteDireta: "afp-busca" },
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
  /**
   * Trechos do corpo já normalizados, um por bloco (linha fina, descrição,
   * parágrafo), para confirmar menção fraca no título. Casados um a um: juntar
   * os blocos casa nome pela emenda ("não mostra Ciro" + "Gomes de Sá").
   */
  trechos?: string[]
  /** Vídeo: a página não tem corpo de matéria; o único texto além do título é este resumo (caixa original). */
  semCorpo?: boolean
  resumo?: string
  /** Onde ler o corpo para confirmar título com só parte do nome. Sem isto e sem trechos, o lead fica pendente. */
  corpo?: CorpoItem
}

/**
 * - `wp-json`: objeto REST do WordPress (`_links.self` da busca) com `content` e `excerpt`;
 * - `html-prose`: página do Aos Fatos, corpo no `div.prose`;
 * - `html-article`: página do g1, corpo no `<article itemprop="articleBody">`.
 */
export interface CorpoItem {
  url: string
  formato: "wp-json" | "html-prose" | "html-article" | "html-uol" | "html-afp"
}

export interface LeadChecagem {
  agencia: string
  titulo: string
  link: string
  data_publicacao: string | null
  /** Evidência local para a avaliação editorial em sombra; ausente quando o título bastou. */
  confirmado_por?: "corpo" | "resumo"
  trecho_confirmacao?: string
}

export interface LeadMesaChecagem extends LeadChecagem {
  motivo: "regra3" | "identidade_jev"
  noul_identidade: number | null
}

export type EstadoAgencia =
  | { status: "ok"; itens: number; leads: LeadChecagem[]; mesa?: LeadMesaChecagem[]; transporte?: TransporteBusca; falhas?: string[]; desde?: string; pendentes?: number; descartados?: number }
  | { status: "erro"; erro: string }

/**
 * `homonimo`: todas as agências responderam e houve matéria com o nome de urna,
 * mas outra candidatura usa o mesmo nome e nenhum título trouxe marca que
 * separe as duas. Não é ausência nem achado; não entra no catálogo público.
 */
/**
 * `nao_confirmado`: todas responderam, nenhum lead confirmado pelo nome
 * completo, mas ficou item pendente: título com só parte do nome numa rota sem
 * corpo para conferir (Google News) ou lead à espera da Mesa. Não é ausência
 * nem achado; fica fora do catálogo. Item descartado (o corpo mostrou outra
 * pessoa, ou a Mesa descartou) não impede afirmar ausência.
 */
export type ResultadoRecibo = "encontrado" | "vazio_confirmado" | "erro" | "homonimo" | "nao_confirmado"

export interface ReciboChecagem {
  schema_version: typeof SCHEMA_RECIBOS_CHECAGENS
  policy: string
  candidate_id: string
  candidate_slug: string
  candidate_name: string
  office: CandidatoChecagem["cargo_disputado"]
  uf: string | null
  searched_at: string
  result: ResultadoRecibo
  leads: LeadChecagem[]
  /** Tabela privada de revisão: candidatos a lead sem decisão publicável. */
  mesa?: LeadMesaChecagem[]
  /** `desde`: data (AAAA-MM-DD) do item mais antigo do arquivo de seção; antes dela a busca não cobre. */
  /** `pendentes`: títulos com só parte do nome sem corpo para conferir; `descartados`: parte do nome que o corpo não confirmou ou colada a outra pessoa. */
  agencias: Record<string, { status: "ok" | "erro"; itens?: number; leads?: number; erro?: string; transporte?: TransporteBusca; falhas?: string[]; desde?: string; pendentes?: number; descartados?: number }>
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
  const pendentes = Object.values(agencias).some((estado) => estado.status === "ok" && (estado.pendentes ?? 0) > 0)
  const result: ResultadoRecibo = leads.length > 0 ? "encontrado" : algumaFalhou ? "erro" : pendentes ? "nao_confirmado" : descartados > 0 ? "homonimo" : "vazio_confirmado"
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
  const soGoogle = nomes((a) => !a.wpSearch && !a.buscaSite && !a.arquivo && !a.fonteDireta)
  return `uma consulta por agência (${AGENCIAS_CHECAGEM.map((a) => a.nome).join(", ")}) com o nome de urna; busca nativa WordPress em ${nomes((a) => Boolean(a.wpSearch))} (até ${PAGINAS_WP * 100} resultados); busca do site em ${nomes((a) => Boolean(a.buscaSite))} (até ${PAGINAS_BUSCA_SITE * ITENS_POR_PAGINA_BUSCA_SITE} resultados); arquivo completo da seção em ${nomes((a) => Boolean(a.arquivo))}, lido uma vez por rodada; arquivo do UOL Confere e busca nativa da AFP Checamos sem Google; Google News RSS em ${soGoogle || "nenhuma agência"} como segunda via quando a rota direta falha (teto de ${TETO_ITENS_POR_CONSULTA} itens); buscas sem limite de data, arquivos de seção só a partir do item mais antigo lido (campo desde do recibo); lead exige o nome completo no título, ou parte dele no título e o nome completo no corpo (no resumo, para vídeo), sem parte colada a outro nome próprio; na rota sem corpo (Google News) o título parcial fica pendente e o recibo sem lead confirmado não entra no catálogo público`
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
    itens.push({ titulo: decodeEntities(titulo), link, fonte: "", fonte_url: link, data_publicacao: null, corpo: { url: link, formato: "html-prose" } })
  }
  return { itens, ultimaPagina }
}

function dataIso(value: unknown): string | null {
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

/**
 * Página do feed Falkor do g1. `brutos` conta os itens como vieram, antes de
 * qualquer filtro. Lança quando a paginação não é a esperada: `nextPage`
 * presente e não numérico, página cheia sem `nextPage` (o fim real é uma
 * página curta sem o campo) ou página vazia que ainda aponta para outra.
 */
export function parseArquivoFalkor(body: string): { itens: ItemBusca[]; brutos: number; proxima: number | null } {
  const data = JSON.parse(body) as { items?: unknown; nextPage?: unknown }
  if (!data || !Array.isArray(data.items)) throw new Error("feed do g1 sem lista de itens")
  if (data.nextPage !== undefined && data.nextPage !== null && typeof data.nextPage !== "number") throw new Error("feed do g1 com nextPage não numérico")
  const proxima = typeof data.nextPage === "number" ? data.nextPage : null
  const brutos = data.items.length
  if (brutos >= ITENS_POR_PAGINA_FALKOR && proxima === null) throw new Error(`página cheia (${brutos} itens) sem nextPage: paginação mudou`)
  if (brutos === 0 && proxima !== null) throw new Error("página vazia que aponta para outra: arquivo truncado")
  const itens: ItemBusca[] = []
  for (const row of data.items) {
    const content = (row as { content?: Record<string, unknown> })?.content
    const titulo = typeof content?.title === "string" ? content.title.trim() : ""
    const url = typeof content?.url === "string" ? content.url : ""
    if (!titulo || !url.startsWith("https://")) continue
    const resumo = typeof content?.summary === "string" ? content.summary : ""
    const video = (row as { type?: unknown }).type === "video"
    // Matéria confirma pelo corpo (página aberta); o resumo só vale para vídeo, que não tem corpo.
    itens.push({
      titulo, link: url, fonte: "", fonte_url: url, data_publicacao: dataIso((row as { publication?: unknown }).publication),
      ...(video ? { semCorpo: true, resumo } : { corpo: { url, formato: "html-article" as const } }),
    })
  }
  return { itens, brutos, proxima }
}

export function urlArquivoArc(arquivo: Extract<ArquivoSecao, { tipo: "arc" }>, offset: number): string {
  const body = JSON.stringify({ query: { bool: { must: [
    { term: { type: "story" } },
    { term: { "revision.published": 1 } },
    { nested: { path: "taxonomy.sections", query: { bool: { must: [{ regexp: { "taxonomy.sections._id": arquivo.secaoRegex } }] } } } },
  ] } } })
  const query = { body, headlineSearch: "", included_fields: "headlines.basic,subheadlines.basic,description.basic,content_elements,canonical_url,display_date", offset: String(offset), query: "", size: ITENS_POR_PAGINA_ARC, sort: "display_date:desc, first_publish_date:desc" }
  return `${arquivo.url}?query=${encodeURIComponent(JSON.stringify(query))}&_website=${encodeURIComponent(arquivo.website)}`
}

/** Linha fina, descrição e parágrafos de uma história do Arc, um trecho normalizado por bloco. */
function trechosArc(row: Record<string, unknown>): string[] {
  const partes: string[] = []
  for (const campo of ["subheadlines", "description"]) {
    const basic = (row[campo] as { basic?: unknown } | undefined)?.basic
    if (typeof basic === "string") partes.push(basic)
  }
  for (const elemento of Array.isArray(row.content_elements) ? row.content_elements as Array<Record<string, unknown>> : []) {
    if ((elemento?.type === "text" || elemento?.type === "header") && typeof elemento.content === "string") partes.push(elemento.content.replace(/<[^>]+>/g, " "))
  }
  return partes.map((parte) => normalizarNome(decodeEntities(parte))).filter(Boolean)
}

function temCorpoArc(row: Record<string, unknown>): boolean {
  return Array.isArray(row.content_elements) && (row.content_elements as Array<Record<string, unknown>>).some((elemento) => elemento?.type === "text" && typeof elemento.content === "string" && elemento.content.trim().length > 0)
}

/** Página do `story-feed-query` do Arc. Lança se faltar `count` ou `content_elements`. */
export function parseArquivoArc(body: string, site: string): { itens: ItemBusca[]; total: number; lidos: number; comCorpo: number } {
  const data = JSON.parse(body) as { count?: unknown; content_elements?: unknown }
  if (!data || typeof data.count !== "number" || !Array.isArray(data.content_elements)) throw new Error("arquivo Arc sem count ou content_elements")
  const itens: ItemBusca[] = []
  let comCorpo = 0
  for (const row of data.content_elements as Array<Record<string, unknown>>) {
    const headlines = row?.headlines as { basic?: unknown } | undefined
    const titulo = typeof headlines?.basic === "string" ? headlines.basic.trim() : ""
    const caminho = typeof row?.canonical_url === "string" ? row.canonical_url : ""
    if (!titulo || !caminho) continue
    const link = new URL(caminho, site).toString()
    if (!link.startsWith("https://")) continue
    if (temCorpoArc(row)) comCorpo++
    itens.push({ titulo, link, fonte: "", fonte_url: link, data_publicacao: dataIso(row.display_date), trechos: trechosArc(row) })
  }
  return { itens, total: data.count, lidos: data.content_elements.length, comCorpo }
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
    const self = (record._links as { self?: Array<{ href?: unknown }> } | undefined)?.self?.[0]?.href
    const corpo = typeof self === "string" && self.startsWith("https://") && hostDe(self) === hostDe(url)
      ? { corpo: { url: `${self}${self.includes("?") ? "&" : "?"}_fields=content,excerpt`, formato: "wp-json" as const } }
      : {}
    itens.push({ titulo, link: url, fonte: "", fonte_url: url, data_publicacao: null, ...corpo })
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
/**
 * Candidatos a lead: item do domínio da agência cujo título cita o candidato
 * pelo critério frouxo das notícias (`newsTitleMentionsCandidate`), sem
 * duplicar, com o sufixo de veículo do Google tirado do título. Ainda não é
 * lead: `confirmarCandidatos` exige o nome completo.
 */
export function candidatosDaResposta(itens: readonly ItemBusca[], candidato: CandidatoChecagem, agencia: AgenciaChecagem): ItemBusca[] {
  const vistos = new Set<string>()
  const candidatos: ItemBusca[] = []
  for (const item of itens) {
    const host = hostDe(item.fonte_url)
    if (!host || !agencia.dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))) continue
    const titulo = tituloSemVeiculo(item.titulo, item.fonte)
    if (!newsTitleMentionsCandidate(titulo, { nome_urna: candidato.nome_urna, nome_completo: candidato.nome_completo })) continue
    // "Cadu de Lula" é o nome de urna de Carlos Eduardo Xavier. "Lula" sozinho
    // nomeia outra pessoa e abriria milhares de matérias sem relação com ele.
    if (candidato.slug === "cadu-xavier" && !/\b(?:cadu|xavier|carlos eduardo)\b/.test(normalizarNome(titulo))) continue
    // Duplicata por link aqui; por título só entre os confirmados (títulos iguais podem ser matérias diferentes).
    if (vistos.has(item.link)) continue
    vistos.add(item.link)
    candidatos.push({ ...item, titulo })
  }
  return candidatos
}

function chaveTitulo(titulo: string): string {
  return stripAccents(titulo).toLowerCase()
}

/** Leads pelo critério frouxo, antes da confirmação por nome completo, sem título repetido. */
export function leadsDaResposta(itens: readonly ItemBusca[], candidato: CandidatoChecagem, agencia: AgenciaChecagem): LeadChecagem[] {
  const vistos = new Set<string>()
  return candidatosDaResposta(itens, candidato, agencia)
    .filter((item) => !vistos.has(chaveTitulo(item.titulo)) && Boolean(vistos.add(chaveTitulo(item.titulo))))
    .map((item) => ({ agencia: agencia.id, titulo: item.titulo, link: item.link, data_publicacao: item.data_publicacao }))
}

export function montarRecibo(candidato: CandidatoChecagem, estados: Record<string, EstadoAgencia>, searchedAt: Date): ReciboChecagem {
  const agencias: ReciboChecagem["agencias"] = {}
  const leads: LeadChecagem[] = []
  const mesa: LeadMesaChecagem[] = []
  let erro = false
  let pendentes = false
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
      ...(estado.desde ? { desde: estado.desde } : {}),
      ...(estado.pendentes ? { pendentes: estado.pendentes } : {}),
      ...(estado.descartados ? { descartados: estado.descartados } : {}),
    }
    if (estado.pendentes) pendentes = true
    leads.push(...estado.leads)
    mesa.push(...(estado.mesa ?? []))
  }
  return {
    schema_version: SCHEMA_RECIBOS_CHECAGENS,
    policy: POLITICA_CHECAGENS,
    candidate_id: candidato.id,
    candidate_slug: candidato.slug,
    candidate_name: candidato.nome_urna,
    office: candidato.cargo_disputado,
    uf: candidato.estado,
    searched_at: searchedAt.toISOString(),
    // Lead achado vale mesmo com outra agência em erro; ausência só com todas respondendo.
    // Título parcial sem corpo para conferir impede afirmar ausência.
    result: leads.length > 0 ? "encontrado" : erro ? "erro" : pendentes ? "nao_confirmado" : "vazio_confirmado",
    leads,
    ...(mesa.length ? { mesa } : {}),
    agencias,
    escopo: descricaoEscopo(),
  }
}

/** Linha de `coleta_log` do recibo. Volume é o número de leads, não de checagens publicadas. */
export function entradaColetaDoRecibo(recibo: ReciboChecagem): EntradaColeta {
  const porAgencia = AGENCIAS_CHECAGEM.map((agencia) => {
    const estado = recibo.agencias[agencia.id]
    return estado?.status === "ok" ? `${agencia.id}=${estado.leads ?? 0}/${estado.itens ?? 0}(${estado.transporte ?? "?"}${estado.desde ? ` desde ${estado.desde}` : ""}${estado.pendentes ? ` pendentes ${estado.pendentes}` : ""}${estado.descartados ? ` descartados ${estado.descartados}` : ""})` : `${agencia.id}=erro(${estado?.erro ?? "não consultada"})`
  }).join(" ")
  const homonimo = recibo.homonimo
    ? `; homônimo de ${recibo.homonimo.grupo.join(", ")}: ${recibo.homonimo.descartados} lead(s) sem marca distintiva no título`
    : ""
  return {
    fonte: FONTE_CHECAGENS_AGENCIAS,
    alvo: recibo.candidate_slug,
    escopo: "candidato",
    // Homônimo e título parcial sem confirmação não provam achado nem ausência: indeterminado no log.
    resultado: recibo.result === "homonimo" || recibo.result === "nao_confirmado" ? "indeterminado" : recibo.result,
    volume: recibo.result === "encontrado" || recibo.result === "erro" ? recibo.leads.length : 0,
    detalhe: `${POLITICA_CHECAGENS}; leads/itens por agência: ${porAgencia}${homonimo}; ${recibo.escopo}`.slice(0, 1000),
  }
}

/** Forma pública, versionada no repositório e lida pelo site no build. */
export interface ReciboChecagemPublico {
  /** Ausente nos recibos v1 curados pelo #530; novas buscas registram v2. */
  policy?: string
  candidate_id: string
  candidate_slug: string
  searched_at: string
  result: "encontrado" | "vazio_confirmado"
  leads: number
  /** Agências que responderam nesta busca. Só elas podem aparecer no texto do site. */
  agencias: string[]
  /** Agências cuja cobertura começa numa data (arquivo de seção): nome → AAAA-MM-DD. */
  janelas?: Record<string, string>
}

export interface CatalogoRecibosChecagens {
  schema_version: typeof SCHEMA_RECIBOS_CHECAGENS
  policy: "pf-checagens-v1" | typeof POLITICA_CHECAGENS
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
function janelasPublicas(recibo: ReciboChecagem): { janelas?: Record<string, string> } {
  const janelas: Record<string, string> = {}
  for (const agencia of AGENCIAS_CHECAGEM) {
    const estado = recibo.agencias[agencia.id]
    if (estado?.status === "ok" && estado.desde) janelas[agencia.nome] = estado.desde
  }
  return Object.keys(janelas).length ? { janelas } : {}
}

/**
 * Ausência com no máximo uma agência sem resposta e nada pendente (decisão
 * editorial de 28/09/2026): o recibo público lista só quem respondeu e o site
 * nomeia a agência que faltou. Duas ou mais sem resposta continuam sem recibo.
 */
export const MAX_AGENCIAS_SEM_RESPOSTA_NA_AUSENCIA = 1

function ausenciaComUmaAgenciaSemResposta(recibo: ReciboChecagem): boolean {
  if (recibo.leads.length > 0 || recibo.mesa?.length) return false
  // Homônimo com matéria descartada não é ausência, com ou sem agência fora.
  if ((recibo.homonimo?.descartados ?? 0) > 0) return false
  const semResposta = AGENCIAS_CHECAGEM.filter((agencia) => recibo.agencias[agencia.id]?.status !== "ok").length
  const pendente = Object.values(recibo.agencias).some((estado) => estado.status === "ok" && (estado.pendentes ?? 0) > 0)
  return semResposta > 0 && semResposta <= MAX_AGENCIAS_SEM_RESPOSTA_NA_AUSENCIA && !pendente
}

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
    if (recibo.policy !== POLITICA_CHECAGENS) throw new Error(`Recibo de ${recibo.candidate_slug} usa política ${recibo.policy ?? "ausente"}; refaça a busca com ${POLITICA_CHECAGENS}`)
    if (recibo.result === "erro" && !ausenciaComUmaAgenciaSemResposta(recibo)) continue
    const chave = `${recibo.candidate_id}\u0000${recibo.candidate_slug}`
    if (homonimos.has(chave) && !recibo.homonimo) continue
    const atual = porChave.get(chave)
    if (atual && atual.searched_at > recibo.searched_at) continue
    // Homônimo mais recente derruba o recibo público anterior: a contagem não é atribuível.
    if (recibo.result === "homonimo" || recibo.result === "nao_confirmado") {
      porChave.delete(chave)
      continue
    }
    porChave.set(chave, {
      policy: POLITICA_CHECAGENS,
      candidate_id: recibo.candidate_id,
      candidate_slug: recibo.candidate_slug,
      searched_at: recibo.searched_at,
      result: recibo.result === "encontrado" ? "encontrado" : "vazio_confirmado",
      leads: recibo.result === "encontrado" ? recibo.leads.length : 0,
      agencias: AGENCIAS_CHECAGEM.filter((agencia) => recibo.agencias[agencia.id]?.status === "ok").map((agencia) => agencia.nome),
      ...janelasPublicas(recibo),
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
  fetchText: (url: string) => Promise<{ status: number; body: string; headers?: Record<string, string> }>
  /** Probabilidade Jev da identidade; sem sinal ou falha, o lead vai à Mesa. */
  julgarIdentidade?: (item: ItemBusca, candidato: CandidatoChecagem) => Promise<number | null>
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
  /** Piso de arquivo por agência, no lugar do da configuração (testes com fixture pequena). */
  pisos?: Partial<Record<string, PisoArquivo>>
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
  julgarIdentidade?: OpcoesColeta["julgarIdentidade"]
  disjuntor: DisjuntorGoogle
  /** Arquivo de cada agência, lido uma vez por rodada e compartilhado entre trabalhadores. */
  arquivos: Map<string, Promise<ArquivoLido>>
  /** Resultado da sonda da busca do site por agência: null quando o leitor funciona. */
  sondas: Map<string, Promise<string | null>>
  /** Rodada interrompida: leituras de arquivo em curso param na próxima página. */
  parada: { abortada: boolean }
  /** Texto de matérias abertas para confirmar menção, compartilhado entre candidaturas. */
  paginas: Map<string, Promise<{ trechos: string[] } | { erro: string }>>
  orcamentoPaginas: { total: number; restantes: number }
  /** Disjuntor da via direta por agência: aberto, a agência vira erro sem pedir nada nem cair no Google. */
  disjuntoresDiretos: Map<string, { falhasSeguidas: number; aberto: string | null }>
  pisos: Partial<Record<string, PisoArquivo>>
}

type ArquivoLido = { status: "ok"; itens: ItemBusca[]; desde: string } | { status: "erro"; erro: string }

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
    if (tentativa > 0) await opcoes.sleep(Math.max(100, opcoes.pausaMs) * 4 * tentativa)
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

function sondarBuscaSite(agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<string | null> {
  return lerPaginaBuscaSite(SONDA_BUSCA_SITE, agencia, 1, opcoes).then((lida) =>
    "erro" in lida ? `sonda: ${lida.erro}` : lida.itens.length === 0 ? `sonda "${SONDA_BUSCA_SITE}" sem resultado: leitor da página quebrado` : null)
}

async function consultarBuscaSite(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  // Página vazia não se distingue de leitor quebrado; a sonda prova que o leitor acha resultado.
  let sonda = opcoes.sondas.get(agencia.id)
  if (!sonda) {
    sonda = sondarBuscaSite(agencia, opcoes)
    opcoes.sondas.set(agencia.id, sonda)
  }
  const falhaSonda = await sonda
  if (falhaSonda) {
    // Falha não fica em cache: a próxima candidatura sonda de novo (erro transitório não derruba a rodada).
    if (opcoes.sondas.get(agencia.id) === sonda) opcoes.sondas.delete(agencia.id)
    return { status: "erro", erro: `busca do site: ${falhaSonda}` }
  }
  const itens: ItemBusca[] = []
  let fechou = false
  for (let pagina = 1; pagina <= PAGINAS_BUSCA_SITE; pagina++) {
    if (pagina > 1) await opcoes.sleep(opcoes.pausaMs)
    const lida = await lerPaginaBuscaSite(candidato.nome_urna, agencia, pagina, opcoes)
    if ("erro" in lida) return { status: "erro", erro: `busca do site: ${lida.erro}` }
    if (lida.fim) { fechou = true; break }
    // Página além da última responde 404: 200 sem cartões depois da primeira é bloqueio ou template quebrado.
    if (pagina > 1 && lida.itens.length === 0) return { status: "erro", erro: `busca do site: parcial, página ${pagina} sem cartões (fim real responde 404)` }
    itens.push(...lida.itens)
    // Página curta só encerra sem link para a seguinte; página cheia segue até o teto.
    if (lida.itens.length < ITENS_POR_PAGINA_BUSCA_SITE && (lida.ultimaPagina === null || lida.ultimaPagina <= pagina)) { fechou = true; break }
  }
  if (!fechou) return { status: "erro", erro: `busca do site: parcial após ${PAGINAS_BUSCA_SITE} páginas; fim não comprovado` }
  if (itens.length === 0) {
    // Zero cartões pode ser bloqueio ou template quebrado no meio da rodada: sonda de novo antes de aceitar o vazio.
    const agora = await sondarBuscaSite(agencia, opcoes)
    if (agora) return { status: "erro", erro: `busca do site: vazio não confirmado, ${agora}` }
  }
  return estadoConfirmado(itens, itens.length, candidato, agencia, opcoes, "busca-site", "busca do site")
}

async function lerArquivo(agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<ArquivoLido> {
  const arquivo = agencia.arquivo!
  const porLink = new Map<string, ItemBusca>()
  let brutos = 0
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
        brutos += lida.brutos
        for (const item of lida.itens) porLink.set(item.link, item)
        if (lida.proxima !== null && lida.proxima !== pagina + 1) return { status: "erro", erro: `arquivo, página ${pagina}: nextPage ${lida.proxima} não é a seguinte` }
        // Toda página antes da última vem cheia; página curta que aponta para outra é recorte.
        if (lida.proxima !== null && lida.brutos !== ITENS_POR_PAGINA_FALKOR) return { status: "erro", erro: `arquivo, página ${pagina}: ${lida.brutos} itens antes do fim` }
        // Fim: página curta ou vazia sem nextPage (o parser recusa página cheia sem o campo).
        pagina = lida.proxima
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
        brutos += lida.lidos
        // Sem corpo, título com só parte do nome não tem como ser confirmado.
        if (lida.lidos > 0 && lida.comCorpo === 0) return { status: "erro", erro: `arquivo, offset ${offset}: nenhuma história com corpo (content_elements)` }
        for (const item of lida.itens) porLink.set(item.link, item)
        if (lida.lidos === 0 && offset < total) return { status: "erro", erro: `arquivo parou no offset ${offset} de ${total}` }
        offset += lida.lidos
      }
    }
  } catch (error) {
    return { status: "erro", erro: `arquivo: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (porLink.size === 0) return { status: "erro", erro: "arquivo vazio: rota mudou" }
  return conferirPiso([...porLink.values()], brutos, opcoes.pisos[agencia.id] ?? arquivo.piso)
}

/** Arquivo lido pela metade não confirma ausência: piso de itens, item antigo o bastante e itens descartados no parser. */
export function conferirPiso(itens: ItemBusca[], brutos: number, piso: PisoArquivo): ArquivoLido {
  if (itens.length < piso.itens) return { status: "erro", erro: `arquivo com ${itens.length} itens, abaixo do piso de ${piso.itens}: leitura parcial` }
  if (itens.length < brutos * 0.95) return { status: "erro", erro: `parser descartou ${brutos - itens.length} de ${brutos} itens: formato mudou` }
  const datas = itens.map((item) => item.data_publicacao).filter((data): data is string => Boolean(data)).sort()
  const desde = datas[0]?.slice(0, 10)
  if (!desde || desde > piso.maisAntigoAte) return { status: "erro", erro: `item mais antigo ${desde ?? "sem data"}, depois de ${piso.maisAntigoAte}: leitura parcial` }
  return { status: "ok", itens, desde }
}

/** Nome de urna ou nome completo inteiro, como sequência de palavras, num texto já normalizado. */
export function textoCitaNomeInteiro(textoNormalizado: string, candidato: CandidatoChecagem): boolean {
  const alvo = ` ${textoNormalizado} `
  return [candidato.nome_urna, candidato.nome_completo].some((nome) => {
    const normalizado = normalizarNome(nome)
    return normalizado.length > 0 && alvo.includes(` ${normalizado} `)
  })
}

/**
 * Corpo principal da matéria (`<article itemprop="articleBody">` até o
 * fechamento correspondente, com os `<article>` aninhados dentro), em trechos
 * normalizados, um por bloco. Sem esse article, devolve null: chamadas
 * relacionadas e menus não confirmam.
 */
export function textoDaPagina(html: string): string[] | null {
  const abertura = /<article\b[^>]*\bitemprop="articleBody"[^>]*>/.exec(html)
  if (!abertura) return null
  const marcas = /<article\b[^>]*>|<\/article>/g
  marcas.lastIndex = abertura.index + abertura[0].length
  let profundidade = 1
  let fim = -1
  for (let marca = marcas.exec(html); marca; marca = marcas.exec(html)) {
    profundidade += marca[0].startsWith("</") ? -1 : 1
    if (profundidade === 0) { fim = marca.index; break }
  }
  if (fim < 0) return null
  return trechosDeHtml(html.slice(abertura.index + abertura[0].length, fim))
}

/** Fragmento HTML em trechos normalizados, um por bloco: nome não casa atravessando parágrafos. */
export function trechosDeHtml(fragmento: string): string[] {
  const $ = load(fragmento, {}, false)
  $("script, style").remove()
  $("*").each((_, elemento) => { $(elemento).before(" "); $(elemento).after(" ") })
  $("p, h1, h2, h3, h4, h5, h6, li, ul, ol, div, br, figcaption, figure, blockquote, section, article, header, footer, table, tr, td, th")
    .each((_, elemento) => { $(elemento).before("\u0001"); $(elemento).after("\u0001") })
  return $.root().text().split("\u0001").map((trecho) => normalizarNome(trecho)).filter(Boolean)
}

/** Corpo de matéria do Aos Fatos: o `div` de classe `prose` até o fechamento correspondente. Sem ele, null. */
export function trechosAosFatos(html: string): string[] | null {
  const abertura = /<div\b[^>]*\bclass="(?:[^"]*\s)?prose(?:\s[^"]*)?"[^>]*>/.exec(html)
  if (!abertura) return null
  const marcas = /<div\b[^>]*>|<\/div>/g
  marcas.lastIndex = abertura.index + abertura[0].length
  let profundidade = 1
  for (let marca = marcas.exec(html); marca; marca = marcas.exec(html)) {
    profundidade += marca[0].startsWith("</") ? -1 : 1
    if (profundidade === 0) return trechosDeHtml(html.slice(abertura.index + abertura[0].length, marca.index))
  }
  return null
}

/** Objeto REST do WordPress com `content.rendered` (e `excerpt.rendered`). Sem conteúdo, null. */
export function trechosWpJson(body: string): string[] | null {
  const data = JSON.parse(body) as { content?: { rendered?: unknown }; excerpt?: { rendered?: unknown } }
  if (typeof data?.content?.rendered !== "string") return null
  return [...(typeof data.excerpt?.rendered === "string" ? trechosDeHtml(data.excerpt.rendered) : []), ...trechosDeHtml(data.content.rendered)]
}

/** Nome inteiro em algum trecho, casado trecho a trecho. */
function trechoComNomeInteiro(trechos: readonly string[], candidato: CandidatoChecagem): string | null {
  return trechos.find((trecho) => textoCitaNomeInteiro(trecho, candidato)) ?? null
}

/**
 * Regra 3: em título que desfaz uma associação, só passa se o próprio boato
 * atribuiu ao candidato fala, ato, propriedade, aparição ou vínculo direto ao
 * caso. Ação de terceiro e parentesco negado são incertos e vão à Mesa. Este
 * filtro é conservador; texto não resolvido nunca entra na contagem pública.
 */
export function leadPermitidoRegra3(titulo: string, slug: string): boolean {
  const texto = normalizarNome(titulo)
  const nome = normalizarNome(slug.replace(/-gov-[a-z]{2}$|-pres-[a-z]{2}$/, "").replace(/-/g, " "))
  // Sobrenome isolado pode ser outra pessoa da família; sem nome inteiro, Mesa.
  const x = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const tem = (padrao: string) => new RegExp(padrao).test(texto)
  const parentesco = "(?:filh[oa]|sobrinh[oa]|irma[oa]|pai|mae|net[oa]|av[oa]|ti[oa]|prim[oa]|espos[oa]|marido|mulher|genro|nora|cunhad[oa]|entead[oa]|parente)"
  if (tem(`\\bnao e ${parentesco} de (?:[a-z]+ )?${x}\\b`)) return false
  if (tem(`\\b(?:nao tem|sem) parentesco com (?:[a-z]+ )?${x}\\b`)) return false
  const desmente = /\bnao\b|\be falso que\b|\bsatira\b|\bsem parentesco\b/.test(texto)
  if (!desmente) return true
  // O sujeito da alegação é o candidato, mesmo quando a conclusão a nega.
  if (tem(`\\b${x}\\s+nao\\s+(?:disse|falou|afirmou|e|tem|fez|falava)\\b`)) return true
  if (tem(`\\b(?:e falso que|nao e verdade que|post dizendo que) (?:[a-z]+ )?${x}\\b`)) return true
  if (tem(`\\b(?:video|foto|imagem|post) nao mostra ${x}\\b`)) return true
  if (tem(`\\bnao e ${x}\\b`)) return true
  if (tem(`\\bnao e de (?:[a-z]+ )?${x}\\b`)) return true
  if (tem(`\\b(?:vice de|liga [a-z ]{1,80} a|apoio [a-z ]{1,80} a) ${x}\\b`)) return true
  if (tem(`\\bnao e iniciativa da gestao ${x}\\b`)) return true
  if (tem(`\\b(?:tatuagem|assinatura|documento) de ${x}\\b.*\\bcaso\\b`)) return true
  if (tem(`\\b(?:filh[oa]|sobrinh[oa]|irma[oa]|pai|mae) de ${x} no caso\\b`)) return true
  // O título explicita que o vídeo foi atribuído ao candidato por associação
  // com outra figura na cena; sem essa ligação textual a rota é Mesa.
  if (tem(`\\b(?:video|foto) de [a-z ]{1,100} atras de [a-z ]{1,100} nao tem relacao com ${x}\\b`)) return true
  return false
}

/** Conectivos de nome. "Neto", "Filho" e "Junior" ficam de fora: são parte do nome ("ACM Neto"). */
const CONECTIVOS_NOME = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "van", "von", "la", "le"])

const CARGOS_ANTES_DO_NOME = new Set(["governador", "governadora", "presidente", "senador", "senadora", "deputado", "deputada", "prefeito", "prefeita", "ministro", "ministra", "vice", "ex", "candidato", "candidata", "pre", "general", "coronel", "pastor", "pastora", "governo", "gestao", "campanha", "candidatura", "chapa", "partido", "gabinete", "equipe", "aliados", "base", "prefeitura", "secretaria", "senado", "camara", "assembleia", "estado", "municipio", "video", "foto", "post", "texto", "fala", "declaracao", "declaracoes", "audio", "imagem", "nao"])

/**
 * Só descarta quando a parte do nome forma outro nome próprio reconhecível.
 * Se o título também contém outra parte do nome da candidatura, o contexto é
 * ambíguo e a confirmação segue para o corpo da matéria.
 */
export function contextoNomeVizinho(texto: string, candidato: CandidatoChecagem): "outra_pessoa" | "incerto" | "livre" {
  const doNome = new Set([candidato.nome_urna, candidato.nome_completo].flatMap((nome) => normalizarNome(nome).split(" ")).filter((token) => token && !CONECTIVOS_NOME.has(token)))
  const palavras = [...texto.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({ texto: match[0], inicio: match.index, fim: match.index + match[0].length }))
  // Colado é só vizinho separado por espaço: "São Luís: Braide" tem pontuação no meio e não é outra pessoa.
  const coladas = (a: { fim: number }, b: { inicio: number }) => /^\s+$/.test(texto.slice(a.fim, b.inicio))
  let incerto = false
  let outraPessoa = false
  for (const [indice, palavra] of palavras.entries()) {
    const token = normalizarNome(palavra.texto)
    if (!doNome.has(token)) continue
    for (const direcao of [-1, 1] as const) {
      let atual = indice
      let vizinho = indice + direcao
      let conjuncao = false
      while (vizinho >= 0 && vizinho < palavras.length && coladas(direcao < 0 ? palavras[vizinho] : palavras[atual], direcao < 0 ? palavras[atual] : palavras[vizinho])) {
        const normalizado = normalizarNome(palavras[vizinho].texto)
        if (CONECTIVOS_NOME.has(normalizado)) { conjuncao ||= normalizado === "e"; atual = vizinho; vizinho += direcao; continue }
        if (!/^\p{Lu}/u.test(palavras[vizinho].texto) || CARGOS_ANTES_DO_NOME.has(normalizado) || doNome.has(normalizado)) break
        if (conjuncao) incerto = true
        else outraPessoa = true
        break
      }
    }
  }
  return incerto ? "incerto" : outraPessoa ? "outra_pessoa" : "livre"
}

export function nomeColadoEmOutraPessoa(texto: string, candidato: CandidatoChecagem): boolean {
  return contextoNomeVizinho(texto, candidato) === "outra_pessoa"
}

async function lerCorpo(corpo: CorpoItem, opcoes: OpcoesConsulta): Promise<{ trechos: string[] } | { erro: string }> {
  let lido = opcoes.paginas.get(corpo.url)
  if (!lido) {
    if (opcoes.orcamentoPaginas.restantes <= 0) return { erro: `teto de ${opcoes.orcamentoPaginas.total} páginas de confirmação na rodada` }
    opcoes.orcamentoPaginas.restantes--
    lido = pedirComTentativas(corpo.url, opcoes).then((resposta) => {
      if ("erro" in resposta) return resposta
      try {
        const trechos = corpo.formato === "wp-json" ? trechosWpJson(resposta.body)
          : corpo.formato === "html-prose" ? trechosAosFatos(resposta.body)
          : corpo.formato === "html-uol" ? trechosUol(resposta.body)
          : corpo.formato === "html-afp" ? trechosAfp(resposta.body)
          : textoDaPagina(resposta.body)
        return trechos === null ? { erro: `corpo não encontrado (${corpo.formato})` } : { trechos }
      } catch (error) {
        return { erro: `corpo ilegível (${corpo.formato}): ${error instanceof Error ? error.message : String(error)}` }
      }
    })
    opcoes.paginas.set(corpo.url, lido)
  }
  return lido
}

/**
 * Confirmação por nome completo, igual em todas as rotas. Título com o nome
 * de urna ou o nome completo inteiro vale. Título com só parte do nome:
 * colada a outro nome próprio ("Felipe Neto" para ACM Neto) é descartado;
 * senão exige o nome inteiro no corpo, trecho a trecho (no resumo, para
 * vídeo, também sem parte colada a outra pessoa). Rota sem corpo (Google
 * News) deixa o candidato pendente: não vira lead nem permite afirmar ausência.
 */
export async function confirmarCandidatos(
  candidatos: readonly ItemBusca[],
  candidato: CandidatoChecagem,
  agencia: AgenciaChecagem,
  opcoes: OpcoesConsulta,
): Promise<{ leads: LeadChecagem[]; mesa: LeadMesaChecagem[]; pendentes: number; descartados: number }> {
  const leads: LeadChecagem[] = []
  const mesa: LeadMesaChecagem[] = []
  const titulos = new Set<string>()
  let pendentes = 0
  let descartados = 0
  for (const item of candidatos) {
    let confirmado = textoCitaNomeInteiro(normalizarNome(item.titulo), candidato)
    let confirmadoPor: LeadChecagem["confirmado_por"]
    let trechoConfirmacao: string | null = null
    if (!confirmado) {
      if (nomeColadoEmOutraPessoa(item.titulo, candidato)) {
        descartados++
        continue
      }
      if (item.semCorpo) {
        confirmado = Boolean(item.resumo) && textoCitaNomeInteiro(normalizarNome(item.resumo), candidato) && !nomeColadoEmOutraPessoa(item.resumo!, candidato)
        if (confirmado) { confirmadoPor = "resumo"; trechoConfirmacao = item.resumo ?? null }
      } else if (item.trechos) {
        trechoConfirmacao = trechoComNomeInteiro(item.trechos, candidato)
        confirmado = trechoConfirmacao !== null
        if (confirmado) confirmadoPor = "corpo"
      } else if (item.corpo) {
        const corpo = await lerCorpo(item.corpo, opcoes)
        if ("erro" in corpo) { pendentes++; continue }
        trechoConfirmacao = trechoComNomeInteiro(corpo.trechos, candidato)
        confirmado = trechoConfirmacao !== null
        if (confirmado) confirmadoPor = "corpo"
      } else {
        pendentes++
        continue
      }
    }
    if (!confirmado) {
      descartados++
      continue
    }
    if (titulos.has(chaveTitulo(item.titulo))) continue
    titulos.add(chaveTitulo(item.titulo))
    const lead: LeadChecagem = { agencia: agencia.id, titulo: item.titulo, link: item.link, data_publicacao: item.data_publicacao,
      ...(confirmadoPor ? { confirmado_por: confirmadoPor, trecho_confirmacao: trechoConfirmacao?.slice(0, 500) } : {}),
    }
    const regra3 = leadPermitidoRegra3(item.titulo, candidato.slug) ? "permitido" : "revisao"
    let noulIdentidade: number | null = null
    if (regra3 === "permitido" && opcoes.julgarIdentidade) {
      try { noulIdentidade = await opcoes.julgarIdentidade(item, candidato) }
      catch { noulIdentidade = null }
    }
    const decisao = decidirPublicacaoChecagem({ nomeConfirmadoPelaRegra: confirmado, noulIdentidade, regra3 })
    if (decisao === "publicar") leads.push(lead)
    else {
      pendentes++
      mesa.push({ ...lead, motivo: regra3 === "revisao" ? "regra3" : "identidade_jev", noul_identidade: noulIdentidade })
    }
  }
  return { leads, mesa, pendentes, descartados }
}

/** Estado `ok` de uma rota depois da confirmação; falha de corpo deixa só o item pendente. */
async function estadoConfirmado(itens: readonly ItemBusca[], total: number, candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta, transporte: TransporteBusca, prefixo: string, desde?: string): Promise<EstadoAgencia> {
  const confirmacao = await confirmarCandidatos(candidatosDaResposta(itens, candidato, agencia), candidato, agencia, opcoes)
  void prefixo
  return {
    status: "ok", itens: total, leads: confirmacao.leads, transporte,
    ...(confirmacao.mesa.length ? { mesa: confirmacao.mesa } : {}),
    ...(desde ? { desde } : {}),
    ...(confirmacao.pendentes ? { pendentes: confirmacao.pendentes } : {}),
    ...(confirmacao.descartados ? { descartados: confirmacao.descartados } : {}),
  }
}

async function consultarArquivo(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  let lido = opcoes.arquivos.get(agencia.id)
  if (!lido) {
    lido = lerArquivo(agencia, opcoes)
    opcoes.arquivos.set(agencia.id, lido)
  }
  const arquivo = await lido
  if (arquivo.status === "erro") return { status: "erro", erro: `arquivo da seção: ${arquivo.erro}` }
  return estadoConfirmado(arquivo.itens, arquivo.itens.length, candidato, agencia, opcoes, "arquivo-secao", "arquivo da seção", arquivo.desde)
}

async function lerArquivoUol(opcoes: OpcoesConsulta): Promise<ArquivoLido> {
  const porLink = new Map<string, ItemBusca>()
  const cursores = new Set<string>()
  let url = urlArquivoUol()
  for (let pagina = 1; pagina <= MAX_PAGINAS_ARQUIVO; pagina++) {
    if (opcoes.parada.abortada) return { status: "erro", erro: "rodada interrompida" }
    const resposta = await pedirComTentativas(url, opcoes)
    if ("erro" in resposta) return { status: "erro", erro: `arquivo UOL página ${pagina}: ${resposta.erro}` }
    let lida: ReturnType<typeof parseArquivoUol>
    try { lida = parseArquivoUol(resposta.body) }
    catch (error) { return { status: "erro", erro: `arquivo UOL página ${pagina}: ${error instanceof Error ? error.message : String(error)}` } }
    for (const item of lida.itens) porLink.set(item.link, item)
    if (!lida.hasNext) {
      const itens = [...porLink.values()]
      if (itens.length === 0) return { status: "erro", erro: "arquivo UOL sem matérias Confere" }
      const desde = itens.map((item) => item.data_publicacao).filter((data): data is string => Boolean(data)).sort()[0]
      if (!desde) return { status: "erro", erro: "arquivo UOL sem data para delimitar cobertura" }
      return { status: "ok", itens, desde }
    }
    if (!lida.cursor || cursores.has(lida.cursor)) return { status: "erro", erro: `arquivo UOL cursor repetido na página ${pagina}` }
    cursores.add(lida.cursor)
    url = urlProximaUol(lida.request)
  }
  return { status: "erro", erro: `arquivo UOL excedeu ${MAX_PAGINAS_ARQUIVO} páginas` }
}

async function consultarUol(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  let lido = opcoes.arquivos.get(agencia.id)
  if (!lido) { lido = lerArquivoUol(opcoes); opcoes.arquivos.set(agencia.id, lido) }
  const arquivo = await lido
  if (arquivo.status === "erro") return { status: "erro", erro: arquivo.erro }
  return estadoConfirmado(arquivo.itens, arquivo.itens.length, candidato, agencia, opcoes, "uol-arquivo", "arquivo UOL", arquivo.desde)
}

/** Limite de taxa com `pararNoBloqueio`: a rodada para e a candidatura em curso não gera recibo. */
export class BloqueioDeTaxa extends Error {
  constructor(readonly status: number, readonly candidateSlug: string) {
    super(`limite de taxa (HTTP ${status}) em ${candidateSlug}`)
  }
}

async function consultarNativa(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  let sonda = opcoes.sondas.get(agencia.id)
  if (!sonda) {
    sonda = pedirComTentativas(urlBuscaNativa(SONDA_BUSCA_WP, agencia, 1)!, opcoes).then((resposta) => {
      if ("erro" in resposta) return `sonda: ${resposta.erro}`
      try { return parseBuscaNativa(resposta.body).length > 0 ? null : `sonda "${SONDA_BUSCA_WP}" sem resultado` }
      catch (error) { return `sonda ilegível: ${error instanceof Error ? error.message : String(error)}` }
    })
    opcoes.sondas.set(agencia.id, sonda)
  }
  const falhaSonda = await sonda
  if (falhaSonda) {
    if (opcoes.sondas.get(agencia.id) === sonda) opcoes.sondas.delete(agencia.id)
    return { status: "erro", erro: `busca nativa: ${falhaSonda}` }
  }
  const itens: ItemBusca[] = []
  let totalPaginas: number | null = null
  let fechou = false
  for (let pagina = 1; pagina <= PAGINAS_WP; pagina++) {
    let ultimoErro = "sem resposta"
    let lidos: ItemBusca[] | null = null
    let fimPor400 = false
    for (let tentativa = 0; tentativa < opcoes.tentativas && !lidos; tentativa++) {
      if (tentativa > 0) await opcoes.sleep(Math.max(100, opcoes.pausaMs) * 4 * tentativa)
      try {
        const resposta = await opcoes.fetchText(urlBuscaNativa(candidato.nome_urna, agencia, pagina)!)
        // WordPress responde 400 ao pedir página além da última.
        if (pagina > 1 && resposta.status === 400) { lidos = []; fimPor400 = true; break }
        if (resposta.status < 200 || resposta.status >= 300) { ultimoErro = `HTTP ${resposta.status}`; continue }
        lidos = parseBuscaNativa(resposta.body)
        const cabecalho = resposta.headers?.["x-wp-totalpages"] ?? resposta.headers?.["X-WP-TotalPages"]
        if (cabecalho !== undefined) {
          const total = Number(cabecalho)
          if (!Number.isSafeInteger(total) || total < 0) return { status: "erro", erro: "busca nativa: X-WP-TotalPages inválido" }
          totalPaginas = total
        }
      } catch (error) {
        ultimoErro = error instanceof Error ? error.message : String(error)
      }
    }
    if (!lidos) return { status: "erro", erro: `busca nativa: ${ultimoErro}` }
    if (fimPor400) {
      if (totalPaginas !== null && pagina <= totalPaginas) return { status: "erro", erro: `busca nativa: parcial, página ${pagina} ausente antes do total ${totalPaginas}` }
      fechou = true
      break
    }
    itens.push(...lidos)
    if (totalPaginas !== null && pagina >= totalPaginas) { fechou = true; break }
    if (lidos.length < 100 && (totalPaginas === null || pagina >= totalPaginas)) { fechou = true; break }
    await opcoes.sleep(opcoes.pausaMs)
  }
  if (!fechou) return { status: "erro", erro: `busca nativa: parcial após ${PAGINAS_WP} páginas; total ${totalPaginas ?? "desconhecido"}` }
  return estadoConfirmado(itens, itens.length, candidato, agencia, opcoes, "wp-rest", "busca nativa")
}

function temViaDireta(agencia: AgenciaChecagem): boolean {
  return Boolean(agencia.wpSearch || agencia.buscaSite || agencia.arquivo || agencia.fonteDireta)
}

async function consultarAfp(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  const itens: ItemBusca[] = []
  let pagina = 0
  for (let lidas = 0; lidas < MAX_PAGINAS_ARQUIVO; lidas++) {
    const resposta = await pedirComTentativas(urlBuscaAfp(candidato.nome_urna, pagina), opcoes)
    if ("erro" in resposta) return { status: "erro", erro: `busca AFP página ${pagina}: ${resposta.erro}` }
    let parsed: ReturnType<typeof parseBuscaAfp>
    try { parsed = parseBuscaAfp(resposta.body, candidato.nome_urna, pagina) }
    catch (error) { return { status: "erro", erro: `busca AFP página ${pagina}: ${error instanceof Error ? error.message : String(error)}` } }
    itens.push(...parsed.itens)
    if (parsed.proxima === null) return estadoConfirmado(itens, parsed.total, candidato, agencia, opcoes, "afp-busca", "busca AFP")
    pagina = parsed.proxima
  }
  return { status: "erro", erro: `busca AFP excedeu ${MAX_PAGINAS_ARQUIVO} páginas` }
}

async function consultarAgencia(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  if (!temViaDireta(agencia)) return consultarGoogle(candidato, agencia, opcoes)
  const disjuntor = opcoes.disjuntoresDiretos.get(agencia.id) ?? { falhasSeguidas: 0, aberto: null }
  opcoes.disjuntoresDiretos.set(agencia.id, disjuntor)
  // Via direta bloqueada não despeja a rodada no Google: isso derrubaria UOL Confere e AFP Checamos.
  if (disjuntor.aberto) return { status: "erro", erro: disjuntor.aberto }
  const direta = agencia.wpSearch
    ? await consultarNativa(candidato, agencia, opcoes)
    : agencia.buscaSite
      ? await consultarBuscaSite(candidato, agencia, opcoes)
      : agencia.arquivo
        ? await consultarArquivo(candidato, agencia, opcoes)
        : agencia.fonteDireta === "afp-busca"
          ? await consultarAfp(candidato, agencia, opcoes)
          : await consultarUol(candidato, agencia, opcoes)
  if (direta.status === "ok") {
    disjuntor.falhasSeguidas = 0
    return direta
  }
  if (++disjuntor.falhasSeguidas >= LIMITE_FALHAS_DIRETAS) {
    disjuntor.aberto = `via direta com disjuntor aberto após ${disjuntor.falhasSeguidas} falhas seguidas (${direta.erro.slice(0, 120)})`
    return { status: "erro", erro: disjuntor.aberto }
  }
  // Busca sem prova de fim não é substituída por um RSS com teto de resultados.
  if (/sonda|parcial/.test(direta.erro)) return direta
  const google = await consultarGoogle(candidato, agencia, opcoes)
  if (google.status === "ok" && (google.leads.length > 0 || (google.pendentes ?? 0) > 0 || (google.descartados ?? 0) > 0)) return { ...google, falhas: [direta.erro] }
  if (google.status === "ok") return { status: "erro", erro: `${direta.erro}; google-news sem lead não fecha busca direta` }
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
      const espera = bloqueado ? Math.max(400, opcoes.esperaBloqueioMs) * tentativa : Math.max(100, opcoes.pausaMs) * 4 * tentativa
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
      return estadoConfirmado(itens, itens.length, candidato, agencia, opcoes, "google-news", "google-news")
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
    julgarIdentidade: opcoes.julgarIdentidade,
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
    disjuntoresDiretos: new Map(),
    pisos: opcoes.pisos ?? {},
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
    for (const agencia of AGENCIAS_CHECAGEM) {
      if (agencia.arquivo) consulta.arquivos.set(agencia.id, lerArquivo(agencia, consulta))
      if (agencia.fonteDireta === "uol-arquivo") consulta.arquivos.set(agencia.id, lerArquivoUol(consulta))
    }
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
        const semPedido = Boolean(agencia.arquivo || agencia.fonteDireta === "uol-arquivo") || (!temViaDireta(agencia) && (consulta.semGoogle || disjuntor.aberto !== null))
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
  nao_confirmado: number
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
    nao_confirmado: recibos.filter((recibo) => recibo.result === "nao_confirmado").length,
    erro: recibos.filter((recibo) => recibo.result === "erro").length,
    encontrado_parcial: recibos.filter((recibo) => recibo.result === "encontrado" && Object.values(recibo.agencias).some((estado) => estado.status === "erro")).length,
    leads: recibos.reduce((total, recibo) => total + recibo.leads.length, 0),
    erros_por_agencia: errosPorAgencia,
  }
}

export const SCHEMA_DECISOES_CHECAGENS = "checagens-decisoes-v1" as const

/**
 * `jev-validacao`: Jev em sombra mais validação editorial, ambos acima do
 * corte; `mesa`: decisão humana na Mesa. Só a Mesa libera lead que a regra 3
 * em código mandou para revisão.
 */
export type OrigemDecisaoChecagem = "jev-validacao" | "mesa"

/**
 * Lead que a Mesa traz junto com a decisão, para matéria que nenhuma coleta
 * viu. Passa pela mesma validação do lead coletado: agência da lista com link
 * no domínio dela, título que cita a candidatura, nome inteiro no título ou no
 * trecho do corpo e marca distintiva quando há homônimo. A regra 3 não barra:
 * só a Mesa traz lead, e a Mesa é quem resolve a regra 3.
 */
export interface LeadDecisaoMesa {
  agencia: string
  titulo: string
  link: string
  data_publicacao: string | null
  /** Trecho do corpo com o nome inteiro, quando o título só traz parte dele. Privado: não vai ao catálogo. */
  trecho_confirmacao?: string
}

export interface DecisaoLeadChecagem {
  candidate_id: string
  candidate_slug: string
  link: string
  decisao: "publicar" | "descartar"
  origem: OrigemDecisaoChecagem
  /** Só em `publicar` da Mesa: o lead, quando ele não está na Mesa do recibo. */
  lead?: LeadDecisaoMesa
}

export type MotivoRejeicaoLeadMesa = "sem_cadastro" | "titulo_sem_nome" | "nome_colado_em_outra_pessoa" | "nome_inteiro_ausente" | "homonimo_sem_marca" | "titulo_repetido"

export interface LeadMesaRejeitado {
  candidate_slug: string
  link: string
  motivo: MotivoRejeicaoLeadMesa
}

export interface ArquivoDecisoesChecagens {
  schema_version: typeof SCHEMA_DECISOES_CHECAGENS
  policy: typeof POLITICA_CHECAGENS
  decisoes: DecisaoLeadChecagem[]
}

function chaveDecisao(candidateId: string, candidateSlug: string, link: string): string {
  return `${candidateId}\u0000${candidateSlug}\u0000${link}`
}

/** Valida o arquivo inteiro antes de aplicar: decisão malformada ou repetida derruba a importação. */
export function validarDecisoesChecagens(bruto: unknown): ArquivoDecisoesChecagens {
  const arquivo = bruto as Partial<ArquivoDecisoesChecagens> | null
  if (!arquivo || arquivo.schema_version !== SCHEMA_DECISOES_CHECAGENS || !Array.isArray(arquivo.decisoes)) throw new Error("Arquivo de decisões inválido")
  if (arquivo.policy !== POLITICA_CHECAGENS) throw new Error(`Decisões de política ${arquivo.policy ?? "ausente"}; esperado ${POLITICA_CHECAGENS}`)
  const vistas = new Set<string>()
  for (const decisao of arquivo.decisoes) {
    if (!decisao?.candidate_id || !decisao.candidate_slug || !decisao.link) throw new Error("Decisão sem identidade ou link")
    if (decisao.decisao !== "publicar" && decisao.decisao !== "descartar") throw new Error(`Decisão desconhecida para ${decisao.link}`)
    if (decisao.origem !== "jev-validacao" && decisao.origem !== "mesa") throw new Error(`Origem desconhecida para ${decisao.link}`)
    if (decisao.lead !== undefined) validarLeadDecisaoMesa(decisao)
    const chave = chaveDecisao(decisao.candidate_id, decisao.candidate_slug, decisao.link)
    if (vistas.has(chave)) throw new Error(`Decisão repetida para ${decisao.candidate_slug}: ${decisao.link}`)
    vistas.add(chave)
  }
  return arquivo as ArquivoDecisoesChecagens
}

/** Forma do lead trazido pela Mesa. Lead malformado ou fora da lista de agências derruba a importação. */
function validarLeadDecisaoMesa(decisao: DecisaoLeadChecagem): void {
  const lead = decisao.lead
  if (decisao.origem !== "mesa" || decisao.decisao !== "publicar") throw new Error(`Só decisão publicar da Mesa traz lead (${decisao.link})`)
  if (!lead || typeof lead !== "object" || lead.link !== decisao.link) throw new Error(`Lead da Mesa com link diferente da decisão (${decisao.link})`)
  const agencia = AGENCIAS_CHECAGEM.find((item) => item.id === lead.agencia)
  if (!agencia) throw new Error(`Agência fora da lista no lead da Mesa: ${String(lead.agencia)} (${decisao.link})`)
  const host = hostDe(lead.link)
  if (!host || !agencia.dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))) {
    throw new Error(`Link fora do domínio de ${agencia.nome} no lead da Mesa (${decisao.link})`)
  }
  if (typeof lead.titulo !== "string" || !lead.titulo.trim()) throw new Error(`Lead da Mesa sem título (${decisao.link})`)
  if (lead.data_publicacao !== null && (typeof lead.data_publicacao !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/.test(lead.data_publicacao))) {
    throw new Error(`Data inválida no lead da Mesa (${decisao.link})`)
  }
  if (lead.trecho_confirmacao !== undefined && typeof lead.trecho_confirmacao !== "string") throw new Error(`Trecho inválido no lead da Mesa (${decisao.link})`)
}

function linkComparavel(link: string): string {
  let decodificado = link
  try { decodificado = decodeURI(link) } catch { /* link com escape inválido fica como veio */ }
  return decodificado.replace(/\/+$/, "")
}

/**
 * Mesma validação de identidade do lead coletado (`candidatosDaResposta` e
 * `confirmarCandidatos`), mais a regra de homônimo. Devolve o motivo da
 * rejeição ou, quando passa, por onde o nome inteiro foi confirmado.
 */
export function avaliarLeadDecisaoMesa(
  lead: LeadDecisaoMesa,
  candidato: CandidatoChecagem,
  grupo?: readonly CandidatoChecagem[],
): { motivo: MotivoRejeicaoLeadMesa } | { confirmado_por?: "corpo" } {
  const agencia = AGENCIAS_CHECAGEM.find((item) => item.id === lead.agencia)
  const item: ItemBusca = { titulo: lead.titulo, link: lead.link, fonte: "", fonte_url: lead.link, data_publicacao: lead.data_publicacao }
  if (!agencia || candidatosDaResposta([item], candidato, agencia).length === 0) return { motivo: "titulo_sem_nome" }
  if (grupo && grupo.length > 1 && !tituloTemMarcador(lead.titulo, marcadoresDistintivos(candidato, grupo))) return { motivo: "homonimo_sem_marca" }
  if (textoCitaNomeInteiro(normalizarNome(lead.titulo), candidato)) return {}
  if (nomeColadoEmOutraPessoa(lead.titulo, candidato)) return { motivo: "nome_colado_em_outra_pessoa" }
  if (lead.trecho_confirmacao && textoCitaNomeInteiro(normalizarNome(lead.trecho_confirmacao), candidato)) return { confirmado_por: "corpo" }
  return { motivo: "nome_inteiro_ausente" }
}

/**
 * Aplica decisões editoriais aos leads da Mesa de cada recibo. Lead publicado
 * passa a contar; lead descartado conta como `descartados`, como o nome que o
 * corpo não confirmou, e não impede afirmar ausência. O que não tem decisão
 * continua na Mesa e impede afirmar ausência. Recibo em erro ou com agência sem resposta continua sem ausência.
 *
 * Decisão `publicar` da Mesa com `lead` publica também matéria que não está na
 * Mesa do recibo, depois de `avaliarLeadDecisaoMesa` (precisa do cadastro para
 * o nome completo e os homônimos). Link já contado não conta de novo; lead
 * reprovado não entra e sai em `rejeitadas`.
 */
export function aplicarDecisoesMesa(
  recibos: readonly ReciboChecagem[],
  arquivo: ArquivoDecisoesChecagens,
  cadastro: readonly CandidatoChecagem[] = [],
): { recibos: ReciboChecagem[]; aplicadas: number; sem_lead: number; leads_da_mesa: number; rejeitadas: LeadMesaRejeitado[] } {
  const porChave = new Map(arquivo.decisoes.map((decisao) => [chaveDecisao(decisao.candidate_id, decisao.candidate_slug, decisao.link), decisao]))
  const comLead = new Map<string, DecisaoLeadChecagem[]>()
  for (const decisao of arquivo.decisoes) {
    if (!decisao.lead) continue
    const chaveRecibo = `${decisao.candidate_id}\u0000${decisao.candidate_slug}`
    comLead.set(chaveRecibo, [...(comLead.get(chaveRecibo) ?? []), decisao])
  }
  const candidatos = new Map(cadastro.map((candidato) => [`${candidato.id}\u0000${candidato.slug}`, candidato]))
  const grupos = gruposDeHomonimos(cadastro)
  const usadas = new Set<string>()
  const rejeitadas: LeadMesaRejeitado[] = []
  let leadsDaMesa = 0
  const saida = recibos.map((recibo) => {
    // Todo recibo importado passa pela regra atual de resultado, com ou sem Mesa.
    const agencias = Object.fromEntries(Object.entries(recibo.agencias).map(([id, estado]) => [id, { ...estado }]))
    const leads = [...recibo.leads]
    const mesa: LeadMesaChecagem[] = []
    for (const lead of recibo.mesa ?? []) {
      const chave = chaveDecisao(recibo.candidate_id, recibo.candidate_slug, lead.link)
      const decisao = porChave.get(chave)
      if (!decisao) {
        mesa.push(lead)
        continue
      }
      if (decisao.decisao === "publicar" && lead.motivo === "regra3" && decisao.origem !== "mesa") {
        throw new Error(`Regra 3 não resolvida em ${recibo.candidate_slug} (${lead.link}): só a Mesa publica`)
      }
      usadas.add(chave)
      const estado = agencias[lead.agencia]
      if (estado?.status === "ok") estado.pendentes = Math.max(0, (estado.pendentes ?? 0) - 1) || undefined
      if (decisao.decisao === "publicar") {
        const { motivo: _motivo, noul_identidade: _noul, ...publicado } = lead
        void _motivo
        void _noul
        leads.push(publicado)
        if (estado?.status === "ok") estado.leads = (estado.leads ?? 0) + 1
      } else if (estado?.status === "ok") {
        estado.descartados = (estado.descartados ?? 0) + 1
      }
    }
    const chaveRecibo = `${recibo.candidate_id}\u0000${recibo.candidate_slug}`
    for (const decisao of comLead.get(chaveRecibo) ?? []) {
      const chave = chaveDecisao(decisao.candidate_id, decisao.candidate_slug, decisao.link)
      if (usadas.has(chave)) continue
      const lead = decisao.lead!
      // Mesmo link com outra codificação ("publicações" e "publica%C3%A7%C3%B5es") já está contado.
      if (leads.some((existente) => linkComparavel(existente.link) === linkComparavel(lead.link))) { usadas.add(chave); continue }
      const candidato = candidatos.get(chaveRecibo)
      const avaliacao = candidato ? avaliarLeadDecisaoMesa(lead, candidato, grupos.get(chaveRecibo)) : { motivo: "sem_cadastro" as const }
      const motivo = "motivo" in avaliacao ? avaliacao.motivo
        : leads.some((existente) => existente.agencia === lead.agencia && chaveTitulo(existente.titulo) === chaveTitulo(lead.titulo)) ? "titulo_repetido" : null
      if (motivo) {
        rejeitadas.push({ candidate_slug: recibo.candidate_slug, link: lead.link, motivo })
        continue
      }
      usadas.add(chave)
      leadsDaMesa++
      const confirmadoPor = "confirmado_por" in avaliacao ? avaliacao.confirmado_por : undefined
      leads.push({ agencia: lead.agencia, titulo: lead.titulo, link: lead.link, data_publicacao: lead.data_publicacao,
        ...(confirmadoPor ? { confirmado_por: confirmadoPor, trecho_confirmacao: lead.trecho_confirmacao?.slice(0, 500) } : {}),
      })
      const estado = agencias[lead.agencia]
      if (estado?.status === "ok") estado.leads = (estado.leads ?? 0) + 1
    }
    for (const estado of Object.values(agencias)) {
      if (estado.pendentes === undefined) delete estado.pendentes
    }
    const estados = Object.values(agencias)
    const incerto = estados.some((estado) => (estado.pendentes ?? 0) > 0)
    const result: ResultadoRecibo = leads.length > 0
      ? "encontrado"
      : estados.some((estado) => estado.status === "erro")
        ? "erro"
        : recibo.result === "homonimo"
          ? "homonimo"
          : incerto ? "nao_confirmado" : "vazio_confirmado"
    const { mesa: _mesa, ...resto } = recibo
    void _mesa
    return { ...resto, agencias, leads, result, ...(mesa.length ? { mesa } : {}) }
  })
  return { recibos: saida, aplicadas: usadas.size, sem_lead: porChave.size - usadas.size - rejeitadas.length, leads_da_mesa: leadsDaMesa, rejeitadas }
}

/** Recibo que precisa ser refeito: erro geral ou alguma agência sem resposta. */
export function reciboIncompleto(recibo: ReciboChecagem): boolean {
  return recibo.result === "erro" || Object.values(recibo.agencias).some((estado) => estado.status === "erro")
}

/** Retoma também candidaturas sem recibo, por exemplo após interrupção da rodada. */
export function candidaturasParaRetomada(roster: readonly CandidatoChecagem[], anteriores: readonly ReciboChecagem[]): CandidatoChecagem[] {
  const porChave = new Map(anteriores.map((recibo) => [`${recibo.candidate_id}\u0000${recibo.candidate_slug}`, recibo]))
  return roster.filter((candidato) => {
    const anterior = porChave.get(`${candidato.id}\u0000${candidato.slug}`)
    return !anterior || reciboIncompleto(anterior)
  })
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
