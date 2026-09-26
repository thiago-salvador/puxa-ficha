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
}

export type TransporteBusca = "wp-rest" | "google-news"
/** Páginas de 100 resultados lidas na busca nativa. */
export const PAGINAS_WP = 3

/**
 * Agências já usadas no catálogo e as que o contrato editorial lista. A ordem
 * é a do recibo. Mudar um nome aqui exige mudar o catálogo, e o teste de
 * nome canônico por domínio pega a divergência.
 */
export const AGENCIAS_CHECAGEM: readonly AgenciaChecagem[] = Object.freeze([
  { id: "lupa", nome: "Lupa", sites: ["agencialupa.org", "piaui.folha.uol.com.br/lupa"], dominios: ["agencialupa.org", "piaui.folha.uol.com.br"], wpSearch: "https://www.agencialupa.org/wp-json/wp/v2/search" },
  { id: "aos-fatos", nome: "Aos Fatos", sites: ["aosfatos.org"], dominios: ["aosfatos.org"] },
  { id: "fato-ou-fake", nome: "Fato ou Fake", sites: ["g1.globo.com/fato-ou-fake"], dominios: ["g1.globo.com"] },
  { id: "estadao-verifica", nome: "Estadão Verifica", sites: ["estadao.com.br/estadao-verifica"], dominios: ["estadao.com.br"] },
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
  homonimo?: { grupo: string[]; descartados: number; marcadores: string[] }
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
 * nome do estado quando nenhuma outra disputa pela mesma UF.
 */
export function marcadoresDistintivos(candidato: CandidatoChecagem, grupo: readonly CandidatoChecagem[]): string[] {
  const outros = grupo.filter((membro) => membro.id !== candidato.id || membro.slug !== candidato.slug)
  const urna = new Set(normalizarNome(candidato.nome_urna).split(" "))
  const deOutros = new Set(outros.flatMap((membro) => normalizarNome(membro.nome_completo).split(" ")))
  const marcadores = normalizarNome(candidato.nome_completo).split(" ")
    .filter((token) => token.length >= 4 && !PARTICULAS_NOME.has(token) && !urna.has(token) && !deOutros.has(token))
  const uf = candidato.estado
  if (uf && UF_NOMES[uf] && !outros.some((membro) => membro.estado === uf)) marcadores.push(normalizarNome(UF_NOMES[uf]))
  return [...new Set(marcadores)]
}

function tituloTemMarcador(titulo: string, marcadores: readonly string[]): boolean {
  const normalizado = ` ${normalizarNome(titulo)} `
  return marcadores.some((marcador) => normalizado.includes(` ${marcador} `))
}

/**
 * Aplica a regra de homônimo a um recibo já montado. Pura e idempotente: serve
 * para a coleta e para reimportar recibos antigos sem buscar de novo.
 */
export function aplicarRegraHomonimo(recibo: ReciboChecagem, candidato: CandidatoChecagem, grupo: readonly CandidatoChecagem[] | undefined): ReciboChecagem {
  if (!grupo || grupo.length < 2) return recibo
  const marcadores = marcadoresDistintivos(candidato, grupo)
  const leads = recibo.leads.filter((lead) => tituloTemMarcador(lead.titulo, marcadores))
  const descartados = recibo.leads.length - leads.length + (recibo.homonimo?.descartados ?? 0)
  const agencias: ReciboChecagem["agencias"] = {}
  for (const [id, estado] of Object.entries(recibo.agencias)) {
    agencias[id] = estado.status === "ok" ? { ...estado, leads: leads.filter((lead) => lead.agencia === id).length } : estado
  }
  const algumaFalhou = Object.values(agencias).some((estado) => estado.status === "erro")
  const result: ResultadoRecibo = leads.length > 0 ? "encontrado" : algumaFalhou ? "erro" : descartados > 0 ? "homonimo" : "vazio_confirmado"
  return {
    ...recibo, leads, agencias, result,
    homonimo: { grupo: grupo.map((membro) => membro.slug).sort(), descartados, marcadores },
  }
}

export function descricaoEscopo(): string {
  const nativas = AGENCIAS_CHECAGEM.filter((a) => a.wpSearch).map((a) => a.nome).join(", ")
  return `uma consulta por agência (${AGENCIAS_CHECAGEM.map((a) => a.nome).join(", ")}) com o nome de urna; busca nativa WordPress em ${nativas} (até ${PAGINAS_WP * 100} resultados) e Google News RSS nas demais ou como segunda via (teto de ${TETO_ITENS_POR_CONSULTA} itens); sem limite de data; lead exige o nome no título`
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
 */
export function consolidarCatalogoRecibos(
  anterior: CatalogoRecibosChecagens | null,
  recibos: readonly ReciboChecagem[],
  now: Date,
): CatalogoRecibosChecagens {
  const porChave = new Map<string, ReciboChecagemPublico>()
  for (const recibo of anterior?.receipts ?? []) porChave.set(`${recibo.candidate_id}\u0000${recibo.candidate_slug}`, recibo)
  for (const recibo of recibos) {
    if (recibo.result === "erro") continue
    const chave = `${recibo.candidate_id}\u0000${recibo.candidate_slug}`
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
  roster: readonly CandidatoChecagem[]
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

async function consultarAgencia(candidato: CandidatoChecagem, agencia: AgenciaChecagem, opcoes: OpcoesConsulta): Promise<EstadoAgencia> {
  if (!agencia.wpSearch) return consultarGoogle(candidato, agencia, opcoes)
  const nativa = await consultarNativa(candidato, agencia, opcoes)
  if (nativa.status === "ok") return nativa
  const google = await consultarGoogle(candidato, agencia, opcoes)
  if (google.status === "ok") return { ...google, falhas: [nativa.erro] }
  return { status: "erro", erro: `${nativa.erro}; google-news: ${google.erro}` }
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
  const homonimos = gruposDeHomonimos(opcoes.roster)
  const consulta: OpcoesConsulta = {
    fetchText: opcoes.fetchText, tentativas, sleep, pausaMs, esperaBloqueioMs,
    semGoogle: opcoes.semGoogle ?? false,
    pararNoBloqueio: opcoes.pararNoBloqueio ?? false,
    limiteBloqueiosSeguidos: Math.max(1, opcoes.limiteBloqueiosSeguidos ?? 3),
    orcamentoEsperaMs: Math.max(0, opcoes.orcamentoEsperaMs ?? 10 * 60_000),
    disjuntor,
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
        const semPedido = !agencia.wpSearch && (consulta.semGoogle || disjuntor.aberto !== null)
        try {
          estados[agencia.id] = await consultarAgencia(candidato, agencia, consulta)
        } catch (error) {
          if (error instanceof BloqueioDeTaxa) abortado = true
          throw error
        }
        if (!semPedido) await sleep(pausaMs)
      }
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
