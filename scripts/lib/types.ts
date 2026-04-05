export interface CandidatoConfig {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: "Presidente" | "Governador"
  estado?: string
  wikipedia_title?: string
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
  /** Quando true, nenhuma escrita foi feita (ex.: ingest opcional que pula candidato ja coberto). */
  skipped?: boolean
  skip_reason?: string
  /** Em ingest incremental Camara: etapas que foram puladas por ja estarem cobertas no banco. */
  incremental_skipped?: ("perfil" | "gastos_parlamentares" | "votos_candidato" | "projetos_lei")[]
}
