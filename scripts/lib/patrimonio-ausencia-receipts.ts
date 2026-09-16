import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { stripAccents } from "../../src/lib/strip-accents"

const RECEIPTS_PATH = resolve(process.cwd(), "scripts/data/patrimonio-ausencias-arquivo-validadas.json")

export type PatrimonioFileAbsenceReceipt = {
  slug: string
  source_year: number
  effective_year: number
  sq_candidato: string
  uf: string
  cargo: string
  election_date: string
  election_type: string
  candidate_name: string
  consulta_package_sha256: string
  bens_package_sha256: string
  identity_members: Array<{ member: string; rows_scanned: number; matched_rows: number }>
  asset_members: Array<{ member: string; rows_scanned: number; matched_rows: number }>
  asset_matched_rows: 0
  verified_at: string
}

type ReceiptFile = {
  schema_version: string
  receipts: PatrimonioFileAbsenceReceipt[]
}

let cached: ReceiptFile | null = null

function normalize(value: string | null | undefined): string {
  return stripAccents(value ?? "").trim().toUpperCase()
}

export function loadPatrimonioFileAbsenceReceipts(): PatrimonioFileAbsenceReceipt[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(RECEIPTS_PATH, "utf8")) as ReceiptFile
    if (cached.schema_version !== "patrimonio-file-absence-receipts-v1") throw new Error("recibo patrimonial incompatível")
    if (cached.receipts.length !== 17) throw new Error(`recibo patrimonial incompleto: ${cached.receipts.length}/17`)
  }
  return cached.receipts
}

export function findPatrimonioIdentityReceipt(input: {
  sourceYear: number
  consultaPackageSha256: string
  sqCandidato: string
  uf: string
  cargo: string
  electionDate: string | null
  electionType: string | null
}): PatrimonioFileAbsenceReceipt | null {
  return loadPatrimonioFileAbsenceReceipts().find((receipt) =>
    receipt.source_year === input.sourceYear &&
    receipt.consulta_package_sha256 === input.consultaPackageSha256 &&
    receipt.sq_candidato === input.sqCandidato &&
    normalize(receipt.uf) === normalize(input.uf) &&
    normalize(receipt.cargo) === normalize(input.cargo) &&
    receipt.election_date === input.electionDate &&
    normalize(receipt.election_type) === normalize(input.electionType),
  ) ?? null
}

export function validatesPatrimonioFileAbsence(
  receipt: PatrimonioFileAbsenceReceipt | undefined,
  bensPackageSha256: string,
): receipt is PatrimonioFileAbsenceReceipt {
  return Boolean(receipt && receipt.bens_package_sha256 === bensPackageSha256 && receipt.asset_matched_rows === 0)
}

export function patrimonioAbsencePublicDetail(input: {
  cargo: string | null | undefined
  uf: string | null | undefined
  effectiveYear: number
  declarouBens?: string | null
}): string {
  const cargo = input.cargo?.trim() || "cargo informado pelo TSE"
  const uf = input.uf?.trim() || "UF informada pelo TSE"
  const divergence = input.declarouBens?.trim().toUpperCase() === "S"
    ? " O cadastro oficial da candidatura informa que houve declaração de bens; essa divergência entre os arquivos permanece registrada."
    : ""
  return `Na candidatura a ${cargo} por ${uf}, na eleição de ${input.effectiveYear}, os arquivos oficiais do TSE consultados não trouxeram registro de bens para esta candidatura.${divergence} Essa verificação se limita aos arquivos consultados e não comprova ausência de patrimônio pessoal nem de declaração em outra fonte.`
}
