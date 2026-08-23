export const REPLACEMENT_CHAR = "\uFFFD"
export const INVERTED_QUESTION_MARK = "\u00BF"

const C1_CONTROL_RE = /[\u0080-\u009F]/g
const MOJIBAKE_LEAD_RE = /[ÃÂâ][\u0080-\u00FF]/g
const UTF8_AS_LATIN1_SEQUENCE_RE = /[\u00C2-\u00F4][\u0080-\u00BF]{1,3}/g

const WINDOWS_1252_CONTROLS: Record<string, string> = {
  "\u0080": "€",
  "\u0082": "‚",
  "\u0083": "ƒ",
  "\u0084": "„",
  "\u0085": "…",
  "\u0086": "†",
  "\u0087": "‡",
  "\u0088": "ˆ",
  "\u0089": "‰",
  "\u008A": "Š",
  "\u008B": "‹",
  "\u008C": "Œ",
  "\u008E": "Ž",
  "\u0091": "‘",
  "\u0092": "’",
  "\u0093": "“",
  "\u0094": "”",
  "\u0095": "•",
  "\u0096": "–",
  "\u0097": "—",
  "\u0098": "˜",
  "\u0099": "™",
  "\u009A": "š",
  "\u009B": "›",
  "\u009C": "œ",
  "\u009E": "ž",
  "\u009F": "Ÿ",
}

export type PublicTextEncodingArtifacts = {
  replacement: number
  invertedQuestionMark: number
  c1Control: number
  mojibake: number
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0
}

export function detectPublicTextEncodingArtifacts(
  value: string | null | undefined,
): PublicTextEncodingArtifacts {
  const text = value ?? ""
  return {
    replacement: countMatches(text, /\uFFFD/g),
    invertedQuestionMark: countMatches(text, /\u00BF/g),
    c1Control: countMatches(text, C1_CONTROL_RE),
    mojibake: countMatches(text, MOJIBAKE_LEAD_RE),
  }
}

export function hasPublicTextEncodingArtifacts(
  value: string | null | undefined,
): boolean {
  const found = detectPublicTextEncodingArtifacts(value)
  return Object.values(found).some((count) => count > 0)
}

function artifactScore(value: string): number {
  const found = detectPublicTextEncodingArtifacts(value)
  return found.replacement * 100
    + found.invertedQuestionMark * 20
    + found.c1Control * 10
    + found.mojibake * 5
}

/**
 * Reverte apenas o caso deterministico UTF-8 -> Latin-1 -> Unicode.
 * U+FFFD e U+00BF nao sao reparados aqui porque perderam informacao e exigem
 * curadoria a partir da fonte primaria.
 */
export function repairReversibleUtf8Mojibake(value: string): string {
  if (!C1_CONTROL_RE.test(value) && !MOJIBAKE_LEAD_RE.test(value)) return value
  C1_CONTROL_RE.lastIndex = 0
  MOJIBAKE_LEAD_RE.lastIndex = 0

  const decodeLatin1Bytes = (candidate: string): string | null => {
    const codePoints = [...candidate].map((character) => character.codePointAt(0) ?? 0)
    if (codePoints.some((codePoint) => codePoint > 0xff)) return null

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(codePoints))
    } catch {
      return null
    }
  }

  const whole = decodeLatin1Bytes(value)
  let best = whole && artifactScore(whole) < artifactScore(value) ? whole : value
  const partial = value.replace(UTF8_AS_LATIN1_SEQUENCE_RE, (sequence) =>
    decodeLatin1Bytes(sequence) ?? sequence,
  )
  if (artifactScore(partial) < artifactScore(best)) best = partial
  return best
}

/** Converte os bytes definidos do Windows-1252 que foram expostos como C1. */
export function repairWindows1252Controls(value: string): string {
  return value.replace(C1_CONTROL_RE, (character) => WINDOWS_1252_CONTROLS[character] ?? character)
}

/** Repara os dois casos reversiveis antes de qualquer texto chegar ao publico. */
export function repairPublicTextEncoding(value: string): string {
  return repairWindows1252Controls(repairReversibleUtf8Mojibake(value))
}

export function assertPublicTextEncodingSafe(value: string, origin: string): void {
  const found = detectPublicTextEncodingArtifacts(value)
  if (Object.values(found).every((count) => count === 0)) return

  const details = [
    found.replacement > 0 ? `U+FFFD=${found.replacement}` : null,
    found.invertedQuestionMark > 0 ? `U+00BF=${found.invertedQuestionMark}` : null,
    found.c1Control > 0 ? `C1=${found.c1Control}` : null,
    found.mojibake > 0 ? `mojibake=${found.mojibake}` : null,
  ].filter(Boolean)

  throw new Error(`${origin}: recusando texto publico com artefato de encoding (${details.join(", ")})`)
}
