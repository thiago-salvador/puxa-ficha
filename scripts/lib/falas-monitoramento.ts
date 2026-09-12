import { createHash } from "node:crypto"
import { load } from "cheerio"
import { conteudoSerializadoClickPb } from "./falas-conteudo-serializado"
import { CANAIS_AO_VIVO_APROVADOS } from "./falas-evidencia-video"
import { validarEstruturaVideoGravado } from "./falas-video-gravado"
import sourcesConfig from "../data/falas-fontes.json"
import { periodoDaFala, chaveDataFala, type CatalogoFalas, type FalaCandidato } from "../../src/lib/falas-candidatos"

export const SOURCES = sourcesConfig.sources
export const LOOKBACK_DAYS = 14
export const INITIAL_SEARCH_START = "2026-08-16" as const
export type FonteFalas = (typeof SOURCES)[number]
export interface CandidatoFalas {
  id: string; slug: string; nome_urna: string; nome_completo: string
  cargo_disputado: "Presidente" | "Governador"; estado: string | null
}
export interface EvidenciaArtigo {
  url: string; status: "eligible" | "pending" | "discarded" | "unavailable"
  reason: string; sha256: string | null; quotes: FalaCandidato[]
}
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
export const texto = (html: string) => load(html, null, false).text().replace(/\s+/g, " ").trim()
const normalizar = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const escapar = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function urlAprovada(raw: string, source: FonteFalas): string | null {
  try {
    const url = new URL(raw, source.origin)
    if (url.origin !== source.origin || url.protocol !== "https:" || url.username || url.password) return null
    url.hash = ""
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key)
    if (source.approvedArticleUrls && !source.approvedArticleUrls.includes(url.href)) return null
    return url.href
  } catch { return null }
}

export function descobrirLinks(html: string, source: FonteFalas, roster: CandidatoFalas[]) {
  const $ = load(html)
  $("script,style,nav,aside,footer,template,noscript,svg").remove()
  const links = new Set<string>()
  let next: string | null = null
  for (const element of $("a[href],link[rel=next]").toArray()) {
    const href = $(element).attr("href")
    if (!href) continue
    const url = urlAprovada(href, source)
    if (!url) continue
    if ($(element).attr("rel") === "next") { next = url; continue }
    const title = $(element).text().replace(/\s+/g, " ").trim()
    if (!new URL(url).pathname.includes(source.articlePath) || new URL(url).pathname === source.listing) continue
    if (/debate|entrevista|sabatin/i.test(title) || roster.some((c) => menciona(title, c))) links.add(url)
  }
  return { urls: [...links], next }
}

function nomes(candidate: CandidatoFalas): string[] {
  // Never infer aliases or match a surname alone.
  return [...new Set([candidate.nome_urna, candidate.nome_completo].map(normalizar))].filter((s) => s.length >= 4)
}
function menciona(text: string, candidate: CandidatoFalas): boolean {
  const normalized = ` ${normalizar(text)} `
  return nomes(candidate).some((name) => normalized.includes(` ${name} `))
}

function tipoEvento(context: string): FalaCandidato["event_type"] | null {
  const matches = [ /\b(?:no|durante o|em um) debate\b/i.test(context) ? "debate" : null,
    /\b(?:na|durante a|em uma) entrevista\b/i.test(context) ? "entrevista" : null,
    /\b(?:na|durante a|em uma|no) sabatina\b/i.test(context) ? "sabatina" : null ].filter(Boolean)
  return matches.length === 1 ? matches[0] as FalaCandidato["event_type"] : null
}

