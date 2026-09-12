import { createHash } from "node:crypto"

export type EvidenciaVideo = {
  url: string
  channel_id: string
  title: string
  description: string
  broadcast_on: string
  release_timestamp: number
  raw_sha256: string
}

export const CANAIS_AO_VIVO_APROVADOS = {
  "UCsVYJNopaXURKDSF4x_ZNtQ": { publisher: "O Rio Branco", source_origin: "https://oriobranco.net" },
  "UCic6Oio9KDhXYeyjl0XPetA": { publisher: "Rádio Monte Roraima FM", source_origin: "https://www.monteroraimafm.com.br" },
  "UCn6Moj1CU0yJi-xZpsKDaZg": { publisher: "TV Ponta Negra", source_origin: "https://pontanegranews.com.br" },
} as const

type VideoMetadata = {
  id?: unknown
  webpage_url?: unknown
  channel_id?: unknown
  title?: unknown
  description?: unknown
  was_live?: unknown
  live_status?: unknown
  release_timestamp?: unknown
}

const CANONICAL_VIDEO_URL = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/
const DATE_IN_TITLE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g
const VTT_TIMING = /^\s*\d{2}:\d{2}:\d{2}(?:\.\d{3})?\s+-->\s+\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:\s+.*)?\s*$/

function rejeitar(reason: string): never {
  throw new Error(`Evidência de vídeo inválida: ${reason}`)
}

function parseDate(day: string, month: string, year: string): string | null {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    !Number.isInteger(Number(day)) ||
    !Number.isInteger(Number(month)) ||
    !Number.isInteger(Number(year)) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) return null
  return `${year}-${month}-${day}`
}

function dateInSaoPaulo(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function decodeVttEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&(?:amp|gt|lt|quot|apos|nbsp);/gi, entity => ({
      "&amp;": "&", "&gt;": ">", "&lt;": "<", "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
    }[entity.toLowerCase()] ?? entity))
}

function cleanVttCue(lines: string[]): string {
  return decodeVttEntities(lines.join(" "))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function wordKey(word: string): string {
  return word.toLocaleLowerCase("pt-BR").replace(/^[^\p{L}\p{N}%]+|[^\p{L}\p{N}%]+$/gu, "")
}

function overlapSize(existing: string[], incoming: string[]): number {
  const limit = Math.min(100, existing.length, incoming.length)
  for (let size = limit; size > 0; size -= 1) {
    const suffix = existing.slice(-size).map(wordKey)
    const prefix = incoming.slice(0, size).map(wordKey)
    if (suffix.every((word, index) => word !== "" && word === prefix[index])) return size
  }
  return 0
}

/**
 * Converte uma legenda VTT em texto corrido para comparação editorial.
 * O texto é apenas uma ponte de conferência: ASR não é prova literal da fala.
 */
export function exportarTextoLegendaVtt(raw: string): string {
  if (typeof raw !== "string" || raw.trim() === "") return ""
  const cues: string[][] = []
  let cueLines: string[] | null = null
  let hasTiming = false
  const finishCue = () => {
    if (hasTiming && cueLines) {
      const cue = cleanVttCue(cueLines)
      if (cue) cues.push(cue.split(" "))
    }
    cueLines = null
    hasTiming = false
  }
  for (const line of raw.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (VTT_TIMING.test(line)) {
      finishCue()
      cueLines = []
      hasTiming = true
      continue
    }
    if (!hasTiming) continue
    if (line.trim() === "") {
      finishCue()
      continue
    }
    cueLines!.push(line.trim())
  }
  finishCue()

  const output: string[] = []
  for (const cue of cues) {
    const overlap = overlapSize(output, cue)
    output.push(...cue.slice(overlap))
  }
  return output.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * Valida somente a transmissão ao vivo registrada pelo yt-dlp.
 * Isso não prova, isoladamente, que o candidato apareceu no vídeo ou que uma
 * declaração jornalística ocorreu durante essa transmissão.
 */
export function lerEvidenciaVideo(
  raw: string,
  expectedUrl: string,
  expectedChannelId: string,
  now: Date,
): EvidenciaVideo {
  if (typeof raw !== "string" || raw.length === 0) rejeitar("raw ausente")

  let metadata: VideoMetadata
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) rejeitar("JSON não é objeto")
    metadata = parsed as VideoMetadata
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Evidência de vídeo inválida:")) throw error
    rejeitar("JSON inválido")
  }

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) rejeitar("now inválido")

  if (typeof metadata.id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(metadata.id)) rejeitar("id inválido")
  if (typeof metadata.webpage_url !== "string" || metadata.webpage_url !== expectedUrl) rejeitar("URL divergente")
  const urlMatch = metadata.webpage_url.match(CANONICAL_VIDEO_URL)
  if (!urlMatch || urlMatch[1] !== metadata.id) rejeitar("URL não é o watch URL canônico")
  if (typeof expectedUrl !== "string" || !CANONICAL_VIDEO_URL.test(expectedUrl)) rejeitar("expectedUrl não é canônico")
  if (typeof metadata.channel_id !== "string" || metadata.channel_id !== expectedChannelId) rejeitar("canal divergente")
  if (metadata.was_live !== true || metadata.live_status !== "was_live") rejeitar("transmissão ao vivo não confirmada")

  const releaseTimestamp = metadata.release_timestamp
  if (typeof releaseTimestamp !== "number" || !Number.isFinite(releaseTimestamp) || !Number.isInteger(releaseTimestamp) || releaseTimestamp <= 0) {
    rejeitar("release_timestamp inválido")
  }
  if (releaseTimestamp * 1000 > now.getTime()) rejeitar("release_timestamp futuro")

  if (typeof metadata.title !== "string" || metadata.title.trim() === "") rejeitar("título ausente")
  if (typeof metadata.description !== "string") rejeitar("descrição ausente")
  const broadcastOn = dateInSaoPaulo(releaseTimestamp)
  let titleDateMatches = 0
  for (const match of metadata.title.matchAll(DATE_IN_TITLE)) {
    const titleDate = parseDate(match[1], match[2], match[3])
    if (titleDate === broadcastOn) titleDateMatches += 1
  }
  if (titleDateMatches === 0) rejeitar("título não contém a data do broadcast")

  return {
    url: metadata.webpage_url,
    channel_id: metadata.channel_id,
    title: metadata.title,
    description: metadata.description,
    broadcast_on: broadcastOn,
    release_timestamp: releaseTimestamp,
    raw_sha256: createHash("sha256").update(raw, "utf8").digest("hex"),
  }
}
