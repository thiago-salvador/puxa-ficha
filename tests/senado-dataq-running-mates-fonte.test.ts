import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

const proof = {
  kind: "senado_suplencias_official_records_without_current_eligible_positions",
  titular_slug: "titular",
  titular_sq: "123456789012",
  uf: "AM",
  source_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
  source_sha256: "c".repeat(64),
  complement_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
  complement_sha256: "d".repeat(64),
  consulted_at: "2026-09-15T16:31:35.000Z",
  positions: [
    { ordem: 1, sq: "123456789013", nome: "SUPLENTE UM", status: "INDEFERIDO" },
    { ordem: 2, sq: "123456789014", nome: "SUPLENTE DOIS", status: "INDEFERIDO" },
  ],
}

test("ausência confirmada cita o arquivo e o hash do comprovante validado", async () => {
  const { senadoRunningMateAbsenceFromProof } = await import("../src/lib/senado-running-mates")
  const absence = senadoRunningMateAbsenceFromProof(proof, { slug: "titular", estado: "AM", registration_sq: "123456789012" })
  assert.deepEqual(absence, {
    fonte_url: proof.source_url,
    fonte_sha256: proof.source_sha256,
    complemento_url: proof.complement_url,
    complemento_sha256: proof.complement_sha256,
    fonte_data: "15/09/2026",
  })
})

test("comprovante inválido não produz ausência", async () => {
  const { senadoRunningMateAbsenceFromProof } = await import("../src/lib/senado-running-mates")
  const row = { slug: "titular", estado: "AM", registration_sq: "123456789012" }
  assert.equal(senadoRunningMateAbsenceFromProof({ ...proof, source_sha256: "curto" }, row), null)
  assert.equal(senadoRunningMateAbsenceFromProof(proof, { ...row, registration_sq: "999" }), null)
  assert.equal(senadoRunningMateAbsenceFromProof(null, row), null)
})
