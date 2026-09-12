import { createHash } from "node:crypto"
import { load } from "cheerio"
import type { FalaCandidato } from "../../src/lib/falas-candidatos"
import { CANAIS_AO_VIVO_APROVADOS } from "./falas-evidencia-video"
import { verificarVideoGravado } from "./falas-video-gravado"
import { SOURCES, dataEvento, sha256, urlAprovada, validarCatalogo, type CandidatoFalas } from "./falas-monitoramento"

const plain = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim()
const words = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex")

/** Accept only the PCM format produced by the local extraction command.
 * Silence caused actual ASR hallucinations during this collection. */
export function medirAudioPcm(wav: Buffer): { seconds: number; rmsDb: number } {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("Áudio WAV inválido")
  let rate = 0
  let data: Buffer | undefined
  for (let p = 12; p + 8 <= wav.length;) {
    const kind = wav.toString("ascii", p, p + 4)
    const size = wav.readUInt32LE(p + 4)
    const start = p + 8
    if (start + size > wav.length) throw new Error("Áudio truncado")
    if (kind === "fmt ") {
      if (size < 16 || wav.readUInt16LE(start) !== 1 || wav.readUInt16LE(start + 2) !== 1 || wav.readUInt16LE(start + 14) !== 16) throw new Error("Áudio deve ser PCM mono de 16 bits")
      rate = wav.readUInt32LE(start + 4)
    }
    if (kind === "data") data = wav.subarray(start, start + size)
    p = start + size + (size % 2)
  }
  if (rate !== 16000 || !data?.length || data.length % 2) throw new Error("Áudio deve ter 16 kHz e amostras completas")
  let energy = 0
  for (let i = 0; i < data.length; i += 2) energy += (data.readInt16LE(i) / 32768) ** 2
  return { seconds: data.length / 2 / rate, rmsDb: 10 * Math.log10(energy / (data.length / 2)) }
}

export interface PacoteTranscricao {
  article: string
  audio: Buffer
  /** Plain text from the selected clip, not an entire broadcast. */
  transcript: string
  verification: string
  metadata?: string
  frame?: Buffer
  supporting?: Array<{ url: string; raw: string }>
}

/** Checks provenance and agreement of automatic transcripts. It does not claim
 * that agreement is a human listening review; the public label stays automatic. */
