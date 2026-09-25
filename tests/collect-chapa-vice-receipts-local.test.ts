import test from "node:test"
import assert from "node:assert/strict"
import { projectChapaReceipt } from "../scripts/audit/collect-chapa-vice-receipts-local"

const oldSha = "a".repeat(64)
const newSha = "b".repeat(64)
const sourceUrl = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
const checkedAt = "2026-09-24T16:56:50.458Z"
const snapshot = {
  metadata: { source_url: sourceUrl, source_sha256: oldSha },
  chapas: [{
    chave: "2026:AC:ana-exemplo", eleicao_codigo: "6259", eleicao_data: "04/10/2026", uf: "AC",
    cargo_titular: "Governador", sq_coligacao: "100",
    identidade_status: "confirmada", tse_situacao_codigo: "#NE",
    tse_situacao_titular_codigo: "-3", tse_situacao_vice_codigo: "-3",
    tipo_agremiacao: "COLIGAÇÃO", composicao: "A / B",
    titular: {
      sq_candidato: "123", perfil_slug: "ana-exemplo", vinculo_perfil_status: "confirmado",
      nome_completo: "ANA EXEMPLO",
      nome_urna: "ANA", partido_sigla: "A", partido_nome: "PARTIDO A",
      numero: "10", data_nascimento: "01/01/1980",
    },
    vice: {
      sq_candidato: "124", nome_completo: "BEA EXEMPLO", nome_urna: "BEA",
      partido_sigla: "B", partido_nome: "PARTIDO B", numero: "10",
      data_nascimento: "02/02/1982",
    },
  }],
}
const profile = {
  id: "candidate-1", slug: "ana-exemplo",
  chapa_2026: {
    chave: "2026:AC:ana-exemplo", eleicao_codigo: "6259", eleicao_data: "2026-10-04", uf: "AC",
    cargo_titular: "Governador",
    titular_slug: "ana-exemplo", titular_nome_urna: "ANA", vice_nome_urna: "BEA",
    identidade_status: "confirmada",
    vinculo_titular_status: "confirmado", fonte_url: sourceUrl,
    fonte_sha256: oldSha, snapshot_em: "2026-08-28T01:58:24.127Z",
    titular_candidato_id: "candidate-1", titular_sq_candidato: "123",
    vice_sq_candidato: "124", titular_nome_completo: "ANA EXEMPLO",
    vice_nome_completo: "BEA EXEMPLO", titular_partido_sigla: "A",
    vice_partido_sigla: "B", tse_situacao_codigo: "#NE",
  },
}
const rows = new Map([
  ["123", [{ SQ_CANDIDATO: "123", NR_TURNO: "1", ANO_ELEICAO: "2026",
    CD_ELEICAO: "6259", DT_ELEICAO: "04/10/2026", SG_UF: "AC", SQ_COLIGACAO: "100", DS_CARGO: "GOVERNADOR",
    NM_CANDIDATO: "ANA EXEMPLO", NM_URNA_CANDIDATO: "ANA", SG_PARTIDO: "A",
    NM_PARTIDO: "PARTIDO A", NR_CANDIDATO: "10", DT_NASCIMENTO: "01/01/1980",
    CD_SITUACAO_CANDIDATURA: "-3", DS_SITUACAO_CANDIDATURA: "#NE",
    TP_AGREMIACAO: "COLIGAÇÃO", DS_COMPOSICAO_COLIGACAO: "A / B" }]],
  ["124", [{ SQ_CANDIDATO: "124", NR_TURNO: "1", ANO_ELEICAO: "2026",
    CD_ELEICAO: "6259", DT_ELEICAO: "04/10/2026", SG_UF: "AC", SQ_COLIGACAO: "100", DS_CARGO: "VICE-GOVERNADOR",
    NM_CANDIDATO: "BEA EXEMPLO", NM_URNA_CANDIDATO: "BEA", SG_PARTIDO: "B",
    NM_PARTIDO: "PARTIDO B", NR_CANDIDATO: "10", DT_NASCIMENTO: "02/02/1982",
    CD_SITUACAO_CANDIDATURA: "-3", DS_SITUACAO_CANDIDATURA: "#NE",
    TP_AGREMIACAO: "COLIGAÇÃO", DS_COMPOSICAO_COLIGACAO: "A / B" }]],
])
const coalitionSqs = new Map([["6259|AC|100", ["123", "124"]]])
const candidateIdsBySlug = new Map([["ana-exemplo", "candidate-1"]])

test("chapa idêntica no pacote novo permanece indeterminada até revisão do snapshot", () => {
  const result = projectChapaReceipt({ profile, snapshot, rowsBySq: rows, coalitionSqs, candidateIdsBySlug, currentSha256: newSha, checkedAt })
  assert.equal(result.reason, "revision_changed")
  assert.equal(result.receipt?.resultado, "indeterminado")
  assert.equal(result.receipt?.volume, 0)
  assert.equal(JSON.parse(result.receipt!.detalhe).resource_sha256, newSha)
})

test("revisão igual e par integralmente reconciliado geram recibo positivo", () => {
  const result = projectChapaReceipt({ profile, snapshot, rowsBySq: rows, coalitionSqs, candidateIdsBySlug, currentSha256: oldSha, checkedAt })
  assert.equal(result.reason, "ok")
  assert.equal(result.receipt?.resultado, "encontrado")
  assert.equal(result.receipt?.volume, 1)
})

test("mudança ou duplicidade da fonte impede recibo positivo", () => {
  const changed = new Map(rows)
  changed.set("124", [{ ...rows.get("124")![0], SQ_COLIGACAO: "101" }])
  assert.equal(projectChapaReceipt({ profile, snapshot, rowsBySq: changed, coalitionSqs, candidateIdsBySlug, currentSha256: oldSha, checkedAt }).reason, "official_pair_changed")
  changed.set("124", [rows.get("124")![0], rows.get("124")![0]])
  assert.equal(projectChapaReceipt({ profile, snapshot, rowsBySq: changed, coalitionSqs, candidateIdsBySlug, currentSha256: oldSha, checkedAt }).reason, "official_row_missing_or_duplicate")
  const extraVice = new Map([["6259|AC|100", ["123", "124", "125"]]])
  assert.equal(projectChapaReceipt({ profile, snapshot, rowsBySq: rows, coalitionSqs: extraVice, candidateIdsBySlug, currentSha256: oldSha, checkedAt }).reason, "official_pair_changed")
  assert.equal(projectChapaReceipt({ profile: { ...profile, chapa_2026: { ...profile.chapa_2026, cargo_titular: "Presidente" } }, snapshot, rowsBySq: rows, coalitionSqs, candidateIdsBySlug, currentSha256: oldSha, checkedAt }).reason, "profile_mismatch")
  assert.equal(projectChapaReceipt({ profile: { ...profile, chapa_2026: { ...profile.chapa_2026, sq_coligacao: "101" } }, snapshot, rowsBySq: rows, coalitionSqs, candidateIdsBySlug, currentSha256: oldSha, checkedAt }).reason, "profile_mismatch")
  const wrongVice = projectChapaReceipt({ profile: { ...profile, chapa_2026: { ...profile.chapa_2026, vice_candidato_id: "wrong-id" } }, snapshot, rowsBySq: rows, coalitionSqs, candidateIdsBySlug, currentSha256: oldSha, checkedAt })
  assert.equal(wrongVice.reason, "public_link_unverifiable")
  assert.equal(wrongVice.receipt?.resultado, "indeterminado")
})
