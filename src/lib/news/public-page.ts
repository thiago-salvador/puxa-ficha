import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerSupabaseClient } from "@/lib/supabase"
import { newsRetentionCutoffIso } from "@/lib/operational-retention"
import { NEWS_DENYLIST, splitNewsByDenylist } from "@/lib/news/denylist"
import { newsTitleMentionsCandidate, type CandidateNameInput } from "@/lib/news/name-match"
import { PUBLIC_NEWS_PAGE_SIZE, type PublicNewsCursor } from "@/lib/news/news-cursor"
import { shouldExposeCargo } from "@/lib/senado-feature"
import type { NoticiaCandidato } from "@/lib/types"

/**
 * Lista pública de notícias da ficha: a prévia que vem no HTML e as páginas do
 * botão "Ver mais notícias" passam pelas MESMAS três funções abaixo (consulta,
 * filtro e rótulo), para que as duas leituras não se afastem.
 */

/** Colunas do tipo `NoticiaCandidato`. Nada de coluna interna na resposta. */
const PUBLIC_NEWS_COLUMNS = "id, candidato_id, titulo, fonte, url, data_publicacao, snippet"

/**
 * Linhas lidas por consulta. A margem existe para que a denylist editorial
 * possa retirar itens sem encolher a página abaixo de 20 notícias.
 */
export const PUBLIC_NEWS_FETCH_LIMIT = PUBLIC_NEWS_PAGE_SIZE * 2

/** Teto de consultas por página: 200 linhas lidas no pior caso. */
const MAX_LEITURAS_POR_PAGINA = 5

type NewsCandidate = CandidateNameInput & { slug: string }

/**
 * Janela pública: notícia com data, dentro da retenção de 365 dias, em ordem
 * (data_publicacao desc, id desc). O `id` desempata notícias com o mesmo
 * horário, que existem (a coleta grava várias no mesmo segundo); sem ele duas
 * páginas poderiam repetir ou pular item. Com cursor, lê só o que vem depois
 * do último item exibido.
 */
export function publicNewsWindowQuery(
  client: SupabaseClient,
  candidatoId: string,
  cursor: PublicNewsCursor | null,
  limit: number,
  signal: AbortSignal,
) {
  let query = client
    .from("noticias_candidato")
    .select(PUBLIC_NEWS_COLUMNS)
    .abortSignal(signal)
    .eq("candidato_id", candidatoId)
    .not("data_publicacao", "is", null)
    .gte("data_publicacao", newsRetentionCutoffIso())
  if (cursor) {
    query = query.or(
      `data_publicacao.lt."${cursor.data_publicacao}",and(data_publicacao.eq."${cursor.data_publicacao}",id.lt.${cursor.id})`,
    )
  }
  return query
    .order("data_publicacao", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)
}

/**
 * Denylist editorial, corte da página e rótulo de relevância em tempo de
 * leitura (auditoria 2026-07-24, etapa 1C): item cujo título não cita o
 * candidato é marcado como cobertura do pleito, sem apagar dado.
 */
export function toPublicNewsItems(
  rows: readonly NoticiaCandidato[],
  candidato: NewsCandidate,
  pageSize: number = PUBLIC_NEWS_PAGE_SIZE,
): NoticiaCandidato[] {
  return splitNewsByDenylist(rows, candidato.slug).permitidos
    .slice(0, pageSize)
    .map((noticia) => ({
      ...noticia,
      contexto_do_pleito: !newsTitleMentionsCandidate(noticia.titulo, candidato),
    }))
}

export interface PublicNewsPage {
  items: NoticiaCandidato[]
  /** Posição de onde a próxima página continua; null quando acabou. */
  nextCursor: PublicNewsCursor | null
}

/**
 * Próxima página depois do cursor. Lê de novo enquanto a denylist deixar a
 * página incompleta e ainda houver linha no banco. Pede uma notícia a mais do
 * que exibe para saber, sem outra consulta, se existe página seguinte.
 *
 * @public Exercitada diretamente pelos testes de paginação.
 */
