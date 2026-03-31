import type { FichaCandidato } from "@/lib/types"

interface Dimension {
  label: string
  status: "full" | "partial" | "empty"
  tooltip: string
}

function getDimensions(ficha: FichaCandidato): Dimension[] {
  const patrimonio = ficha.patrimonio ?? []
  const financiamento = ficha.financiamento ?? []
  const votos = ficha.votos ?? []
  const processos = ficha.processos ?? []
  const historico = ficha.historico ?? []
  const pontosAtencao = ficha.pontos_atencao ?? []

  return [
    {
      label: "Bio",
      status: ficha.biografia && ficha.data_nascimento && ficha.formacao ? "full" : ficha.biografia ? "partial" : "empty",
      tooltip: ficha.biografia ? "Biografia disponivel" : "Sem biografia detalhada",
    },
    {
      label: "Patrimonio",
      status: patrimonio.length >= 2 ? "full" : patrimonio.length === 1 ? "partial" : "empty",
      tooltip: patrimonio.length > 0 ? `${patrimonio.length} declaracao(oes)` : "Nenhum patrimonio declarado no TSE",
    },
    {
      label: "Financiamento",
      status: financiamento.length >= 1 ? "full" : "empty",
      tooltip: financiamento.length > 0 ? `${financiamento.length} campanha(s)` : "Sem dados de financiamento",
    },
    {
      label: "Votacoes",
      status: votos.length >= 5 ? "full" : votos.length > 0 ? "partial" : "empty",
      tooltip: votos.length > 0 ? `${votos.length} votacao(oes) registrada(s)` : "Sem votacoes registradas",
    },
    {
      label: "Processos",
      status: processos.length > 0 ? "full" : "empty",
      tooltip: processos.length > 0 ? `${processos.length} processo(s)` : "Nenhum processo encontrado",
    },
    {
      label: "Trajetoria",
      status: historico.length >= 2 ? "full" : historico.length === 1 ? "partial" : "empty",
      tooltip: historico.length > 0 ? `${historico.length} cargo(s) registrado(s)` : "Sem historico de cargos",
    },
  ]
}

const STATUS_COLORS = {
  full: "bg-foreground",
  partial: "bg-gray-400",
  empty: "bg-gray-200",
}

export function DataCompleteness({ ficha }: { ficha: FichaCandidato }) {
  const dimensions = getDimensions(ficha)
  const filled = dimensions.filter((d) => d.status !== "empty").length

  return (
    <div className="rounded-[12px] border border-border/50 px-4 py-3 sm:rounded-[16px] sm:px-5 sm:py-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
          Dados disponiveis
        </span>
        <span className="text-[length:var(--text-caption)] font-bold text-foreground sm:text-[length:var(--text-body-sm)]">
          {filled} de {dimensions.length}
        </span>
      </div>
      <div className="mt-2.5 flex gap-1">
        {dimensions.map((d) => (
          <div key={d.label} className="flex-1" title={`${d.label}: ${d.tooltip}`}>
            <div className={`h-1.5 rounded-full ${STATUS_COLORS[d.status]}`} />
            <span className="mt-1 block text-center text-[9px] font-semibold text-muted-foreground">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
