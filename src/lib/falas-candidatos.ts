export interface TranscricaoFala {
  kind: "automatic"
  media_url: string
  start_seconds: number
  end_seconds: number
  media_published_at: string
  engine: string
  transcript_sha256: string
  verification_sha256: string
  audio_sha256: string
  speaker_context: string
  reviewed_context: true
}

export interface FalaCandidato {
  id: string
  candidate_id: string
  candidate_slug: string
  candidate_name: string
  office: "Presidente" | "Governador"
  uf: string | null
  quote_text: string
  context: string
  event_context: string
  event_type: "debate" | "entrevista" | "sabatina" | "declaracao"
  occurred_on: string | null
  occurred_between?: { from: string; to: string }
  publisher: string
  article_url: string
  article_title: string
  article_published_at: string
  observed_at: string
  source_sha256: string
  attribution: "explicit_name_same_paragraph" | "source_context_review"
  transcription?: TranscricaoFala
  collection_scope?: { mode: "initial_backfill"; from: "2026-08-16" }
  review_evidence?: {
    identity_excerpt: string
    date_excerpt: string
    fetched_url: string
    method: "codex_source_review"
    source_format?: "web_text"
    quote_location?: "headline"
    source_credit?: string
    declaration_context_excerpt?: string
    content_encoding?: "react_flight"
    live_video?: {
      url: string; channel_id: string; broadcast_on: string; release_timestamp: number
      metadata_sha256: string; captions_sha256: string; frame_sha256: string; frame_at_seconds: number
      article_event_excerpt: string; quote_excerpt: string; reviewed_live_on_air: true
    }
    recorded_video?: {
      url: string; channel_id: string; published_at: string
      metadata_sha256: string; frame_sha256: string; frame_at_seconds: number
      description_excerpt: string; publisher_identity_url: string
      date_basis: "publication_week_description"; reviewed_context: true
    }
    date_range_proof?: { anchor_url: string; anchor_excerpt: string; relationship_excerpt: string; anchor_published_at: string; publication_timestamp: string }
    supporting_sources?: Array<{ url: string; sha256: string; excerpts: string[]; source_format?: "web_text" }>
  }
}

export interface CatalogoFalas {
  schema_version: "falas-v1"
  updated_at: string | null
  quotes: FalaCandidato[]
}

export function periodoDaFala(quote: Pick<FalaCandidato, "occurred_on" | "occurred_between">): { from: string; to: string } | null {
  if (quote.occurred_on) return quote.occurred_between ? null : { from: quote.occurred_on, to: quote.occurred_on }
  const range = quote.occurred_between
  return quote.occurred_on === null && range && range.from <= range.to ? range : null
}

export function chaveDataFala(quote: Pick<FalaCandidato, "occurred_on" | "occurred_between">): string {
  return quote.occurred_on ?? `${quote.occurred_between?.from}/${quote.occurred_between?.to}`
}

export function falasDoCandidato(catalog: CatalogoFalas, slug: string, id: string): FalaCandidato[] {
  return catalog.quotes.filter((quote) => quote.candidate_id === id && quote.candidate_slug === slug)
    .sort((a, b) => (periodoDaFala(b)?.to ?? "").localeCompare(periodoDaFala(a)?.to ?? "") || a.id.localeCompare(b.id))
}
