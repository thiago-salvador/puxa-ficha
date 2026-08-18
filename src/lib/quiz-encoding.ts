import {
  quizPerguntasPrimeiras,
  quizPerguntasOrdenadas,
  QUIZ_VERSION,
  QUIZ_V1_QUESTION_COUNT,
  type RespostaLikert,
} from "@/data/quiz/perguntas"

export type QuizRespostaCodificada = { valor: RespostaLikert; importante: boolean }

function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : btoa(binary)
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlToUint8(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + (pad ? "=".repeat(4 - pad) : "")
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(b64, "base64"))
    }
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i)
    }
    return out
  } catch {
    return null
  }
}

const LIKERT_TO_CODE: Record<RespostaLikert, number> = {
  concordo_total: 0,
  concordo_parcial: 1,
  neutro: 2,
  discordo_parcial: 3,
  discordo_total: 4,
}

const CODE_TO_LIKERT: RespostaLikert[] = [
  "concordo_total",
  "concordo_parcial",
  "neutro",
  "discordo_parcial",
  "discordo_total",
]

function writeBits(bits: boolean[], value: number, bitCount: number) {
  for (let i = bitCount - 1; i >= 0; i -= 1) {
    bits.push(((value >> i) & 1) === 1)
  }
}

function readBits(bits: boolean[], offset: { i: number }, bitCount: number): number {
  let v = 0
  for (let k = 0; k < bitCount; k += 1) {
    v = (v << 1) | (bits[offset.i] ? 1 : 0)
    offset.i += 1
  }
  return v
}

function bitsToBytes(bits: boolean[]): Uint8Array {
  const pad = (8 - (bits.length % 8)) % 8
  const all = [...bits]
  for (let i = 0; i < pad; i += 1) all.push(false)
  const out = new Uint8Array(all.length / 8)
  for (let b = 0; b < all.length; b += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | (all[b + j] ? 1 : 0)
    }
    out[b / 8] = byte
  }
  return out
}

function bytesToBits(bytes: Uint8Array): boolean[] {
  const bits: boolean[] = []
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]!
    for (let j = 7; j >= 0; j -= 1) {
      bits.push(((byte >> j) & 1) === 1)
    }
  }
  return bits
}

function questionCountForQuizVersion(quizVersion: number): number {
  if (quizVersion <= 1) return QUIZ_V1_QUESTION_COUNT
  return quizPerguntasOrdenadas().length
}

function bitsPerQuestion(quizVersion: number): number {
  return quizVersion >= 3 ? 4 : 3
}

/**
 * Codifica respostas para `?r=` na URL.
 * v1: 10 perguntas, 3 bits Likert.
 * v2: todas as perguntas, 3 bits Likert.
 * v3: todas as perguntas, 3 bits Likert + 1 bit importancia.
 */
export function encodeQuizRespostasPayload(
  respostas: Map<string, QuizRespostaCodificada>,
  quizVersion: number = QUIZ_VERSION
): string {
  const count = questionCountForQuizVersion(quizVersion)
  const ordenadas = quizPerguntasPrimeiras(count)
  const bpq = bitsPerQuestion(quizVersion)
  const bits: boolean[] = []
  for (const p of ordenadas) {
    const cell = respostas.get(p.id) ?? { valor: "neutro" as const, importante: false }
    const code = LIKERT_TO_CODE[cell.valor]
    writeBits(bits, code, 3)
    if (bpq === 4) {
      writeBits(bits, cell.importante ? 1 : 0, 1)
    }
  }
  return uint8ToBase64Url(bitsToBytes(bits))
}

/** base64url sem padding para as primeiras N perguntas (ordem do quiz). Apenas Likert (encoding v1 legado). */
export function encodeQuizAnswersPayloadFirstN(
  respostas: Map<string, RespostaLikert>,
  questionCount: number
): string {
  const ordenadas = quizPerguntasPrimeiras(questionCount)
  const bits: boolean[] = []
  for (const p of ordenadas) {
    const v = respostas.get(p.id) ?? "neutro"
    const code = LIKERT_TO_CODE[v]
    writeBits(bits, code, 3)
  }
  return uint8ToBase64Url(bitsToBytes(bits))
}

