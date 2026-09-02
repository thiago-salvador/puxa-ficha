/**
 * Refresh incremental de noticias por candidato a partir do Google News RSS.
 *
 * Roda sobre um SUBCONJUNTO de candidatos (passado pela rota /api/news/refresh,
 * que fatia o universo em lotes pequenos e se reencadeia via after()). Mantem o
 * comportamento provado do pipeline manual (scripts/lib/ingest-google-news.ts):
 * fetch sequencial com pausa entre candidatos, upsert idempotente com
 * ignoreDuplicates sobre UNIQUE(candidato_id, url). Sem deletes, sem updates de
 * linha existente: so insere noticia nova.
 *
 * Tudo via deps injetaveis (upsert, fetch, sleep) para manter o modulo puro de
 * runtime e testavel sem tocar Supabase nem rede.
 */
import { splitNewsByDenylist } from "@/lib/news/denylist"
import {
  buildGoogleNewsSearchUrl,
  parseGoogleNewsRss,
} from "@/lib/news/google-news"
import { splitNewsByCandidateMention } from "@/lib/news/name-match"
import { sanitizePublicTextOrThrow } from "@/lib/public-text"

export interface NewsCandidato {
  id: string
  slug: string
  nome_urna: string
  /** Usado só para casar o título da notícia com o candidato; não é gravado. */
  nome_completo?: string | null
  cargo_disputado: string | null
}

export interface NoticiaRow {
  candidato_id: string
  titulo: string
  fonte: string
  url: string
  data_publicacao: string
}

/**
 * Desfecho da tentativa de um candidato, no vocabulário de `public.coleta_log`
 * (migration 20260804160000). O refresh só produz três dos cinco valores:
 * `nao_aplicavel` não existe aqui (todo publicável é elegível a notícia) e
 * `indeterminado` tampouco, porque este módulo separa falha de vazio desde a
 * origem: HTTP quebrado/timeout/upsert com erro é `erro`, e RSS respondido sem
 * nenhum título citando o candidato é `vazio_confirmado`.
 */
type ColetaResultadoNews = "encontrado" | "vazio_confirmado" | "erro"

/**
 * Uma tentativa de coleta por candidato, pronta para virar linha de
 * `public.coleta_log` (fonte `google-news`, escopo `candidato`). Montada aqui,
 * gravada pela rota: o módulo continua puro (sem Supabase, sem rede própria).
 */
export interface ColetaTentativaNews {
  /** Slug do candidato (o `alvo` da coleta_log). */
  alvo: string
  candidato_id: string
  resultado: ColetaResultadoNews
  /** Linhas enviadas ao upsert. Obrigatoriamente > 0 em `encontrado`. */
  volume: number
  detalhe: string
  /** URL da busca RSS consultada. */
  url: string
  duracao_ms: number
}

export interface NewsRefreshSummary {
  processed: number
  withNews: number
  rowsUpserted: number
  /**
   * Itens que o Google devolveu mas cujo título não cita o candidato: cobertura
   * do pleito, não dele. Nunca são gravados (auditoria 2026-07-24, etapa 1C).
   */
  discardedByName: number
  /**
   * Itens que o guarda de nome aprovou e a curadoria barrou: são de outra
   * pessoa, não do candidato (o caso medido é o tio governador de
   * `orleans-brandao`, ver `src/lib/news/denylist.ts`). Contado à parte de
   * `discardedByName` porque a causa é outra: aqui o nome casa mesmo, e quem
   * separa é a leitura humana da matéria.
   */
  discardedByDenylist: number
  errors: Array<{ slug: string; error: string }>
  /**
   * Uma tentativa por candidato processado, sempre, inclusive nos que não
   * renderam linha nenhuma. É o que permite provar "consultamos e não havia"
   * em vez de deixar o zero ambíguo (incidente de 2026-08-04: o cron cobria 5
   * de 194 candidatos por dia e nenhum rastro denunciava).
   */
  coletas: ColetaTentativaNews[]
}

export interface NewsRefreshDeps {
  upsertNoticias: (rows: NoticiaRow[]) => Promise<{ error: string | null }>
  fetchImpl: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => Date
  sleepMs: number
  timeoutMs: number
  newsLimit: number
}

const DEFAULT_NEWS_SLEEP_MS = 1500
const DEFAULT_NEWS_TIMEOUT_MS = 8000
const DEFAULT_NEWS_LIMIT = 20

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Processa o lote de candidatos em serie. Falha de um candidato (HTTP, timeout,
 * upsert) e nao-fatal: registra em `errors` e segue. A pausa `sleepMs` roda em
 * todos os ramos (sucesso, sem-noticia, erro) para nao martelar o Google News.
 */
