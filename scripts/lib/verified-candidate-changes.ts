import { SITUACAO_CANDIDATURA_DOMINIO } from "../../src/lib/situacao-candidatura"

export interface VerifiedChangeObservation {
  candidateId: string
  field: "patrimonio" | "situacao"
  year: number
  value: string
  sq: string
  uf: string
  sourceUrl: string
  identityVerified: boolean
  dryRun?: boolean
  observationOnly?: boolean
}

export type VerifiedChangeRpc = (name: "observe_verified_candidate_change", args: {
  p_candidate_id: string
  p_field: string
  p_year: number
  p_value: string
  p_source_url: string
  p_source_identity: string
}) => PromiseLike<{ data: unknown; error: { message: string } | null }>

/** Only observations from successfully persisted, public TSE records enter the feed.
 * Party is intentionally absent: an election's declared party is not current affiliation.
 */
export async function observeVerifiedCandidateChange(
  observation: VerifiedChangeObservation,
  dependencies: { confirmPersisted: () => Promise<boolean>; rpc: VerifiedChangeRpc },
): Promise<"baseline" | "unchanged" | "changed" | "skipped"> {
  const o = observation
  const packageName = o.field === "patrimonio" ? "bem_candidato" : "consulta_cand_complementar"
  const expectedUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/${packageName}/${packageName}_${o.year}.zip`
  const validValue = o.field === "patrimonio"
    ? /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(o.value) && Number.isFinite(Number(o.value))
    : o.field === "situacao" && (SITUACAO_CANDIDATURA_DOMINIO as readonly string[]).includes(o.value)
  if (o.dryRun || !o.identityVerified || !validValue || !o.candidateId ||
      !Number.isInteger(o.year) || o.year < 1990 || o.year > new Date().getFullYear() ||
      !/^\d+$/.test(o.sq) || !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO|BR)$/.test(o.uf) ||
      o.sourceUrl !== expectedUrl) return "skipped"
  if (!await dependencies.confirmPersisted()) {
    if (o.observationOnly) return "skipped"
    throw new Error("Verified change: persisted value could not be confirmed")
  }
  const { data, error } = await dependencies.rpc("observe_verified_candidate_change", {
    p_candidate_id: o.candidateId,
    p_field: o.field,
    p_year: o.year,
    p_value: o.field === "patrimonio" ? Number(o.value).toFixed(2) : o.value,
    p_source_url: o.sourceUrl,
    p_source_identity: `${o.year}:${o.sq}:${o.uf}`,
  })
  if (error) throw new Error(`Verified change: ${error.message}`)
  if (data !== "baseline" && data !== "unchanged" && data !== "changed") throw new Error("Verified change: unexpected RPC result")
  return data
}
