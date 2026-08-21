import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const ROOT = process.cwd()
const MIGRATION = "20260821010000_reserve_ip_quotas_atomicas.sql"

const FUNCTIONS = [
  {
    name: "insert_quiz_short_link_under_ip_quota",
    lock: "quiz-short-link:",
    signature: "text, text, text, timestamptz, timestamptz, timestamptz, integer",
  },
  {
    name: "insert_analytics_launch_event_under_ip_quota",
    lock: "analytics-event:",
    signature: "text, jsonb, text, text, timestamptz, integer",
  },
  {
    name: "insert_alert_subscriber_under_ip_quota",
    lock: "alerts-new-subscriber:",
    signature: "text, text, text, text, timestamptz, text, text, text, timestamptz, integer",
  },
  {
    name: "reserve_alert_email_ip_budget",
    lock: "alerts-email:",
    signature: "uuid, text, timestamptz, integer, timestamptz",
  },
] as const

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function sql(): string {
  return readFileSync(join(ROOT, "supabase/migrations", MIGRATION), "utf8")
}

describe("quotas publicas atomicas", () => {
  it("cada RPC serializa com advisory lock na mesma transacao da escrita", () => {
    const source = sql()
    for (const fn of FUNCTIONS) {
      const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${fn.name}(`)
      assert.notEqual(start, -1, `${fn.name} ausente`)
      const bodyStart = source.indexOf("AS $$", start)
      const bodyEnd = source.indexOf("$$;", bodyStart)
      const body = source.slice(bodyStart, bodyEnd)
      assert.match(body, /pg_advisory_xact_lock/)
      assert.match(body, new RegExp(`hashtext\\('${fn.lock}'`))
      assert.match(body, /RETURN jsonb_build_object\('status', 'quota_exceeded'\)/)
    }
  })

  it("REVOKE PUBLIC e GRANT EXECUTE so para service_role", () => {
    const source = sql()
    for (const fn of FUNCTIONS) {
      const ident = escapeRegExp(`FUNCTION public.${fn.name}(${fn.signature})`)
      assert.match(source, new RegExp(`REVOKE ALL ON ${ident} FROM PUBLIC`))
      assert.match(source, new RegExp(`REVOKE ALL ON ${ident} FROM anon, authenticated`))
      assert.match(source, new RegExp(`GRANT EXECUTE ON ${ident} TO service_role\\s*;`))
      assert.doesNotMatch(source, new RegExp(`GRANT EXECUTE ON ${ident} TO anon`))
      assert.doesNotMatch(source, new RegExp(`GRANT EXECUTE ON ${ident} TO authenticated`))
    }
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
    assert.match(shortLink, /rpc\("insert_quiz_short_link_under_ip_quota"/)
    assert.match(analytics, /rpc\("insert_analytics_launch_event_under_ip_quota"/)
    assert.match(alerts, /rpc\(\s*"insert_alert_subscriber_under_ip_quota"/)
    assert.match(alerts, /rpc\("reserve_alert_email_ip_budget"/)
  })
})
