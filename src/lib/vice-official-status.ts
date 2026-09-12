import type { Chapa2026 } from "./types"

type ViceStatusRow = Pick<Chapa2026, "vice_nome_urna" | "uf"> & Partial<Pick<Chapa2026,
  "titular_sq_candidato" | "vice_sq_candidato" | "vice_partido_sigla" | "vice_situacao_divulgacand" |
  "identidade_status" | "vinculo_titular_status">>

export type ProgramRunningMate = string | { name: string; status: string; source_url: string; checked_at: string }

/** The vice-domain code is never interpreted as a CDN candidacy-status code. */
export function verifiedViceStatus(row: ViceStatusRow): { label: string; source_url: string; checked_at: string } | null {
  const proof = row.vice_situacao_divulgacand
  if (row.identidade_status !== "confirmada" || row.vinculo_titular_status !== "confirmado" ||
    !proof || proof.domain !== "divulgacand_vices" || proof.situacao_vice !== 3 || proof.status !== "inapto" ||
    !row.titular_sq_candidato || !row.vice_sq_candidato ||
    proof.titular_sq_candidato !== row.titular_sq_candidato || proof.vice_sq_candidato !== row.vice_sq_candidato ||
    proof.vice_nome_urna !== row.vice_nome_urna || proof.vice_partido_sigla !== row.vice_partido_sigla ||
    proof.uf !== (row.uf ?? "BR") || !/^[a-f0-9]{64}$/.test(proof.source_sha256) ||
    !Number.isFinite(Date.parse(proof.checked_at)) ||
    proof.source_url !== `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/${row.uf ?? "BR"}/20322002026/candidato/${row.titular_sq_candidato}`) return null
  return { label: "Inapto no TSE", source_url: proof.source_url, checked_at: proof.checked_at }
}
