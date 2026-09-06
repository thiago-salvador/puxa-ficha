import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

test("a ficha publica nao devolve noticia sem data, vencida ou bloqueada editorialmente", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/api.ts"), "utf8")
  const queryStart = source.indexOf("withSupabaseRetry(`noticias_candidato(${slug})`")
  const queryEnd = source.indexOf("candidato.cargo_disputado", queryStart)
  const query = source.slice(queryStart, queryEnd)

  assert.match(query, /\.not\("data_publicacao", "is", null\)/)
  assert.match(query, /\.gte\("data_publicacao", newsRetentionCutoffIso\(\)\)/)
  assert.match(query, /\.limit\(40\)/)

  const mappingStart = source.indexOf("noticias: splitNewsByDenylist")
  const mappingEnd = source.indexOf("indicadores_estaduais:", mappingStart)
  const mapping = source.slice(mappingStart, mappingEnd)
  assert.match(mapping, /splitNewsByDenylist\(noticias\.data \?\? \[\], candidato\.slug\)\.permitidos/)
  assert.match(mapping, /\.slice\(0, 20\)/)
})
