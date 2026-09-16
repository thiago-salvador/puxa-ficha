import { supabase } from "./supabase"
import { loadCandidatosPublicos, resolveCandidatoId } from "./helpers-db"
import { sleep as defaultSleep } from "./helpers"
import { log } from "./logger"
import type { CandidatoConfig, IngestResult } from "./types"
import { buildGoogleNewsSearchUrl, isValidGoogleNewsRss, parseGoogleNewsRss } from "../../src/lib/news/google-news"
import { splitNewsByDenylist } from "../../src/lib/news/denylist"
import { splitNewsByCandidateMention } from "../../src/lib/news/name-match"

type NewsDatabase = Pick<typeof supabase, "from">
type CandidateLoader = () => Promise<CandidatoConfig[]>
type CandidateResolver = (slug: string) => Promise<string | null>
type NewsFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface IngestGoogleNewsDependencies {
  database?: NewsDatabase
  loadCandidates?: CandidateLoader
  resolveCandidateId?: CandidateResolver
  fetchImpl?: NewsFetcher
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
  sleepMs?: number
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

function finish(result: IngestResult, url: string, outcome: NonNullable<IngestResult["coleta_resultado"]>, detail: string, volume = 0): void {
  result.coleta_url = url
  result.coleta_resultado = outcome
  result.coleta_volume = outcome === "encontrado" || outcome === "erro" ? volume : 0
  result.coleta_detalhe = detail
}

/** Busca a coorte carregada pelo chamador com desfecho explícito e URL rastreável. */
export async function ingestGoogleNews(overrides: IngestGoogleNewsDependencies = {}): Promise<IngestResult[]> {
  const database = overrides.database ?? supabase
  const loadCandidates = overrides.loadCandidates ?? loadCandidatosPublicos
  const resolveId = overrides.resolveCandidateId ?? resolveCandidatoId
  const fetchImpl = overrides.fetchImpl ?? fetch
  const wait = overrides.sleep ?? defaultSleep
  const timeoutMs = overrides.timeoutMs ?? 15_000
  const sleepMs = overrides.sleepMs ?? 2_000
  const candidatos = await loadCandidates()
  const results: IngestResult[] = []

  for (let index = 0; index < candidatos.length; index += 1) {
    const cand = candidatos[index]
    const start = Date.now()
    const url = buildGoogleNewsSearchUrl(cand.nome_urna, cand.cargo_disputado)
    const result: IngestResult = {
      source: "google-news",
      candidato: cand.slug,
      tables_updated: [],
      rows_upserted: 0,
      errors: [],
      duration_ms: 0,
      coleta_url: url,
    }
    log("google-news", `Processando ${cand.slug}`)
    try {
      const candidatoId = await resolveId(cand.slug)
      if (!candidatoId) {
        result.errors.push("Candidato nao encontrado no Supabase")
        finish(result, url, "erro", "candidato não encontrado; consulta RSS não executada")
      } else {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
          const response = await fetchImpl(url, { signal: controller.signal })
          if (!response.ok) {
            result.errors.push(`HTTP ${response.status}`)
            finish(result, url, "erro", `HTTP ${response.status}; consulta RSS não concluída; url=${url}`)
          } else {
            const xml = await response.text()
            if (!isValidGoogleNewsRss(xml)) {
              result.errors.push("RSS inválido")
              finish(result, url, "erro", `RSS inválido; resposta 2xx sem estrutura rss/channel; url=${url}`)
            } else {
              const { items, discardedUrls } = parseGoogleNewsRss(xml)
              const { mencionam, contextoDoPleito } = splitNewsByCandidateMention(items, cand)
              const { permitidos, bloqueados } = splitNewsByDenylist(mencionam, cand.slug)
              const newsItems = permitidos.slice(0, 20)
              const filterDetail = `url=${url}; rss_items=${items.length}; citam_nome=${mencionam.length}; descartados_nome=${contextoDoPleito.length}; denylist=${bloqueados.length}; urls_invalidas=${discardedUrls}`
              if (newsItems.length === 0) {
                finish(result, url, "vazio_confirmado", `${filterDetail}; 0 enviados ao upsert`)
              } else {
                const rows = newsItems.map((item) => ({ candidato_id: candidatoId, titulo: item.titulo, fonte: item.fonte, url: item.url, data_publicacao: item.data_publicacao }))
                const { error } = await database.from("noticias_candidato").upsert(rows, { onConflict: "candidato_id,url", ignoreDuplicates: true })
                if (error) {
                  result.errors.push(`upsert: ${error.message}`)
                  finish(result, url, "erro", `${filterDetail}; upsert falhou: ${error.message}`)
                } else {
                  result.tables_updated.push("noticias_candidato")
                  result.rows_upserted = rows.length
                  finish(result, url, "encontrado", `${filterDetail}; ${rows.length} enviados ao upsert`, rows.length)
                }
              }
            }
          }
        } catch (error) {
          const timeout = error instanceof Error && error.name === "AbortError"
          result.errors.push(timeout ? "timeout" : message(error))
          finish(result, url, "erro", `${timeout ? `timeout após ${timeoutMs}ms` : `falha de consulta RSS: ${message(error)}`}; url=${url}`)
        } finally {
          clearTimeout(timer)
        }
      }
    } catch (error) {
      result.errors.push(message(error))
      finish(result, url, "erro", `falha preparando candidato: ${message(error)}; url=${url}`)
    }
    result.duration_ms = Date.now() - start
    results.push(result)
    if (index < candidatos.length - 1) await wait(sleepMs)
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestGoogleNews().then((rows) => {
    const total = rows.reduce((sum, row) => sum + row.rows_upserted, 0)
    const errors = rows.reduce((sum, row) => sum + row.errors.length, 0)
    console.log(`\nGoogle News: ${total} noticias, ${errors} erros`)
  }).catch((error) => { console.error(message(error)); process.exitCode = 1 })
}
