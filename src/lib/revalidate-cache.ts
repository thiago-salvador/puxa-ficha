import { timingSafeEqual } from "node:crypto"

/**
 * Whitelist canonica de tags revalidaveis pelo endpoint protegido `/api/revalidate`.
 *
 * Cada entrada aqui DEVE corresponder a um `unstable_cache(..., { tags: [...] })` real
 * em `src/lib/api.ts` ou `src/lib/doador-reverse.ts`. Nunca aceitar tag arbitraria
 * vinda da request (CSRF/leaky-cache vector). Para adicionar tag nova: registrar aqui
 * e provar que existe no codigo via `tests/revalidate-route.test.ts`.
 *
 * Fonte de verdade do uso de cada tag (cross-check do test):
 * - public-candidatos: getCachedCandidatosResource, getCachedGlobalSearchIndexResource,
 *   getCachedCandidatoSlugParams (src/lib/api.ts)
 * - public-candidato-metadata: getCachedCandidatoMetadataResource
 * - public-candidato-ficha: getCachedCandidatoBySlugResource
 * - public-candidatos-resumo: getCachedCandidatosComResumoResource
 * - public-candidatos-comparaveis: getCachedCandidatosComparaveisResource
 * - public-indicadores-all: indicadores cache (homepage)
 * - public-indicadores-estado: indicadores por UF
 * - quiz-dataset: dataset do quiz
 * - ranking-data: rankings
 * - doador-reverse: getCachedDoadorReverseRows (src/lib/doador-reverse.ts)
 */
export const REVALIDATE_ALLOWED_TAGS = [
  "public-candidatos",
  "public-candidato-metadata",
  "public-candidato-ficha",
  "public-candidatos-resumo",
  "public-candidatos-comparaveis",
  "public-indicadores-all",
  "public-indicadores-estado",
  "quiz-dataset",
  "ranking-data",
  "doador-reverse",
] as const

export type RevalidateAllowedTag = (typeof REVALIDATE_ALLOWED_TAGS)[number]

const ALLOWED_TAG_SET: ReadonlySet<string> = new Set(REVALIDATE_ALLOWED_TAGS)

export function isAllowedRevalidateTag(value: unknown): value is RevalidateAllowedTag {
  return typeof value === "string" && ALLOWED_TAG_SET.has(value)
}

export type RevalidateRequestParseResult =
  | { ok: true; tags: string[] }
  | { ok: false; reason: string }

/**
 * Parse defensivo do body do POST. Aceita `{ tag: "x" }` ou `{ tags: ["x", "y"] }`,
 * mas nao mistura: se ambos vierem, body e invalido. Tag duplicada e dedup-ada.
 * Nao normaliza (case-sensitive) para nao mascarar tag mal escrita pelo caller.
 */
export function parseRevalidateRequestBody(input: unknown): RevalidateRequestParseResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "body_not_object" }
  }

  const body = input as Record<string, unknown>
  const hasTag = Object.prototype.hasOwnProperty.call(body, "tag")
  const hasTags = Object.prototype.hasOwnProperty.call(body, "tags")

  if (hasTag && hasTags) {
    return { ok: false, reason: "tag_and_tags_both_present" }
  }
  if (!hasTag && !hasTags) {
    return { ok: false, reason: "missing_tag" }
  }

  if (hasTag) {
    const value = body.tag
    if (typeof value !== "string" || value.trim() === "") {
      return { ok: false, reason: "tag_not_string" }
    }
    return { ok: true, tags: [value] }
  }

  const value = body.tags
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "tags_not_nonempty_array" }
  }
  const collected: string[] = []
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return { ok: false, reason: "tags_entry_not_string" }
    }
    if (!collected.includes(entry)) collected.push(entry)
  }
  return { ok: true, tags: collected }
}

export type RevalidateAuthResult =
  | { ok: true }
  | { ok: false; reason: "env_missing" | "secret_missing" | "secret_invalid" }

/**
 * Comparacao constante (timingSafeEqual). Falha fechada se env vazio em qualquer
 * ambiente; nao tem fallback de "modo dev". Operacionalmente: defina
 * PF_REVALIDATE_SECRET em .env.local pra rodar local.
 */
export function verifyRevalidateSecret(
  provided: string | null | undefined,
  expected: string | undefined,
): RevalidateAuthResult {
  const expectedTrimmed = typeof expected === "string" ? expected.trim() : ""
  if (!expectedTrimmed) {
    return { ok: false, reason: "env_missing" }
  }
  const providedTrimmed = typeof provided === "string" ? provided.trim() : ""
  if (!providedTrimmed) {
    return { ok: false, reason: "secret_missing" }
  }
  const providedBuf = Buffer.from(providedTrimmed, "utf8")
  const expectedBuf = Buffer.from(expectedTrimmed, "utf8")
  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, reason: "secret_invalid" }
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: "secret_invalid" }
  }
  return { ok: true }
}

/**
 * Extrai o secret do request. Aceita header dedicado `x-pf-revalidate-secret`
 * (preferencial) ou `Authorization: Bearer <secret>` (fallback operacional,
 * mesmo padrao usado por send-digest). NUNCA aceita query string.
 */
export function extractRevalidateSecret(headers: Pick<Headers, "get">): string | null {
  const dedicated = headers.get("x-pf-revalidate-secret")?.trim()
  if (dedicated) return dedicated
  const auth = headers.get("authorization")?.trim()
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim()
    return token || null
  }
  return null
}

export interface RevalidateAllowedTagsResult {
  ok: boolean
  status: number
  revalidated: string[]
  rejected: string[]
  reason?: string
}

/**
 * Logica pura para o handler: valida secret, parse, whitelist, executa
 * `revalidateFn` para cada tag aceita. Aceita `revalidateFn` como dep injetavel
 * pra teste poder espionar sem mockar `next/cache`.
 */
export function executeRevalidateRequest(input: {
  body: unknown
  providedSecret: string | null | undefined
  envSecret: string | undefined
  revalidateFn: (tag: string) => void
}): RevalidateAllowedTagsResult {
  const auth = verifyRevalidateSecret(input.providedSecret, input.envSecret)
  if (!auth.ok) {
    if (auth.reason === "env_missing") {
      return {
        ok: false,
        status: 503,
        revalidated: [],
        rejected: [],
        reason: "env_missing",
      }
    }
    return {
      ok: false,
      status: 401,
      revalidated: [],
      rejected: [],
      reason: auth.reason,
    }
  }

  const parsed = parseRevalidateRequestBody(input.body)
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      revalidated: [],
      rejected: [],
      reason: parsed.reason,
    }
  }

  const accepted: string[] = []
  const rejected: string[] = []
  for (const tag of parsed.tags) {
    if (isAllowedRevalidateTag(tag)) {
      accepted.push(tag)
    } else {
      rejected.push(tag)
    }
  }

  if (rejected.length > 0) {
    // All-or-nothing: nao revalidar nada se alguma tag e suspeita.
    return {
      ok: false,
      status: 400,
      revalidated: [],
      rejected,
      reason: "tag_not_allowed",
    }
  }

  for (const tag of accepted) {
    input.revalidateFn(tag)
  }

  return {
    ok: true,
    status: 200,
    revalidated: accepted,
    rejected: [],
  }
}
