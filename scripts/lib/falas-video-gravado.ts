import { createHash } from "node:crypto"
import { load } from "cheerio"
import type { FalaCandidato } from "../../src/lib/falas-candidatos"
import type { CandidatoFalas } from "./falas-monitoramento"
import type { PacoteTranscricao } from "./falas-transcricao"

export const CANAL_THE_PAPO = "UCtmjIizIEQ7ifU9TYVkcgUg"
export const FONTE_THE_PAPO = "https://selesnafes.com/2024/05/no-the-papo-especialista-afirma-que-ia-nao-tem-mais-volta/"
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const plain = (s: string) => s.replace(/\s+/g, " ").trim()

/** Sunday is the conservative lower bound: covers both common week conventions. */
export function intervaloSemanaPublicacao(publication: string) {
  if (!Number.isFinite(Date.parse(publication))) throw new Error("Publicação inválida")
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(publication))
  const start = new Date(to + "T00:00:00Z")
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  return { from: start.toISOString().slice(0, 10), to }
}

export function validarEstruturaVideoGravado(q: FalaCandidato): void {
  const r = q.review_evidence?.recorded_video
  if (!r) throw new Error("Vídeo gravado sem evidência")
  const range = intervaloSemanaPublicacao(r.published_at)
  if (!q.transcription || q.review_evidence?.live_video || q.occurred_on !== null
    || q.occurred_between?.from !== range.from || q.occurred_between?.to !== range.to
    || r.channel_id !== CANAL_THE_PAPO || q.publisher !== "The Papo com André Silva"
    || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(r.url)
    || q.article_url !== r.url || q.transcription.media_url !== r.url
    || Date.parse(r.published_at) !== Date.parse(q.article_published_at)
    || Date.parse(r.published_at) !== Date.parse(q.transcription.media_published_at)
    || ![r.metadata_sha256, r.frame_sha256].every(h => /^[a-f0-9]{64}$/.test(h))
    || !Number.isFinite(r.frame_at_seconds) || r.frame_at_seconds < q.transcription.start_seconds || r.frame_at_seconds > q.transcription.end_seconds
    || r.date_basis !== "publication_week_description" || r.reviewed_context !== true
    || !/nesta semana\b.*\brecebeu\b/i.test(plain(r.description_excerpt))
    || /será|participará|receberá|republica|reprise/i.test(r.description_excerpt)
    || q.review_evidence?.date_excerpt !== r.description_excerpt
    || r.publisher_identity_url !== FONTE_THE_PAPO
    || !q.review_evidence?.supporting_sources?.some(s => s.url === FONTE_THE_PAPO)) throw new Error("Vídeo gravado sem intervalo ou canal comprovado")
}

/** Parse the embedded JSON as data. Never execute scripts from a source page. */
export interface PlayerYoutube {
  videoDetails?: { videoId: string; title: string; channelId: string; shortDescription: string; lengthSeconds: string; isLiveContent: boolean }
  microformat?: { playerMicroformatRenderer: { publishDate: string; uploadDate: string } }
}
export function lerPlayerYoutube(html: string): PlayerYoutube {
  const match = /\bytInitialPlayerResponse\s*=\s*(\{)/.exec(html)
  if (!match) throw new Error("Metadados públicos do vídeo ausentes")
  const start = match.index + match[0].length - 1
  let depth = 0, quoted = false, escaped = false
  for (let i = start; i < html.length; i++) {
    const char = html[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === "{") depth++
    else if (char === "}" && --depth === 0) return JSON.parse(html.slice(start, i + 1))
  }
  throw new Error("Metadados públicos truncados")
}

export function verificarVideoGravado(q: FalaCandidato, candidate: CandidatoFalas, evidence: PacoteTranscricao): void {
  validarEstruturaVideoGravado(q)
  const r = q.review_evidence!.recorded_video!
  if (!evidence.metadata || !evidence.frame || sha(evidence.metadata) !== r.metadata_sha256 || sha(evidence.frame) !== r.frame_sha256) throw new Error("Integridade do vídeo gravado divergente")
  const m = JSON.parse(evidence.metadata)
  const p = lerPlayerYoutube(evidence.article)
  const v = p.videoDetails
  const dates = p.microformat?.playerMicroformatRenderer
  const $ = load(evidence.article)
  const canonical = $("link[rel=canonical]").attr("href")
  if (canonical !== q.article_url || !v || !dates || v.videoId !== m.id
    || v.channelId !== r.channel_id || m.channel_id !== r.channel_id || m.webpage_url !== r.url
    || r.url !== `https://www.youtube.com/watch?v=${v.videoId}`
    || v.isLiveContent !== false || m.was_live !== false || m.live_status !== "not_live"
    || m.title !== v.title || q.article_title !== v.title || m.description !== v.shortDescription
    || typeof v.shortDescription !== "string" || !v.shortDescription.includes(r.description_excerpt)
    || Date.parse(dates.publishDate) !== Date.parse(r.published_at) || Date.parse(dates.uploadDate) !== Date.parse(r.published_at)
    || m.upload_date !== dates.publishDate.slice(0, 10).replace(/-/g, "")
    || Number(v.lengthSeconds) !== m.duration || !Number.isFinite(m.duration) || q.transcription!.end_seconds > m.duration) throw new Error("Página e metadados do vídeo gravado divergem")
  const identity = q.review_evidence!.identity_excerpt
  if (!v.shortDescription.includes(identity)
    || ![candidate.nome_urna, candidate.nome_completo].some(name => normalize(identity).includes(normalize(name)))
    || !/candidat[oa]\b/i.test(identity) || /pr[eé][ -]?candidat/i.test(identity)) throw new Error("Candidatura oficial não identificada no episódio")
  const proof = q.review_evidence!.supporting_sources!.find(s => s.url === FONTE_THE_PAPO)!
  const support = evidence.supporting?.find(s => s.url === proof.url)
  if (!support || sha(support.raw) !== proof.sha256 || !proof.excerpts.length) throw new Error("Identidade jornalística sem fonte")
  const page = load(support.raw)
  if (page("link[rel=canonical]").attr("href") !== proof.url) throw new Error("Fonte de identidade divergente")
  page("script,style,nav,aside").remove()
  const body = plain(page.text())
  if (!proof.excerpts.every(e => body.includes(plain(e))) || !proof.excerpts.some(e => /The Papo.*jornalista André Silva/i.test(e))) throw new Error("Identidade jornalística não confirmada")
}
