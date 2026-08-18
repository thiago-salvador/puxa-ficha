/**
 * Parser puro do Google News RSS, sem dependencia de runtime (Node-only ou
 * Next-only). Fonte unica de verdade para a busca + parse de noticias por
 * candidato, consumida por:
 *  - scripts/lib/ingest-google-news.ts (CLI / pipeline manual)
 *  - src/lib/news/refresh.ts (rota serverless /api/news/refresh, cron diario)
 *
 * Manter puro: nenhum import de "server-only", "next/*", fs ou processo. Assim
 * o mesmo codigo roda no script tsx e dentro da function da Vercel.
 */

export interface GoogleNewsItem {
  titulo: string
  fonte: string
  url: string
  data_publicacao: string
}

export interface ParsedGoogleNews {
  items: GoogleNewsItem[]
  discardedUrls: number
}

/**
 * Monta a URL de busca do Google News RSS para um candidato. Query usa o
 * nome de urna entre aspas (match exato) seguido do cargo disputado.
 */
export function buildGoogleNewsSearchUrl(nomeUrna: string, cargo?: string | null): string {
  const query = encodeURIComponent(`"${nomeUrna}" ${cargo || ""}`)
  return `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
}

/**
 * Aceita apenas URLs https. Retorna a URL normalizada ou null se o esquema
 * for invalido ou a URL nao parsear.
 */
export function normalizeNewsUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" ? parsed.toString() : null
  } catch {
    return null
  }
}

/**
 * Parse do XML do RSS via regex sobre <item>...</item>. Mantem somente itens
 * com titulo + link https. `now` e injetavel para testes deterministicos
 * (fallback de data_publicacao quando o item nao traz pubDate).
 */
export function parseGoogleNewsRss(xml: string, now: () => Date = () => new Date()): ParsedGoogleNews {
  const items: GoogleNewsItem[] = []
  let discardedUrls = 0
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null

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

      const parsedPublishedAt = pubDate ? new Date(pubDate) : null
      const publishedAt =
        parsedPublishedAt && !Number.isNaN(parsedPublishedAt.getTime())
          ? parsedPublishedAt
          : now()

      items.push({
        titulo: title,
        fonte: source || "",
        url: safeUrl,
        data_publicacao: publishedAt.toISOString(),
      })
    }
  }

  return { items, discardedUrls }
}
