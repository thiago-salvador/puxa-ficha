// Contrato canônico de dados publicados por candidato.
// Independente da UI — toda página pública deve derivar deste shape.
// Fase 1 da Auditoria Factual (docs/plans/2026-03-31-auditoria-factual-site.md)

export type AuditoriaStatus = "auditado" | "pendente" | "reprovado"
export type AuditResult = "pass" | "warning" | "fail" | "manual_review"
export type Severidade = "S0" | "S1" | "S2"
export type Criticidade = "critica" | "relevante" | "editorial"
export type TipoComparacao = "igualdade_exata" | "valor_e_ano" | "existencia" | "contagem" | "revisao_humana"
export type CandidateAuditProfile =
  | "deputado_federal_em_exercicio"
  | "senador_em_exercicio"
  | "executivo_em_exercicio"
  | "ex_mandatario_sem_cargo_atual"
  | "sem_mandato_previo"

export type CandidateSection =
  | "biografia"
  | "historico_politico"
  | "mudancas_partido"
  | "patrimonio"
  | "financiamento"
  | "processos"
  | "projetos_lei"
  | "votos_candidato"
  | "gastos_parlamentares"

export type SnapshotFreshnessStatus = "current" | "historical" | "stale" | "missing"
export type SnapshotFreshnessKey =
  | "perfil_atual"
  | "historico_politico"
  | "mudancas_partido"
  | "patrimonio"
  | "financiamento"
  | "projetos_lei"
  | "votos_candidato"
  | "gastos_parlamentares"

export interface SnapshotFreshnessInfo {
  key: SnapshotFreshnessKey
  status: SnapshotFreshnessStatus
  verified_at: string | null
  reference_date: string | null
  reference_year: number | null
  message: string
}

// DTO público estável do candidato — fonte de verdade para auditoria
export interface CandidatePublicSnapshot {
  slug: string
  canonical_person_slug: string
  related_person_slugs: string[]
  nome_completo: string
  nome_urna: string
  partido_sigla: string | null
  partido_atual: string | null
  cargo_atual: string | null
  cargo_disputado: string
  estado: string | null
  situacao_candidatura: string | null
  biografia: string | null
  patrimonio_mais_recente: number | null
  patrimonio_ano: number | null
  total_patrimonio_registros: number
  financiamento_mais_recente: number | null
  financiamento_ano: number | null
  total_financiamento_registros: number
  total_processos: number
  foto_url: string | null
  data_nascimento: string | null
  naturalidade: string | null
  formacao: string | null
  total_historico_politico: number
  total_mudancas_partido: number
  total_projetos_lei: number
  total_votos: number
  total_gastos_parlamentares: number
  ultimo_historico_cargo: string | null
  ultimo_historico_periodo_inicio: number | null
  ultimo_historico_periodo_fim: number | null
  ultimo_partido_timeline: string | null
  ultima_eleicao_disputada: number | null
  has_tse_anchor: boolean
  has_camara_anchor: boolean
  has_senado_anchor: boolean
  audit_profile: CandidateAuditProfile
  section_freshness: Partial<Record<SnapshotFreshnessKey, SnapshotFreshnessInfo>>
  // status de auditoria interno — não exibido publicamente
  auditoria_status: AuditoriaStatus
  auditoria_revisado_em: string | null // ISO date
  auditoria_revisado_por: string | null
}

// Resultado de auditoria por campo
export interface AuditFieldResult {
  campo: string
  resultado: AuditResult
  severidade: Severidade
  valor_publicado: unknown
  valor_esperado: unknown
  fonte: string
  motivo: string | null
  requer_revisao_manual: boolean
}

// Resultado de auditoria por candidato
export interface AuditCandidateResult {
  slug: string
  canonical_person_slug: string
  related_person_slugs: string[]
  audit_profile: CandidateAuditProfile
  secoes_obrigatorias: CandidateSection[]
  nome_urna: string
  timestamp: string // ISO datetime
  auditoria_status: AuditoriaStatus
  campos: AuditFieldResult[]
  tem_falha_critica: boolean // qualquer campo P0 com fail
  tem_warning: boolean
  itens_revisao_manual: AuditFieldResult[]
}

// Item de fila de revisão manual
export interface FilaRevisaoItem {
  id: string // uuid gerado no momento
  candidato_slug: string
  campo: string
  valor_publicado: unknown
  valor_esperado: unknown
  fonte: string
  severidade: Severidade
  status: "aberto" | "em_revisao" | "resolvido" | "descartado"
  responsavel: string | null
  prazo: string | null // ISO date
  criado_em: string // ISO datetime
  resolvido_em: string | null
  notas: string | null
}

// Metadados de proveniência — registrar em qualquer campo sensível editável
export interface ProvenanceMetadata {
  last_edited_by: "human" | "automation" | "unknown"
  last_edited_source: string | null // ex: "ingest-wikipedia", "editor:thiago", "seed-pontos"
  last_reviewed_by: string | null // nome do revisor humano
  last_reviewed_at: string | null // ISO datetime
}

export interface AuditPersistentStateItem {
  slug: string
  nome_urna: string
  auditoria_status: AuditoriaStatus
  pode_publicar: boolean
  ultima_execucao: string
  cohorts: string[]
  source: string | null
  verified_at: string | null
  campos_com_fail: string[]
  campos_com_warning: string[]
  provenance: ProvenanceMetadata
}

export interface AuditPersistentState {
  atualizado_em: string
  candidatos: Record<string, AuditPersistentStateItem>
}

export interface AuditHistoryEntry {
  run_id: string
  executado_em: string
  scope: string
  filtros: Record<string, string | boolean | undefined>
  total_candidatos: number
  resumo: Record<string, number>
  report_output_path: string
  queue_output_path: string
  summary_output_path: string
  run_report_path: string
}
