import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  calcularJanelasBusca,
  gerarPlanoBuscaFalas,
  FONTES_NACIONAIS_APROVADAS,
  FONTES_REGIONAIS_POR_UF,
  validarPlanoBuscaFalas,
  type CandidatoPlanoBusca,
} from "../scripts/lib/falas-plano-busca"

const now = new Date("2026-09-11T12:00:00Z")
const candidate = (id: string, slug: string, overrides: Partial<CandidatoPlanoBusca> = {}): CandidatoPlanoBusca => ({
  id, slug, nome_urna: "Ana Exemplo", nome_completo: "Ana Maria Exemplo", cargo_disputado: "Governador", estado: "SP", ...overrides,
})
const proof = { source_url: "https://example.com/prova", excerpt: "Ana Exemplo também é conhecida como Ana Popular" }

describe("plano determinístico de busca de falas", () => {
  it("calcula primeira carga inclusiva e recorrente somente em 14 dias", () => {
    const first = calcularJanelasBusca(now, "primeira_carga")
    assert.deepEqual(first.map((window) => [window.id, window.start, window.end, window.after, window.before]), [
      ["14d", "2026-08-29", "2026-09-11", "2026-08-28", "2026-09-12"],
      ["campanha", "2026-08-16", "2026-09-11", "2026-08-15", "2026-09-12"],
    ])
    assert.deepEqual(calcularJanelasBusca(now, "recorrente").map((window) => window.id), ["14d"])
  })

  it("limita a recorrência no início da campanha e oferece termos alternativos", () => {
    assert.equal(calcularJanelasBusca(new Date("2026-08-20T12:00:00Z"), "recorrente")[0].start, "2026-08-16")
    const plan = gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster: [candidate("a", "ana")] })
    assert.ok(plan.candidates[0].queries.every(q => q.window_start >= "2026-08-16"))
    const terms = plan.candidates[0].queries.filter(q => q.stage === "programas_e_atribuicao").map(q => q.query).join(" ")
    for (const term of ["rádio", "TV", "podcast", "disse à", "afirmou à", "Roda Viva", "Bom Dia", "coletiva"]) assert.ok(terms.includes(term), term)
  })

  it("usa aliases somente com prova e mantém a prova serializável", () => {
    const plan = gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster: [candidate("a", "ana", {
      aliases: [{ alias: "Ana Popular", proof }, { alias: "Alias Sem Prova" } as never],
    })], maxQueriesPerCandidateStage: 100 })
    const item = plan.candidates[0]
    assert.deepEqual(item.aliases.map((alias) => alias.alias), ["Ana Popular"])
    assert.deepEqual(item.rejected_aliases.map((alias) => alias.alias), ["Alias Sem Prova"])
    assert.equal(item.queries.some((query) => query.query.includes("Alias Sem Prova")), false)
    assert.doesNotThrow(() => JSON.stringify(plan))
  })

  it("preserva todos os IDs e slugs no backfill mesmo com limite por etapa e deduplica consultas", () => {
    const roster = [candidate("b", "bia", { nome_urna: "Bia Exemplo", nome_completo: "Bia Exemplo Completo", estado: "RJ" }), candidate("a", "ana")]
    const plan = gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster, maxQueriesPerCandidateStage: 1, maxQueriesTotal: 1 })
    assert.deepEqual(plan.candidates.map((item) => [item.candidate_id, item.candidate_slug]), [["a", "ana"], ["b", "bia"]])
    assert.equal(plan.candidates.length, 2)
    assert.equal(new Set(plan.candidates.flatMap((item) => item.queries.map((query) => query.query))).size, plan.candidates.flatMap((item) => item.queries).length)
    assert.equal(plan.candidates.flatMap((item) => item.queries).length, 1)
    assert.equal(plan.candidates.every((item) => item.candidate_id && item.candidate_slug), true)
    assert.doesNotThrow(() => validarPlanoBuscaFalas(plan))
  })

  it("fila apenas lacunas no backfill e todos no recorrente", () => {
    const roster = [candidate("a", "ana"), candidate("b", "bia", { nome_urna: "Bia Exemplo", nome_completo: "Bia Maria Exemplo" })]
    const catalog = { quotes: [{ candidate_id: "a", candidate_slug: "ana" }] }
    const backfill = gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster, catalog, maxQueriesPerCandidateStage: 0 })
    assert.deepEqual(backfill.candidates.map((item) => item.candidate_id), ["b"])
    assert.equal(backfill.candidates[0].queue, "backfill_missing_quote")
    const recurring = gerarPlanoBuscaFalas({ mode: "recorrente", now, roster, catalog, maxQueriesPerCandidateStage: 0 })
    assert.deepEqual(recurring.candidates.map((item) => item.candidate_id), ["a", "b"])
    assert.equal(recurring.candidates.every((item) => item.queue === "recurring_all"), true)
  })

  it("separa tipos de evento, cargo, UF e fallback sem cargo, com região aprovada e ano por último", () => {
    const plan = gerarPlanoBuscaFalas({ mode: "recorrente", now, roster: [candidate("a", "ana")], regionalSources: [{ id: "regional", origin: "https://regional.example" }], maxQueriesPerCandidateStage: 100 })
    const queries = plan.candidates[0].queries
    const first = queries.filter((query) => query.stage === "nome_evento_cargo_uf")
    assert.deepEqual([...new Set(first.map((query) => query.event_type))], ["debate", "entrevista", "sabatina"])
    assert.equal(first.every((query) => query.query.includes("governador") && query.query.includes("SP")), true)
    assert.equal(queries.some((query) => query.stage === "nome_evento_sem_cargo" && !query.query.includes("governador") && query.query.includes("SP")), true)
    assert.equal(queries.some((query) => query.stage === "fonte_regional_aprovada" && query.query.includes("site:regional.example")), true)
    const lastStage = queries.at(-1)!
    assert.equal(lastStage.stage, "ano_estado")
    assert.match(lastStage.query, /"Ana (?:Maria )?Exemplo" (?:debate|entrevista|sabatina) 2026 São Paulo/)
  })

  it("seleciona somente fontes explicitamente mapeadas à UF e fontes nacionais para BR", () => {
    assert.ok(FONTES_REGIONAIS_POR_UF.AM.some((origin) => origin.includes("acritica")))
    assert.equal(FONTES_REGIONAIS_POR_UF.AM.some((origin) => origin.includes("diariodonordeste")), false)
    const amazon = gerarPlanoBuscaFalas({ mode: "recorrente", now, roster: [candidate("am", "am", { estado: "AM" })] })
    assert.equal(amazon.candidates[0].queries.filter((query) => query.stage === "fonte_regional_aprovada").every((query) => FONTES_REGIONAIS_POR_UF.AM.includes(query.source_origin!)), true)
    const brazil = gerarPlanoBuscaFalas({ mode: "recorrente", now, roster: [candidate("br", "br", { cargo_disputado: "Presidente", estado: null })] })
    assert.equal(brazil.candidates[0].queries.filter((query) => query.stage === "fonte_regional_aprovada").every((query) => FONTES_NACIONAIS_APROVADAS.includes(query.source_origin!)), true)
  })

  it("distribui o teto padrão entre as janelas sem buscar antes da campanha", () => {
    const plan = gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster: [candidate("a", "ana")] })
    const stage = plan.candidates[0].queries.filter((query) => query.stage === "nome_evento_cargo_uf")
    assert.equal(stage.length, 12)
    assert.deepEqual([...new Set(stage.map((query) => query.window))], ["14d", "campanha"])
    const firstWindow = plan.candidates[0].queries.filter((query) => query.window === "14d")
    assert.equal(firstWindow.every((query, index) => index === 0 || query.stage_order >= firstWindow[index - 1].stage_order), true)
    assert.equal(plan.candidates[0].queries.findIndex((query) => query.window === "campanha") > plan.candidates[0].queries.findIndex((query) => query.window === "14d"), true)
  })

  it("visita as seis fontes do RN antes de repetir variantes na mesma fonte", () => {
    const plan = gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster: [candidate("rn", "rn", { estado: "RN" })] })
    for (const window of plan.windows) {
      const regional = plan.candidates[0].queries.filter((query) => query.stage === "fonte_regional_aprovada" && query.window === window.id)
      assert.deepEqual([...new Set(regional.map((query) => query.source_origin))].sort(), [...FONTES_REGIONAIS_POR_UF.RN].sort())
      assert.equal(new Set(regional.map((query) => query.event_type)).size, 3)
    }
  })

  it("mantém os três tipos de evento no fallback regional de cada janela com uma fonte", () => {
    const plan = gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster: [candidate("am", "am", { estado: "AM" })], regionalSources: [{ id: "regional", origin: "https://regional.example" }] })
    const regional = plan.candidates[0].queries.filter((query) => query.stage === "fonte_regional_aprovada")
    for (const window of plan.windows) assert.deepEqual([...new Set(regional.filter((query) => query.window === window.id).map((query) => query.event_type))].sort(), ["debate", "entrevista", "sabatina"])
  })
})
