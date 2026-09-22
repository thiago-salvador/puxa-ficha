import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { gerarPlanoBuscaFalas, type CandidatoPlanoBusca, type PlanoBuscaFalas } from "../scripts/lib/falas-plano-busca"
import {
  gerarPlanoEconomicoFalas,
  DEFAULT_CANDIDATOS_POR_LOTE_ECONOMICO,
  MAX_CANDIDATOS_POR_LOTE_ECONOMICO,
  TERMOS_BUSCA_ECONOMICA,
  validarPlanoEconomicoFalas,
} from "../scripts/lib/falas-plano-economico"

const now = new Date("2026-09-11T12:00:00Z")
const candidate = (id: string, slug: string, overrides: Partial<CandidatoPlanoBusca> = {}): CandidatoPlanoBusca => ({
  id, slug, nome_urna: "Ana Exemplo", nome_completo: "Ana Maria Exemplo", cargo_disputado: "Governador", estado: "SP", ...overrides,
})
const plan = (roster: readonly CandidatoPlanoBusca[]): PlanoBuscaFalas => gerarPlanoBuscaFalas({ mode: "primeira_carga", now, roster, maxQueriesPerCandidateStage: 0 })

describe("plano econômico de busca de falas", () => {
  it("cobre todos os candidatos, inclusive homônimos com IDs distintos, sem duplicar identidade", () => {
    const economic = gerarPlanoEconomicoFalas(plan([
      candidate("b", "ana-exemplo-2", { estado: "RJ", nome_urna: "Ana Exemplo" }),
      candidate("a", "ana-exemplo-1", { estado: "SP", nome_urna: "Ana Exemplo" }),
    ]))
    const entries = economic.batches.flatMap((batch) => batch.candidates)
    assert.deepEqual(entries.map((entry) => [entry.candidate_id, entry.candidate_slug]), [["b", "ana-exemplo-2"], ["a", "ana-exemplo-1"]])
    assert.equal(new Set(entries.map((entry) => `${entry.candidate_id}\u0000${entry.candidate_slug}`)).size, 2)
    assert.equal(economic.candidate_count, 2)
    assert.doesNotThrow(() => validarPlanoEconomicoFalas(economic))
  })

  it("particiona por UF e cargo em lotes de no máximo oito, com ordenação estável", () => {
    const roster = Array.from({ length: 17 }, (_, index) => candidate(String(index + 1).padStart(3, "0"), `candidato-${index + 1}`, { estado: index % 2 ? "RJ" : "SP" }))
    const economic = gerarPlanoEconomicoFalas(plan(roster))
    assert.equal(MAX_CANDIDATOS_POR_LOTE_ECONOMICO, 8)
    assert.ok(economic.batches.every((batch) => batch.candidates.length <= 8))
    assert.ok(economic.batches.every((batch) => batch.candidates.every((entry) => entry.uf === batch.uf && entry.office === batch.office)))
    assert.equal(economic.batch_size, DEFAULT_CANDIDATOS_POR_LOTE_ECONOMICO)
    assert.deepEqual(economic.batches.map((batch) => batch.candidates.length), [4, 4, 4, 4, 1])
  })

  it("emite consulta ampla individual com a mesma janela do plano e fallback Google", () => {
    const source = plan([candidate("a", "ana")])
    const economic = gerarPlanoEconomicoFalas(source)
    const entry = economic.batches[0].candidates[0]
    assert.equal(entry.queries.length, source.windows.length)
    for (const query of entry.queries) {
      const window = source.windows.find((item) => item.id === query.window)!
      assert.equal(query.window_start, window.start)
      assert.equal(query.window_end, window.end)
      assert.equal(query.after, window.after)
      assert.equal(query.before, window.before)
      for (const term of TERMOS_BUSCA_ECONOMICA) assert.ok(query.query.includes(term), term)
      assert.equal(query.google_query, query.query)
    }
    const prompt = economic.batches[0].perplexity_prompt
    assert.match(prompt, /\[1\]/)
    assert.match(prompt, /id=a/)
    assert.match(prompt, /slug=ana/)
    assert.match(prompt, /resposta coletiva/i)
    assert.match(prompt, /result=found\|empty\|no_results/)
    assert.match(prompt, /status=executed\|no_results\|blocked/)
    assert.match(prompt, /response_excerpt/)
    assert.match(prompt, /evidence_ref/)
    assert.deepEqual(economic.response_contract.required_fields, ["id", "slug", "status", "result", "response_excerpt", "evidence_ref", "provider", "source_id"])
    assert.deepEqual(economic.response_contract.provider_values, ["google", "perplexity"])
    assert.match(economic.capture_policy.truncated_or_missing_response, /resposta completa/)
    assert.match(economic.capture_policy.unseen_ids, /nunca contam/)
    assert.match(economic.response_contract.blocked_representation, /nunca converta/)
  })

  it("rejeita lote inválido acima do teto", () => {
    assert.throws(() => gerarPlanoEconomicoFalas(plan([candidate("a", "ana")]), { batchSize: 9 }), /entre 1 e 8/)
    assert.throws(() => gerarPlanoEconomicoFalas(plan([candidate("a", "ana")]), { batchSize: 0 }), /entre 1 e 8/)
  })

  it("preserva o candidato recorrente mesmo quando o plano completo já tem citação", () => {
    const source = gerarPlanoBuscaFalas({ mode: "recorrente", now, roster: [candidate("a", "ana")], catalog: { quotes: [{ candidate_id: "a", candidate_slug: "ana" }] }, maxQueriesPerCandidateStage: 0 })
    const economic = gerarPlanoEconomicoFalas(source)
    assert.equal(economic.candidate_count, 1)
    assert.equal(economic.batches[0].candidates[0].candidate_id, "a")
  })

  it("aceita roster vazio com plano econômico vazio", () => {
    const economic = gerarPlanoEconomicoFalas(plan([]))
    assert.equal(economic.candidate_count, 0)
    assert.deepEqual(economic.batches, [])
    assert.doesNotThrow(() => validarPlanoEconomicoFalas(economic))
  })
})
