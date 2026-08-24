import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const ARTICLE_URL =
  "https://www.band.com.br/politica/eleicoes/2026/band-faz-1-debate-presidencial-veja-como-ele-foi-por-aspas-dos-candidatos-202608240052"
const OUTPUT_PATH = resolve(
  process.cwd(),
  "scripts/data/debates-presidencia-band-2026-imprensa.json",
)

const EVENT = {
  id: "br_presidente_2026_1t_band_2026_08_23",
  title: "Primeiro debate presidencial das Eleições 2026",
  organizer: "Grupo Bandeirantes de Comunicação",
  occurred_at: "2026-08-23T20:00:00-03:00",
}

const CANDIDATES = [
  {
    candidate_id: "5a4d76d2-6243-41b9-88b2-e94c68383e52",
    candidate_slug: "augusto-cury",
    candidate_name: "Augusto Cury",
  },
  {
    candidate_id: "4cbc3b25-075a-4d87-89bd-58d1e0b2a5f2",
    candidate_slug: "renan-santos",
    candidate_name: "Renan Santos",
  },
  {
    candidate_id: "781b5abb-aa49-46a7-bc17-c38f16706ed0",
    candidate_slug: "ronaldo-caiado",
    candidate_name: "Ronaldo Caiado",
  },
] as const

const TOPICS = ["Segurança Pública", "Educação", "Economia"] as const
const MAX_QUOTE_WORDS = 40

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function decodeHtml(value: string): string {
  const numericEntities = value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )

  return numericEntities
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

function textContent(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

function extractMeta(html: string, attribute: string, value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  )
  return pattern.exec(html)?.[1] ?? null
}

function extractCanonicalUrl(html: string): string | null {
  return /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] ?? null
}

function selectSentence(value: string): string {
  const segmenter = new Intl.Segmenter("pt-BR", { granularity: "sentence" })
  const sentences = Array.from(segmenter.segment(value), (segment) => segment.segment.trim()).filter(Boolean)
  const first = sentences[0] ?? ""
  if (first && first.split(/\s+/).length <= MAX_QUOTE_WORDS) return first

  const shortSentences = sentences.filter(
    (sentence) => sentence.split(/\s+/).length <= MAX_QUOTE_WORDS,
  )
  const actionMarker = /\b(vou|vamos|proponho|precisa|precisamos|temos|terá|deve|devem)\b/i
  return shortSentences.find((sentence) => actionMarker.test(sentence)) ?? shortSentences[0] ?? ""
}

