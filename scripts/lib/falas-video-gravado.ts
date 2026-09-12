import { createHash } from "node:crypto"
import { load } from "cheerio"
import type { FalaCandidato } from "../../src/lib/falas-candidatos"
import type { CandidatoFalas } from "./falas-monitoramento"
import type { PacoteTranscricao } from "./falas-transcricao"

export const CANAL_THE_PAPO = "UCtmjIizIEQ7ifU9TYVkcgUg"
export const FONTE_THE_PAPO = "https://selesnafes.com/2024/05/no-the-papo-especialista-afirma-que-ia-nao-tem-mais-volta/"
export const CANAL_METAL_TV = "UC2FHzKYg93IRVFAqF7pO3Xg"
export const URL_METAL_TV = "https://www.youtube.com/watch?v=vqKvJUvXAIU"
export const PUBLISHER_METAL_TV = "MetalTV (SMC)"
export const FONTE_UFPR = "https://jornalcomunicacao.ufpr.br/confira-como-foi-a-semana-dos-candidatos-ao-governo-do-parana/"
const CANDIDATO_METAL_TV_ID = "30bca027-016e-4db1-a065-2081a62d71de"
const CANDIDATO_METAL_TV_SLUG = "adriano-funileiro"
const DATA_METAL_TV = "2026-08-31"
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
  const isThePapo = r.channel_id === CANAL_THE_PAPO && q.publisher === "The Papo com André Silva"
  const isMetalTv = r.channel_id === CANAL_METAL_TV && q.publisher === PUBLISHER_METAL_TV
  const publicationRange = intervaloSemanaPublicacao(r.published_at)
  const validRecordedOn = r.date_basis === "explicit_recording_date"
    && /^\d{4}-\d{2}-\d{2}$/.test(r.recorded_on)
    && (() => {
      const date = new Date(`${r.recorded_on}T00:00:00Z`)
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === r.recorded_on
    })()
  const description = plain(r.description_excerpt)
  const explicitDateInDescription = r.date_basis === "explicit_recording_date" && validRecordedOn
    && (() => {
      const [, , month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.recorded_on)!
      return new RegExp(`realizado\\s+nesta\\s+[^,\\n]+\\(\\s*${day}/${month}\\s*\\)`, "i").test(description)
    })()
  const structureInvalid = !q.transcription || q.review_evidence?.live_video
    || !isThePapo && !isMetalTv
    || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(r.url)
    || q.article_url !== r.url || q.transcription.media_url !== r.url
    || Date.parse(r.published_at) !== Date.parse(q.article_published_at)
    || Date.parse(r.published_at) !== Date.parse(q.transcription.media_published_at)
    || ![r.metadata_sha256, r.frame_sha256].every(h => /^[a-f0-9]{64}$/.test(h))
    || !Number.isFinite(r.frame_at_seconds) || r.frame_at_seconds < q.transcription.start_seconds || r.frame_at_seconds > q.transcription.end_seconds
    || r.reviewed_context !== true
    || /será|participará|receberá|republica|reprise/i.test(description)
    || q.review_evidence?.date_excerpt !== r.description_excerpt
  const thePapoInvalid = isThePapo && (q.occurred_on !== null
    || q.occurred_between?.from !== publicationRange.from || q.occurred_between?.to !== publicationRange.to
    || r.date_basis !== "publication_week_description"
    || !/nesta semana\b.*\brecebeu\b/i.test(description)
    || r.publisher_identity_url !== FONTE_THE_PAPO
    || !q.review_evidence?.supporting_sources?.some(s => s.url === FONTE_THE_PAPO))
  const metalTvInvalid = isMetalTv && (q.occurred_on !== r.recorded_on
    || q.occurred_between !== undefined
    || r.url !== URL_METAL_TV
    || q.candidate_id !== CANDIDATO_METAL_TV_ID
    || q.candidate_slug !== CANDIDATO_METAL_TV_SLUG
    || r.recorded_on !== DATA_METAL_TV
    || !validRecordedOn || !explicitDateInDescription
    || r.publisher_identity_url !== FONTE_UFPR
    || !q.review_evidence?.supporting_sources?.some(s => s.url === FONTE_UFPR))
  if (structureInvalid || thePapoInvalid || metalTvInvalid) throw new Error("Vídeo gravado sem intervalo ou canal comprovado")
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
  const proofUrl = r.publisher_identity_url
  const proof = q.review_evidence!.supporting_sources!.find(s => s.url === proofUrl)
  if (!proof) throw new Error("Identidade jornalística sem fonte")
  const support = evidence.supporting?.find(s => s.url === proof.url)
  if (!support || sha(support.raw) !== proof.sha256 || !proof.excerpts.length) throw new Error("Identidade jornalística sem fonte")
  const page = load(support.raw)
  if (page("link[rel=canonical]").attr("href") !== proof.url) throw new Error("Fonte de identidade divergente")
  page("script,style,nav,aside").remove()
  const body = plain(page.text())
  const sourceMentionsCandidate = r.channel_id !== CANAL_METAL_TV
    || [candidate.nome_urna, candidate.nome_completo].some(name => normalize(body).includes(normalize(name)))
  const identityConfirmed = r.channel_id === CANAL_THE_PAPO
    ? proof.excerpts.some(e => /The Papo.*jornalista André Silva/i.test(e))
    : r.channel_id === CANAL_METAL_TV
      && sourceMentionsCandidate
      && proof.excerpts.some(e => /Teixeira esteve presente nesta segunda-feira \(31\).*sabatina mediada pelo sindicato dos metalúrgicos de Curitiba/i.test(e))
  if (!proof.excerpts.every(e => body.includes(plain(e))) || !identityConfirmed) throw new Error("Identidade jornalística não confirmada")
}
