import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never
import type { SenadoRunningMateRow } from "../src/lib/senado-running-mates"

const row = (ordem: 1 | 2, slug = "titular"): SenadoRunningMateRow => ({
  titular_slug: slug, uf: "AM", ordem, nome_urna: `MATE ${ordem}`, situacao: "DEFERIDO", fonte_url: "https://tse.example", sq_candidato: `sq-${ordem}`, titular_publicavel: true, vinculo_verificado: true,
})

test("reader mantém duas posições ordenadas e só titular elegível", async () => {
  const { selectSenadoRunningMates } = await import("../src/lib/senado-running-mates")
  assert.deepEqual(selectSenadoRunningMates([row(2), row(1)], ["titular"], "AM"), {
    titular: [row(1), row(2)].map(({ ordem, nome_urna, situacao, fonte_url, sq_candidato }) => ({ ordem, nome_urna, situacao, fonte_url, sq_candidato })),
  })
  assert.deepEqual(selectSenadoRunningMates([row(1), row(2, "outro")], ["titular", "outro"], "AM"), {})
})

test("recibo de ausência aceita hashes SHA-256 atuais sem fixar snapshot", async () => {
  const { isValidSenadoRunningMateAbsenceProof } = await import("../src/lib/senado-running-mates")
  const proof = {
    kind: "senado_suplencias_official_records_without_current_eligible_positions",
    titular_slug: "titular",
    titular_sq: "123456789012",
    uf: "AM",
    source_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
    source_sha256: "a".repeat(64),
    complement_url: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
    complement_sha256: "b".repeat(64),
    consulted_at: "2026-09-15T16:31:35.000Z",
    positions: [
      { ordem: 1, sq: "123456789013", nome: "SUPLENTE UM", status: "INDEFERIDO" },
      { ordem: 2, sq: "123456789014", nome: "SUPLENTE DOIS", status: "INDEFERIDO" },
    ],
  }
  assert.equal(isValidSenadoRunningMateAbsenceProof(proof, { slug: "titular", estado: "AM", registration_sq: "123456789012" }), true)
  assert.equal(isValidSenadoRunningMateAbsenceProof({ ...proof, source_sha256: "x" }, { slug: "titular", estado: "AM", registration_sq: "123456789012" }), false)
})
