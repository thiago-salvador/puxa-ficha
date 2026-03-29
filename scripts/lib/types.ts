export interface CandidatoConfig {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: "Presidente" | "Governador"
  estado?: string
  ids: {
    camara: number | null
    senado: number | null
    tse_sq_candidato: Record<string, string>
  }
}

export interface IngestResult {
  source: string
  candidato: string
  tables_updated: string[]
  rows_upserted: number
  errors: string[]
  duration_ms: number
}
