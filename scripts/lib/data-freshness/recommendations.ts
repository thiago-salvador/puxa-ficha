import type { SourceFreshnessResult } from "./registry"
import type {
  CandidacyChange,
  CandidacyChangeKind,
  CandidacyComparison,
  FreshnessSource,
} from "./types"

export interface DataFreshnessRecommendation {
  code: string
  priority: "critical" | "high"
  title: string
  action: string
  evidence: string[]
}

interface RecommendationInput {
  comparison: CandidacyComparison | null
  freshness: SourceFreshnessResult[]
  registry: FreshnessSource[]
}

const CHANGE_GUIDANCE: Record<CandidacyChangeKind, { title: string; action: string }> = {
  inclusion: {
    title: "Candidaturas oficiais ainda não publicadas",
    action: "Confirmar cada registro pelo SQ_CANDIDATO e preparar a inclusão ou a ficha ausente para revisão humana.",
  },
  removal: {
    title: "Candidaturas publicadas ausentes da fonte atual",
    action: "Não apagar automaticamente. Confirmar a situação oficial e preparar uma despublicação auditável se a ausência for válida.",
  },
  replacement: {
    title: "Substituições de candidatura detectadas",
    action: "Revisar a candidatura anterior e a substituta, corrigir o vínculo da chapa e preservar a trilha da mudança.",
  },
  status_change: {
    title: "Situações de candidatura mudaram",
    action: "Conferir o novo código no TSE e preparar a atualização do status sem alterar outros campos da ficha.",
  },
  identity_mismatch: {
    title: "Identidades divergem da fonte oficial",
    action: "Reconciliar nome de urna, partido, cargo e UF usando o SQ_CANDIDATO como identidade principal.",
  },
  missing_profile: {
    title: "Candidaturas sem ficha pública vinculada",
    action: "Criar ou vincular a ficha correta e validar a rota pública antes da publicação.",
  },
}

function compact(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
}

function affectedLabel(change: CandidacyChange): string {
  const record = change.official ?? change.published
  if (!record) return compact(change.slot)
  const region = record.uf ?? "BR"
  return compact(`${record.nome_urna} (${record.partido_sigla}, ${record.cargo}, ${region}, SQ ${record.sq_candidato})`)
}

function cappedEvidence(values: string[], total: number): string[] {
  const unique = [...new Set(values)].slice(0, 8)
  if (total > unique.length) unique.push(`mais ${total - unique.length} ocorrência(s) no diff.json`)
  return unique
}

export function buildDataFreshnessRecommendations(input: RecommendationInput): DataFreshnessRecommendation[] {
  const recommendations: DataFreshnessRecommendation[] = []
  const sourceById = new Map(input.registry.map((source) => [source.source_id, source]))
  const sourceErrors = input.freshness.filter((item) => item.status === "source_error")
  const sourceReviews = input.freshness.filter((item) => item.status === "review_required")
  const blockingStale = input.freshness.filter((item) => {
    const source = sourceById.get(item.source_id)
    return item.status === "stale" && source?.stale_policy === "review_required"
  })

  if (sourceErrors.length > 0) {
    recommendations.push({
      code: "source_error",
      priority: "critical",
      title: "Fonte necessária indisponível ou inválida",
      action: "Não corrigir o catálogo com dados incompletos. Confirmar a disponibilidade da fonte oficial e reexecutar a auditoria.",
      evidence: sourceErrors.map((item) => sourceById.get(item.source_id)?.label ?? item.source_id),
    })
  }

  if (sourceReviews.length > 0) {
    recommendations.push({
      code: "source_review",
      priority: "high",
      title: "Fontes exigem revisão humana",
      action: "Abrir a evidência de coleta, validar o conteúdo e liberar uma nova publicação somente depois da conferência.",
      evidence: sourceReviews.map((item) => sourceById.get(item.source_id)?.label ?? item.source_id),
    })
  }

  if (blockingStale.length > 0) {
    recommendations.push({
      code: "blocking_stale",
      priority: "high",
      title: "Coletas obrigatórias estão vencidas",
      action: "Reexecutar os coletores indicados e confirmar a nova data de evidência antes de confiar nos dados publicados.",
      evidence: blockingStale.map((item) => sourceById.get(item.source_id)?.label ?? item.source_id),
    })
  }

  if (input.comparison) {
    for (const [kind, guidance] of Object.entries(CHANGE_GUIDANCE) as Array<
      [CandidacyChangeKind, { title: string; action: string }]
    >) {
      const changes = input.comparison.changes.filter((change) => change.kind === kind)
      if (changes.length === 0) continue
      recommendations.push({
        code: kind,
        priority: "high",
        title: guidance.title,
        action: guidance.action,
        evidence: cappedEvidence(changes.map(affectedLabel), changes.length),
      })
    }
  }

  return recommendations
}

export function recommendationsMarkdown(recommendations: DataFreshnessRecommendation[]): string {
  if (recommendations.length === 0) {
    return "## Próximas ações recomendadas\n\nNenhuma ação corretiva necessária nesta rodada.\n"
  }
  const sections = recommendations.map((recommendation) => {
    const icon = recommendation.priority === "critical" ? "🚨" : "⚠️"
    const evidence = recommendation.evidence.map((item) => `- ${compact(item)}`).join("\n")
    return `### ${icon} ${recommendation.title}\n\n` +
      `- Prioridade: **${recommendation.priority}**\n` +
      `- Ação recomendada: ${recommendation.action}\n\n` +
      `Evidências afetadas:\n\n${evidence}\n`
  })
  return `## Próximas ações recomendadas\n\n${sections.join("\n")}`
}
