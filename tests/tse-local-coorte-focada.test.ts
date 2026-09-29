import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  evaluateFinanceGates,
  parseCliOptions,
  reviewedFinanceCeiling,
  runReviewedLive,
  type FinanceGate,
} from "../scripts/tse-local/ingest-tse-local"
import { MAX_FICHAS_COORTE_FOCADA, stableJson } from "../scripts/lib/tse-2026-financas-plano"

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")

const acao = (slug: string) => ({ slug, tipo: "atualizar_financiamento", antes: { total_arrecadado: 100 }, depois: { total_arrecadado: 120 } })

test("--max-fichas-alteradas só entra no live e como inteiro não negativo", () => {
  assert.throws(() => parseCliOptions(["--dry-run", "--max-fichas-alteradas=3"]), /só no --live/)
  const live = ["--live", "--reviewed-run-dir=/tmp/x", "--recibos=/tmp/r", ...["plan", "plan-file", "report", "family", "history", "cohort", "projection"]
    .map((name) => `--expected-${name}-sha=${"a".repeat(64)}`)]
  assert.throws(() => parseCliOptions([...live, "--max-fichas-alteradas=-1"]), /inteiro não negativo/)
  assert.throws(() => parseCliOptions([...live, "--max-fichas-alteradas=3.5"]), /inteiro não negativo/)
  assert.equal(parseCliOptions([...live, "--max-fichas-alteradas=32"]).maxFichasAlteradas, 32)
  assert.equal(parseCliOptions(live).maxFichasAlteradas, null)
})

test("teto revisado: coorte focada exige o número exato do plano; fora dela o teto é recusado", () => {
  const focused: FinanceGate = { focused_cohort: true, fichas_alteradas: 32, teto_explicito: 32, falhas: [] }
  assert.equal(reviewedFinanceCeiling(focused, 32, 48, 32), 32)
  assert.throws(() => reviewedFinanceCeiling(focused, 32, 48, null), /exige --max-fichas-alteradas igual/)
  assert.throws(() => reviewedFinanceCeiling(focused, 32, 48, 33), /exige --max-fichas-alteradas igual/)
  assert.throws(() => reviewedFinanceCeiling({ ...focused, teto_explicito: 31 }, 32, 48, 32), /exige --max-fichas-alteradas igual/)
  assert.throws(() => reviewedFinanceCeiling({ ...focused, fichas_alteradas: 31 }, 32, 48, 32), /divergem do plano revisado/)
  assert.throws(() => reviewedFinanceCeiling(focused, 32, MAX_FICHAS_COORTE_FOCADA + 1, 32), /acima do teto de 100/)
  assert.throws(() => reviewedFinanceCeiling({ ...focused, falhas: ["plano altera 32/48 fichas"] }, 32, 48, 32), /travas do writer reprovaram/)
  assert.throws(() => reviewedFinanceCeiling({ ...focused, falhas: null }, 32, 48, 32), /sem avaliação das travas/)
  assert.throws(() => reviewedFinanceCeiling(null, 32, 48, 32), /sem avaliação das travas/)
  const unfocused: FinanceGate = { focused_cohort: false, fichas_alteradas: 10, teto_explicito: null, falhas: [] }
  assert.equal(reviewedFinanceCeiling(unfocused, 10, 512, null), null)
  assert.throws(() => reviewedFinanceCeiling(unfocused, 10, 512, 10), /só vale para coorte focada/)
})

