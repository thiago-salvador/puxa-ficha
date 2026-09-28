import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { parseCliOptions, runReviewedLive } from "../scripts/tse-local/ingest-tse-local"

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")

test("dry-run artifacts pass the live gate without regeneration; tampering fails before any writer", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-reviewed-live-"))
  try {
    const reviewed = join(root, "reviewed")
    const live = join(root, "live")
    mkdirSync(join(reviewed, "financas"), { recursive: true })
    const profiles = [{ id: "00000000-0000-4000-8000-000000000001", slug: "candidate" }]
    writeFileSync(join(reviewed, "coorte-perfis.json"), JSON.stringify(profiles))
    const family = join(reviewed, "recibos-familias-aplicaveis.json")
    const history = join(reviewed, "historico-recibos.json")
    const plan = join(reviewed, "financas", "plano-privado.json")
    const report = join(reviewed, "relatorio.json")
    const receipts = join(root, "post-round.json")
    writeFileSync(family, JSON.stringify({ receipts: [] }))
    writeFileSync(history, JSON.stringify({ receipts: [] }))
    writeFileSync(plan, JSON.stringify({ plano_sha256: createHash("sha256").update("[]").digest("hex"), acoes: [], revisao: [], recibos: [], resumo: {} }))
    writeFileSync(report, JSON.stringify({ mode: "dry-run", historical_scope_complete: true, assets_reused_from_verified_cache: [],
      sources: { consulta_cand: { requested: 16, fresh_certifiable: 16, errors: [] },
        bem_candidato_2026: { fresh_certifiable: true, errors: [] },
        financiamento_2026: { fresh_certifiable: true, errors: [] } },
      steps: { history_review_receipts: { ok: true }, coverage_dry_run: { ok: true },
        history_coverage_dry_run: { ok: true }, finance_planner: { ok: true },
        apply_projection: { ok: true }, family_receipts: { ok: true }, identity_risk_actions_blocked: 0 },
      cohort: { selected: 1 } }))
    writeFileSync(receipts, "[]")
    const options = parseCliOptions([
      "--live", `--reviewed-run-dir=${reviewed}`, `--out-dir=${live}`, `--recibos=${receipts}`,
      `--expected-plan-sha=${JSON.parse(readFileSync(plan, "utf8")).plano_sha256}`,
      `--expected-plan-file-sha=${sha(plan)}`, `--expected-family-sha=${sha(family)}`, `--expected-history-sha=${sha(history)}`,
      `--expected-report-sha=${sha(report)}`,
    ])
    const calls: string[] = []
    const runner = (script: string, args: string[]) => {
      calls.push(`${script} ${args.join(" ")}`)
      if (script.endsWith("exportar-perfis-publicos.ts")) {
        writeFileSync(args.find((arg) => arg.startsWith("--out="))!.slice(6), JSON.stringify(profiles))
      }
      return { ok: true, code: 0 }
    }
    assert.equal(await runReviewedLive(options, runner), 0)
    assert.equal(calls.filter((call) => call.includes("tse-2026-financas.ts")).length, 1)
    writeFileSync(report, JSON.stringify({ mode: "dry-run", historical_scope_complete: false }))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "invalid-report") }, runner), /SHA-256.*relatório|gate do dry-run/)
    assert.equal(calls.filter((call) => call.includes("tse-2026-financas.ts")).length, 1)
    assert.ok(calls.findIndex((call) => call.includes("tse-2026-financas.ts")) < calls.findIndex((call) => call.includes("apply-coverage-receipts.ts")))
    assert.equal(calls.some((call) => call.includes("collect-tse-family-receipts-local.ts") || call.includes("coletar-revisao-historico.ts")), false)
    writeFileSync(family, JSON.stringify({ receipts: [{ altered: true }] }))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "tampered") }, runner), /SHA-256.*família/)
    assert.equal(calls.filter((call) => call.includes("tse-2026-financas.ts")).length, 1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
