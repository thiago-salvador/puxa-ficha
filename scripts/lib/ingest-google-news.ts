import { supabase } from "./supabase"
import { loadCandidatos, sleep } from "./helpers"
import { log, warn } from "./logger"
import type { IngestResult } from "./types"

interface NewsItem {
  titulo: string
  fonte: string
  url: string
  data_publicacao: string
}

function normalizeNewsUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" ? parsed.toString() : null
  } catch {
    return null
  }
}

function parseRSS(xml: string): { items: NewsItem[]; discardedUrls: number } {
  const items: NewsItem[] = []
  let discardedUrls = 0
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]
    const title = item
      .match(/<title>([\s\S]*?)<\/title>/)?.[1]
      ?.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1")
      .trim()
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()
    const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim()

    if (title && link) {
      const safeUrl = normalizeNewsUrl(link)
      if (!safeUrl) {
        discardedUrls += 1
        continue
      }

      items.push({
        titulo: title,
        fonte: source || "",
        url: safeUrl,
        data_publicacao: pubDate
          ? new Date(pubDate).toISOString()
          : new Date().toISOString(),
      })
    }
  }
  return { items, discardedUrls }
}

async function resolveCandidatoId(
  slug: string
): Promise<string | null> {
  const { data } = await supabase
    .from("candidatos")
    .select("id")
    .eq("slug", slug)
    .single()
  return data?.id ?? null
}

export async function ingestGoogleNews(): Promise<IngestResult[]> {
  const candidatos = loadCandidatos()
  const results: IngestResult[] = []

  for (const cand of candidatos) {
    const start = Date.now()
    const result: IngestResult = {
      source: "google-news",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
    }

    log("google-news", `Processando ${cand.slug}`)

    try {
      const candidatoId = await resolveCandidatoId(cand.slug)
      if (!candidatoId) {
        result.errors.push("Candidato nao encontrado no Supabase")
        result.duration_ms = Date.now() - start
        results.push(result)
        continue
      }

      // Build search query: "nome_urna" + cargo
      const query = encodeURIComponent(
        `"${cand.nome_urna}" ${cand.cargo_disputado || ""}`
      )
      const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)

      try {
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)

        if (!res.ok) {
          warn("google-news", `  ${cand.slug}: HTTP ${res.status}`)
          result.duration_ms = Date.now() - start
          results.push(result)
          await sleep(2000)
          continue
        }

        const xml = await res.text()
        const { items, discardedUrls } = parseRSS(xml)
        const newsItems = items.slice(0, 20)

        if (discardedUrls > 0) {
          warn("google-news", `  ${cand.slug}: ${discardedUrls} URL(s) descartada(s) por esquema invalido`)
        }

        if (newsItems.length === 0) {
          log("google-news", `  ${cand.slug}: nenhuma noticia`)
          result.duration_ms = Date.now() - start
          results.push(result)
          await sleep(2000)
          continue
        }

        const rows = newsItems.map((item) => ({
          candidato_id: candidatoId,
          titulo: item.titulo,
          fonte: item.fonte,
          url: item.url,
          data_publicacao: item.data_publicacao,
        }))

        const { error: upsertErr } = await supabase
          .from("noticias_candidato")
          .upsert(rows, {
            onConflict: "candidato_id,url",
            ignoreDuplicates: true,
          })

        if (upsertErr) {
          result.errors.push(upsertErr.message)
        } else {
          result.tables_updated.push("noticias_candidato")
          result.rows_upserted = newsItems.length
          log(
            "google-news",
            `  ${cand.slug}: ${newsItems.length} noticias`
          )
        }
      } catch (err) {
        clearTimeout(timer)
        if (err instanceof Error && err.name === "AbortError") {
          warn("google-news", `  ${cand.slug}: timeout`)
        } else {
          result.errors.push(
            err instanceof Error ? err.message : String(err)
          )
        }
      }
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : String(err)
      )
    }

    result.duration_ms = Date.now() - start
    results.push(result)
    await sleep(2000)
  }

  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestGoogleNews().then((r) => {
    const total = r.reduce((s, x) => s + x.rows_upserted, 0)
    const errors = r.reduce((s, x) => s + x.errors.length, 0)
    console.log(`\nGoogle News: ${total} noticias, ${errors} erros`)
  })
}
