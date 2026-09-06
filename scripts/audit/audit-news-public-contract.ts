import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { newsTitleMentionsCandidate } from "../../src/lib/news/name-match"
import { splitNewsByDenylist } from "../../src/lib/news/denylist"
import { supabase } from "../lib/supabase"

const PAGE_SIZE = 1_000
export const NEWS_RETENTION_DAYS = 365

type CandidateRow = {
  id: string
  slug: string
  nome_urna: string
  nome_completo: string
  publicavel: boolean
}

type NewsRow = {
  id: string
  candidato_id: string
  titulo: string
  url: string
  data_publicacao: string | null
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - NEWS_RETENTION_DAYS * 24 * 60 * 60 * 1_000)
}

export function analyzeNewsPublicContract(candidates: CandidateRow[], news: NewsRow[], now: Date) {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const cutoff = retentionCutoff(now)
  const crossCandidateContext: Array<{ id: string; slug: string; matched_slugs: string[]; title: string; url: string }> = []
  const contextOfElection: Array<{ id: string; slug: string; title: string; url: string }> = []
  const missingPublicationDate: Array<{ id: string; slug: string; title: string; url: string }> = []
  const expired: Array<{ id: string; slug: string; published_at: string; url: string }> = []
  const orphaned: Array<{ id: string; candidato_id: string; url: string }> = []

  for (const item of news) {
    const candidate = candidatesById.get(item.candidato_id)
    if (!candidate) {
      orphaned.push({ id: item.id, candidato_id: item.candidato_id, url: item.url })
      continue
    }
    if (!item.data_publicacao) {
      missingPublicationDate.push({ id: item.id, slug: candidate.slug, title: item.titulo, url: item.url })
    } else if (new Date(item.data_publicacao) < cutoff) {
      expired.push({ id: item.id, slug: candidate.slug, published_at: item.data_publicacao, url: item.url })
    }
    if (!candidate.publicavel) continue
    const mentions = newsTitleMentionsCandidate(item.titulo, candidate)
    const allowedByDenylist = splitNewsByDenylist([item], candidate.slug).permitidos.length === 1
    if (!mentions || !allowedByDenylist) {
      const matchedSlugs = candidates
        .filter((other) => other.id !== candidate.id && newsTitleMentionsCandidate(item.titulo, other))
        .map((other) => other.slug)
        .sort()
      if (matchedSlugs.length > 0) {
        // Mencionar outro candidato não prova atribuição errada. A matéria pode
        // cobrir o mesmo pleito e a UI já a identifica como contexto. Mantemos
        // este grupo como sinal para amostragem editorial, não como violação.
        crossCandidateContext.push({ id: item.id, slug: candidate.slug, matched_slugs: matchedSlugs, title: item.titulo, url: item.url })
      } else {
        contextOfElection.push({ id: item.id, slug: candidate.slug, title: item.titulo, url: item.url })
      }
    }
  }

  return {
    generated_at: now.toISOString(),
    retention_cutoff: cutoff.toISOString(),
    totals: {
      candidates: candidates.length,
      public_candidates: candidates.filter((candidate) => candidate.publicavel).length,
      news: news.length,
      cross_candidate_context: crossCandidateContext.length,
      context_of_election: contextOfElection.length,
      missing_publication_date: missingPublicationDate.length,
      expired: expired.length,
      orphaned: orphaned.length,
    },
    cross_candidate_context: crossCandidateContext,
    context_of_election: contextOfElection,
    missing_publication_date: missingPublicationDate,
    expired,
    orphaned,
  }
}

function value(args: string[], prefix: string): string | null {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const out = value(args, "--out=")
  const [candidates, news] = await Promise.all([
    fetchAll<CandidateRow>("candidatos", "id,slug,nome_urna,nome_completo,publicavel"),
    fetchAll<NewsRow>("noticias_candidato", "id,candidato_id,titulo,url,data_publicacao"),
  ])
  const report = analyzeNewsPublicContract(candidates, news, new Date())
  if (out) {
    await mkdir(path.dirname(path.resolve(out)), { recursive: true })
    await writeFile(path.resolve(out), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }
  console.log(
    `NEWS_PUBLIC_CONTRACT_AUDIT news=${report.totals.news} cross_candidate_context=${report.totals.cross_candidate_context} ` +
    `context_of_election=${report.totals.context_of_election} ` +
    `missing_date=${report.totals.missing_publication_date} expired=${report.totals.expired} orphaned=${report.totals.orphaned}`,
  )
  if (args.includes("--expect-clean")) {
    const debt = report.totals.missing_publication_date + report.totals.expired + report.totals.orphaned
    if (debt > 0) throw new Error(`contrato público de notícias tem ${debt} violação(ões)`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
