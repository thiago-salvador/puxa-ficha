import { supabase } from "./supabase"
import { loadCandidatos, sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

const IG_APP_ID = "936619743392459"

interface InstagramUser {
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

async function resolveCandidatoId(slug: string): Promise<string | null> {
  const { data } = await supabase.from("candidatos").select("id").eq("slug", slug).single()
  return data?.id ?? null
}

async function fetchInstagramFollowers(username: string): Promise<number | null> {
  // Tentativa 1: endpoint oficial da web
  try {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`
    const res = await fetch(url, {
      headers: {
        "x-ig-app-id": IG_APP_ID,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Referer: `https://www.instagram.com/${username}/`,
      },
    })

    if (res.ok) {
      const json = (await res.json()) as InstagramProfileResponse
      const count = json?.data?.user?.edge_followed_by?.count
      if (typeof count === "number") return count
    }

    if (res.status !== 403 && res.status !== 401) {
      warn("instagram", `  Endpoint principal retornou ${res.status} para @${username}`)
    }
  } catch {
    // Silencioso, vai tentar fallback
  }

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
    })

    if (res.ok) {
      const json = await res.json() as Record<string, unknown>
      // Estrutura varia, tenta varios paths possiveis
      const graphql = json.graphql as Record<string, unknown> | undefined
      const user = graphql?.user as Record<string, unknown> | undefined
      const edgeFollowedBy = user?.edge_followed_by as Record<string, unknown> | undefined
      const count = edgeFollowedBy?.count
      if (typeof count === "number") return count
    }
  } catch {
    // Silencioso
  }

  // Ambos falharam — confirma existencia mas nao tem followers
  warn("instagram", `  Nao foi possivel obter followers de @${username} (ambos endpoints falharam)`)
  return null
}

export async function enrichInstagram(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
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
      const candidatoId = await resolveCandidatoId(cand.slug)
      if (!candidatoId) {
        result.errors.push(`Candidato ${cand.slug} nao encontrado no Supabase`)
        warn("instagram", `  ${cand.slug}: nao encontrado no banco`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      const { data: dbCand } = await supabase
        .from("candidatos")
        .select("redes_sociais")
        .eq("id", candidatoId)
        .single()

      const redes = (dbCand?.redes_sociais as RedesSociais) ?? {}

      if (!redes.instagram) {
        log("instagram", `  ${cand.slug}: sem username do Instagram, pulando`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      // Suporta tanto formato string quanto objeto
      let username: string
      if (typeof redes.instagram === "string") {
        username = redes.instagram
      } else {
        username = redes.instagram.username
      }

      if (!username) {
        log("instagram", `  ${cand.slug}: username vazio, pulando`)
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      log("instagram", `  ${cand.slug}: buscando followers de @${username}`)

      const followers = await fetchInstagramFollowers(username)

      const instagramAtualizado = {
        username,
        url: `https://instagram.com/${username}`,
        followers,
      }

      const redesAtualizado: RedesSociais = {
        ...redes,
        instagram: instagramAtualizado,
      }

      const { error: updateError } = await supabase
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
          log("instagram", `  ${cand.slug}: @${username} — ${followers.toLocaleString()} seguidores`)
        } else {
          log("instagram", `  ${cand.slug}: @${username} — followers nao disponivel, username salvo`)
        }
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
      warn("instagram", `  ${cand.slug}: ${err instanceof Error ? err.message : String(err)}`)
    }

    result.duration_ms = Date.now() - start
    results.push(result)

    // Instagram e mais restritivo
    await sleep(2000)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enrichInstagram().then((r) => console.log(JSON.stringify(r, null, 2)))
}
