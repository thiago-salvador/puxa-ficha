import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { FETCH_TIMEOUT_MS, sleep } from "./helpers"
import { supabase } from "./supabase"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

const IG_APP_ID = process.env.INSTAGRAM_APP_ID?.trim() || null
let warnedMissingInstagramAppId = false

interface InstagramUser {
  username?: string
  edge_followed_by?: { count: number }
  full_name?: string
  biography?: string
  profile_pic_url_hd?: string
}

interface InstagramProfileResponse {
  data?: {
    user?: InstagramUser
  }
}

interface RedesSociais {
  instagram?: { username: string; url: string; followers?: number | null } | string
  twitter?: string
  facebook?: string
  site_oficial?: string
}

const RESERVED_INSTAGRAM_PATHS = new Set([
  "about", "accounts", "direct", "explore", "p", "privacy", "reel", "reels",
  "stories", "terms", "tv",
])

function normalizeInstagramCandidate(raw: string | null | undefined): string | null {
  let value = typeof raw === "string" ? raw.trim() : ""
  if (!value) return null

  const looksLikeUrl = /^(?:https?:\/\/|www\.|instagram\.com\/)/i.test(value)
  if (looksLikeUrl) {
    try {
      const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
      if (host !== "instagram.com") return null
      if (parsed.username || parsed.password || parsed.port) return null
      const segments = parsed.pathname.split("/").filter(Boolean)
      if (segments.length !== 1) return null
      value = decodeURIComponent(segments[0])
    } catch {
      return null
    }
  }

  value = value.replace(/^@/, "")
  if (RESERVED_INSTAGRAM_PATHS.has(value.toLowerCase())) return null
  return /^[A-Za-z0-9._]{1,30}$/.test(value) ? value.toLowerCase() : null
}

export function normalizeInstagramUsername(instagram: RedesSociais["instagram"]): string | null {
  if (typeof instagram === "string") return normalizeInstagramCandidate(instagram)
  if (!instagram) return null
  const username = normalizeInstagramCandidate(instagram.username)
  const fromUrl = normalizeInstagramCandidate(instagram.url)
  if (username && fromUrl && username !== fromUrl) return null
  if (instagram.username?.trim() && !username) return null
  if (instagram.url?.trim() && !fromUrl) {
    // Corrupção legada conhecida: a URL completa foi armazenada como username
    // e novamente prefixada com instagram.com. Só reparar essa forma exata.
    const legacyUrl = `https://instagram.com/${instagram.username?.trim()}`
    if (!username || instagram.url.trim() !== legacyUrl) return null
  }
  return username ?? fromUrl
}

export interface EnrichInstagramDependencies {
  database: typeof supabase
  loadCandidates: typeof loadCandidatosPublicos
  resolveCandidateId: typeof resolveCandidatoId
  fetcher: typeof fetch
  appId: string | null
  wait: typeof sleep
}

export async function fetchInstagramFollowers(
  username: string,
  fetch: typeof globalThis.fetch = globalThis.fetch,
  appId: string | null = IG_APP_ID,
): Promise<{ count: number | null; reasons: string[] }> {
  const reasons: string[] = []
  const confirmedCount = (user: InstagramUser | undefined): number | null => {
    const count = user?.edge_followed_by?.count
    if (user?.username?.toLowerCase() !== username.toLowerCase()) return null
    return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null
  }
  // Tentativa 1: endpoint oficial da web
  if (appId) {
    try {
      const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`
      const res = await fetch(url, {
        headers: {
          "x-ig-app-id": appId,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          Referer: `https://www.instagram.com/${username}/`,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (res.ok) {
        const json = (await res.json()) as InstagramProfileResponse
        const count = confirmedCount(json?.data?.user)
        if (count !== null) return { count, reasons }
        reasons.push("principal: identidade ou contagem inválida/ausente")
      } else {
        reasons.push(`principal: HTTP ${res.status}`)
      }

      if (res.status !== 403 && res.status !== 401) {
        warn("instagram", `  Endpoint principal retornou ${res.status} para @${username}`)
      }
    } catch {
      reasons.push("principal: falha de transporte ou JSON inválido")
    }
  } else if (!warnedMissingInstagramAppId) {
    warnedMissingInstagramAppId = true
    warn("instagram", "INSTAGRAM_APP_ID ausente. Pulando endpoint principal e usando apenas fallback publico.")
  }
  if (!appId) reasons.push("principal: INSTAGRAM_APP_ID ausente, consulta não executada")

  // Tentativa 2: fallback com __a=1
  try {
    const url = `https://www.instagram.com/${username}/?__a=1&__d=dis`
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://www.instagram.com/",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (res.ok) {
      const json = await res.json() as Record<string, unknown>
      // Estrutura varia, tenta varios paths possiveis
      const graphql = json.graphql as Record<string, unknown> | undefined
      const user = graphql?.user as Record<string, unknown> | undefined
      const count = confirmedCount(user as InstagramUser | undefined)
      if (count !== null) return { count, reasons }
      reasons.push("fallback: identidade ou contagem inválida/ausente")
    } else {
      reasons.push(`fallback: HTTP ${res.status}`)
    }
  } catch {
    reasons.push("fallback: falha de transporte ou JSON inválido")
  }

  // Falha de consulta não comprova existência nem ausência do perfil.
  warn("instagram", `  Nao foi possivel obter followers de @${username} (ambos endpoints falharam)`)
  return { count: null, reasons }
}