export async function refreshCandidatosNews(
  candidatos: NewsCandidato[],
  deps: NewsRefreshDeps,
): Promise<NewsRefreshSummary> {
  const summary: NewsRefreshSummary = {
    processed: 0,
    withNews: 0,
    rowsUpserted: 0,
    discardedByName: 0,
    discardedByDenylist: 0,
    errors: [],
    coletas: [],
  }

  for (let index = 0; index < candidatos.length; index += 1) {
    const cand = candidatos[index]
    summary.processed += 1

    const url = buildGoogleNewsSearchUrl(cand.nome_urna, cand.cargo_disputado)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
    const inicio = Date.now()
    const coletaBase = { alvo: cand.slug, candidato_id: cand.id, url }
    const registrarColeta = (
      resultado: ColetaResultadoNews,
      volume: number,
      detalhe: string,
    ) => {
      summary.coletas.push({
        ...coletaBase,
        resultado,
        volume,
        detalhe,
        duracao_ms: Date.now() - inicio,
      })
    }

    try {
      // O clearTimeout fica no finally: cancelar aqui deixaria o `await
      // res.text()` abaixo sem prazo nenhum, e fonte que manda cabeçalho e não
      // termina o corpo penduraria a invocação inteira até o limite da Vercel,
      // sem avançar o cursor nem agendar o encadeamento.
      const res = await deps.fetchImpl(url, { signal: controller.signal })

      if (!res.ok) {
        summary.errors.push({ slug: cand.slug, error: `HTTP ${res.status}` })
        registrarColeta("erro", 0, `HTTP ${res.status}`)
        continue
      }

      const xml = await res.text()
      const { items } = parseGoogleNewsRss(xml, deps.now)

      // Guard de relevancia (auditoria 2026-07-24, etapa 1C): so grava item
      // cujo titulo cita o candidato. O que sobra e cobertura coletiva do
      // pleito devolvida pela busca de nome, nao noticia sobre a pessoa.
      const { mencionam, contextoDoPleito } = splitNewsByCandidateMention(items, cand)
      summary.discardedByName += contextoDoPleito.length

      // Denylist editorial (auditoria de homonimo 2026-08-17): o guarda acima
      // aprova qualquer titulo com token distintivo do nome de urna, e no caso
      // de `orleans-brandao` isso inclui ato do TIO, governador do MA em
      // exercicio. O corte roda ANTES do slice e do upsert, porque apagar a
      // linha a mao nao segura: o cron reinsere na coleta seguinte (precedente
      // de 05/08/2026, 06:32). Ver `src/lib/news/denylist.ts`.
      const { permitidos, bloqueados } = splitNewsByDenylist(mencionam, cand.slug)
      summary.discardedByDenylist += bloqueados.length

      const newsItems = permitidos.slice(0, deps.newsLimit)

      if (newsItems.length === 0) {
        // A fonte respondeu e nada sobrou para gravar, seja porque nenhum
        // titulo cita o candidato, seja porque a curadoria barrou o que citava.
        // Nos dois casos e um zero provado, nao um "nao sabemos", e volume 0
        // aqui e o que a constraint `coleta_log_volume_coerente` exige de
        // `vazio_confirmado` (encontrado com volume 0 seria mentira).
        registrarColeta(
          "vazio_confirmado",
          0,
          `rss respondeu ${items.length} item(ns), ${mencionam.length} citam o candidato no titulo, ${bloqueados.length} bloqueados por denylist, 0 enviados ao upsert`,
        )
        continue
      }

      const rows: NoticiaRow[] = newsItems.map((item) => ({
        candidato_id: cand.id,
        titulo: sanitizePublicTextOrThrow(item.titulo, `google-news:${cand.slug}:titulo`),
        fonte: sanitizePublicTextOrThrow(item.fonte, `google-news:${cand.slug}:fonte`),
        url: item.url,
        data_publicacao: item.data_publicacao,
      }))

      const { error } = await deps.upsertNoticias(rows)
      if (error) {
        summary.errors.push({ slug: cand.slug, error })
        registrarColeta("erro", 0, `upsert falhou: ${error}`.slice(0, 500))
        continue
      }

      summary.withNews += 1
      summary.rowsUpserted += rows.length
      registrarColeta(
        "encontrado",
        rows.length,
        `rss respondeu ${items.length} item(ns), ${mencionam.length} citam o candidato, ${rows.length} enviados ao upsert, ${contextoDoPleito.length} descartados por nome, ${bloqueados.length} bloqueados por denylist`,
      )
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "timeout"
          : err instanceof Error
            ? err.message
            : String(err)
      summary.errors.push({ slug: cand.slug, error: message })
      registrarColeta("erro", 0, message.slice(0, 500))
    } finally {
      // Único ponto de cancelamento: cobre sucesso, os `continue` e o catch.
      clearTimeout(timer)
      if (index < candidatos.length - 1) {
        await deps.sleep(deps.sleepMs)
      }
    }
  }

  return summary
}

export function defaultNewsRefreshDeps(
  upsertNoticias: NewsRefreshDeps["upsertNoticias"],
): NewsRefreshDeps {
  return {
    upsertNoticias,
    fetchImpl: fetch,
    sleep: defaultSleep,
    now: () => new Date(),
    sleepMs: DEFAULT_NEWS_SLEEP_MS,
    timeoutMs: DEFAULT_NEWS_TIMEOUT_MS,
    newsLimit: DEFAULT_NEWS_LIMIT,
  }
}
