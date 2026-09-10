import type { NoticiaCandidato } from "@/lib/types"

type NewsText = Pick<NoticiaCandidato, "titulo" | "fonte" | "snippet">

/** A ficha mascara IDs; a URL preserva a identidade do item vindo do e-mail. */
export function mergeLinkedNews(news: NoticiaCandidato[], linked?: NoticiaCandidato): NoticiaCandidato[] {
  if (!linked) return [...news]
  return [...news.filter((item) => item.id !== linked.id && item.url !== linked.url), linked]
}

/** Remove apenas o sufixo exato do portal, já exibido nos metadados. */
export function newsTitle(news: Pick<NewsText, "titulo" | "fonte">): string {
  const title = news.titulo.trim()
  const suffix = news.fonte?.trim() ? ` - ${news.fonte.trim()}` : null
  return suffix && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title
}

/** Snippet ausente, igual à manchete ou só ao nome da fonte não é resumo. */
export function newsSummary(news: NewsText): string | null {
  const summary = news.snippet?.trim()
  if (!summary) return null
  const normalized = summary.toLocaleLowerCase("pt-BR")
  return [news.titulo, newsTitle(news), news.fonte ?? ""].some((text) => text.trim().toLocaleLowerCase("pt-BR") === normalized) ? null : summary
}