export async function enrichInstagram(overrides: Partial<EnrichInstagramDependencies> = {}): Promise<IngestResult[]> {
  const deps: EnrichInstagramDependencies = {
    database: supabase,
    loadCandidates: loadCandidatosPublicos,
    resolveCandidateId: resolveCandidatoId,
    fetcher: fetch,
    appId: IG_APP_ID,
    wait: sleep,
    ...overrides,
  }
  const candidatos = await deps.loadCandidates()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const result: IngestResult = {
      source: "instagram",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }
    const start = Date.now()

    try {
      const candidatoId = await deps.resolveCandidateId(cand.slug)
      if (!candidatoId) {
        result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
        warn("instagram", `  ${cand.slug}: nao encontrado no banco`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const { data: dbCand, error: readError } = await deps.database
        .from("candidatos")
        .select("redes_sociais")
        .eq("id", candidatoId)
        .single()
      if (readError) throw new Error(`Leitura de redes sociais recusada: ${readError.message}`)
      if (!dbCand) throw new Error("Leitura de redes sociais não retornou o candidato")

      const redes = (dbCand?.redes_sociais as RedesSociais) ?? {}

      if (!redes.instagram) {
        log("instagram", `  ${cand.slug}: sem username do Instagram, pulando`)
        result.skipped = true
        result.skip_reason = "perfil sem Instagram declarado"
        result.coleta_resultado = "nao_aplicavel"
        result.coleta_detalhe = "Perfil sem Instagram declarado; nenhuma consulta externa foi executada."
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const username = normalizeInstagramUsername(redes.instagram)

      if (!username) {
        warn("instagram", `  ${cand.slug}: identidade de Instagram inválida ou ambígua; nenhuma consulta executada`)
        result.coleta_resultado = "indeterminado"
        result.coleta_detalhe = "Identidade de Instagram inválida ou ambígua; nenhuma consulta externa ou escrita foi executada."
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      log("instagram", `  ${cand.slug}: buscando followers de @${username}`)

      const observation = await fetchInstagramFollowers(username, deps.fetcher, deps.appId)
      const followers = observation.count
      const limitation = observation.reasons.join("; ")

      const currentUsername = typeof redes.instagram === "string"
        ? redes.instagram
        : redes.instagram.username
      const currentUrl = typeof redes.instagram === "string"
        ? redes.instagram
        : redes.instagram.url
      const normalizedUrl = `https://instagram.com/${username}`
      const needsNormalization = currentUsername !== username || currentUrl !== normalizedUrl

      if (followers === null && !needsNormalization) {
        result.coleta_resultado = "indeterminado"
        result.coleta_detalhe = `Instagram não disponibilizou contagem confirmada; valor anterior preservado. ${limitation}`
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const instagramAtualizado = {
        ...(typeof redes.instagram === "object" ? redes.instagram : {}),
        username,
        url: normalizedUrl,
        followers: followers ?? (typeof redes.instagram === "string" ? null : redes.instagram.followers ?? null),
      }

      const redesAtualizado: RedesSociais = {
        ...redes,
        instagram: instagramAtualizado,
      }

      const { error: updateError } = await deps.database
        .from("candidatos")
        .update({ redes_sociais: redesAtualizado })
        .eq("id", candidatoId)

      if (updateError) {
        result.errors.push(updateError.message)
        warn("instagram", `  ${cand.slug}: erro ao salvar: ${updateError.message}`)
      } else {
        result.tables_updated.push("candidatos")
        result.rows_upserted++

        if (followers !== null) {
          result.coleta_resultado = "encontrado"
          result.coleta_volume = 1
          result.coleta_detalhe = "Perfil consultado e contagem de seguidores atualizada."
          log("instagram", `  ${cand.slug}: @${username} — ${followers.toLocaleString()} seguidores`)
        } else {
          result.coleta_resultado = "indeterminado"
          result.coleta_detalhe = `Username normalizado, mas a contagem não foi confirmada. ${limitation}`
          log("instagram", `  ${cand.slug}: @${username} — username normalizado; followers indisponível`)
        }
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
      warn("instagram", `  ${cand.slug}: ${err instanceof Error ? err.message : String(err)}`)
    }

    result.duration_ms = Date.now() - start
    results.push(result)

    // Instagram e mais restritivo
    await deps.wait(2000)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enrichInstagram().then((r) => console.log(JSON.stringify(r, null, 2)))
}
