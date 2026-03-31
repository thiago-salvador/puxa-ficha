import type { FichaCandidato } from "@/lib/types"
import { formatCompact } from "@/lib/utils"
import { AlertTriangle, TrendingUp, TrendingDown, Scale, Landmark, ArrowRightLeft, FileText, Vote, Briefcase } from "lucide-react"

interface SnapshotItem {
  icon: React.ComponentType<{ className?: string }>
  text: string
  type: "neutral" | "positive" | "warning" | "critical"
}

function buildSnapshot(ficha: FichaCandidato): SnapshotItem[] {
  const items: SnapshotItem[] = []
  const patrimonio = ficha.patrimonio ?? []
  const financiamento = ficha.financiamento ?? []
  const processos = ficha.processos ?? []
  const votos = ficha.votos ?? []
  const historico = ficha.historico ?? []
  const mudancas = ficha.mudancas_partido ?? []
  const pontosAtencao = ficha.pontos_atencao ?? []
  const projetosLei = ficha.projetos_lei ?? []

  // Trajetoria
  if (historico.length > 0) {
    const anos = historico.reduce((acc, h) => {
      const fim = h.periodo_fim ?? new Date().getFullYear()
      return acc + (fim - (h.periodo_inicio ?? fim))
    }, 0)
    if (anos > 0) {
      items.push({
        icon: Briefcase,
        text: `${anos} anos de vida publica em ${historico.length} cargo${historico.length > 1 ? "s" : ""}`,
        type: "neutral",
      })
    }
  } else if (!ficha.cargo_atual) {
    items.push({
      icon: Briefcase,
      text: "Primeira candidatura a cargo eletivo federal",
      type: "neutral",
    })
  }

  // Patrimonio evolution
  if (patrimonio.length >= 2) {
    const sorted = [...patrimonio].sort((a, b) => b.ano_eleicao - a.ano_eleicao)
    const latest = sorted[0]
    const earliest = sorted[sorted.length - 1]
    const delta = ((latest.valor_total - earliest.valor_total) / earliest.valor_total) * 100
    const icon = delta > 0 ? TrendingUp : TrendingDown
    const direction = delta > 0 ? "cresceu" : "caiu"
    items.push({
      icon,
      text: `Patrimonio ${direction} ${Math.abs(Math.round(delta))}% de ${earliest.ano_eleicao} a ${latest.ano_eleicao} (${formatCompact(earliest.valor_total)} → ${formatCompact(latest.valor_total)})`,
      type: delta > 200 ? "warning" : "neutral",
    })
  } else if (patrimonio.length === 1) {
    items.push({
      icon: Landmark,
      text: `Patrimonio declarado de ${formatCompact(patrimonio[0].valor_total)} em ${patrimonio[0].ano_eleicao}`,
      type: "neutral",
    })
  }

  // Processos
  const criminais = processos.filter((p) => p.tipo === "criminal")
  const ativos = processos.filter((p) => p.status === "em_andamento")
  if (criminais.length > 0) {
    items.push({
      icon: Scale,
      text: `${criminais.length} processo${criminais.length > 1 ? "s" : ""} criminal${criminais.length > 1 ? "is" : ""} (${ativos.length} em andamento)`,
      type: "critical",
    })
  } else if (processos.length > 0) {
    items.push({
      icon: Scale,
      text: `${processos.length} processo${processos.length > 1 ? "s" : ""} (nenhum criminal)`,
      type: "neutral",
    })
  }

  // Mudancas de partido
  if (mudancas.length >= 3) {
    items.push({
      icon: ArrowRightLeft,
      text: `Trocou de partido ${mudancas.length} vezes desde ${mudancas.sort((a, b) => a.ano - b.ano)[0].ano}`,
      type: "warning",
    })
  }

  // Votacoes com contradicao
  const contradicoes = votos.filter((v) => v.contradicao)
  if (contradicoes.length > 0) {
    items.push({
      icon: Vote,
      text: `${contradicoes.length} contradicao(oes) detectada(s) em ${votos.length} votacoes monitoradas`,
      type: "warning",
    })
  } else if (votos.length > 0) {
    items.push({
      icon: Vote,
      text: `${votos.length} votacao(oes)-chave monitorada(s)`,
      type: "neutral",
    })
  }

  // Pontos criticos
  const criticos = pontosAtencao.filter((p) => p.gravidade === "critica" || p.gravidade === "alta")
  if (criticos.length > 0 && items.every(i => i.type !== "critical")) {
    items.push({
      icon: AlertTriangle,
      text: `${criticos.length} alerta${criticos.length > 1 ? "s" : ""} de alta gravidade registrado${criticos.length > 1 ? "s" : ""}`,
      type: "critical",
    })
  }

  // Projetos de lei destaque
  const destaques = projetosLei.filter((p) => p.destaque)
  if (destaques.length > 0) {
    items.push({
      icon: FileText,
      text: `${projetosLei.length} projeto${projetosLei.length > 1 ? "s" : ""} de lei (${destaques.length} em destaque)`,
      type: "neutral",
    })
  } else if (projetosLei.length > 0) {
    items.push({
      icon: FileText,
      text: `Autor de ${projetosLei.length} projeto${projetosLei.length > 1 ? "s" : ""} de lei`,
      type: "neutral",
    })
  }

  return items.slice(0, 6)
}

const TYPE_STYLES = {
  neutral: "border-border/50 text-foreground",
  positive: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-900",
}

const ICON_STYLES = {
  neutral: "text-muted-foreground",
  positive: "text-green-600",
  warning: "text-amber-600",
  critical: "text-red-600",
}

export function CandidateSnapshot({ ficha }: { ficha: FichaCandidato }) {
  const items = buildSnapshot(ficha)
  if (items.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-5 pb-6 md:px-12">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[length:var(--text-eyebrow)]">
        Resumo
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 ${TYPE_STYLES[item.type]}`}
          >
            <item.icon className={`mt-0.5 size-3.5 shrink-0 ${ICON_STYLES[item.type]}`} />
            <span className="text-[length:var(--text-caption)] font-medium leading-snug sm:text-[length:var(--text-body-sm)]">
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
