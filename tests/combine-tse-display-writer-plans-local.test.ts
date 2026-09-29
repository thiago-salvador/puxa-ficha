import assert from "node:assert/strict"
import test from "node:test"
import { combineSafeDisplayPlans, finance2026ActionsFromCombined } from "../scripts/audit/combine-tse-display-writer-plans-local"

test("extrai do combinado anterior apenas ações financeiras de 2026 para reprojeção", () => {
  const actions = [
    { tipo: "atualizar_financiamento", slug: "a" },
    { tipo: "substituir_financiamento", slug: "a", ano_eleicao: 2022 },
    { tipo: "substituir_historico", slug: "a" },
  ]
  assert.deepEqual(finance2026ActionsFromCombined(actions), [actions[0]])
})

test("plano combinado rejeita risco de identidade em qualquer família", () => {
  const classification = { cells: [
    { slug: "a", family: "financiamento", category: "stale_not_projected" },
    { slug: "a", family: "historico_politico", category: "identity_review" },
  ] }
  assert.throws(() => combineSafeDisplayPlans(classification, [
    { family: "financiamento", acoes: [{ tipo: "atualizar_financiamento", slug: "a" }], sha256: "digest" },
  ]), /fora da classe/)
})

test("plano combinado aceita somente ação da família classificada como segura", () => {
  const classification = { cells: [{ slug: "a", family: "patrimonio", category: "stale_not_projected" }] }
  const valid = combineSafeDisplayPlans(classification, [{ family: "patrimonio", acoes: [{ tipo: "substituir_patrimonio", slug: "a", ano_eleicao: 2022, source_complete: true }], sha256: "digest" }])
  assert.equal(valid.acoes.length, 1)
  assert.throws(() => combineSafeDisplayPlans(classification, [{ family: "patrimonio", acoes: [{ tipo: "substituir_historico", slug: "a" }], sha256: "digest" }]), /fora da classe/)
})

test("soma planos financeiros atual e histórico sem perder ações", () => {
  const classification = { cells: [{ slug: "a", family: "financiamento", category: "stale_not_projected" }] }
  const result = combineSafeDisplayPlans(classification, [
    { family: "financiamento", acoes: [{ tipo: "atualizar_financiamento", slug: "a", ano_eleicao: 2026 }], sha256: "atual" },
    { family: "financiamento", acoes: [{ tipo: "substituir_financiamento", slug: "a", ano_eleicao: 2022, source_complete: true }], sha256: "historico" },
  ])
  assert.equal(result.acoes.length, 2)
  assert.equal(result.summary.financiamento, 2)
  assert.equal(result.inputs.length, 2)
})

test("historical replacement actions require a complete official source list", () => {
  const cases = [
    { family: "financiamento" as const, tipo: "substituir_financiamento" },
    { family: "patrimonio" as const, tipo: "substituir_patrimonio" },
    { family: "historico_politico" as const, tipo: "substituir_historico" },
  ]
  for (const { family, tipo } of cases) {
    const classification = { cells: [{ slug: "a", family, category: "stale_not_projected" }] }
    assert.throws(() => combineSafeDisplayPlans(classification, [{ family, acoes: [{ tipo, slug: "a", source_complete: false }], sha256: "digest" }]), /fora da classe/)
    assert.equal(combineSafeDisplayPlans(classification, [{ family, acoes: [{ tipo, slug: "a", source_complete: true }], sha256: "digest" }]).acoes.length, 1)
  }
})