test("dry-run avalia as travas no writer com a coorte e o teto que o live vai usar", () => {
  const root = mkdtempSync(join(tmpdir(), "pf-finance-gates-"))
  try {
    const plan = join(root, "plano-privado.json")
    const acoes = [acao("a"), acao("b")]
    const planSha = createHash("sha256").update(stableJson(acoes)).digest("hex")
    writeFileSync(plan, JSON.stringify({ plano_sha256: planSha, acoes }))
    const calls: Array<{ args: string[]; env?: NodeJS.ProcessEnv }> = []
    const writerAnswers = (falhas: string[], writtenSha = planSha) => (script: string, args: string[], env?: NodeJS.ProcessEnv) => {
      assert.ok(script.endsWith("tse-2026-financas.ts"))
      calls.push({ args, env })
      writeFileSync(join(root, "travas.json"), JSON.stringify({ plano_sha256: writtenSha, falhas }))
      return falhas.length ? { ok: false, code: 2, reason: "travas do writer reprovaram" } : { ok: true, code: 0 }
    }
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PF_TSE_COHORT_PROFILES: join(root, "coorte-perfis.json") }
    const focused = evaluateFinanceGates(root, plan, true, env, writerAnswers([]))
    assert.deepEqual(focused.gate, { focused_cohort: true, fichas_alteradas: 2, teto_explicito: 2, falhas: [] })
    assert.equal(focused.step.ok, true)
    assert.ok(calls[0]!.args.includes("--avaliar-travas"))
    assert.ok(calls[0]!.args.includes("--max-fichas-alteradas=2"))
    assert.ok(calls[0]!.args.includes(`--expected-plan-file-sha=${sha(plan)}`))
    assert.equal(calls[0]!.args.includes("--apply"), false, "a avaliação do dry-run nunca aplica")
    assert.equal(calls[0]!.env?.PF_TSE_COHORT_PROFILES, env.PF_TSE_COHORT_PROFILES)
    assert.equal(reviewedFinanceCeiling(focused.gate, 2, 2, 2), 2, "o que o dry-run grava é o que o live aceita")

    const unfocused = evaluateFinanceGates(root, plan, false, env, writerAnswers(["plano altera 30/40 fichas, acima do limite de 50%"]))
    assert.equal(calls[1]!.args.some((arg) => arg.startsWith("--max-fichas-alteradas")), false)
    assert.deepEqual(unfocused.gate.falhas, ["plano altera 30/40 fichas, acima do limite de 50%"])
    assert.equal(unfocused.step.ok, false)
    assert.throws(() => reviewedFinanceCeiling(unfocused.gate, 2, 40, null), /travas do writer reprovaram/)

    const stale = evaluateFinanceGates(root, plan, true, env, writerAnswers([], "f".repeat(64)))
    assert.equal(stale.gate.falhas, null, "travas.json de outro plano não conta como avaliação")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("live de coorte focada passa a coorte fixada e o teto ao writer; sem teto certo, para antes de consumir o plano", async () => {
  const root = mkdtempSync(join(tmpdir(), "pf-reviewed-live-focused-"))
  try {
    const reviewed = join(root, "reviewed")
    mkdirSync(join(reviewed, "financas"), { recursive: true })
    const profiles = [
      { id: "00000000-0000-4000-8000-000000000001", slug: "a" },
      { id: "00000000-0000-4000-8000-000000000002", slug: "b" },
    ]
    const p = (name: string) => join(reviewed, name)
    writeFileSync(p("coorte-perfis.json"), JSON.stringify(profiles))
    writeFileSync(p("recibos-familias-aplicaveis.json"), JSON.stringify({ receipts: [] }))
    writeFileSync(p("historico-recibos.json"), JSON.stringify({ receipts: [] }))
    writeFileSync(p("recibos-familias-projecao.json"), JSON.stringify({ receipts: [] }))
    writeFileSync(p("historico-revisao.json"), JSON.stringify({ itens: [] }))
    writeFileSync(p("coorte-candidatos.json"), JSON.stringify([]))
    writeFileSync(p("recibos-familias-tse.json"), JSON.stringify({ diagnostics: [] }))
    const acoes = [acao("a"), acao("b")]
    const planSha = createHash("sha256").update(stableJson(acoes)).digest("hex")
    const plan = p("financas/plano-privado.json")
    writeFileSync(plan, JSON.stringify({ plano_sha256: planSha, acoes, revisao: [], recibos: [], resumo: {}, resumo_por_perfil: {}, identity_risk_slugs: [] }))
    const reportBody = { generated_at: new Date().toISOString(), mode: "dry-run", historical_scope_complete: true, assets_reused_from_verified_cache: [], identity_reviewed_sha256: null,
      identity_risk_source_shas: { history_review: sha(p("historico-revisao.json")), candidates: sha(p("coorte-candidatos.json")), family_receipts: sha(p("recibos-familias-tse.json")) },
      sources: { consulta_cand: { requested: 16, fresh_certifiable: 16, errors: [] }, bem_candidato_2026: { fresh_certifiable: true, errors: [] }, financiamento_2026: { fresh_certifiable: true, errors: [] } },
      steps: { history_review_receipts: { ok: true }, coverage_dry_run: { ok: true }, history_coverage_dry_run: { ok: true }, finance_planner: { ok: true },
        finance_gates: { ok: true }, apply_projection: { ok: true }, family_receipts: { ok: true }, identity_risk_actions_blocked: 0 },
      finance_gate: { focused_cohort: true, fichas_alteradas: 2, teto_explicito: 2, falhas: [] },
      cohort: { selected: 2 } }
    const report = p("relatorio.json")
    const receipts = join(root, "post-round.json")
    writeFileSync(receipts, "[]")
    const argsFor = (out: string, extra: string[] = []) => parseCliOptions(["--live", `--reviewed-run-dir=${reviewed}`, `--out-dir=${join(root, out)}`, `--recibos=${receipts}`,
      `--expected-plan-sha=${planSha}`, `--expected-plan-file-sha=${sha(plan)}`, `--expected-family-sha=${sha(p("recibos-familias-aplicaveis.json"))}`,
      `--expected-history-sha=${sha(p("historico-recibos.json"))}`, `--expected-report-sha=${sha(report)}`, `--expected-cohort-sha=${sha(p("coorte-perfis.json"))}`,
      `--expected-projection-sha=${sha(p("recibos-familias-projecao.json"))}`, ...extra])
    const writerCalls: Array<{ args: string[]; env?: NodeJS.ProcessEnv }> = []
    const runner = (script: string, args: string[], env?: NodeJS.ProcessEnv) => {
      if (script.endsWith("tse-2026-financas.ts")) writerCalls.push({ args, env })
      if (script.endsWith("exportar-perfis-publicos.ts")) writeFileSync(args.find((arg) => arg.startsWith("--out="))!.slice(6), JSON.stringify(profiles))
      return { ok: true, code: 0 }
    }
    const refuse = async (out: string, body: unknown, extra: string[], pattern: RegExp) => {
      writeFileSync(report, JSON.stringify(body))
      const consumed = join(root, `consumed-${out}`)
      await assert.rejects(() => runReviewedLive(argsFor(out, extra), runner, consumed), pattern)
      assert.equal(existsSync(join(consumed, `${planSha}.json`)), false, `${out}: plano não pode ser consumido`)
    }
    await refuse("sem-teto", reportBody, [], /coorte focada exige --max-fichas-alteradas igual/)
    await refuse("teto-errado", reportBody, ["--max-fichas-alteradas=1"], /coorte focada exige --max-fichas-alteradas igual/)
    await refuse("travas-reprovadas", { ...reportBody, finance_gate: { ...reportBody.finance_gate, falhas: ["plano altera 2/2 fichas"] } }, ["--max-fichas-alteradas=2"], /travas do writer reprovaram/)
    await refuse("sem-avaliacao", { ...reportBody, finance_gate: undefined }, ["--max-fichas-alteradas=2"], /sem avaliação das travas/)
    await refuse("passo-reprovado", { ...reportBody, steps: { ...reportBody.steps, finance_gates: { ok: false } } }, ["--max-fichas-alteradas=2"], /gate do dry-run/)
    await refuse("nao-focada", { ...reportBody, finance_gate: { ...reportBody.finance_gate, focused_cohort: false, teto_explicito: null } }, ["--max-fichas-alteradas=2"], /só vale para coorte focada/)
    assert.equal(writerCalls.length, 0, "nenhuma recusa chega ao writer")

    writeFileSync(report, JSON.stringify(reportBody))
    const consumed = join(root, "consumed")
    assert.equal(await runReviewedLive(argsFor("live", ["--max-fichas-alteradas=2"]), runner, consumed), 0)
    assert.equal(writerCalls.length, 1)
    assert.ok(writerCalls[0]!.args.includes("--max-fichas-alteradas=2"))
    assert.ok(writerCalls[0]!.args.includes("--apply"))
    const pinnedCohort = join(realpathSync(join(root, "live")), "pinned", "coorte-perfis.json")
    assert.equal(writerCalls[0]!.env?.PF_TSE_COHORT_PROFILES, pinnedCohort, "writer lê a coorte fixada, não as fichas públicas inteiras")
    assert.equal(sha(pinnedCohort), sha(p("coorte-perfis.json")))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
