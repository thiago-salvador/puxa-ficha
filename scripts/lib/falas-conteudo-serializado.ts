import { load } from "cheerio"

/** ClickPB sends the article body in its React data stream. Decode only JSON
 * and length-delimited text; never execute publisher JavaScript. The caller
 * retains the unmodified HTTP response as the hashed source evidence. */
export function conteudoSerializadoClickPb(html: string, url: string): { body: string; title: string; published: string } | null {
  if (new URL(url).origin !== "https://www.clickpb.com.br") return null
  const $ = load(html)
  const chunks: string[] = []
  for (const script of $("script").toArray()) {
    const match = /^self\.__next_f\.push\(([\s\S]+)\);?$/.exec($(script).text().trim())
    if (!match) continue
    try {
      const value: unknown = JSON.parse(match[1])
      if (Array.isArray(value) && value[0] === 1 && typeof value[1] === "string") chunks.push(value[1])
    } catch { /* Executable expressions are not JSON evidence. */ }
  }
  const bytes = Buffer.from(chunks.join(""), "utf8")
  const texts = new Map<string, string>()
  const values: unknown[] = []
  const ids = new Set<string>()
  let offset = 0
  while (offset < bytes.length) {
    if (bytes[offset] === 10) { offset++; continue }
    // Anonymous preload hints do not contain article data or reference IDs.
    if (bytes.subarray(offset, offset + 3).toString() === ":HL") {
      const end = bytes.indexOf(10, offset)
      if (end < 0) return null
      offset = end + 1
      continue
    }
    const header = /^([a-f0-9]+):(?:T([a-f0-9]+),)?/.exec(bytes.subarray(offset, offset + 80).toString("utf8"))
    const close = /^[a-f0-9]+:C\n/.exec(bytes.subarray(offset, offset + 80).toString("utf8"))
    if (close) { offset += Buffer.byteLength(close[0]); continue }
    if (!header || ids.has(header[1])) return null
    ids.add(header[1]); offset += Buffer.byteLength(header[0])
    if (header[2]) {
      const length = Number.parseInt(header[2], 16)
      if (!Number.isSafeInteger(length) || length > bytes.length - offset) return null
      texts.set(header[1], bytes.subarray(offset, offset + length).toString("utf8"))
      offset += length
    } else {
      const end = bytes.indexOf(10, offset)
      const row = bytes.subarray(offset, end < 0 ? bytes.length : end).toString("utf8")
      try { values.push(JSON.parse(row)) } catch { /* Component references and metadata are not article data. */ }
      offset = end < 0 ? bytes.length : end + 1
    }
  }
  const articles: Array<{ body: string; title: string; published: string }> = []
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 50) return
    const object = value as Record<string, unknown>
    const article = object.Article as Record<string, unknown> | undefined
    if (article && typeof article === "object" && article.uri === new URL(url).pathname
      && typeof article.title === "string" && typeof article.datePublished === "string" && typeof article.content === "string") {
      const reference = /^\$([a-f0-9]+)$/.exec(article.content)
      const body = reference ? texts.get(reference[1]) : undefined
      if (body && Number.isFinite(Date.parse(article.datePublished))) articles.push({ body, title: article.title, published: article.datePublished })
    }
    for (const child of Object.values(object)) visit(child, depth + 1)
  }
  for (const value of values) visit(value, 0)
  return articles.length === 1 ? articles[0] : null
}
