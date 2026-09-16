import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  findPatrimonioIdentityReceipt,
  loadPatrimonioFileAbsenceReceipts,
  patrimonioAbsencePublicDetail,
  validatesPatrimonioFileAbsence,
} from "../scripts/lib/patrimonio-ausencia-receipts"

test("recibo canônico contém os 17 contextos e corrige Bartô para o pleito ordinário de 2022", () => {
  const receipts = loadPatrimonioFileAbsenceReceipts()
  assert.equal(receipts.length, 17)
  const barto = receipts.find((receipt) => receipt.slug === "tse-2026-230002549361")
  assert.equal(barto?.sq_candidato, "230001610813")
  assert.equal(barto?.cargo, "SENADOR")
  assert.equal(barto?.effective_year, 2022)
  assert.equal(barto?.election_date, "02/10/2022")
  assert.equal(barto?.asset_matched_rows, 0)
})

test("recibo só autoriza ausência com identidade e hashes exatos dos dois pacotes", () => {
  const receipt = loadPatrimonioFileAbsenceReceipts()[0]
  const matched = findPatrimonioIdentityReceipt({
    sourceYear: receipt.source_year,
    consultaPackageSha256: receipt.consulta_package_sha256,
    sqCandidato: receipt.sq_candidato,
    uf: receipt.uf,
    cargo: receipt.cargo,
    electionDate: receipt.election_date,
    electionType: receipt.election_type,
  })
  assert.equal(matched?.slug, receipt.slug)
  assert.equal(validatesPatrimonioFileAbsence(matched ?? undefined, receipt.bens_package_sha256), true)
  assert.equal(validatesPatrimonioFileAbsence(matched ?? undefined, "0".repeat(64)), false)
  assert.equal(findPatrimonioIdentityReceipt({
    sourceYear: receipt.source_year,
    consultaPackageSha256: "0".repeat(64),
    sqCandidato: receipt.sq_candidato,
    uf: receipt.uf,
    cargo: receipt.cargo,
    electionDate: receipt.election_date,
    electionType: receipt.election_type,
  }), null)
})

test("texto público descreve o escopo sem expor rastreio técnico e explicita divergência ST=S", () => {
  const detail = patrimonioAbsencePublicDetail({ cargo: "SENADOR", uf: "RR", effectiveYear: 2022, declarouBens: "S" })
  assert.match(detail, /candidatura a SENADOR por RR/)
  assert.match(detail, /não trouxeram registro de bens/)
  assert.match(detail, /informa que houve declaração de bens/)
  assert.match(detail, /não comprova ausência de patrimônio pessoal nem de declaração em outra fonte/)
  assert.doesNotMatch(detail, /SQ|sha|CSV|linhas deduplicadas/i)
  const receiptText = readFileSync("scripts/data/patrimonio-ausencias-arquivo-validadas.json", "utf8")
  assert.match(receiptText, /identity_members/)
  assert.match(receiptText, /rows_scanned/)
})
