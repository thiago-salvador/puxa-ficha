import { normalizePartySigla } from "@/lib/party-utils"

export interface EspectroPartidario {
  partido_sigla: string
  eixo_economico: number
  eixo_social: number
  fonte?: string
  notas?: string
}

/** Revisao editorial pendente antes de comunicacao publica forte. */
export const ESPECTRO_PARTIDARIO: EspectroPartidario[] = [
  { partido_sigla: "PSTU", eixo_economico: 1, eixo_social: 1, fonte: "curadoria" },
  { partido_sigla: "PCO", eixo_economico: 1, eixo_social: 2, fonte: "curadoria" },
  { partido_sigla: "UP", eixo_economico: 1, eixo_social: 1, fonte: "curadoria" },
  { partido_sigla: "PSOL", eixo_economico: 2, eixo_social: 1, fonte: "curadoria" },
  { partido_sigla: "PT", eixo_economico: 3, eixo_social: 3, fonte: "curadoria" },
  { partido_sigla: "PCDOB", eixo_economico: 3, eixo_social: 3, fonte: "curadoria" },
  { partido_sigla: "PDT", eixo_economico: 3, eixo_social: 4, fonte: "curadoria" },
  { partido_sigla: "PSB", eixo_economico: 4, eixo_social: 3, fonte: "curadoria" },
  { partido_sigla: "PV", eixo_economico: 4, eixo_social: 3, fonte: "curadoria" },
  { partido_sigla: "CIDADANIA", eixo_economico: 5, eixo_social: 4, fonte: "curadoria" },
  { partido_sigla: "PSD", eixo_economico: 5, eixo_social: 5, fonte: "curadoria" },
  { partido_sigla: "MDB", eixo_economico: 5, eixo_social: 5, fonte: "curadoria" },
  { partido_sigla: "PSDB", eixo_economico: 6, eixo_social: 4, fonte: "curadoria" },
  { partido_sigla: "PODE", eixo_economico: 6, eixo_social: 5, fonte: "curadoria" },
  { partido_sigla: "UNIAO", eixo_economico: 6, eixo_social: 6, fonte: "curadoria" },
  { partido_sigla: "PP", eixo_economico: 7, eixo_social: 6, fonte: "curadoria" },
  { partido_sigla: "AVANTE", eixo_economico: 6, eixo_social: 6, fonte: "curadoria" },
  { partido_sigla: "REPUBLICANOS", eixo_economico: 7, eixo_social: 8, fonte: "curadoria" },
  { partido_sigla: "PL", eixo_economico: 8, eixo_social: 9, fonte: "curadoria" },
  { partido_sigla: "NOVO", eixo_economico: 9, eixo_social: 5, fonte: "curadoria" },
  { partido_sigla: "DC", eixo_economico: 5, eixo_social: 9, fonte: "curadoria" },
  { partido_sigla: "PRTB", eixo_economico: 7, eixo_social: 8, fonte: "curadoria" },
  { partido_sigla: "MISSAO", eixo_economico: 5, eixo_social: 8, fonte: "curadoria" },
]

const MAP = new Map<string, EspectroPartidario>()
for (const row of ESPECTRO_PARTIDARIO) {
  MAP.set(normalizePartySigla(row.partido_sigla), row)
}

export function getEspectroPartidario(sigla: string | null | undefined): EspectroPartidario | null {
  const key = normalizePartySigla(sigla)
  return MAP.get(key) ?? null
}
