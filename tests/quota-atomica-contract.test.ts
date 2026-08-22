import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const ROOT = process.cwd()
const MIGRATION = "20260821010000_reserve_ip_quotas_atomicas.sql"
const HARNESS = "scripts/audit/provar-quota-rpc-pg17.sh"

const FUNCTIONS = [
  {
    name: "insert_quiz_short_link_under_ip_quota",
    signature: "text, text, text, timestamptz, timestamptz, timestamptz, integer",
    lock:
      "PERFORM pg_advisory_xact_lock(hashtext('quiz-short-link:' || coalesce(p_ip_hash, '')));",
    table: "quiz_result_short_links",
    keyPredicate: "WHERE ip_hash = p_ip_hash",
    mutatedKeyPredicate: "WHERE ip_hash <> p_ip_hash",
    windowPredicate: "AND created_at >= p_since;",
    write: "INSERT INTO public.quiz_result_short_links",
    success: "RETURN jsonb_build_object('status', 'inserted');",
  },
  {
    name: "insert_analytics_launch_event_under_ip_quota",
    signature: "text, jsonb, text, text, timestamptz, integer",
    lock:
      "PERFORM pg_advisory_xact_lock(hashtext('analytics-event:' || coalesce(p_ip_hash, '')));",
    table: "analytics_launch_events",
    keyPredicate: "WHERE ip_hash = p_ip_hash",
    mutatedKeyPredicate: "WHERE ip_hash <> p_ip_hash",
    windowPredicate: "AND created_at >= p_since;",
    write: "INSERT INTO public.analytics_launch_events",
    success: "RETURN jsonb_build_object('status', 'inserted');",
  },
  {
    name: "insert_alert_subscriber_under_ip_quota",
    signature:
      "text, text, text, text, timestamptz, text, text, text, timestamptz, integer",
    lock:
      "PERFORM pg_advisory_xact_lock(hashtext('alerts-new-subscriber:' || coalesce(p_ip_consentimento_hash, '')));",
    table: "alert_subscribers",
    keyPredicate: "WHERE ip_consentimento_hash = p_ip_consentimento_hash",
    mutatedKeyPredicate: "WHERE ip_consentimento_hash <> p_ip_consentimento_hash",
    windowPredicate: "AND created_at >= p_since;",
    write: "INSERT INTO public.alert_subscribers",
    success: "RETURN jsonb_build_object('status', 'inserted', 'id', v_id);",
  },
  {
    name: "reserve_alert_email_ip_budget",
    signature: "uuid, text, timestamptz, integer, timestamptz",
    lock:
      "PERFORM pg_advisory_xact_lock(hashtext('alerts-email:' || coalesce(p_email_ip_hash, '')));",
    table: "alert_subscribers",
    keyPredicate: "WHERE last_email_request_ip_hash = p_email_ip_hash",
    mutatedKeyPredicate: "WHERE last_email_request_ip_hash <> p_email_ip_hash",
    windowPredicate: "AND last_verification_email_sent_at >= p_since;",
    write: "UPDATE public.alert_subscribers",
    success: "RETURN jsonb_build_object('status', 'reserved');",
  },
] as const

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function sql(): string {
  return readFileSync(join(ROOT, "supabase/migrations", MIGRATION), "utf8")
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  assert.notEqual(start, -1, `${name}: function missing`)
  const bodyStart = source.indexOf("AS $$", start)
  const bodyEnd = source.indexOf("$$;", bodyStart)
  assert.notEqual(bodyStart, -1, `${name}: body missing`)
  assert.notEqual(bodyEnd, -1, `${name}: body incomplete`)
  return source.slice(bodyStart, bodyEnd)
}

function mutateFunctionBody(source: string, name: string, from: string, to: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const end = source.indexOf("$$;", start)
  assert.notEqual(start, -1, `${name}: function missing for mutation`)
  assert.notEqual(end, -1, `${name}: body missing for mutation`)
  const body = source.slice(start, end)
  assert.ok(body.includes(from), `${name}: mutation target missing`)
  return `${source.slice(0, start)}${body.replace(from, to)}${source.slice(end)}`
}

