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
    writeFileSync(plan, JSON.stringify({ plano_sha256: createHash("sha256").update("[]").digest("hex"), acoes: [], revisao: [], recibos: [{ alvo: "candidate", resultado: "indeterminado", detalhe: JSON.stringify({ motivo: "identidade_em_revisao" }) }], resumo: {}, resumo_por_perfil: {}, identity_risk_slugs: ["candidate"] }))
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
    assert.ok(appliedReceipts.every((item) => !item.alvos.includes("candidate")))
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
    const planBeforeLegacyCase = readFileSync(plan)
    const legacy = JSON.parse(planBeforeLegacyCase.toString("utf8"))
    delete legacy.resumo_por_perfil
    writeFileSync(plan, JSON.stringify(legacy))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "legacy-plan"), expectedPlanFileSha: sha(plan) }, runner, join(root, "legacy-consumed")), /plano revisado sem resumo por perfil/)
    writeFileSync(plan, planBeforeLegacyCase)
    const certifying = { ...JSON.parse(planBeforeLegacyCase.toString("utf8")), recibos: [{ alvo: "candidate", resultado: "encontrado" }] }
    writeFileSync(plan, JSON.stringify(certifying))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "risk-certifying-receipt"), expectedPlanFileSha: sha(plan) }, runner, consumed), /não marcado para revisão/)
    writeFileSync(plan, planBeforeLegacyCase)
    const unmarked = { ...JSON.parse(planBeforeLegacyCase.toString("utf8")), recibos: [{ alvo: "candidate", resultado: "erro", detalhe: "{}" }] }
    writeFileSync(plan, JSON.stringify(unmarked))
    await assert.rejects(() => runReviewedLive({ ...options, outDir: join(root, "risk-unmarked-receipt"), expectedPlanFileSha: sha(plan) }, runner, consumed), /não marcado para revisão/)
    writeFileSync(plan, planBeforeLegacyCase)
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
    writeFileSync(plan, planBeforeLegacyCase)
    assert.ok(calls.find((call) => call.includes("tse-2026-financas.ts"))?.includes(join(live, "pinned")))
    assert.equal(appliedReceipts[0]?.source, join(realpathSync(live), "recibos-familias-projecao-elegiveis.json"))
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

