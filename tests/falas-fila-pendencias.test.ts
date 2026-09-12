import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  gerarFilaPendenciasEconomica,
  type CatalogInput,
  type ConsolidatedSearchesInput,
  type GerarFilaPendenciasEconomicaInput,
  type PendenciasEconomicasInput,
  type PendenciasReceiptsInput,
  type RosterCandidate,
} from "../scripts/falas-fila-pendencias"

const roster: RosterCandidate[] = [
  { id: "1", slug: "ana" },
  { id: "2", slug: "bia" },
  { id: "3", slug: "caio" },
  { id: "4", slug: "duda" },
]
const task = (candidate_slug: string, queries: string[], kind: "date_anchor" | "source_discovery" = "date_anchor") => ({
  candidate_slug, kind, next_check: "checar uma fonte", queries, blocked_routes: ["rota bloqueada"], evidence_paths: ["research/prova.json"],
})
const base = (tasks: PendenciasEconomicasInput["tasks"], catalog: CatalogInput = { quotes: [] }, consolidated: ConsolidatedSearchesInput = { schema_version: "falas-pesquisa-consolidada-v1", candidates: [] }, receipts?: PendenciasReceiptsInput): GerarFilaPendenciasEconomicaInput => ({
  pending: { schema_version: "falas-pendencias-economicas-v1", tasks }, roster, catalog, consolidated, receipts,
})

describe("fila econômica de pendências de falas", () => {
  it("omite candidato já coberto no catálogo", () => {
    const fila = gerarFilaPendenciasEconomica(base([task("ana", ["consulta ana"]), task("bia", ["consulta bia"])], { quotes: [{ candidate_id: "1", candidate_slug: "ana" }] }))
    assert.deepEqual(fila.candidates.map((item) => item.candidate_slug), ["bia"])
  })

  it("não aceita cobertura por slug sem identidade completa", () => {
    for (const quote of [{ candidate_slug: "ana" }, { candidate_id: "outra", candidate_slug: "ana" }]) {
      assert.equal(gerarFilaPendenciasEconomica(base([task("ana", [])], { quotes: [quote] })).candidates.length, 1)
    }
    assert.throws(() => gerarFilaPendenciasEconomica({ ...base([task("ana", [])]), roster: [{ slug: "ana" }] as RosterCandidate[] }), /ID do roster/)
  })

  it("deduplica histórico executado e consultas entre candidatos", () => {
    const fila = gerarFilaPendenciasEconomica(base(
      [task("ana", ["consulta já feita", "consulta compartilhada"]), task("bia", ["consulta compartilhada", "consulta nova"])],
      undefined,
      { schema_version: "falas-pesquisa-consolidada-v1", candidates: [{ slug: "ana", queries: ["consulta já feita"] }] },
    ))
    assert.deepEqual(fila.candidates[0].queries_ja_executadas, ["consulta já feita"])
    assert.deepEqual(fila.candidates[0].queries_novas, ["consulta compartilhada"])
    assert.deepEqual(fila.candidates[1].queries_novas, ["consulta nova"])
  })

  it("limita a duas consultas novas por candidato", () => {
    const fila = gerarFilaPendenciasEconomica(base([task("ana", ["um", "dois", "três"])]))
    assert.deepEqual(fila.candidates[0].queries_novas, ["um", "dois"])
  })

  it("preserva tarefa aberta sem consulta e não transforma ausência em inexistência", () => {
    const fila = gerarFilaPendenciasEconomica(base([task("ana", [])]))
    assert.deepEqual(fila.candidates[0], {
      candidate_slug: "ana",
      tarefa: { kind: "date_anchor", next_check: "checar uma fonte", blocked_routes: ["rota bloqueada"], evidence_paths: ["research/prova.json"] },
      queries_novas: [], queries_ja_executadas: [], status: "aberto",
    })
  })

  it("usa apenas recibos executados na segunda rodada", () => {
    const receipts: PendenciasReceiptsInput = {
      schema_version: "falas-pendencias-recibos-v1",
      attempts: [
        { query: "executada", attempt_status: "executed", candidate_slugs: ["ana"], outcome: "ok" },
        { query: "planejada", attempt_status: "planned", candidate_slugs: ["ana"], outcome: "pendente" },
        { query: "bloqueada", attempt_status: "blocked", candidate_slugs: ["ana"], outcome: "erro" },
      ],
    }
    const fila = gerarFilaPendenciasEconomica(base([task("ana", ["executada", "planejada", "bloqueada"]), task("bia", ["executada", "outra"])], undefined, undefined, receipts))
    assert.deepEqual(fila.candidates[0].queries_ja_executadas, ["executada"])
    assert.deepEqual(fila.candidates[0].queries_novas, ["planejada", "bloqueada"])
    assert.deepEqual(fila.candidates[1].queries_novas, ["outra"])
  })

  it("falha claro para roster ausente, tarefa desconhecida e schema histórico inválido", () => {
    assert.throws(() => gerarFilaPendenciasEconomica({ ...base([task("ausente", [])]), roster: [] }), /Roster ausente ou vazio/)
    assert.throws(() => gerarFilaPendenciasEconomica(base([task("ausente", [])])), /ausente no roster/)
    assert.throws(() => gerarFilaPendenciasEconomica(base([task("ana", []), task("ana", ["nova"])])), /Mais de uma tarefa/)
    assert.throws(() => gerarFilaPendenciasEconomica(base([task("ana", [])], undefined, { schema_version: "outro", candidates: [] } as never)), /Histórico consolidado/)
  })
})
