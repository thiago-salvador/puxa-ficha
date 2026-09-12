import { load } from "cheerio"
import { INITIAL_SEARCH_START, SOURCES, dataEvento, naJanela, naJanelaInicial, sha256, urlAprovada, type CandidatoFalas } from "./falas-monitoramento"
import { periodoDaFala, chaveDataFala, type FalaCandidato } from "../../src/lib/falas-candidatos"
import { lerEvidenciaWeb, type EvidenciaWeb } from "./falas-evidencia-web"
import { conteudoSerializadoClickPb } from "./falas-conteudo-serializado"
import { CANAIS_AO_VIVO_APROVADOS, lerEvidenciaVideo, exportarTextoLegendaVtt as textoLegendaVtt } from "./falas-evidencia-video"

export interface VideoDeApoio { metadata: string; captions: string; frame_sha256: string; frame_at_seconds: number }

export interface AchadoRevisado {
  quote_text: string
  context: string
  event_context: string
  occurred_on: string | null
  occurred_between?: { from: string; to: string }
  article_published_at: string
  publisher: string
  article_url: string
  article_title: string
  evidence: { identity_excerpt?: string; date_excerpt?: string; date_source_url?: string; quote_location?: "headline"; source_credit?: string; declaration_context_excerpt?: string;
    event_live_video?: { url: string; channel_id: string; article_event_excerpt: string; quote_excerpt: string; frame_sha256: string; reviewed_live_on_air: true };
    event_date_source?: { article_url: string; date_excerpt: string; article_published_at: string };
    event_date_range?: { anchor_url: string; anchor_excerpt: string; anchor_published_at: string; relationship_excerpt: string };
    identity_alias_evidence?: Array<{ alias: string; canonical_name: string; uf: string; article_url: string; identity_excerpt: string; alias_party_excerpt: string; uf_excerpt: string }> }
}

const plain = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim()
const normalizeId = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

const containsName = (text: string, name: string) => {
  const normalizedName = normalizeId(name)
  return normalizedName.length > 0 && ` ${normalizeId(text)} `.includes(` ${normalizedName} `)
}

/** Reject explicit contradictions around this quotation. This is a narrow
 * guard, not a replacement for the contextual source review between paragraphs.
 * Mask whole quoted passages so names/dates mentioned by the speaker cannot
 * be mistaken for the journalist's attribution of the selected excerpt. */
