import assert from "node:assert/strict"
import test from "node:test"
import { assertViceStatusSourceCurrent, verifyViceStatusOfficialSource } from "../scripts/audit/verify-vice-status-official-source"

function fixture() {
  return { id: "230002553857", nomeUrna: "CLÉBIO GENUÍNO", ufCandidatura: "RR",
    eleicao: { id: "20322002026" }, cargo: { codigo: 3 }, partido: { sigla: "PCO" },
    vices: [{ sq_CANDIDATO: "230002554442", nm_URNA: "JOTA RODRIGUES", sg_PARTIDO: "PCO", situacaoVice: 3 }] }
}
test("aceita identidade e situação oficial da vice no domínio correto", () => {
  assert.doesNotThrow(() => assertViceStatusSourceCurrent(fixture()))
})
test("recusa fonte com vice ativa, duplicada ou identidade divergente", () => {
  for (const change of [
    (row: ReturnType<typeof fixture>) => { row.id = "999" },
    (row: ReturnType<typeof fixture>) => { row.ufCandidatura = "SP" },
    (row: ReturnType<typeof fixture>) => { row.vices[0].sq_CANDIDATO = "999" },
    (row: ReturnType<typeof fixture>) => { row.vices[0].nm_URNA = "OUTRO" },
    (row: ReturnType<typeof fixture>) => { row.vices[0].sg_PARTIDO = "OUTRO" },
    (row: ReturnType<typeof fixture>) => { row.vices[0].situacaoVice = 1 },
    (row: ReturnType<typeof fixture>) => { row.vices.push(structuredClone(row.vices[0])) },
  ]) {
    const row = fixture(); change(row)
    assert.throws(() => assertViceStatusSourceCurrent(row), /TSE:/)
  }
})
test("recusa documento diferente do recibo revisado, mesmo com campos equivalentes", async () => {
  await assert.rejects(verifyViceStatusOfficialSource(async () => new Response(JSON.stringify(fixture()))), /conteúdo do recibo revisado mudou/)
})
