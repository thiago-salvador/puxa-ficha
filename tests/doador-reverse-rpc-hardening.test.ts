import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const ROOT = process.cwd()
const MIGRATION = "20260820164117_doador_reverse_rpc_server_only_trgm.sql"

function sql(): string {
  return readFileSync(join(ROOT, "supabase/migrations", MIGRATION), "utf8")
}

function rpcBody(source: string): string {
  const marker = "CREATE OR REPLACE FUNCTION public.search_financiamento_by_doador_normalized("
  const start = source.lastIndexOf(marker)
  assert.notEqual(start, -1, "RPC paginada ausente")
  const bodyStart = source.indexOf("AS $$", start)
  const bodyEnd = source.indexOf("$$;", bodyStart)
  assert.ok(bodyStart > start && bodyEnd > bodyStart, "corpo da RPC nao encontrado")
  return source.slice(bodyStart, bodyEnd)
}

describe("RPC de doadores: server-only, offset cap, trgm", () => {
  it("REVOKE PUBLIC e GRANT EXECUTE so para service_role", () => {
    const source = sql()
    assert.match(
      source,
      /REVOKE ALL ON FUNCTION public\.search_financiamento_by_doador_normalized\(text, integer, integer\) FROM PUBLIC/,
    )
    assert.match(
      source,
      /REVOKE ALL ON FUNCTION public\.search_financiamento_by_doador_normalized\(text, integer, integer\) FROM anon, authenticated/,
    )
    assert.match(
      source,
      /GRANT EXECUTE ON FUNCTION public\.search_financiamento_by_doador_normalized\(text, integer, integer\) TO service_role\s*;/,
    )
    assert.doesNotMatch(
      source,
      /GRANT EXECUTE ON FUNCTION public\.search_financiamento_by_doador_normalized\(text, integer, integer\) TO anon/,
    )
    assert.doesNotMatch(
      source,
      /GRANT EXECUTE ON FUNCTION public\.search_financiamento_by_doador_normalized\(text, integer, integer\) TO authenticated/,
    )
  })

  it("dropa a assinatura de 1 argumento", () => {
    assert.match(
      sql(),
      /DROP FUNCTION IF EXISTS public\.search_financiamento_by_doador_normalized\(text\)\s*;/,
    )
  })

  it("cap de offset em 1000, no mesmo espirito do teto de p_limit", () => {
    const source = sql()
    assert.match(source, /LEAST\(GREATEST\(COALESCE\(p_offset, 0\), 0\), 1000\)/)
    assert.match(source, /LEAST\(GREATEST\(COALESCE\(p_limit, 100\), 1\), 200\)/)
  })

  it("RPC busca nome_normalizado com LIKE trgm, nao jsonb + position", () => {
    const body = rpcBody(sql())
    assert.match(body, /financiamento_doador_search/)
    assert.match(body, /nome_normalizado LIKE '%' \|\| q\.n \|\| '%'/)
    assert.match(body, /INNER JOIN public\.candidatos_publico/)
    assert.match(body, /INNER JOIN public\.financiamento_publico/)
    assert.doesNotMatch(body, /jsonb_to_recordset/)
    assert.doesNotMatch(body, /position\s*\(/)
  })

  it("tabela materializada tem RLS e nenhum GRANT SELECT a anon", () => {
    const source = sql()
    assert.match(source, /CREATE TABLE public\.financiamento_doador_search/)
    assert.match(source, /ALTER TABLE public\.financiamento_doador_search ENABLE ROW LEVEL SECURITY/)
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.financiamento_doador_search FROM PUBLIC/,
    )
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.financiamento_doador_search FROM anon, authenticated/,
    )
    assert.doesNotMatch(
      source,
      /GRANT[^;]*ON TABLE public\.financiamento_doador_search[^;]*\b(anon|authenticated)\b/,
    )
    assert.match(source, /USING gin \(nome_normalizado gin_trgm_ops\)/)
  })

  it("probe de consistencia publica inclui a tabela de busca no recorte anon-denied", () => {
    const src = readFileSync(join(ROOT, "src/lib/published-consistency.ts"), "utf8")
    assert.match(src, /"financiamento_doador_search"/)
  })

  it("SECURITY INVOKER e search_path incluem extensions para trgm", () => {
    const source = sql()
    const rpc = source.slice(source.lastIndexOf("CREATE OR REPLACE FUNCTION public.search_financiamento_by_doador_normalized("))
    assert.match(rpc, /SECURITY INVOKER/)
    assert.match(rpc, /SET search_path = public, extensions/)
  })
})

describe("app /doadores: service_role + limiter fail-closed", () => {
  it("caminho de producao chama a RPC com o cliente service_role", () => {
    const src = readFileSync(join(ROOT, "src/lib/doador-reverse.ts"), "utf8")
    assert.match(src, /createServiceRoleSupabaseClient/)
    // O caller real embrulha o cliente service_role e da prazo por chamada; o
    // contrato injetavel (testes) continua sendo um rpc que devolve Promise.
    assert.match(src, /rpcCaller \?\? realRpcCaller\(\)/)
    assert.match(
      src,
      /function realRpcCaller\(\)[\s\S]*?createServiceRoleSupabaseClient\(\)[\s\S]*?\.rpc\(fn, params\)\.abortSignal\(supabaseQueryTimeoutSignal\(\)\)/,
    )
    assert.doesNotMatch(src, /createServerSupabaseClient/)
    assert.doesNotMatch(src, /assinaturaPaginadaAusente/)
    assert.doesNotMatch(src, /p_query: normalizedQuery,\s*\n\s*\}\)/)
  })

  it("limiter da pagina continua fail-closed", () => {
    const page = readFileSync(join(ROOT, "src/app/(site)/doadores/page.tsx"), "utf8")
    assert.match(page, /doadoresSearchRateLimiter/)
    assert.match(page, /doadores search rate limit failed closed/)
    assert.match(page, /aguardeSegundos = 60/)
  })
})
