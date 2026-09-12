import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { verifiedViceStatus } from "../src/lib/vice-official-status"
import type { Chapa2026 } from "../src/lib/types"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never

const proof: NonNullable<Chapa2026["vice_situacao_divulgacand"]> = {
  domain: "divulgacand_vices", situacao_vice: 3, status: "inapto",
  titular_sq_candidato: "230002553857", vice_sq_candidato: "230002554442", vice_nome_urna: "JOTA RODRIGUES",
  vice_partido_sigla: "PCO", uf: "RR",
  source_url: "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RR/20322002026/candidato/230002553857",
  source_sha256: "feeacd33aed30e896405e59223800703e4ac0237d3b1429a649bba4ad73cbe42", checked_at: "2026-09-12T15:32:15.536Z",
}
const row = { uf: "RR", identidade_status: "confirmada" as const, vinculo_titular_status: "confirmado" as const, titular_sq_candidato: proof.titular_sq_candidato, vice_sq_candidato: proof.vice_sq_candidato,
  vice_nome_urna: proof.vice_nome_urna, vice_partido_sigla: proof.vice_partido_sigla, vice_situacao_divulgacand: proof }

test("mostra inaptidão da vice com fonte própria sem converter código CDN", () => {
  assert.deepEqual(verifiedViceStatus(row), { label: "Inapto no TSE", source_url: proof.source_url, checked_at: proof.checked_at })
  assert.equal(verifiedViceStatus({ ...row, vice_situacao_divulgacand: null }), null)
  assert.equal(verifiedViceStatus({ ...row, identidade_status: "duplicidade_oficial" }), null)
  assert.equal(verifiedViceStatus({ ...row, vinculo_titular_status: "revisao_identidade" }), null)
})

test("não afirma inaptidão com fonte, identidade ou domínio divergentes", () => {
  for (const patch of [
    { domain: "consulta_cand" }, { situacao_vice: 1 }, { status: "deferido" },
    { titular_sq_candidato: "999" }, { vice_sq_candidato: "999" }, { vice_nome_urna: "OUTRA PESSOA" },
    { vice_partido_sigla: "OUTRO" }, { uf: "SP" }, { source_sha256: "" }, { checked_at: "inválida" },
    { source_url: "https://example.test" },
  ]) {
    assert.equal(verifiedViceStatus({ ...row, vice_situacao_divulgacand: { ...proof, ...patch } as typeof proof }), null)
  }
})

test("programas preservam status e link da vice inapta", async () => {
  const { selectProgramRunningMates } = await import("../src/lib/program-running-mates")
  const matches = selectProgramRunningMates([{ ...row, titular_slug: "clebio-genuino", identidade_status: "confirmada",
    vinculo_titular_status: "confirmado", cargo_titular: "Governador", eleicao_data: "2026-10-04" }], ["clebio-genuino"], "Governador", "RR")
  assert.deepEqual(matches["clebio-genuino"], { name: "JOTA RODRIGUES", status: "Inapto no TSE", source_url: proof.source_url, checked_at: proof.checked_at })
})
