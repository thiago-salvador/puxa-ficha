/** Read-only release gate for the exact, reviewed DivulgaCand vice receipt. */
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const SOURCE_URL = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RR/20322002026/candidato/230002553857"
const SOURCE_SHA256 = "feeacd33aed30e896405e59223800703e4ac0237d3b1429a649bba4ad73cbe42"
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TSE: objeto oficial ausente")
  return value as Record<string, unknown>
}

export function assertViceStatusSourceCurrent(payload: unknown): void {
  const candidate = object(payload)
  if (String(candidate.id) !== "230002553857" || candidate.nomeUrna !== "CLÉBIO GENUÍNO" ||
    candidate.ufCandidatura !== "RR" || String(object(candidate.eleicao).id) !== "20322002026" ||
    String(object(candidate.cargo).codigo) !== "3" || object(candidate.partido).sigla !== "PCO") {
    throw new Error("TSE: identidade do titular divergiu")
  }
  if (!Array.isArray(candidate.vices)) throw new Error("TSE: lista de vices ausente")
  const vices = candidate.vices.map(object)
  if (new Set(vices.map((vice) => String(vice.sq_CANDIDATO))).size !== vices.length) throw new Error("TSE: vice duplicada")
  const vice = vices.find((row) => String(row.sq_CANDIDATO) === "230002554442")
  if (!vice || vice.nm_URNA !== "JOTA RODRIGUES" || vice.sg_PARTIDO !== "PCO" ||
    Number(vice.situacaoVice) !== 3) throw new Error("TSE: identidade ou situação da vice divergiu")
}

export async function verifyViceStatusOfficialSource(fetchImpl: typeof fetch = fetch): Promise<void> {
  let bytes: Uint8Array | undefined
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(SOURCE_URL, { redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(20_000), headers: { "user-agent": "PuxaFichaDataFreshness/1.0" } })
      if (!response.ok) throw new Error("HTTP")
      bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > 10_000_000) throw new Error("size")
      break
    } catch {
      if (attempt === 3) throw new Error("TSE: fonte indisponível após três tentativas")
    }
  }
  if (!bytes) throw new Error("TSE: fonte ausente")
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (sha256 !== SOURCE_SHA256) throw new Error("TSE: conteúdo do recibo revisado mudou")
  assertViceStatusSourceCurrent(JSON.parse(new TextDecoder().decode(bytes)))
  console.log(JSON.stringify({ source_url: SOURCE_URL, sha256, checked_at: new Date().toISOString(), status: "verified" }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyViceStatusOfficialSource().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Falha no gate da fonte oficial")
    process.exitCode = 1
  })
}
