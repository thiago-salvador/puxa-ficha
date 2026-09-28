import assert from "node:assert/strict"
import test from "node:test"
import { buildHistoryPlan, classifyHistoryTarget } from "../scripts/audit/plan-historico-politico-escrita-local"

const cell = (slug: string, category: string) => ({ slug, family: "historico_politico", category })
const source = (overrides: Record<string, string> = {}) => ({
  SQ_CANDIDATO: "123", ANO_ELEICAO: "2022", SG_UF: "SP", DS_CARGO: "Deputado Federal",
  SG_PARTIDO: "ABC", DS_SITUACAO_CANDIDATURA: "DEFERIDO", DS_SIT_TOT_TURNO: "ELEITO POR MÉDIA",
  NR_TURNO: "1", ...overrides,
})

test("historical planner routes identity and rule overlaps to review", () => {
  assert.deepEqual(classifyHistoryTarget("identity", [cell("identity", "identity_review")], []), {
    slug: "identity", classification: "b", reason: "identidade_em_revisao",
  })
  assert.deepEqual(classifyHistoryTarget("rule", [cell("rule", "stale_not_projected")], [
    { slug: "rule", tipo: "linha_diverge" },
  ]), {
    slug: "rule", classification: "c", reason: "regra_ou_vinculo_historico_em_revisao:linha_diverge",
  })
})

test("safe action carries both official status fields, checks preimage, and preserves manual rows", () => {
  const plan = buildHistoryPlan({
    sourceComplete: true,
    candidates: [{ slug: "safe", id: "candidate-id", ids: { tse_sq_candidato: { "2022": "123" } } }],
    profiles: [{ slug: "safe", id: "candidate-id", historico: [
      { tipo_evento: "CANDIDATURA", proveniencia: "TSE", cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", periodo_inicio: 2018, periodo_fim: 2018, partido: "ABC", estado: "SP", eleito_por: false, observacoes: "old" },
      { tipo_evento: "CANDIDATURA", proveniencia: "TSE", cargo: "Deputado Federal", cargo_canonico: "Deputado Federal", periodo_inicio: 2022, periodo_fim: 2022, partido: "ABC", estado: "SP", eleito_por: false, observacoes: "stale" },
      { tipo_evento: "CANDIDATURA", proveniencia: "manual", observacoes: "manual row" },
    ] }],
    cells: [cell("safe", "stale_not_projected"), cell("identity", "identity_review")],
    reviewItems: [],
    assets: [{ family: "historico_politico", year: 2022, path: "/unused", url: "https://cdn.tse.jus.br/test.zip", sha256: "a".repeat(64) }],
    rowsByYear: new Map([[2022, [source()]]]),
  })
  assert.equal(plan.actions.length, 1)
  assert.equal(plan.review.length, 1)
  assert.equal(plan.review[0]?.classification, "b")
  const action = plan.actions[0]!
  assert.equal(action.antes_publico.length, 1)
  assert.equal(action.antes_publico[0]?.periodo_inicio, 2022)
  assert.match(action.antes_sha256, /^[a-f0-9]{64}$/)
  assert.match(String(action.depois[0]?.observacoes), /Situação do registro: DEFERIDO/)
  assert.match(String(action.depois[0]?.observacoes), /Resultado eleitoral: ELEITO POR MÉDIA/)
  assert.equal(action.depois[0]?.eleito_por, "ELEITO POR MÉDIA")
  assert.equal(action.source_complete, true)
})

test("historical planner withholds replacement without complete official source proof", () => {
  const plan = buildHistoryPlan({
    candidates: [{ slug: "safe", id: "candidate-id", ids: { tse_sq_candidato: { "2022": "123" } } }],
    profiles: [{ slug: "safe", id: "candidate-id", historico: [] }],
    cells: [cell("safe", "stale_not_projected")], reviewItems: [],
    assets: [{ family: "historico_politico", year: 2022, path: "/unused", url: "https://cdn.tse.jus.br/test.zip", sha256: "a".repeat(64) }],
    rowsByYear: new Map([[2022, [source()]]]),
  })
  assert.equal(plan.actions.length, 0)
  assert.equal(plan.review[0]?.reason, "pacote_oficial_completo_nao_comprovado")
})

test("ambiguous UF or same-turn display rows are withheld", () => {
  const plan = buildHistoryPlan({
    candidates: [{ slug: "ambiguous", ids: { tse_sq_candidato: { "2022": "123" } } }],
    profiles: [{ slug: "ambiguous", id: "id", historico: [] }],
    cells: [cell("ambiguous", "stale_not_projected")], reviewItems: [],
    assets: [{ family: "historico_politico", year: 2022, path: "", url: "https://cdn.tse.jus.br/a", sha256: "a".repeat(64) }],
    rowsByYear: new Map([[2022, [source(), source({ SG_UF: "RJ" })]]]),
  })
  assert.equal(plan.actions.length, 0)
  assert.equal(plan.review[0]?.classification, "c")
  assert.match(plan.review[0]?.reason ?? "", /uf_ausente_ou_ambigua/)
})
