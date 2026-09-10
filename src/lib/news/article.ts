import "server-only"
import { createServerSupabaseClient } from "@/lib/supabase"
import { newsRetentionCutoffIso } from "@/lib/operational-retention"
import { splitNewsByDenylist } from "@/lib/news/denylist"
import { newsTitleMentionsCandidate } from "@/lib/news/name-match"
import type { NoticiaCandidato } from "@/lib/types"

/** Leitura pontual para links de e-mail que saíram da prévia de 20 notícias. */
export async function getPublicNewsArticle(
  slug: string,
  id: string,
  client = createServerSupabaseClient({ cacheMode: "no-store" }),
): Promise<NoticiaCandidato | null> {
  const candidate = await client.from("candidatos_publico")
    .select("id, slug, nome_urna, nome_completo")
    .eq("slug", slug)
    .abortSignal(AbortSignal.timeout(8_000))
    .maybeSingle()
  if (candidate.error) throw new Error("Falha ao consultar candidato")
  if (!candidate.data) return null

  const result = await client.from("noticias_candidato")
    .select("id, candidato_id, titulo, fonte, url, data_publicacao, snippet")
    .eq("id", id)
    .eq("candidato_id", candidate.data.id)
    .not("data_publicacao", "is", null)
    .gte("data_publicacao", newsRetentionCutoffIso())
    .abortSignal(AbortSignal.timeout(8_000))
    .maybeSingle()
  if (result.error) throw new Error("Falha ao consultar notícia")
  if (!result.data) return null
  const noticia = splitNewsByDenylist([result.data as NoticiaCandidato], slug).permitidos[0]
  if (!noticia) return null
  return { ...noticia, contexto_do_pleito: !newsTitleMentionsCandidate(noticia.titulo, candidate.data) }
}