function contradicaoNoContexto(context: string, quote: string, names: string[], period: { from: string; to: string }, published: string): string | null {
  let outside = context.replace(/[“"]([^”"]+)[”"]/g, " ")
  // Some interview templates present answers without quotation marks.
  outside = outside.replace(quote, " ")
  const properName = "[\\p{Lu}][\\p{L}’'-]+(?:\\s+(?:(?:da|de|do|dos|das)\\s+)?[\\p{Lu}][\\p{L}’'-]+)+"
  const speech = "(?:disse|afirmou|declarou|respondeu|explicou|ressaltou|concluiu)"
  const role = "(?:(?:o|a)\\s+)?(?:(?:candidat[oa]|governador[ae]?|senador[ae]?|deputad[oa]|presidente)\\s+)?"
  const patterns = [new RegExp(`${speech}\\s+${role}(${properName})`, "gu"), new RegExp(`(${properName})\\s+${speech}\\s*[:,]`, "gu")]
  for (const pattern of patterns) for (const match of outside.matchAll(pattern)) {
    const speaker = normalizeId(match[1])
    if (!names.some((name) => name === speaker || name.startsWith(speaker + " ") || speaker.startsWith(name + " "))) return "explicit_speaker_contradiction"
  }
  // Only dates explicitly attached to an interview/debate are considered;
  // an unrelated historical date elsewhere in the paragraph is not a conflict.
  for (const match of outside.matchAll(/(?:entrevista|sabatina|debate|coletiva)\b[^“”";!?]{0,140}/gi)) {
    const date = dataEvento(match[0], published)
    if (date && (date < period.from || date > period.to)) return "explicit_event_date_contradiction"
  }
  return null
}

/** Explicit source review supplements deterministic extraction, never an LLM
 * guess promoted from a search snippet. All three excerpts must be in the
 * retrieved publisher page and are saved with its content hash for replay. */
export function verificarRevisao(input: { candidate: CandidatoFalas; finding: AchadoRevisado; html: string; webText?: EvidenciaWeb; now: Date; supporting?: Map<string, string>; supportingWeb?: Map<string, EvidenciaWeb>; liveVideos?: Map<string, VideoDeApoio>; mode?: "recurring" | "initial_backfill" }): { quote: FalaCandidato | null; reason: string } {
  const { candidate, finding, html, now } = input
  const pending = (reason: string) => ({ quote: null, reason })
  const source = SOURCES.find((s) => urlAprovada(finding.article_url, s) === finding.article_url)
  if (!source) return pending("source_not_approved")
  let web: ReturnType<typeof lerEvidenciaWeb> | undefined
  if (input.webText) {
    try { web = lerEvidenciaWeb(input.webText) } catch (error) { return pending(error instanceof Error ? error.message : "invalid_web_evidence") }
    if (web.url !== finding.article_url || Date.parse(web.retrieved_at) > now.getTime()) return pending("web_evidence_source_mismatch")
  }
  const period = periodoDaFala(finding)
  const inWindow = input.mode === "initial_backfill" ? naJanelaInicial : naJanela
  if (!period || !inWindow(period.from, now) || !inWindow(period.to, now)) return pending("event_outside_window")
  if (!Number.isFinite(Date.parse(finding.article_published_at)) || Date.parse(finding.article_published_at) > now.getTime()
    || period.to > finding.article_published_at.slice(0, 10)) return pending("invalid_publication_date")
  const $ = load(html)
  const rangeProof = finding.evidence.event_date_range
  let publicationTimestamp: string | undefined
  if (finding.occurred_between) {
    // A range requires the original publisher's timestamp as an upper bound.
    // A search result or a caller-provided publication day is not enough.
    publicationTimestamp = $("meta[property='article:published_time']").attr("content")
    if (web || !rangeProof || !publicationTimestamp || !Number.isFinite(Date.parse(publicationTimestamp))
      || Date.parse(publicationTimestamp) !== Date.parse(finding.article_published_at)
      || period.to !== publicationTimestamp.slice(0, 10)) return pending("range_publication_bound_not_verified")
  } else if (rangeProof) return pending("range_proof_requires_interval")
  let canonical = web?.url ?? $("link[rel=canonical]").attr("href") ?? $("meta[property='og:url']").attr("content")
  // These two publisher templates have directly observed metadata defects:
  // Classe Política points every article at its homepage; Política Livre adds
  // a literal dollar sign before the month. Keep the fetched article URL,
  // whose visible quotation and dated attribution are still verified below.
  if (source.id === "classe-politica" && canonical === source.origin + "/" && new URL(finding.article_url).pathname.startsWith("/noticia/")) canonical = finding.article_url
  if (source.id === "politica-livre" && canonical?.replace("/$", "/") === finding.article_url) canonical = finding.article_url
  if (!canonical || !urlAprovada(canonical, source)) return pending("canonical_not_verified")
  if (urlAprovada(canonical, source)!.replace("/amp/", "/") !== finding.article_url.replace("/amp/", "/")) return pending("canonical_article_mismatch")
  const serialized = !web && source.id === "clickpb" ? conteudoSerializadoClickPb(html, finding.article_url) : null
  if (serialized) {
    if (plain(serialized.title) !== plain(finding.article_title) || serialized.published.slice(0, 10) !== finding.article_published_at.slice(0, 10)) return pending("serialized_article_metadata_mismatch")
    $("body").append($("<article></article>").html(serialized.body))
  }
  $("script,style,nav,aside,template,noscript,svg").remove()
  $("header,footer").each((_, element) => { if (!$(element).closest("article,[itemprop=articleBody],.entry-content").length) $(element).remove() })
  const body = plain(web?.body ?? $.text())
  if (finding.evidence.source_credit && !body.includes(plain(finding.evidence.source_credit))) return pending("source_credit_not_in_original")
  // Accessible captions on the article's own images can identify the speaker.
  // They never supply a quotation or a date. Live evidence can use them to
  // identify the interview whose chronology is verified independently.
  const identityBody = web ? body : plain(body + " " + $("article img[alt],.hentry img[alt],[itemprop=articleBody] img[alt],#primary .contentnotice img[alt]").toArray().map((image) => $(image).attr("alt") ?? "").join(" "))
  const quoteText = plain(finding.quote_text)
  if (!quoteText || quoteText.split(/\s+/).length < 4 || quoteText.split(/\s+/).length > 90 || !body.includes(quoteText)) return pending("quote_not_literal_in_source")
  const identity = plain(finding.evidence?.identity_excerpt ?? "")
  if (/pré[ -]?candidat|pre[ -]?candidat/iu.test(identity + " " + finding.event_context + " " + finding.evidence.date_excerpt)) return pending("pre_campaign_candidate_context")
  const dateSource = finding.evidence.event_date_source
  const dateUrl = rangeProof?.anchor_url ?? dateSource?.article_url ?? finding.evidence.date_source_url
  const dateEvidence = plain(rangeProof?.anchor_excerpt ?? dateSource?.date_excerpt ?? finding.evidence?.date_excerpt ?? "")
  const supportingSources: Array<{ url: string; sha256: string; excerpts: string[]; source_format?: "web_text" }> = []
  const supportingText = (url: string, excerpts: string[]) => {
    if (!SOURCES.some((s) => urlAprovada(url, s) === url)) return null
    const webInput = input.supportingWeb?.get(url)
    if (webInput) {
      try {
        const evidence = lerEvidenciaWeb(webInput)
        if (evidence.url !== url || Date.parse(evidence.retrieved_at) > now.getTime()) return null
        const text = plain(evidence.body)
        if (!excerpts.every((excerpt) => text.includes(plain(excerpt)))) return null
        supportingSources.push({ url, sha256: sha256(evidence.raw), excerpts, source_format: "web_text" })
        return text
      } catch { return null }
    }
    const raw = input.supporting?.get(url)
    if (!raw) return null
    const doc = load(raw)
    doc("script,style,nav,aside,template,noscript,svg").remove()
    doc("header,footer").each((_, element) => { if (!doc(element).closest("article,[itemprop=articleBody],.entry-content").length) doc(element).remove() })
    const text = plain(doc.text())
    if (!excerpts.every((excerpt) => text.includes(plain(excerpt)))) return null
    supportingSources.push({ url, sha256: sha256(raw), excerpts })
    return text
  }
  if (identity.length < 3 || !identityBody.includes(identity)) return pending("identity_excerpt_not_in_source")
  const names = [candidate.nome_urna, candidate.nome_completo].map(normalizeId)
  const identityNormalized = normalizeId(identity)
  const directIdentity = names.some((name) => ` ${identityNormalized} `.includes(` ${name} `) || (identityNormalized.split(" ").length >= 2 && name.startsWith(identityNormalized + " ")))
  const verifiedAliases = finding.evidence.identity_alias_evidence?.filter((proof) => proof.uf === candidate.estado && names.includes(normalizeId(proof.canonical_name))
    && containsName(proof.identity_excerpt, proof.canonical_name) && containsName(proof.alias_party_excerpt, proof.alias)
    && supportingText(proof.article_url, [proof.identity_excerpt, proof.alias_party_excerpt, proof.uf_excerpt])) ?? []
  const verifiedAlias = verifiedAliases.find((proof) => containsName(identity, proof.alias))
  if (!directIdentity && !verifiedAlias) return pending("identity_does_not_match_candidate")
  let liveVideo: NonNullable<FalaCandidato["review_evidence"]>["live_video"]
  const liveProof = finding.evidence.event_live_video
  if (liveProof) {
    // A live broadcast date alone does not date a prerecorded segment. The
    // source reviewer must inspect the on-air segment and bind its words to
    // the separately verified newspaper quotation; captions are only a match.
    const channel = CANAIS_AO_VIVO_APROVADOS[liveProof.channel_id as keyof typeof CANAIS_AO_VIVO_APROVADOS]
    const support = input.liveVideos?.get(liveProof.url)
    if (!channel || !support || rangeProof || dateUrl || liveProof.reviewed_live_on_air !== true
      || !Number.isFinite(support.frame_at_seconds) || support.frame_at_seconds < 0
      || !/^[a-f0-9]{64}$/.test(liveProof.frame_sha256) || liveProof.frame_sha256 !== support.frame_sha256)
      return pending("live_video_evidence_missing")
    const eventExcerpt = plain(liveProof.article_event_excerpt)
    const matchingQuote = normalizeId(liveProof.quote_excerpt)
    if (eventExcerpt.length < 20 || !identityBody.includes(eventExcerpt)
      || !normalizeId(eventExcerpt).includes(normalizeId(channel.publisher))
      || matchingQuote.split(" ").length < 6 || !normalizeId(quoteText).includes(matchingQuote)
      || !normalizeId(textoLegendaVtt(support.captions)).includes(matchingQuote))
      return pending("live_video_article_link_not_verified")
    try {
      const video = lerEvidenciaVideo(support.metadata, liveProof.url, liveProof.channel_id, now)
      const duration = (JSON.parse(support.metadata) as { duration?: number }).duration
      const published = $("meta[property='article:published_time']").attr("content")
      if (!Number.isFinite(duration) || support.frame_at_seconds >= duration!
        || !published || Date.parse(published) !== Date.parse(finding.article_published_at))
        return pending("live_video_recording_bounds_not_verified")
      if (video.broadcast_on !== period.from || video.broadcast_on !== period.to
        || video.release_timestamp * 1000 > Date.parse(finding.article_published_at))
        return pending("live_video_date_mismatch")
      liveVideo = { url: video.url, channel_id: video.channel_id, broadcast_on: video.broadcast_on,
        release_timestamp: video.release_timestamp, metadata_sha256: video.raw_sha256,
        captions_sha256: sha256(support.captions), frame_sha256: support.frame_sha256,
        frame_at_seconds: support.frame_at_seconds, article_event_excerpt: eventExcerpt,
        quote_excerpt: plain(liveProof.quote_excerpt), reviewed_live_on_air: true }
    } catch { return pending("live_video_metadata_invalid") }
    if (dateEvidence !== eventExcerpt) return pending("live_video_event_excerpt_mismatch")
  } else {
    const dateBody = dateUrl ? supportingText(dateUrl, [dateEvidence]) : body
    if (dateEvidence.length < 8 || !dateBody?.includes(dateEvidence)) return pending("event_date_excerpt_not_in_source")
    if (/^[^\d]{0,80}\b(?:\d{1,2}[/.]\d{2}[/.]\d{4}|\d{1,2} de [\p{L}]+ de \d{4})\s*(?:[-–]|às)?\s*\d{1,2}(?::|h)\d{2}/iu.test(dateEvidence)
      && !/entrevista|sabatina|debate|ocorre|realizad/i.test(dateEvidence)) return pending("publication_timestamp_is_not_event_date")
    if (dateUrl && ![...names, ...verifiedAliases.map((proof) => normalizeId(proof.alias))].some((name) => containsName(dateBody, name))) return pending("event_source_identity_not_verified")
    if (/divulgad|exibid|republicad/i.test(dateEvidence)) return pending("broadcast_date_needs_event_corroboration")
    if (/marcad[oa]|agendad[oa]|será|participará|ocorrerá|acontecerá|previst[oa]/i.test(dateEvidence)) return pending("planned_event_is_not_speech_date")
    if (dataEvento(dateEvidence, rangeProof?.anchor_published_at ?? dateSource?.article_published_at ?? finding.article_published_at, Boolean(rangeProof)) !== period.from) return pending("event_date_not_resolved")
    if (rangeProof) {
      const relationship = plain(rangeProof.relationship_excerpt)
      if (relationship.length < 20 || !body.includes(relationship)
        || !/após|depois|reagiu|reações|comentou|contra a decisão|recorrer|afirmou receber/iu.test(relationship)) return pending("range_relationship_not_verified")
      if (!Number.isFinite(Date.parse(rangeProof.anchor_published_at)) || Date.parse(rangeProof.anchor_published_at) > now.getTime()
        || period.from > rangeProof.anchor_published_at.slice(0, 10)) return pending("range_anchor_timestamp_invalid")
    }
  }
  const event = normalizeId(finding.event_context + " " + dateEvidence)
  if (/nao (?:explicita|confirma|comprova)|sem (?:confirmacao|comprovacao)|fora do escopo/.test(event)) return pending("event_type_not_verified")
  const declarationContext = plain(finding.evidence.declaration_context_excerpt ?? "")
  if (declarationContext && (declarationContext.length < 20 || !body.includes(declarationContext)
    || !/campanha|período eleitoral|panfletagem|comício|durante o ato/iu.test(declarationContext))) return pending("declaration_context_not_verified")
  const eventType = declarationContext ? "declaracao" : /sabatin/.test(event) ? "sabatina" : /entrevista|roda viva/.test(event) ? "entrevista" : /debate/.test(event) ? "debate" : null
  if (!eventType) return pending("event_type_not_verified")
  const paragraphSelector = source.id === "o-dia" ? "p,blockquote,.article-body .texto" : source.id === "informa-rondonia" ? "p,blockquote,.rema26x-quote" : "p,blockquote"
  const acceptedNames = [...names, ...(verifiedAlias ? [normalizeId(verifiedAlias.alias)] : [])]
  let contextParagraph: string | undefined
  if (finding.evidence.quote_location === "headline") {
    const headings = web ? web.paragraphs.filter((text) => /^#{1,2}\s/.test(text)).map((text) => text.replace(/^#{1,2}\s+/, ""))
      : $("h1,h2").toArray().map((el) => plain($(el).text()))
    const headline = headings.find((text) => text === plain(finding.article_title))
    const quoted = headline && [...headline.matchAll(/[“"]([^”"]+)[”"]/g)].some((match) => plain(match[1]) === quoteText)
    const attribution = normalizeId((headline ?? "").replace(/[“"]([^”"]+)[”"]/g, " "))
    const named = acceptedNames.some((name) => new RegExp(`(?:^| )(?:diz|disse|afirma|afirmou|declara|declarou) (?:(?:o|a) candidat[oa] )?${name}(?: |$)`).test(attribution))
    if (!headline || !quoted || !named) return pending("headline_quote_not_explicitly_attributed")
    contextParagraph = headline
  } else {
    contextParagraph = (web?.paragraphs.filter((text) => !/^#{1,6}\s/.test(text)) ?? $(paragraphSelector).toArray().map((el) => plain($(el).text()))).filter((text) => text.includes(quoteText)).sort((a,b) => a.length - b.length)[0]
  }
  if (!contextParagraph) return pending("quote_not_in_article_paragraph")
  const contradiction = contradicaoNoContexto(contextParagraph, quoteText, acceptedNames, period, finding.article_published_at)
  if (contradiction) return pending(contradiction)
  return { reason: "source_context_review", quote: {
    id: sha256(`${candidate.id}:${chaveDataFala(finding)}:${normalizeId(quoteText)}`),
    candidate_id: candidate.id, candidate_slug: candidate.slug, candidate_name: candidate.nome_urna,
    office: candidate.cargo_disputado, uf: candidate.estado,
    quote_text: quoteText, context: contextParagraph, event_context: finding.event_context + ". " + dateEvidence,
    event_type: eventType, occurred_on: finding.occurred_on,
    ...(finding.occurred_between ? { occurred_between: finding.occurred_between } : {}),
    publisher: source.publisher, article_url: urlAprovada(canonical, source)!, article_title: finding.article_title,
    article_published_at: finding.article_published_at, observed_at: now.toISOString(), source_sha256: sha256(web?.raw ?? html),
    ...(!naJanela(period.from, now) ? { collection_scope: { mode: "initial_backfill" as const, from: INITIAL_SEARCH_START } } : {}),
    attribution: "source_context_review", review_evidence: { ...(liveVideo ? { live_video: liveVideo } : {}), ...(declarationContext ? { declaration_context_excerpt: declarationContext } : {}), identity_excerpt: identity, date_excerpt: dateEvidence, fetched_url: finding.article_url, method: "codex_source_review", ...(finding.evidence.source_credit ? { source_credit: plain(finding.evidence.source_credit) } : {}), ...(rangeProof ? { date_range_proof: { ...rangeProof, publication_timestamp: publicationTimestamp! } } : {}), ...(serialized ? { content_encoding: "react_flight" as const } : {}), ...(finding.evidence.quote_location ? { quote_location: finding.evidence.quote_location } : {}), ...(web ? { source_format: "web_text" as const } : {}), ...(supportingSources.length ? { supporting_sources: supportingSources } : {}) },
  } }
}
