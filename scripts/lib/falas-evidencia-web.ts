export interface EvidenciaWeb {
  format: "web_text"
  url: string
  retrieved_at: string
  raw: string
}

/** Preserve the tool response as evidence. Parsed lines are not publisher HTML. */
export function lerEvidenciaWeb(value: unknown): EvidenciaWeb & { paragraphs: string[]; body: string } {
  const v = value as Partial<EvidenciaWeb> | null
  if (!v || v.format !== "web_text" || typeof v.raw !== "string" || typeof v.url !== "string"
    || typeof v.retrieved_at !== "string" || !Number.isFinite(Date.parse(v.retrieved_at))) throw new Error("invalid_web_evidence")
  const url = new URL(v.url)
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid_web_evidence_url")
  const request = /Source: open\((\{[^\n]*?\})\)/.exec(v.raw)
  if (!request || JSON.parse(request[1]).ref_id !== v.url || !/Content type: text\/html/.test(v.raw)) throw new Error("web_evidence_source_mismatch")
  const lines = [...v.raw.matchAll(/\bL(\d+):/g)].map((match) => Number(match[1]))
  if (lines.some((line, index) => index > 0 && line <= lines[index - 1])) throw new Error("web_evidence_line_order")
  const paragraphs = [...v.raw.matchAll(/\bL\d+:\s*([\s\S]*?)(?=\bL\d+:|$)/g)].map((match) => match[1]
    .replace(/cite[^†]*†([^†]+)(?:†[^]*)?/g, "$1")
    .replace(/^>\s*/, "").replace(/\s+/g, " ").trim()).filter(Boolean)
  if (!paragraphs.length) throw new Error("web_evidence_without_article_lines")
  return { ...(v as EvidenciaWeb), paragraphs, body: paragraphs.join(" ") }
}
