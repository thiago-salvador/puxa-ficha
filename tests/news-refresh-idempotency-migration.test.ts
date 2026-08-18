import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260806084742_news_refresh_lotes_idempotentes.sql",
)
const migration = readFileSync(migrationPath, "utf8")
const route = readFileSync(join(process.cwd(), "src/app/api/news/refresh/route.ts"), "utf8")

describe("news refresh idempotency migration contract", () => {
  it("uses a separate persistent key for execution + cursor", () => {
    assert.match(migration, /create table public\.news_refresh_lotes/i)
    assert.match(migration, /primary key \(execucao_id, cursor\)/i)
    assert.doesNotMatch(migration, /delete\s+from\s+public\.coleta_log/i)
  })

  it("deduplicates coleta_log if completion crashes after the append", () => {
    assert.match(migration, /add column lote_cursor integer/i)
    assert.match(migration, /unique \(fonte, execucao, lote_cursor, candidato_id\)/i)
    assert.match(route, /lote_cursor: batchCursor/i)
    assert.match(route, /onConflict:\s*"fonte,execucao,lote_cursor,candidato_id"/i)
    assert.match(route, /ignoreDuplicates:\s*true/i)
  })

  it("acquires atomically and only retakes retryable or expired work", () => {
    assert.match(migration, /on conflict \(execucao_id, cursor\) do update/i)
    assert.match(migration, /news_refresh_lotes\.estado = 'retryable'/i)
    assert.match(migration, /news_refresh_lotes\.lease_ate <= now\(\)/i)
    assert.match(migration, /returning \* into v_row/i)
  })

  it("fences renew, completion and retry transitions with the owner token", () => {
    for (const functionName of [
      "renew_news_refresh_lote_lease",
      "complete_news_refresh_lote",
      "retry_news_refresh_lote",
    ]) {
      const start = migration.indexOf(`function public.${functionName}`)
      assert.ok(start >= 0, `${functionName} precisa existir`)
      const body = migration.slice(start, migration.indexOf("$$;", start))
      assert.match(body, /owner_token = p_owner_token/i)
    }
  })

  it("claims exactly one logical continuation and fences its final state", () => {
    assert.match(migration, /update public\.news_refresh_lotes as l/i)
    assert.match(migration, /and l\.next_cursor is not null/i)
    assert.match(migration, /returning l\.\* into v_row/i)
    assert.match(migration, /continuacao_estado = 'dispatching'/i)
    assert.match(migration, /continuacao_estado = 'pending'/i)
    assert.match(migration, /continuacao_lease_ate <= now\(\)/i)
    assert.match(migration, /continuacao_token = p_continuation_token/i)
    assert.match(migration, /when p_accepted then 'dispatched' else 'pending'/i)
  })

  it("keeps the control surface private and includes a reversible rollback recipe", () => {
    assert.match(migration, /enable row level security/i)
    assert.match(migration, /revoke all on public\.news_refresh_lotes from public, anon, authenticated/i)
    assert.match(migration, /grant select, insert, update on public\.news_refresh_lotes to service_role/i)
    assert.match(migration, /-- drop table if exists public\.news_refresh_lotes;/i)
    assert.match(migration, /-- alter table public\.coleta_log drop column if exists lote_cursor;/i)
  })

  it("lists only bounded recoverable work for the service role", () => {
    assert.match(migration, /function public\.list_news_refresh_recuperaveis/i)
    assert.match(migration, /l\.estado = 'retryable'/i)
    assert.match(migration, /l\.estado = 'processing' and l\.lease_ate <= now\(\)/i)
    assert.match(migration, /l\.estado = 'completed'\s+and l\.next_cursor is not null/i)
    assert.match(migration, /continuation_lease_expired/i)
    assert.match(migration, /order by l\.atualizado_em asc, l\.execucao_id asc, l\.cursor asc/i)
    assert.match(migration, /limit least\(greatest\(p_limit, 1\), 50\)/i)
    assert.match(
      migration,
      /grant execute on function public\.list_news_refresh_recuperaveis\(integer\) to service_role/i,
    )
    assert.match(migration, /-- drop function if exists public\.list_news_refresh_recuperaveis/i)
  })

  it("propagates the stable execution id into coleta_log instead of recreating a daily id", () => {
    assert.match(route, /execucao: executionId/)
    assert.match(route, /NEWS_REFRESH_EXECUTION_HEADER/)
    assert.doesNotMatch(route, /news-refresh:\$\{new Date\(\)/)
  })
})
