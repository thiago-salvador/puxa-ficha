/**
 * Compatibility import for the existing pipeline task key. Jarbas is retired:
 * the replacement receipt comes from the official Câmara cota CSV and never
 * derives or republishes allegations of suspicious spending.
 */
export { ingestCamaraCotasCsv as ingestJarbas, ingestCamaraCotasCsv } from "./ingest-camara-cota-csv"

// Kept solely for the historical identity-guard regression tests. The retired
// Jarbas worker no longer imports or calls these functions.
export interface HistoricalJarbasReimbursement {
  applicant_id?: number
  [key: string]: unknown
}

export type HistoricalJarbasIdentityCheck =
  | { ok: true; reembolsos: HistoricalJarbasReimbursement[] }
  | { ok: false; motivo: string }

export function conferirReembolsos(
  rows: HistoricalJarbasReimbursement[] | null | undefined,
  expectedApplicantId: number,
): HistoricalJarbasIdentityCheck {
  if (!Array.isArray(rows)) return { ok: false, motivo: "resposta sem lista de reembolsos" }
  const foreign = rows.filter((row) => row?.applicant_id !== expectedApplicantId)
  if (foreign.length) {
    const hasMissing = foreign.some((row) => row?.applicant_id == null)
    return { ok: false, motivo: `${foreign.length} registro(s) de outro applicant_id${hasMissing ? " (ID ausente)" : ""}, filtro nao foi respeitado` }
  }
  return { ok: true, reembolsos: rows }
}

export function declararJarbasNaoAplicavel(result: import("./types").IngestResult): void {
  result.coleta_resultado = "nao_aplicavel"
  result.coleta_detalhe = "sem ID da Câmara após consulta do diretório atual e listas oficiais das legislaturas 38-52; nenhuma consulta Jarbas executada"
}
