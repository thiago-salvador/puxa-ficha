import { createHash } from "node:crypto"

export interface ObservacaoPublicacaoPesquisa {
  recognized: boolean
  has_h1: boolean
  has_publication_date: boolean
  has_research_text: boolean
  is_challenge: boolean
  has_article_or_main: boolean
  sha256: string
}

const DATE_PATTERN = /\b(?:20\d{2}[-/]\d{2}[-/]\d{2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/
const RESEARCH_PATTERN = /\b(?:pesquisa(?:s)?|intenc(?:ao|ão) de voto|eleitor(?:es|al)|pesqele|registro de pesquisa)\b/i
const INSTITUTE_PATTERN = /\b(?:Datafolha|PoderData|Real\s*Time\s*Big\s*Data)\b/i
const CHALLENGE_PATTERN = /(?:captcha|cloudflare|access denied|just a moment|enable javascript|checking your browser|verifique se você é humano|verify you are human)/i

function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|nav|footer|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Recognizes a captured publication shell without asserting that results are complete. */
export function observarPublicacaoPesquisa(html: string): ObservacaoPublicacaoPesquisa {
  const source = typeof html === "string" ? html : ""
  const text = visibleText(source)
  const headline = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ""
  const has_h1 = visibleText(headline).length >= 15
  const has_publication_date = /(?:datePublished|datetime|publishtime|published_time)[^0-9]{0,100}20\d{2}-\d{2}-\d{2}/i.test(source) || DATE_PATTERN.test(text)
  const has_research_text = text.length >= 160 && RESEARCH_PATTERN.test(text) && INSTITUTE_PATTERN.test(text)
  const is_challenge = CHALLENGE_PATTERN.test(text.slice(0, 4000)) || /<(?:title|h1)\b[^>]*>[^<]*(?:challenge|denied|captcha|human)[^<]*<\//i.test(source)
  const has_article_or_main = /<(?:article|main)\b/i.test(source)
  return { recognized: source.length > 0 && has_h1 && has_publication_date && has_research_text && !is_challenge, has_h1, has_publication_date, has_research_text, is_challenge, has_article_or_main, sha256: createHash("sha256").update(source).digest("hex") }
}

export function isObservedPollPublication(html: string): boolean {
  return observarPublicacaoPesquisa(html).recognized
}