function assertQuotaMigrationContract(source: string): void {
  for (const fn of FUNCTIONS) {
    const body = functionBody(source, fn.name)
    const locks = body.match(/PERFORM\s+pg_advisory_xact_lock\([^;]+;/g) ?? []
    assert.deepEqual(locks.map(normalizeSql), [normalizeSql(fn.lock)], `${fn.name}: lock key`)

    const countBlock = normalizeSql(`
      SELECT COUNT(*)::integer INTO v_count
      FROM public.${fn.table}
      ${fn.keyPredicate}
      ${fn.windowPredicate}
    `)
    assert.ok(normalizeSql(body).includes(countBlock), `${fn.name}: exact count predicate`)

    const ordered = [
      "IF p_max IS NULL OR p_max < 1 THEN",
      fn.lock,
      "SELECT COUNT(*)::integer INTO v_count",
      fn.keyPredicate,
      fn.windowPredicate,
      "IF v_count >= p_max THEN",
      "RETURN jsonb_build_object('status', 'quota_exceeded');",
      fn.write,
      fn.success,
    ]
    let previous = -1
    for (const clause of ordered) {
      const current = body.indexOf(clause)
      assert.ok(current > previous, `${fn.name}: ${clause} missing or out of order`)
      previous = current
    }

    const ident = `FUNCTION public.${fn.name}(${fn.signature})`
    const escapedIdent = escapeRegExp(ident)
    const aclStatements = source.match(
      new RegExp(`(?:REVOKE|GRANT)\\s+[^;]*?ON\\s+${escapedIdent}\\s+[^;]*;`, "gi"),
    ) ?? []
    assert.deepEqual(
      aclStatements.map(normalizeSql),
      [
        `REVOKE ALL ON ${ident} FROM PUBLIC;`,
        `REVOKE ALL ON ${ident} FROM anon, authenticated;`,
        `GRANT EXECUTE ON ${ident} TO service_role;`,
      ],
      `${fn.name}: final privilege block must allow only service_role`,
    )
    assert.doesNotMatch(
      source,
      new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+${escapedIdent}\\s+TO\\s+(?:PUBLIC|anon|authenticated)\\b`,
        "i",
      ),
      `${fn.name}: public roles cannot execute the quota RPC`,
    )
  }
}

describe("quotas publicas atomicas", () => {
  it("ancora lock, chave, janela, COUNT, limite e escrita nas quatro RPCs", () => {
    assertQuotaMigrationContract(sql())
  })

  it("reprova lock constante em qualquer uma das quatro RPCs", () => {
    const source = sql()
    for (const fn of FUNCTIONS) {
      const constantLock = fn.lock.replace(/ \|\| coalesce\([^)]*\)/, "")
      const mutated = mutateFunctionBody(source, fn.name, fn.lock, constantLock)
      assert.throws(
        () => assertQuotaMigrationContract(mutated),
        new RegExp(`${fn.name}: lock key`),
      )
    }
  })

  it("reprova predicado de chave invertido em qualquer uma das quatro RPCs", () => {
    const source = sql()
    for (const fn of FUNCTIONS) {
      const mutated = mutateFunctionBody(
        source,
        fn.name,
        fn.keyPredicate,
        fn.mutatedKeyPredicate,
      )
      assert.throws(
        () => assertQuotaMigrationContract(mutated),
        new RegExp(`${fn.name}: exact count predicate`),
      )
    }
  })

  it("reprova GRANT posterior para PUBLIC, anon ou authenticated", () => {
    const source = sql()
    for (const fn of FUNCTIONS) {
      for (const role of ["PUBLIC", "anon", "authenticated"]) {
        const mutated = `${source}\nGRANT EXECUTE ON FUNCTION public.${fn.name}(${fn.signature}) TO ${role};\n`
        assert.throws(
          () => assertQuotaMigrationContract(mutated),
          new RegExp(`${fn.name}: final privilege block`),
        )
      }
    }
  })

  it("REVOKE e GRANT finais deixam EXECUTE somente para service_role", () => {
    assertQuotaMigrationContract(sql())
  })

  it("o recorte e a allowlist autorizam as escritas desta migration", () => {
    const recortes = JSON.parse(
      readFileSync(join(ROOT, "scripts/audit/recortes.json"), "utf8"),
    ) as { recortes: Array<{ nome: string; desde: string; ate: string; allowlist: string }> }
    const recorte = recortes.recortes.find((r) => r.nome === "quota-atomica-20260821")
    assert.ok(recorte, "recorte ausente")
    assert.equal(recorte.desde, "20260821010000")
    assert.equal(recorte.ate, "20260821010000")
  })

  it("stores e rotas chamam as RPCs pelo nome", () => {
    const shortLink = readFileSync(join(ROOT, "src/lib/quiz-short-link-store.ts"), "utf8")
    const analytics = readFileSync(join(ROOT, "src/lib/analytics-launch-store.ts"), "utf8")
    const alerts = readFileSync(join(ROOT, "src/app/api/alerts/subscribe/route.ts"), "utf8")
    assert.match(shortLink, /\.rpc\("insert_quiz_short_link_under_ip_quota"/)
    assert.match(
      shortLink,
      /isMissingQuotaRpc\(error,\s*"insert_quiz_short_link_under_ip_quota"\)/,
    )
    assert.match(analytics, /\.rpc\("insert_analytics_launch_event_under_ip_quota"/)
    assert.match(
      analytics,
      /isMissingQuotaRpc\(error,\s*"insert_analytics_launch_event_under_ip_quota"\)/,
    )
    assert.match(alerts, /\.rpc\(\s*"insert_alert_subscriber_under_ip_quota"/)
    assert.match(alerts, /\.rpc\("reserve_alert_email_ip_budget"/)
    assert.match(
      alerts,
      /isMissingQuotaRpc\(insertError,\s*"insert_alert_subscriber_under_ip_quota"\)/,
    )
    assert.match(
      alerts,
      /isMissingQuotaRpc\(error,\s*"reserve_alert_email_ip_budget"\)/,
    )
  })

  it("liga a prova runtime ao gate canônico de PostgreSQL 17 descartável", () => {
    const harness = readFileSync(join(ROOT, HARNESS), "utf8")
    const aggregator = readFileSync(
      join(ROOT, "scripts/audit/provar-release-pf-ajustes-pg17.sh"),
      "utf8",
    )
    assert.match(harness, /postgres:17@sha256:[a-f0-9]{64}/)
    assert.match(harness, new RegExp(escapeRegExp(MIGRATION)))
    assert.match(harness, /pg_locks/)
    assert.match(harness, /not granted/i)
    for (const fn of FUNCTIONS) assert.match(harness, new RegExp(fn.name))
    assert.match(aggregator, new RegExp(escapeRegExp(HARNESS)))
  })
})
