import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  runRecalcFinanciamentoMaioresDoadores,
  type RecalcFinanciamentoRow,
} from "../scripts/recalc-financiamento-maiores-doadores"

function createRows(): RecalcFinanciamentoRow[] {
  return [
    {
      id: "fin-1",
      candidato_id: "cand-1",
      ano_eleicao: 2022,
      maiores_doadores: [
        { nome: "Fulano", valor: 10, tipo: "PJ", cpf_hash: "hash-1" },
        { nome: "FULANO", valor: 20, tipo: "PJ", cpf_hash: "hash-1" },
      ],
    },
    {
      id: "fin-2",
      candidato_id: "cand-2",
      ano_eleicao: 2022,
      maiores_doadores: [{ nome: "Empresa X", valor: 30, tipo: "PJ", cnpj: "12345678000190" }],
    },
    {
      id: "fin-3",
      candidato_id: "cand-3",
      ano_eleicao: 2022,
      maiores_doadores: null,
    },
  ]
}

describe("recalc-financiamento-maiores-doadores", () => {
  it("smoke: dry-run pages fixture rows and reports changed, unchanged and skipped counts", async () => {
    const rows = createRows()
    const logs: string[] = []
    const updates: Array<{ id: string; maiores_doadores: unknown }> = []

    const result = await runRecalcFinanciamentoMaioresDoadores({
      apply: false,
      pageSize: 2,
      async fetchPage(from, to) {
        return rows.slice(from, to + 1)
      },
      async updateRow(id, maiores_doadores) {
        updates.push({ id, maiores_doadores })
      },
      log(message) {
        logs.push(message)
      },
      error(message) {
        throw new Error(`unexpected error log: ${message}`)
      },
    })

    assert.deepEqual(result, {
      changed: 1,
      unchanged: 1,
      skipped: 1,
      updated: 0,
      errors: 0,
    })
    assert.equal(updates.length, 0)
    assert.match(logs[0] ?? "", /\[dry-run] fin-1 candidato=cand-1 ano=2022: 2 -> 1 doadores/)
    assert.match(logs.at(-1) ?? "", /Dry-run\. Nenhuma escrita aplicada\./)
  })
})
