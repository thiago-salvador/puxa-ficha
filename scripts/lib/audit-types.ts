// Contrato canônico de dados publicados por candidato.
// Independente da UI — toda página pública deve derivar deste shape.

export type AuditoriaStatus = "auditado" | "pendente" | "reprovado"
type AuditResult = "pass" | "warning" | "fail" | "manual_review"
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

type SnapshotFreshnessStatus = "current" | "historical" | "stale" | "missing"
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
  /** Contagem após deduplicação de exibição (cargo canônico + período), alinhada a `getCandidatoBySlug`. */
  total_historico_politico_exibicao: number
  /** Linhas excedentes por chave (cargo canônico, periodo_inicio); 0 após UNIQUE + ingest corretos. */
  historico_duplicatas_cargo_ano: number
  /** Linhas com periodo_inicio fora de [1900, ano_corrente+1] ou periodo_fim < periodo_inicio. */
  historico_periodos_invalidos: number
  /** Pares de mandatos do mesmo cargo canônico com períodos temporalmente sobrepostos. */
  historico_sobreposicoes_cargo: number
  /**
   * Pares de mandatos sobrepostos DEPOIS de `normalizeHistoricoPoliticoForDisplay`.
   * Se 0 com raw > 0 → display público normaliza; raw é dívida de curadoria, não risco de publicação.
   * Se > 0 → display ainda tem problema real; warning bloqueia publicação.
   */
  historico_sobreposicoes_cargo_normalizado: number
  /** Linhas com observações contendo indeferido/#NULO#/renúncia/cassado/falecido (legado ou regressão). */
  historico_observacoes_problematicas: number
  /** Cargos canônicos distintos no historico_politico (canonicalCargo), ordenados. Só usado com expected_cargos na assertion. */
  historico_cargos_canonicos_distintos: string[]
  /** Trocas efetivas (exclui âncora inicial); alinhado a `countPartySwitches` na UI. */
  total_mudancas_partido: number
  /** Linhas em `mudancas_partido` (inclui âncora); presença de timeline partidária (raw, para audit-rules). */
  mudancas_partido_linhas: number
  /**
   * Linhas após `normalizePartyTimelineForDisplay`, alinhado ao atributo
   * `data-pf-partidos-count` da UI. Mesma semântica de `total_historico_politico_exibicao`.
   * Opcional por retrocompatibilidade com relatórios antigos.
   * Ver curadoria interna (Fluxo 2; linhas vs trocas efetivas).
   */
  mudancas_partido_linhas_exibicao?: number
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