test("live libera só a célula aprovada do perfil em risco e recusa decisão, evidência ou plano adulterados", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-reviewed-live-cells-"))
  try {
    const reviewed = join(root, "reviewed")
    mkdirSync(join(reviewed, "financas"), { recursive: true })
    const profiles = [
      { id: "00000000-0000-4000-8000-000000000001", slug: "candidate" },
      { id: "00000000-0000-4000-8000-000000000002", slug: "safe" },
    ]
    const p = (name: string) => join(reviewed, name)
    writeFileSync(p("coorte-perfis.json"), JSON.stringify(profiles))
    writeFileSync(p("recibos-familias-aplicaveis.json"), JSON.stringify({ receipts: [] }))
    writeFileSync(p("historico-recibos.json"), JSON.stringify({ receipts: [{ alvo: "candidate", fonte: "tse-historico" }, { alvo: "safe", fonte: "tse-historico" }] }))
    writeFileSync(p("recibos-familias-projecao.json"), JSON.stringify({ receipts: [
      { alvo: "candidate", fonte: "tse-financiamento" }, { alvo: "candidate", fonte: "tse-patrimonio" }, { alvo: "safe", fonte: "tse-financiamento" }] }))
    writeFileSync(p("historico-revisao.json"), JSON.stringify({ itens: [{ slug: "candidate", tipo: "identidade" }] }))
    writeFileSync(p("coorte-candidatos.json"), JSON.stringify([{ slug: "candidate", ids: { tse_sq_candidato: { "2026": "260000000001" } } }]))
    writeFileSync(p("recibos-familias-tse.json"), JSON.stringify({ diagnostics: [] }))
    const cells = join(root, "tse-identidade-celulas.json")
    const cellsBytes = JSON.stringify({ schema_version: 1, kind: "tse-identidade-celulas", celulas: [
      { lote: "t", slug: "candidate", familia: "financiamento", decisao: "publicar", linhas: [{ ano: 2026, uf: "SE", municipio: null, sq: "260000000001", decisao: "publicar" }] },
      { lote: "t", slug: "candidate", familia: "historico_politico", decisao: "publicar", linhas: [{ ano: 2004, uf: "SE", municipio: "ARACAJU", sq: "12", decisao: "publicar" }] },
    ] })
    writeFileSync(cells, cellsBytes)
    const evidence = p("identidade-celulas-evidencia.json")
    const evidenceBytes = JSON.stringify({ ancoras_2026: { candidate: { ano: 2026, uf: "SE", municipio: null, sq: "260000000001" } },
      historico: { candidate: [{ ano: 2004, uf: "SE", municipio: "ESTANCIA", sq: "12" }] } })
    writeFileSync(evidence, evidenceBytes)
    const acoes = [{ slug: "candidate", tipo: "inserir_financiamento" }]
    const planSha = createHash("sha256").update(stableJson(acoes)).digest("hex")
    const planBody = { plano_sha256: planSha, acoes, revisao: [], resumo: {}, resumo_por_perfil: {}, identity_risk_slugs: ["candidate"], identity_released_cells: ["candidate|financiamento"],
      recibos: [{ alvo: "candidate", fonte: "tse-financiamento", resultado: "encontrado" }, { alvo: "candidate", fonte: "tse-patrimonio", resultado: "indeterminado", detalhe: JSON.stringify({ motivo: "identidade_em_revisao" }) }] }
    const plan = p("financas/plano-privado.json")
    writeFileSync(plan, JSON.stringify(planBody))
    const reportBody = { generated_at: new Date().toISOString(), mode: "dry-run", historical_scope_complete: true, assets_reused_from_verified_cache: [], identity_reviewed_sha256: null,
      identity_cells: { sha256: sha(cells), evidence_sha256: sha(evidence) },
      identity_risk_source_shas: { history_review: sha(p("historico-revisao.json")), candidates: sha(p("coorte-candidatos.json")), family_receipts: sha(p("recibos-familias-tse.json")) },
      sources: { consulta_cand: { requested: 16, fresh_certifiable: 16, errors: [] }, bem_candidato_2026: { fresh_certifiable: true, errors: [] }, financiamento_2026: { fresh_certifiable: true, errors: [] } },
      steps: { history_review_receipts: { ok: true }, coverage_dry_run: { ok: true }, history_coverage_dry_run: { ok: true }, finance_planner: { ok: true },
        apply_projection: { ok: true }, family_receipts: { ok: true }, identity_risk_actions_blocked: 0 },
      cohort: { selected: 2 } }
    const report = p("relatorio.json")
    writeFileSync(report, JSON.stringify(reportBody))
    const receipts = join(root, "post-round.json")
    writeFileSync(receipts, "[]")
    const argsFor = (out: string) => parseCliOptions(["--live", `--reviewed-run-dir=${reviewed}`, `--out-dir=${join(root, out)}`, `--recibos=${receipts}`,
      `--expected-plan-sha=${planSha}`, `--expected-plan-file-sha=${sha(plan)}`, `--expected-family-sha=${sha(p("recibos-familias-aplicaveis.json"))}`,
      `--expected-history-sha=${sha(p("historico-recibos.json"))}`, `--expected-report-sha=${sha(report)}`, `--expected-cohort-sha=${sha(p("coorte-perfis.json"))}`,
      `--expected-projection-sha=${sha(p("recibos-familias-projecao.json"))}`, `--identity-cells=${cells}`, `--expected-identity-cells-sha=${sha(cells)}`])
    const applied: unknown[][] = []
    const runner = (script: string, args: string[]) => {
      if (script.endsWith("exportar-perfis-publicos.ts")) writeFileSync(args.find((arg) => arg.startsWith("--out="))!.slice(6), JSON.stringify(profiles))
      if (script.endsWith("apply-coverage-receipts.ts")) {
        const receiptsIn = JSON.parse(readFileSync(args.find((arg) => arg.startsWith("--in="))!.slice(5), "utf8")).receipts as Array<{ alvo: string; fonte: string }>
        applied.push(receiptsIn.map((row) => `${row.alvo}:${row.fonte}`))
      }
      return { ok: true, code: 0 }
    }
    const consumed = join(root, "consumed")
    assert.equal(await runReviewedLive(argsFor("live"), runner, consumed), 0)
    assert.deepEqual(applied, [["candidate:tse-financiamento", "safe:tse-financiamento"], ["safe:tse-historico"]],
      "financiamento aprovado passa; patrimônio sem decisão e histórico de outro município ficam fechados")
    assert.equal(JSON.parse(readFileSync(join(root, "live", "relatorio.json"), "utf8")).reviewed_shas.identity_cells, sha(cells))

    const reject = async (out: string, pattern: RegExp, options = argsFor(out)) =>
      assert.rejects(() => runReviewedLive(options, runner, join(root, `consumed-${out}`)), pattern)
    const reviewedCellsSha = sha(cells)
    writeFileSync(cells, cellsBytes.replace("260000000001", "260000000009"))
    await reject("cells-tampered", /SHA-256 de decisões de identidade por célula diverge/, { ...argsFor("cells-tampered"), expectedIdentityCellsSha: reviewedCellsSha })
    await reject("cells-other-sha", /SHA-256 das decisões de identidade por célula diverge do relatório/)
    writeFileSync(cells, cellsBytes)
    await reject("cells-missing", /exige --identity-cells/, { ...argsFor("cells-missing"), identityCells: null, expectedIdentityCellsSha: null })
    writeFileSync(evidence, evidenceBytes.replace(/"sq":"260000000001"/, "\"sq\":\"260000000009\""))
    writeFileSync(report, JSON.stringify({ ...reportBody, identity_cells: { sha256: sha(cells), evidence_sha256: sha(evidence) } }))
    await reject("anchor-forged", /âncora 2026 da evidência diverge do seed fixado/)
    writeFileSync(evidence, evidenceBytes)
    writeFileSync(report, JSON.stringify(reportBody))
    writeFileSync(plan, JSON.stringify({ ...planBody, identity_released_cells: ["candidate|financiamento", "candidate|historico_politico"] }))
    await reject("plan-overclaims", /células liberadas do plano divergem/)
    const injected = [...acoes, { slug: "candidate", tipo: "inserir_patrimonio" }]
    const injectedSha = createHash("sha256").update(stableJson(injected)).digest("hex")
    writeFileSync(plan, JSON.stringify({ ...planBody, acoes: injected, plano_sha256: injectedSha }))
    await reject("closed-family-action", /gate de identidade/, { ...argsFor("closed-family-action"), expectedPlanSha: injectedSha })
  } finally { rmSync(root, { recursive: true, force: true }) }
})