function topicId(topic: (typeof TOPICS)[number]): string {
  return topic
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function collectDebatePressQuotes() {
  const parsedUrl = new URL(ARTICLE_URL)
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "www.band.com.br") {
    throw new Error("Fonte fora da allowlist")
  }

  const response = await fetch(ARTICLE_URL, {
    headers: { "user-agent": "PuxaFicha/1.0 (+https://puxaficha.com.br)" },
  })
  if (!response.ok) throw new Error(`Falha ao coletar matéria: HTTP ${response.status}`)
  if (response.url !== ARTICLE_URL) throw new Error("Redirecionamento inesperado da fonte")
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    throw new Error("Fonte não retornou HTML")
  }

  const html = await response.text()
  const canonicalUrl = extractCanonicalUrl(html)
  if (canonicalUrl !== ARTICLE_URL) throw new Error("URL canônica divergente")

  const articleTitle = decodeHtml(extractMeta(html, "property", "og:title") ?? "")
  const articlePublishedAt = extractMeta(html, "property", "article:published_time")
  const articleAuthor = decodeHtml(extractMeta(html, "name", "author") ?? "")
  if (!articleTitle || !articlePublishedAt || !articleAuthor) {
    throw new Error("Metadados obrigatórios da matéria ausentes")
  }

  const candidateByName = new Map(CANDIDATES.map((candidate) => [candidate.candidate_name, candidate]))
  const allowedTopics = new Set<string>(TOPICS)
  const selections = new Map<string, { fullQuote: string; quoteText: string }>()
  const sourceBlocks: string[] = []
  let currentTopic: (typeof TOPICS)[number] | null = null
  let currentCandidate: (typeof CANDIDATES)[number] | null = null

  for (const match of html.matchAll(/<(h2|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = match[1].toLowerCase()
    const value = textContent(match[2]).replace(/^“\s*/, "").replace(/\s*”$/, "")
    if (!value) continue

    if (tag === "h2") {
      if (allowedTopics.has(value)) {
        currentTopic = value as (typeof TOPICS)[number]
        currentCandidate = null
      } else if (currentTopic) {
        currentCandidate = candidateByName.get(value) ?? null
      }
      continue
    }

    if (!currentTopic || !currentCandidate) continue
    const key = `${currentCandidate.candidate_slug}:${currentTopic}`
    if (selections.has(key)) continue

    const quoteText = selectSentence(value)
    const wordCount = quoteText.split(/\s+/).filter(Boolean).length
    if (!quoteText || wordCount > MAX_QUOTE_WORDS) {
      throw new Error(`Aspa fora do limite em ${key}: ${wordCount} palavras`)
    }

    selections.set(key, { fullQuote: value, quoteText })
    sourceBlocks.push(`${currentTopic}\n${currentCandidate.candidate_name}\n${value}`)
  }

  const expectedCount = CANDIDATES.length * TOPICS.length
  if (selections.size !== expectedCount) {
    throw new Error(`Cobertura incompleta: ${selections.size}/${expectedCount} aspas`)
  }

  const sourceContentSha256 = sha256(sourceBlocks.join("\n\n"))
  const candidates = CANDIDATES.map((candidate) => ({
    ...candidate,
    quotes: TOPICS.map((topic) => {
      const selected = selections.get(`${candidate.candidate_slug}:${topic}`)
      if (!selected) throw new Error(`Aspa ausente para ${candidate.candidate_slug}:${topic}`)
      return {
        id: `${EVENT.id}:${candidate.candidate_slug}:${topicId(topic)}`,
        topic,
        quote_text: selected.quoteText,
        quote_text_sha256: sha256(selected.quoteText),
        source_quote_sha256: sha256(selected.fullQuote),
        attribution_method: "publisher_candidate_section_heading",
      }
    }),
  }))

  return {
    schema_version: "1.0.0",
    generated_at: articlePublishedAt,
    source_policy: {
      mode: "press_quotes_fail_closed",
      requires_human_review: false,
      direct_quotes_only: true,
      allowed_publishers: ["Band"],
      allowed_domains: ["www.band.com.br"],
      max_quote_words: MAX_QUOTE_WORDS,
      selection_rule: "primeira aspa de cada candidato em Segurança Pública, Educação e Economia; primeira frase se tiver até 40 palavras; se exceder, primeira frase curta com marcador explícito de ação",
    },
    event: EVENT,
    source: {
      publisher: "Band",
      article_title: articleTitle,
      article_url: canonicalUrl,
      article_author: articleAuthor,
      article_published_at: articlePublishedAt,
      source_content_sha256: sourceContentSha256,
    },
    candidates,
  }
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "check"
  const collected = await collectDebatePressQuotes()
  const serialized = `${JSON.stringify(collected, null, 2)}\n`

  if (mode === "write") {
    writeFileSync(OUTPUT_PATH, serialized, "utf8")
    console.log(`WRITE ${collected.candidates.length} candidatos, ${collected.candidates.flatMap((candidate) => candidate.quotes).length} aspas`)
    return
  }

  const current = readFileSync(OUTPUT_PATH, "utf8")
  if (current !== serialized) throw new Error("Snapshot divergiu da matéria original")
  console.log(`PASS ${collected.candidates.length} candidatos, ${collected.candidates.flatMap((candidate) => candidate.quotes).length} aspas`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