export function naJanela(day: string, now: Date): boolean {
  const parsed = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return false
  // Calendar dates in São Paulo: today and the preceding 13 dates.
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const cutoff = new Date(`${today}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - LOOKBACK_DAYS + 1)
  return day >= INITIAL_SEARCH_START && day >= cutoff.toISOString().slice(0, 10) && day <= today
}

/** Broader range is authorized only for the initial population of empty profiles. */
export function naJanelaInicial(day: string, now: Date): boolean {
  const parsed = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return false
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  return day >= INITIAL_SEARCH_START && day <= today
}

export function dataEvento(context: string, published: string, allowRecentMonth = false): string | null {
  // Publication time is NOT evidence of when someone spoke. Only explicit dates
  // tied to the event in the attribution paragraph are accepted automatically.
  const matches = [...context.matchAll(/\b(\d{2})[/.](\d{2})[/.](20\d{2})\b|\b(20\d{2}-\d{2}-\d{2})\b/g)]
    .map((m) => m[4] ?? `${m[3]}-${m[2]}-${m[1]}`)
  const weekdays = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
  for (const match of context.matchAll(/\b(\d{1,2})(?:º)? de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (20\d{2})\b/gi)) {
    matches.push(`${match[3]}-${String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`)
  }
  // A day and month without a year must resolve to a recent past date.
  // Explicit years are handled above and never replaced by the publication year.
  for (const match of (allowRecentMonth ? context : "").matchAll(/\b(\d{1,2})(?:º)? de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b(?! de \d{4})/gi)) {
    const date = `${published.slice(0, 4)}-${String(months.indexOf(match[2].toLowerCase()) + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`
    const elapsed = Date.parse(published.slice(0, 10)) - Date.parse(date)
    if (elapsed >= 0 && elapsed <= 35 * 86_400_000 && new Date(date).toISOString().slice(0, 10) === date) matches.push(date)
  }
  if (/\bontem\b/i.test(context)) {
    const date = new Date(`${published.slice(0, 10)}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - 1)
    if (Number.isFinite(date.getTime())) matches.push(date.toISOString().slice(0, 10))
  }
  // A weekday plus day-of-month is resolved only within the publication week.
  // It must agree with the calendar; no fallback to publication day alone.
  for (const match of context.matchAll(/\b(?:(?:nesta|nessa|neste|nesse|desta|deste|na|no)\s+)?(domingo|segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado)\s*(?:\((\d{1,2})(?:º)?(?: de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))?\)|,\s*(\d{1,2})(?:º)?\b)/gi)) {
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(`${published.slice(0, 10)}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - offset)
      if (date.getUTCDate() === Number(match[2] ?? match[4]) && (!match[3] || months[date.getUTCMonth()] === match[3].toLowerCase())
        && weekdays[date.getUTCDay()].replace("-feira", "") === match[1].toLowerCase().replace("-feira", "")) matches.push(date.toISOString().slice(0, 10))
    }
  }
  for (const match of context.matchAll(/\((\d{1,2})(?:º)?[/.](\d{1,2})\)/g)) {
    const date = `${published.slice(0, 4)}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    if (date <= published.slice(0, 10)) matches.push(date)
  }
  return new Set(matches).size === 1 ? matches[0] : null
}

function noticiasEstruturadas(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(noticiasEstruturadas)
  if (!value || typeof value !== "object") return []
  const obj = value as Record<string, unknown>
  if (["NewsArticle", "Article"].includes(String(obj["@type"]))) return [obj]
  return noticiasEstruturadas(obj["@graph"])
}

export function extrairArtigo(input: { html: string; url: string; source: FonteFalas; roster: CandidatoFalas[]; now: Date }): EvidenciaArtigo {
  const { html, url, source, roster, now } = input
  const hash = sha256(html)
  const result = (status: EvidenciaArtigo["status"], reason: string, quotes: FalaCandidato[] = []): EvidenciaArtigo => ({ url, status, reason, sha256: hash, quotes })
  if (source.origin === "https://www.youtube.com") return result("pending", "Episódio exige validação do canal, áudio e data da gravação")
  if (urlAprovada(url, source) !== url) return result("discarded", "URL fora da fonte aprovada")
  const $ = load(html)
  const canonicalUrl = $("link[rel=canonical]").attr("href")
  if (!canonicalUrl || urlAprovada(canonicalUrl, source) !== url) return result("pending", "URL canônica ausente ou divergente")
  const structured = $("script[type='application/ld+json']").toArray().flatMap((el) => {
    try { return noticiasEstruturadas(JSON.parse($(el).text())) } catch { return [] }
  })
  const news = structured.length === 1 ? structured[0] : null
  const published = $("meta[property='article:published_time']").attr("content") ?? (typeof news?.datePublished === "string" ? news.datePublished : null)
  const title = $("meta[property='og:title']").attr("content")?.trim() ?? ""
  if (!published || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(published) || !Number.isFinite(Date.parse(published)) || !title) return result("pending", "Data original ou título ausente")
  if (Date.parse(published) > now.getTime() || !naJanela(published.slice(0, 10), now)) return result("discarded", "Publicação fora dos últimos 14 dias")
  if (!$("meta[name=author],meta[property='article:author']").attr("content") && !news?.author) return result("pending", "Autoria da matéria ausente")
  if (/\bopinião\b|\bcoluna\b|\beditorial\b/i.test(title + " " + new URL(url).pathname)) return result("discarded", "Opinião fora do escopo")
  const serialized = source.id === "clickpb" ? conteudoSerializadoClickPb(html, url) : null
  if (serialized && (serialized.title !== title || serialized.published !== published)) return result("pending", "Metadados do corpo serializado divergentes")
  $("script,style,nav,aside,footer,header,template,noscript,svg,.articleTeaser,.single-recommended-content").remove()
  const selector = source.id === "diario-nordeste" ? ".articleContent" : source.id === "agencia-brasil" ? ".conteudo-noticia,article" : "article,[itemprop=articleBody]"
  const article = serialized ? $("<article></article>").html(serialized.body) : $(selector).first()
  if (!article.length) return result("pending", "Corpo da matéria não reconhecido")
  const paragraphs = article.find("p").toArray().map((el) => $(el).text().replace(/\s+/g, " ").trim())
  const lead = paragraphs.slice(0, 2).join(" ")
  // The verified Diário do Nordeste debate template identifies its event in
  // the lead. Other layouts keep the stricter same-paragraph requirement.
  const articleEvent = source.id === "diario-nordeste" && /\bdebate\b/i.test(title) && /\b(?:durante o|do) Debate PontoPoder\b/i.test(lead)
    ? { type: "debate" as const, day: dataEvento(lead, published), context: lead } : null
  const quotes: FalaCandidato[] = []
  let potential = 0
  for (const context of paragraphs) {
    const spans = [...context.matchAll(/“([^“”]+)”|"([^"\n]+)"/g)]
    if (spans.length !== 1) continue
    potential++
    const span = spans[0]
    const quote = span[1] ?? span[2]
    const before = context.slice(0, span.index)
    const after = context.slice(span.index! + span[0].length)
    const outside = `${before} ${after}`
    const candidates = roster.filter((candidate) => menciona(outside, candidate))
    if (candidates.length !== 1) continue
    const candidate = candidates[0]
    const namePattern = nomes(candidate).map(escapar).join("|")
    const speech = "(?:disse|afirmou|declarou|respondeu|explicou|defendeu|ressaltou)"
    const explicitAfter = new RegExp(`^\\s*[,;]?\\s*${speech}\\s+(?:o candidato |a candidata )?(?:${namePattern})(?:\\b|$)`).test(normalizar(after))
    const explicitBefore = new RegExp(`^(?:o candidato |a candidata )?(?:${namePattern})\\s+${speech}(?:\\s+.{0,160})?$`).test(normalizar(before))
    if (!explicitAfter && !explicitBefore) continue
    const eventType = tipoEvento(outside) ?? articleEvent?.type
    const occurredOn = dataEvento(outside, published) ?? articleEvent?.day
    if (articleEvent && tipoEvento(outside) && tipoEvento(outside) !== articleEvent.type && !dataEvento(outside, published)) continue
    if (!eventType || !occurredOn || !naJanela(occurredOn, now) || occurredOn > published.slice(0, 10)) continue
    const attributionContext = before + " " + after.split(/[.!?]/, 1)[0]
    if (/\b(?:relembrou|recordou|citou|segundo|em 20\d{2}|havia dito|teria dito|de acordo com|ano passado|mês passado|semana passada|anteriormente)\b/i.test(attributionContext)) continue
    // Short complete quote; do not rewrite, splice or silently truncate it.
    if (quote.split(/\s+/).length < 4 || quote.split(/\s+/).length > 40 || /[“”]|\[\.\.\.\]|…/.test(quote)) continue
    quotes.push({ id: sha256(`${candidate.id}:${occurredOn}:${normalizar(quote)}`), candidate_id: candidate.id,
      candidate_slug: candidate.slug, candidate_name: candidate.nome_urna, office: candidate.cargo_disputado, uf: candidate.estado,
      quote_text: quote, context, event_context: articleEvent?.context ?? outside, event_type: eventType, occurred_on: occurredOn, publisher: source.publisher,
      article_url: url, article_title: title, article_published_at: published, observed_at: now.toISOString(), source_sha256: hash,
      attribution: "explicit_name_same_paragraph" })
  }
  return quotes.length ? result("eligible", "Aspa, atribuição e data explícitas na matéria", quotes)
    : result("pending", potential ? "Aspas exigem confirmação de autoria, contexto ou data do evento" : "Sem aspa atribuível no formato reconhecido")
}

export function consolidarFalas(previous: CatalogoFalas, observed: FalaCandidato[], now: Date): CatalogoFalas {
  validarCatalogo(previous)
  const byId = new Map(previous.quotes.map((quote) => [quote.id, quote]))
  for (const quote of observed) {
    // Idempotent replays preserve the first verified source and observation.
    if (!byId.has(quote.id)) byId.set(quote.id, quote)
  }
  const quotes = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  const catalog: CatalogoFalas = { schema_version: "falas-v1", updated_at: quotes.length === previous.quotes.length ? previous.updated_at : now.toISOString(), quotes }
  validarCatalogo(catalog)
  return catalog
}

export function validarCatalogo(catalog: CatalogoFalas): void {
  if (catalog.schema_version !== "falas-v1" || !Array.isArray(catalog.quotes)) throw new Error("Catálogo de falas inválido")
  const ids = new Set<string>()
  for (const q of catalog.quotes) {
    const period = periodoDaFala(q)
    const transcript = q.transcription
    const recorded = q.review_evidence?.recorded_video
    if (recorded) validarEstruturaVideoGravado(q)
    if (["The Papo com André Silva", "MetalTV (SMC)"].includes(q.publisher) && !recorded) throw new Error("Canal exige evidência do episódio gravado")
    const publicationBound = transcript?.media_published_at ?? q.article_published_at
    if (transcript && (transcript.kind !== "automatic" || transcript.reviewed_context !== true
      || !transcript.engine?.trim() || typeof transcript.speaker_context !== "string" || transcript.speaker_context.trim().length < 30
      || !Number.isFinite(transcript.start_seconds) || !Number.isFinite(transcript.end_seconds)
      || transcript.start_seconds < 0 || transcript.end_seconds <= transcript.start_seconds || transcript.end_seconds - transcript.start_seconds > 90
      || ![transcript.audio_sha256, transcript.transcript_sha256, transcript.verification_sha256].every(hash => /^[a-f0-9]{64}$/.test(hash))
      || !/^https:\/\/[^\s]+$/.test(transcript.media_url) || !Number.isFinite(Date.parse(publicationBound))
      || Date.parse(publicationBound) > Date.parse(q.observed_at) || q.attribution !== "source_context_review"
      || (q.occurred_between && !recorded) || q.quote_text.split(/\s+/).length > 25)) throw new Error("Transcrição sem integridade, contexto ou minutagem")
    const rangeProof = q.review_evidence?.date_range_proof
    const live = q.review_evidence?.live_video
    if (live && (q.occurred_between || q.attribution !== "source_context_review" || live.reviewed_live_on_air !== true
      || !Object.hasOwn(CANAIS_AO_VIVO_APROVADOS, live.channel_id) || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(live.url)
      || !Number.isInteger(live.release_timestamp) || live.release_timestamp <= 0 || live.release_timestamp * 1000 > Date.parse(publicationBound)
      || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(live.release_timestamp * 1000)) !== live.broadcast_on
      || live.broadcast_on !== q.occurred_on || ![live.metadata_sha256, live.captions_sha256, live.frame_sha256].every(hash => /^[a-f0-9]{64}$/.test(hash))
      || !Number.isFinite(live.frame_at_seconds) || live.frame_at_seconds < 0 || live.article_event_excerpt !== q.review_evidence?.date_excerpt
      || live.quote_excerpt.split(/\s+/).length < 6 || !normalizar(q.quote_text).includes(normalizar(live.quote_excerpt)))) throw new Error("Data ao vivo sem evidência vinculada")
    if (!period || (q.occurred_between && !recorded && (!rangeProof || q.attribution !== "source_context_review"
      || rangeProof.relationship_excerpt.length < 20
      || !Number.isFinite(Date.parse(rangeProof.anchor_published_at)) || Date.parse(rangeProof.anchor_published_at) > Date.parse(q.observed_at)
      || Date.parse(rangeProof.publication_timestamp) !== Date.parse(q.article_published_at)
      || period.to !== rangeProof.publication_timestamp.slice(0, 10)
      || dataEvento(rangeProof.anchor_excerpt, rangeProof.anchor_published_at, true) !== period.from
      || !q.review_evidence?.supporting_sources?.some(p => p.url === rangeProof.anchor_url && p.excerpts.includes(rangeProof.anchor_excerpt))))) throw new Error("Intervalo da fala sem limites comprovados")
    const source = SOURCES.find((s) => s.publisher === q.publisher && urlAprovada(q.article_url, s) === q.article_url)
    if (!source || !q.candidate_id || !q.candidate_slug || !q.candidate_name || !q.quote_text || !q.context?.includes(q.quote_text)
      || !q.article_title || !q.event_context || !["Presidente", "Governador"].includes(q.office)
      || !["debate", "entrevista", "sabatina", "declaracao"].includes(q.event_type)
      || (q.event_type === "declaracao" && !q.review_evidence?.declaration_context_excerpt)
      || !["explicit_name_same_paragraph", "source_context_review"].includes(q.attribution) || !/^[a-f0-9]{64}$/.test(q.source_sha256)
      || q.id !== sha256(`${q.candidate_id}:${chaveDataFala(q)}:${normalizar(q.quote_text)}`) || ids.has(q.id)
      || !Number.isFinite(Date.parse(q.article_published_at)) || !Number.isFinite(Date.parse(q.observed_at))
      || Date.parse(q.article_published_at) > Date.parse(q.observed_at) || period.to > publicationBound.slice(0, 10)
      || (q.collection_scope ? (q.collection_scope.mode !== "initial_backfill" || q.collection_scope.from !== INITIAL_SEARCH_START || !naJanelaInicial(period.from, new Date(q.observed_at)) || !naJanelaInicial(period.to, new Date(q.observed_at))) : !naJanela(period.from, new Date(q.observed_at)) || !naJanela(period.to, new Date(q.observed_at)))
      || (q.attribution === "explicit_name_same_paragraph" && dataEvento(q.event_context, q.article_published_at) !== q.occurred_on)
      || (q.attribution === "source_context_review" && (!q.review_evidence?.identity_excerpt || !q.review_evidence.date_excerpt || q.review_evidence.method !== "codex_source_review"
        || (!q.occurred_between && !live && dataEvento(q.review_evidence.date_excerpt, q.article_published_at) !== q.occurred_on)
        || q.review_evidence.supporting_sources?.some((proof) => !/^[a-f0-9]{64}$/.test(proof.sha256) || !proof.excerpts.length || !SOURCES.some((s) => urlAprovada(proof.url, s) === proof.url))
        || !source || !urlAprovada(q.review_evidence.fetched_url, source)))) throw new Error("Fala sem identidade, fonte, integridade ou data comprovada")
    ids.add(q.id)
  }
}