/**
 * Codifica todas as perguntas com {@link QUIZ_VERSION}, assumindo importancia falsa
 * quando a versao atual for v3 (compat com chamadas que so passam Likert).
 */
export function encodeQuizAnswersPayload(respostas: Map<string, RespostaLikert>): string {
  const full = new Map<string, QuizRespostaCodificada>()
  for (const p of quizPerguntasOrdenadas()) {
    full.set(p.id, { valor: respostas.get(p.id) ?? "neutro", importante: false })
  }
  return encodeQuizRespostasPayload(full, QUIZ_VERSION)
}

export function decodeQuizAnswersPayload(
  encoded: string,
  quizVersion: number = QUIZ_VERSION
): {
  versionUsed: number
  respostas: Map<string, QuizRespostaCodificada>
} | null {
  const trimmed = encoded.trim()
  if (!trimmed) return null
  try {
    const bytes = base64UrlToUint8(trimmed)
    if (!bytes) return null
    const bits = bytesToBits(bytes)
    const count = questionCountForQuizVersion(quizVersion)
    const ordenadas = quizPerguntasPrimeiras(count)
    const bpq = bitsPerQuestion(quizVersion)
    const need = ordenadas.length * bpq
    if (bits.length < need) return null
    const offset = { i: 0 }
    const respostas = new Map<string, QuizRespostaCodificada>()
    for (const p of ordenadas) {
      const code = readBits(bits, offset, 3)
      if (code < 0 || code > 4) return null
      let importante = false
      if (bpq === 4) {
        const ib = readBits(bits, offset, 1)
        if (ib !== 0 && ib !== 1) return null
        importante = ib === 1
      }
      respostas.set(p.id, { valor: CODE_TO_LIKERT[code]!, importante })
    }
    return { versionUsed: quizVersion, respostas }
  } catch {
    return null
  }
}

/**
 * Decodifica o payload `r` + `v` da URL de compartilhamento (mesma regra que o cliente).
 */
export function decodeQuizPayloadForShare(
  r: string | null | undefined,
  vParam: string | null | undefined
): Map<string, QuizRespostaCodificada> | null {
  const trimmed = r?.trim()
  if (!trimmed) return null
  const v = vParam === undefined || vParam === null ? null : vParam
  let decoded: { respostas: Map<string, QuizRespostaCodificada> } | null = null
  if (v === "1") {
    decoded =
      decodeQuizAnswersPayload(trimmed, 1) ??
      decodeQuizAnswersPayload(trimmed, 2) ??
      decodeQuizAnswersPayload(trimmed, 3)
  } else if (v === "2") {
    decoded = decodeQuizAnswersPayload(trimmed, 2)
  } else if (v === "3") {
    decoded = decodeQuizAnswersPayload(trimmed, 3)
  } else {
    decoded =
      decodeQuizAnswersPayload(trimmed, QUIZ_VERSION) ??
      decodeQuizAnswersPayload(trimmed, 3) ??
      decodeQuizAnswersPayload(trimmed, 2) ??
      decodeQuizAnswersPayload(trimmed, 1)
  }
  return decoded?.respostas ?? null
}

export interface BuildQuizResultQueryOptions {
  cargo?: string
  uf?: string
}

export function buildQuizResultQuery(
  respostas: Map<string, QuizRespostaCodificada>,
  options?: BuildQuizResultQueryOptions
): string {
  const r = encodeQuizRespostasPayload(respostas, QUIZ_VERSION)
  const params = new URLSearchParams()
  params.set("v", String(QUIZ_VERSION))
  params.set("r", r)
  if (options?.cargo && options.cargo !== "Presidente") {
    params.set("cargo", options.cargo)
    if (options.uf) params.set("uf", options.uf)
  }
  return params.toString()
}