export function verificarTranscricao(quote: FalaCandidato, candidate: CandidatoFalas, evidence: PacoteTranscricao): void {
  function fail(message: string): never { throw new Error(message) }
  const t = quote.transcription
  if (!t || t.kind !== "automatic" || t.reviewed_context !== true || quote.attribution !== "source_context_review") fail("Revisão de contexto da transcrição ausente")
  if (quote.candidate_id !== candidate.id || quote.candidate_slug !== candidate.slug || quote.office !== candidate.cargo_disputado || quote.uf !== candidate.estado) fail("Identidade da transcrição divergente")
  if (quote.quote_text.split(/\s+/).length > 25 || quote.quote_text.split(/\s+/).length < 4) fail("Trecho fora do limite de palavras")
  if (!Number.isFinite(t.start_seconds) || !Number.isFinite(t.end_seconds) || t.start_seconds < 0 || t.end_seconds <= t.start_seconds || t.end_seconds - t.start_seconds > 90) fail("Minutagem inválida")
  const audio = medirAudioPcm(evidence.audio)
  if (Math.abs(audio.seconds - (t.end_seconds - t.start_seconds)) > 0.3 || audio.rmsDb < -50) fail("Áudio silencioso ou duração divergente")
  if (t.audio_sha256 !== digest(evidence.audio) || t.transcript_sha256 !== sha256(evidence.transcript) || t.verification_sha256 !== sha256(evidence.verification) || quote.source_sha256 !== sha256(evidence.article)) fail("Integridade da transcrição divergente")
  if (evidence.transcript.length > 6000 || evidence.verification.length > 6000
    || !words(evidence.transcript).includes(words(quote.quote_text)) || !words(evidence.verification).includes(words(quote.quote_text))
    || !words(evidence.transcript).includes(words(quote.context))) fail("Trecho não coincide nas duas transcrições do áudio")
  if (t.speaker_context.length < 30 || !t.engine.trim()) fail("Contexto do falante ou mecanismo ausente")
  const source = SOURCES.find(s => s.publisher === quote.publisher && urlAprovada(quote.article_url, s) === quote.article_url)
  if (!source) fail("Veículo da transcrição não aprovado")
  if (quote.review_evidence?.recorded_video) {
    verificarVideoGravado(quote, candidate, evidence)
    validarCatalogo({ schema_version: "falas-v1", updated_at: quote.observed_at, quotes: [quote] })
    return
  }
  const $ = load(evidence.article)
  const canonical = $("link[rel=canonical]").attr("href") ?? $("meta[property='og:url']").attr("content")
  if (!canonical || urlAprovada(canonical, source) !== quote.article_url) fail("Página original da transcrição divergente")
  const published = $("meta[property='article:published_time']").attr("content")
  const structuredDates = $("script[type='application/ld+json']").toArray().flatMap(el => {
    try {
      const obj = JSON.parse($(el).text()) as Record<string, unknown>
      const canonicalObject = [obj.url, obj.mainEntityOfPage].some(u => typeof u === "string" && urlAprovada(u, source) === quote.article_url)
      return ["BlogPosting", "NewsArticle", "Article"].includes(String(obj["@type"])) && canonicalObject && typeof obj.datePublished === "string" ? [obj.datePublished] : []
    } catch { return [] }
  })
  const datedTimes = $("time[pubdate]").toArray().map(el => plain($(el).text())).flatMap(s => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/.exec(s)
    return match ? [`${match[3]}-${match[2]}-${match[1]}`] : []
  })
  const publicationVerified = published ? Date.parse(published) === Date.parse(quote.article_published_at)
    : structuredDates.some(d => Date.parse(d) === Date.parse(quote.article_published_at))
      || (/^\d{4}-\d{2}-\d{2}$/.test(quote.article_published_at) && datedTimes.includes(quote.article_published_at))
  if (!publicationVerified) fail("Publicação da página sem evidência")
  $("script,style,nav,aside,template,noscript").remove()
  const body = plain($.text())
  const identity = plain(quote.review_evidence?.identity_excerpt ?? "")
  const acceptedNames = [candidate.nome_urna, candidate.nome_completo].map(words)
  if (!identity || !body.includes(identity) || !acceptedNames.some(n => words(identity).includes(n))) fail("Autoria não identificada pelo veículo")
  if (/pré[ -]?candidat|pre[ -]?candidat/iu.test(identity + " " + quote.event_context)) fail("Contexto anterior à candidatura oficial")
  const media = new URL(t.media_url)
  if (media.protocol !== "https:" || media.username || media.password) fail("URL de mídia inválida")
  const live = quote.review_evidence?.live_video
  if (live) {
    if (!evidence.metadata || !evidence.frame) fail("Evidência da transmissão ausente")
    const m = JSON.parse(evidence.metadata) as Record<string, unknown>
    const channel = CANAIS_AO_VIVO_APROVADOS[live.channel_id as keyof typeof CANAIS_AO_VIVO_APROVADOS]
    const channelUrl = `https://www.youtube.com/channel/${live.channel_id}`
    const linkedEpisode = typeof m.id === "string" && evidence.article.includes(m.id)
    const linkedNamedBroadcast = evidence.article.includes(channelUrl) && m.channel_url === channelUrl
      && typeof m.title === "string" && acceptedNames.some(n => words(m.title as string).includes(n))
      && dataEvento(identity, quote.article_published_at) === quote.occurred_on
    if (!channel || channel.source_origin !== source.origin || m.channel_id !== live.channel_id
      || m.webpage_url !== t.media_url || live.url !== t.media_url || m.was_live !== true || m.live_status !== "was_live"
      || typeof m.id !== "string" || t.media_url !== `https://www.youtube.com/watch?v=${m.id}`
      || (!linkedEpisode && !linkedNamedBroadcast) || m.release_timestamp !== live.release_timestamp
      || typeof m.duration !== "number" || t.end_seconds > m.duration
      || live.frame_at_seconds < t.start_seconds || live.frame_at_seconds > t.end_seconds
      || live.metadata_sha256 !== sha256(evidence.metadata) || live.frame_sha256 !== digest(evidence.frame)
      || live.captions_sha256 !== t.transcript_sha256
      || Date.parse(t.media_published_at) !== live.release_timestamp * 1000) fail("Transmissão não vinculada ao trecho")
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date((live.release_timestamp + t.start_seconds) * 1000))
    if (day !== quote.occurred_on || !body.includes(plain(live.article_event_excerpt))) fail("Data ou episódio da transmissão divergente")
  } else {
    const decodedHtml = evidence.article.replace(/\\\//g, "/").replace(/&amp;/g, "&")
    if (!decodedHtml.includes(t.media_url)) fail("Áudio não vinculado à página original")
    const excerpt = quote.review_evidence?.date_excerpt ?? ""
    if (/marcad[oa]|agendad[oa]|será|participará|ocorrerá|acontecerá|previst[oa]/i.test(excerpt)) fail("Agenda não comprova data da gravação")
    const proof = quote.review_evidence?.supporting_sources?.find(s => s.excerpts.includes(excerpt))
    if (proof) {
      const page = evidence.supporting?.find(s => s.url === proof.url)
      if (!page || proof.sha256 !== sha256(page.raw) || !SOURCES.some(s => urlAprovada(proof.url, s) === proof.url)) fail("Corroboração da data ausente")
      const support = load(page.raw)
      support("script,style,nav,aside").remove()
      const text = plain(support.text())
      if (!text.includes(plain(excerpt)) || !acceptedNames.some(n => words(text).includes(n))) fail("Data sem vínculo com o candidato")
    } else if (!body.includes(plain(excerpt))) fail("Data não encontrada no original")
    if (dataEvento(excerpt, quote.article_published_at) !== quote.occurred_on) fail("Data efetiva da entrevista não comprovada")
    if (t.media_published_at !== quote.article_published_at) fail("Publicação do áudio sem prova")
  }
  validarCatalogo({ schema_version: "falas-v1", updated_at: quote.observed_at, quotes: [quote] })
}
