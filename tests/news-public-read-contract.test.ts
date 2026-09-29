import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

test("a ficha publica nao devolve noticia sem data, vencida ou bloqueada editorialmente", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/api.ts"), "utf8")
  const queryStart = source.indexOf("withSupabaseRetry(`noticias_candidato(${slug})`")
  const queryEnd = source.indexOf("candidato.cargo_disputado", queryStart)
  const query = source.slice(queryStart, queryEnd)

  // A ficha e a rota de "Ver mais noticias" usam a mesma consulta e o mesmo
  // mapeamento, extraidos para src/lib/news/public-page.ts.
  assert.match(query, /publicNewsWindowQuery\(supabase, id, null, PUBLIC_NEWS_FETCH_LIMIT, signal\)/)

  const mappingStart = source.indexOf("noticias: toPublicNewsItems")
  const mappingEnd = source.indexOf("indicadores_estaduais:", mappingStart)
  assert.ok(mappingStart > 0, "a ficha precisa usar o mapeamento compartilhado")
  assert.match(source.slice(mappingStart, mappingEnd), /toPublicNewsItems\(\(noticias\.data \?\? \[\]\)[^,]*, candidato\)/)

  const shared = readFileSync(resolve(process.cwd(), "src/lib/news/public-page.ts"), "utf8")
  const windowStart = shared.indexOf("export function publicNewsWindowQuery")
  const windowQuery = shared.slice(windowStart, shared.indexOf("export function toPublicNewsItems", windowStart))
  assert.match(windowQuery, /\.not\("data_publicacao", "is", null\)/)
  assert.match(windowQuery, /\.gte\("data_publicacao", newsRetentionCutoffIso\(\)\)/)
  assert.match(windowQuery, /\.order\("id", \{ ascending: false \}\)/)
  assert.match(shared, /PUBLIC_NEWS_FETCH_LIMIT = PUBLIC_NEWS_PAGE_SIZE \* 2/)

  const itemsStart = shared.indexOf("export function toPublicNewsItems")
  const items = shared.slice(itemsStart, shared.indexOf("export interface PublicNewsPage", itemsStart))
  assert.match(items, /splitNewsByDenylist\(rows, candidato\.slug\)\.permitidos/)
  assert.match(items, /\.slice\(0, pageSize\)/)
})
