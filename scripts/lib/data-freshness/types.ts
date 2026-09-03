export type FreshnessStatus =
  | "fresh"
  | "stale"
  | "source_error"
  | "review_required"
  | "technical_debt"

type RefreshMode = "scheduled" | "manual" | "versioned_review" | "disabled"

export interface FreshnessSource {
  source_id: string
  label: string
  authority_url: string
  methodology_source_ids: string[]
  collection_source_ids: string[]
  cadence: "daily" | "weekly" | "monthly" | "electoral_cycle" | "on_demand"
  max_age_hours: number | null
  refresh_mode: RefreshMode
  evidence_type: "coleta_log" | "versioned_file" | "official_snapshot" | "runtime_endpoint"
  evidence_ref: string
  stale_policy: "show_with_warning" | "suppress_negative_claims" | "review_required"
  negative_claims_allowed_when_stale: false
}

export type RelevantOffice =
  | "PRESIDENTE"
  | "VICE PRESIDENTE"
  | "GOVERNADOR"
  | "VICE GOVERNADOR"

export interface CandidacyRecord {
  sq_candidato: string
  cargo: RelevantOffice
  uf: string | null
  sq_coligacao: string
  nome_urna: string
  partido_sigla: string
  situacao_codigo: string | null
  situacao_descricao: string | null
  perfil_slug: string | null
}

export type CandidacyChangeKind =
  | "inclusion"
  | "removal"
  | "replacement"
  | "status_change"
  | "identity_mismatch"
  | "missing_profile"
  // Informativo: vice substituída comprovada no DivulgaCandContas, com o
  // catálogo já publicando a vice vigente. Não bloqueia a auditoria.
  | "substituted"

export interface CandidacyChange {
  kind: CandidacyChangeKind
  slot: string
  official: CandidacyRecord | null
  published: CandidacyRecord | null
  detail: string
}

export interface CandidacyComparison {
  generated_at: string
  official_count: number
  published_count: number
  counts: Record<CandidacyChangeKind, number>
  changes: CandidacyChange[]
  status: "ok" | "review_required"
}