export async function fetchPublicNewsPage(
  client: SupabaseClient,
  candidato: NewsCandidate & { id: string },
  cursor: PublicNewsCursor | null,
  pageSize: number = PUBLIC_NEWS_PAGE_SIZE,
): Promise<PublicNewsPage> {
  const lidas: NoticiaCandidato[] = []
  let leitura = cursor
  let esgotou = false

  for (let rodada = 0; rodada < MAX_LEITURAS_POR_PAGINA; rodada++) {
    const { data, error } = await publicNewsWindowQuery(
      client, candidato.id, leitura, PUBLIC_NEWS_FETCH_LIMIT, AbortSignal.timeout(8_000),
    )
    if (error) throw new Error("Falha ao consultar notícias")
    const rows = (data ?? []) as unknown as NoticiaCandidato[]
    lidas.push(...rows)
    if (rows.length < PUBLIC_NEWS_FETCH_LIMIT) {
      esgotou = true
      break
    }
    if (splitNewsByDenylist(lidas, candidato.slug).permitidos.length > pageSize) break
    const ultima = rows[rows.length - 1]
    leitura = { data_publicacao: ultima.data_publicacao, id: ultima.id }
  }

  const permitidos = splitNewsByDenylist(lidas, candidato.slug).permitidos
  const items = toPublicNewsItems(lidas, candidato, pageSize)
  if (permitidos.length > pageSize) {
    const ultimo = items[items.length - 1]
    return { items, nextCursor: { data_publicacao: ultimo.data_publicacao, id: ultimo.id } }
  }
  if (esgotou || lidas.length === 0) return { items, nextCursor: null }
  // Teto de leituras atingido com a página ainda incompleta: todo item lido foi
  // exibido ou bloqueado, então a próxima página continua da última linha lida.
  const ultimaLida = lidas[lidas.length - 1]
  return { items, nextCursor: { data_publicacao: ultimaLida.data_publicacao, id: ultimaLida.id } }
}

/**
 * Total exato da janela pública. Ficha sem regra na denylist conta no banco,
 * sem trazer linha. Ficha com regra lê só as colunas que a denylist olha,
 * porque o filtro editorial roda em código.
 */
async function countPublicNews(client: SupabaseClient, candidato: NewsCandidate & { id: string }): Promise<number> {
  const base = () => client
    .from("noticias_candidato")
    .select("titulo, fonte, url", { count: "exact", head: !NEWS_DENYLIST[candidato.slug]?.length })
    .abortSignal(AbortSignal.timeout(8_000))
    .eq("candidato_id", candidato.id)
    .not("data_publicacao", "is", null)
    .gte("data_publicacao", newsRetentionCutoffIso())

  if (!NEWS_DENYLIST[candidato.slug]?.length) {
    const { count, error } = await base()
    if (error || count === null) throw new Error("Falha ao contar notícias")
    return count
  }
  // O PostgREST devolve no máximo 1.000 linhas por resposta: lê em faixas até
  // cobrir a janela, para o total não travar em 1.000 numa ficha grande.
  const FAIXA = 1_000
  let permitidos = 0
  for (let inicio = 0; inicio < 5_000; inicio += FAIXA) {
    const { data, error } = await base().order("id", { ascending: true }).range(inicio, inicio + FAIXA - 1)
    if (error) throw new Error("Falha ao contar notícias")
    const linhas = data ?? []
    permitidos += splitNewsByDenylist(linhas, candidato.slug).permitidos.length
    if (linhas.length < FAIXA) break
  }
  return permitidos
}

export type PublicNewsPageResource =
  | { known: false }
  | { known: true; page: PublicNewsPage; total: number }

/** Leitura da rota pública: só candidatura publicável, com o mesmo filtro da ficha. */
export async function getPublicNewsPageBySlug(
  slug: string,
  cursor: PublicNewsCursor | null,
  pageSize: number = PUBLIC_NEWS_PAGE_SIZE,
  client: SupabaseClient = createServerSupabaseClient({ cacheMode: "no-store" }),
): Promise<PublicNewsPageResource> {
  const candidate = await client.from("candidatos_publico")
    .select("id, slug, nome_urna, nome_completo, cargo_disputado")
    .abortSignal(AbortSignal.timeout(8_000))
    .eq("slug", slug)
    .maybeSingle()
  if (candidate.error) throw new Error("Falha ao consultar candidato")
  if (!candidate.data) return { known: false }
  // Flag do Senado desligada: a ficha de candidatura ao Senado responde como inexistente.
  if (!shouldExposeCargo(candidate.data.cargo_disputado)) return { known: false }

  const candidato = candidate.data as NewsCandidate & { id: string }
  const [page, total] = await Promise.all([
    fetchPublicNewsPage(client, candidato, cursor, pageSize),
    countPublicNews(client, candidato),
  ])
  return { known: true, page, total }
}
