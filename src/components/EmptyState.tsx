import { Info, ArrowRight } from "lucide-react"

interface EmptyStateProps {
  title: string
  description: string
  type?: "neutral" | "notable"
  suggestLabel?: string
  onSuggest?: () => void
}

export function EmptyState({ title, description, type = "neutral", suggestLabel, onSuggest }: EmptyStateProps) {
  return (
    <div className={`mt-6 rounded-[12px] border px-5 py-6 text-center ${type === "notable" ? "border-amber-200 bg-amber-50" : "border-border/50 bg-muted"}`}>
      <Info className={`mx-auto size-5 ${type === "notable" ? "text-amber-500" : "text-muted-foreground"}`} />
      <p className={`mt-2 text-[length:var(--text-body)] font-bold ${type === "notable" ? "text-amber-900" : "text-foreground"}`}>
        {title}
      </p>
      <p className={`mt-1 text-[length:var(--text-body-sm)] font-medium ${type === "notable" ? "text-amber-800" : "text-muted-foreground"}`}>
        {description}
      </p>
      {suggestLabel && onSuggest && (
        <button
          onClick={onSuggest}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-[length:var(--text-caption)] font-bold text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          {suggestLabel}
          <ArrowRight className="size-3" />
        </button>
      )}
    </div>
  )
}

export function getPatrimonioEmptyState(hasHistorico: boolean) {
  if (hasHistorico) {
    return {
      title: "Nenhum patrimonio declarado no TSE",
      description: "Para um candidato com historico de cargos publicos, a ausencia de declaracao de bens e uma informacao relevante.",
      type: "notable" as const,
    }
  }
  return {
    title: "Sem declaracao de patrimonio",
    description: "Este candidato nao possui declaracoes de bens registradas no TSE.",
    type: "neutral" as const,
  }
}

export function getProcessosEmptyState() {
  return {
    title: "Nenhum processo encontrado",
    description: "Nao foram encontrados processos judiciais associados a este candidato nas bases consultadas.",
    type: "neutral" as const,
  }
}

export function getVotosEmptyState(hasCargo: boolean) {
  if (!hasCargo) {
    return {
      title: "Sem historico de votacoes",
      description: "Candidato sem mandato legislativo anterior. Nao ha votacoes registradas.",
      type: "neutral" as const,
    }
  }
  return {
    title: "Votacoes ainda nao coletadas",
    description: "Estamos trabalhando para incluir os dados de votacao deste candidato.",
    type: "neutral" as const,
  }
}

export function getTrajetoriaEmptyState() {
  return {
    title: "Primeira candidatura",
    description: "Este candidato nao possui historico de cargos publicos eletivos registrados.",
    type: "neutral" as const,
  }
}

export function getLegislacaoEmptyState(hasCargo: boolean) {
  if (!hasCargo) {
    return {
      title: "Sem projetos de lei",
      description: "Candidato sem mandato legislativo anterior.",
      type: "neutral" as const,
    }
  }
  return {
    title: "Projetos de lei ainda nao coletados",
    description: "Estamos processando os dados de autoria legislativa deste candidato.",
    type: "neutral" as const,
  }
}

export function getFinanciamentoEmptyState() {
  return {
    title: "Sem dados de financiamento",
    description: "Nao ha registros de financiamento de campanha para este candidato no TSE.",
    type: "neutral" as const,
  }
}

export function getGastosEmptyState(hasCargo: boolean) {
  if (!hasCargo) {
    return {
      title: "Sem gastos parlamentares",
      description: "Candidato sem mandato legislativo, sem acesso a cota parlamentar.",
      type: "neutral" as const,
    }
  }
  return {
    title: "Gastos parlamentares ainda nao coletados",
    description: "Estamos processando os dados de cota parlamentar deste candidato.",
    type: "neutral" as const,
  }
}
