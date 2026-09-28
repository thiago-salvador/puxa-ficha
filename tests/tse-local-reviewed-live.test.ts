import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { identityRiskSlugsFromArtifacts, parseCliOptions, runReviewedLive } from "../scripts/tse-local/ingest-tse-local"
import { stableJson } from "../scripts/lib/tse-2026-financas-plano"

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")

test("dry-run artifacts pass the live gate without regeneration; tampering fails before any writer", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-reviewed-live-"))
  try {
    const reviewed = join(root, "reviewed")
    const live = join(root, "live")
    mkdirSync(join(reviewed, "financas"), { recursive: true })
    const profiles = [
      { id: "00000000-0000-4000-8000-000000000001", slug: "candidate" },
      { id: "00000000-0000-4000-8000-000000000002", slug: "safe" },
    ]
    writeFileSync(join(reviewed, "coorte-perfis.json"), JSON.stringify(profiles))
    const family = join(reviewed, "recibos-familias-aplicaveis.json")
    const history = join(reviewed, "historico-recibos.json")
    const projection = join(reviewed, "recibos-familias-projecao.json")
    const cohort = join(reviewed, "coorte-perfis.json")
    const plan = join(reviewed, "financas", "plano-privado.json")
    const report = join(reviewed, "relatorio.json")
    const historyReview = join(reviewed, "historico-revisao.json")
    const candidates = join(reviewed, "coorte-candidatos.json")
    const familyReceipts = join(reviewed, "recibos-familias-tse.json")
    const receipts = join(root, "post-round.json")
    const identity = join(root, "identity-reviewed.json")
    writeFileSync(family, JSON.stringify({ receipts: [] }))
    writeFileSync(history, JSON.stringify({ receipts: [{ alvo: "candidate", fonte: "tse-historico" }, { alvo: "safe", fonte: "tse-historico" }] }))
    writeFileSync(projection, JSON.stringify({ receipts: [{ alvo: "candidate", fonte: "tse-financiamento" }, { alvo: "safe", fonte: "tse-financiamento" }] }))
    writeFileSync(historyReview, JSON.stringify({ itens: [{ slug: "candidate", tipo: "identidade" }] }))
    writeFileSync(candidates, JSON.stringify([{ slug: "candidate", ids: { tse_sq_candidato: { "2026": "260000000001" } } }]))
    writeFileSync(familyReceipts, JSON.stringify({ diagnostics: [] }))
    const identityBytes = JSON.stringify({ schema_version: 1, kind: "identidade-revisada-tse", vinculos: [] })
    writeFileSync(identity, identityBytes)
    writeFileSync(plan, JSON.stringify({ plano_sha256: createHash("sha256").update("[]").digest("hex"), acoes: [], revisao: [], recibos: [], resumo: {}, identity_risk_slugs: ["candidate"] }))
    writeFileSync(report, JSON.stringify({ generated_at: new Date().toISOString(), mode: "dry-run", historical_scope_complete: true, assets_reused_from_verified_cache: [], identity_reviewed_sha256: sha(identity),
      identity_risk_source_shas: { history_review: sha(historyReview), candidates: sha(candidates), family_receipts: sha(familyReceipts) },
      sources: { consulta_cand: { requested: 16, fresh_certifiable: 16, errors: [] },
        bem_candidato_2026: { fresh_certifiable: true, errors: [] },
        financiamento_2026: { fresh_certifiable: true, errors: [] } },
      steps: { history_review_receipts: { ok: true }, coverage_dry_run: { ok: true },
        history_coverage_dry_run: { ok: true }, finance_planner: { ok: true },
        apply_projection: { ok: true }, family_receipts: { ok: true }, identity_risk_actions_blocked: 0 },
      cohort: { selected: 2 } }))
    writeFileSync(receipts, "[]")
    const options = parseCliOptions([
      "--live", `--reviewed-run-dir=${reviewed}`, `--out-dir=${live}`, `--recibos=${receipts}`,
      `--expected-plan-sha=${JSON.parse(readFileSync(plan, "utf8")).plano_sha256}`,
      `--expected-plan-file-sha=${sha(plan)}`, `--expected-family-sha=${sha(family)}`, `--expected-history-sha=${sha(history)}`,
      `--expected-report-sha=${sha(report)}`, `--expected-cohort-sha=${sha(cohort)}`, `--expected-projection-sha=${sha(projection)}`,
      `--identity-reviewed=${identity}`, `--expected-identity-sha=${sha(identity)}`,
    ])
    const calls: string[] = []
    const appliedReceipts: Array<{ source: string; alvos: unknown[] }> = []
    const consumed = join(root, "consumed")
    const runner = (script: string, args: string[]) => {
      calls.push(`${script} ${args.join(" ")}`)
      if (script.endsWith("tse-2026-financas.ts")) assert.equal(existsSync(join(consumed, `${options.expectedPlanSha}.json`)), true)
      if (script.endsWith("exportar-perfis-publicos.ts")) {
        writeFileSync(args.find((arg) => arg.startsWith("--out="))!.slice(6), JSON.stringify(profiles))
      }
      if (script.endsWith("apply-coverage-receipts.ts")) {
        const path = args.find((arg) => arg.startsWith("--in="))!.slice(5)
        appliedReceipts.push({ source: path, alvos: JSON.parse(readFileSync(path, "utf8")).receipts.map((row: { alvo: unknown }) => row.alvo) })
      }
      return { ok: true, code: 0 }
    }
    assert.equal(await runReviewedLive(options, runner, consumed), 0)
    assert.equal(calls.filter((call) => call.includes("tse-2026-financas.ts")).length, 1)
    assert.deepEqual(appliedReceipts.map((item) => item.alvos), [["safe"], ["safe"]])
    assert.equal(JSON.parse(readFileSync(join(live, "relatorio.json"), "utf8")).reviewed_shas.identity, sha(identity))
    const dryRunRisk = [...identityRiskSlugsFromArtifacts(
      JSON.parse(readFileSync(historyReview, "utf8")),
      JSON.parse(readFileSync(candidates, "utf8")),
      JSON.parse(readFileSync(familyReceipts, "utf8")),
      JSON.parse(readFileSync(plan, "utf8")),
    )].sort()
    const liveRisk = [...identityRiskSlugsFromArtifacts(
      JSON.parse(readFileSync(join(live, "pinned", "historico-revisao.json"), "utf8")),
      JSON.parse(readFileSync(join(live, "pinned", "coorte-candidatos.json"), "utf8")),
      JSON.parse(readFileSync(join(live, "pinned", "recibos-familias-tse.json"), "utf8")),
      JSON.parse(readFileSync(join(live, "pinned", "plano-privado.json"), "utf8")),
    )].sort()
    assert.deepEqual(liveRisk, dryRunRisk)
    assert.deepEqual(liveRisk, JSON.parse(readFileSync(plan, "utf8")).identity_risk_slugs)
    const originalReportBytes = readFileSync(report)
    const identityOptions = { ...options, outDir: join(root, "identity-tampered") }
    writeFileSync(identity, JSON.stringify({ schema_version: 1, kind: "identidade-revisada-tse", vinculos: [], altered: true }))
    await assert.rejects(() => runReviewedLive(identityOptions, runner, consumed), /SHA-256.*identidade/)
    writeFileSync(identity, identityBytes)
    writeFileSync(report, originalReportBytes)
    const injected = [{ slug: "candidate", tipo: "inserir_patrimonio" }]
    writeFileSync(plan, JSON.stringify({ ...JSON.parse(readFileSync(plan, "utf8")), acoes: injected,
      plano_sha256: createHash("sha256").update(stableJson(injected)).digest("hex") }))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "risk-injected"),
      expectedPlanSha: createHash("sha256").update(stableJson(injected)).digest("hex"), expectedPlanFileSha: sha(plan) }, runner, consumed), /gate de identidade/)
    writeFileSync(plan, JSON.stringify({ ...JSON.parse(readFileSync(plan, "utf8")), identity_risk_slugs: [] }))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "risk-omitted"),
      expectedPlanSha: createHash("sha256").update(stableJson(injected)).digest("hex"), expectedPlanFileSha: sha(plan) }, runner, consumed),
    (error: unknown) => error instanceof Error && error.message === "coorte de risco de identidade do plano diverge dos artefatos fixados")
    writeFileSync(plan, JSON.stringify({ plano_sha256: createHash("sha256").update("[]").digest("hex"), acoes: [], revisao: [], recibos: [], resumo: {}, identity_risk_slugs: ["candidate"] }))
    assert.ok(calls.find((call) => call.includes("tse-2026-financas.ts"))?.includes(join(live, "pinned")))
    assert.equal(appliedReceipts[0]?.source, join(realpathSync(live), "recibos-familias-projecao-aplicaveis.json"))
    assert.match(calls.find((call) => call.includes("apply-coverage-receipts.ts")) ?? "", /--profiles=.*\/coorte-pos-escrita\.json/)
    assert.equal(sha(join(live, "pinned", "coorte-perfis.json")), sha(cohort))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "replay") }, runner, consumed), /consumido|aplicado/)
    writeFileSync(report, JSON.stringify({ mode: "dry-run", historical_scope_complete: false }))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "invalid-report") }, runner, consumed), /SHA-256.*relatório|gate do dry-run/)
    assert.equal(calls.filter((call) => call.includes("tse-2026-financas.ts")).length, 1)
    assert.ok(calls.findIndex((call) => call.includes("tse-2026-financas.ts")) < calls.findIndex((call) => call.includes("apply-coverage-receipts.ts")))
    assert.equal(calls.some((call) => call.includes("collect-tse-family-receipts-local.ts") || call.includes("coletar-revisao-historico.ts")), false)
    writeFileSync(family, JSON.stringify({ receipts: [{ altered: true }] }))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "tampered") }, runner, consumed), /SHA-256.*família/)
    assert.equal(calls.filter((call) => call.includes("tse-2026-financas.ts")).length, 1)
    writeFileSync(family, JSON.stringify({ receipts: [] }))
    writeFileSync(report, JSON.stringify({ ...JSON.parse(originalReportBytes.toString("utf8")), generated_at: new Date(Date.now() - 25 * 3600_000).toISOString() }))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "old"), expectedReportSha: sha(report) }, runner, consumed), /24 h|expirado/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
