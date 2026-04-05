"use client"

import type { FichaCandidato } from "@/lib/types"
import { buildTimelineEvents } from "@/lib/timeline-utils"
import { classifyAttentionPoints } from "@/lib/attention-points"
import { formatCompact } from "@/lib/utils"
import { PatrimonioChart } from "./BarChart"
import { DonutChart } from "./DonutChart"
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Landmark,
  Scale,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

/* ─── Helpers ──────────────────────────────────── */

function normalizePartyToken(value: string | null | undefined) {
  if (!value) return null

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
}

function isInitialPartyAnchorToken(value: string | null | undefined) {
  const normalized = normalizePartyToken(value)
  return normalized != null && [
    "sempartido",
    "semfiliacaopartidaria",
    "semfiliacao",
    "naofiliado",
    "naofiliadopartido",
    "independente",
    "historicoanteriornaodeterminado",
    "historicoanteriorindeterminado",
  ].includes(normalized)
}

function isObservedCurrentPartyAnchor(
  item: FichaCandidato["mudancas_partido"][number] | null | undefined
) {
  return (
    item?.contexto != null &&
    item.contexto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("filiacao atual observada")
  )
}

function isInitialPartyAnchor(
  item: FichaCandidato["mudancas_partido"][number],
  index: number,
) {
  return index === 0 && isInitialPartyAnchorToken(item.partido_anterior) && !!item.partido_novo
}

function countPartySwitches(mudancas: FichaCandidato["mudancas_partido"]) {
  return [...mudancas]
    .sort((a, b) => a.ano - b.ano)
    .filter((item, index) => !isInitialPartyAnchor(item, index))
    .length
}

function buildPartyJourney(
  mudancas: FichaCandidato["mudancas_partido"],
  partidoSigla: string | null | undefined,
) {
  if (mudancas.length === 0) return "Sem mudancas"

  const ordered = [...mudancas].sort((a, b) => a.ano - b.ano)
  const chain: string[] = []
  const firstAnchor = ordered.find((item, index) => isInitialPartyAnchor(item, index)) ?? null
  const switchCount = countPartySwitches(ordered)

  for (const [index, item] of ordered.entries()) {
    const isAnchor = isInitialPartyAnchor(item, index)

    if (chain.length === 0 && item.partido_anterior && !isAnchor) {
      chain.push(item.partido_anterior)
    }

    if (item.partido_novo && normalizePartyToken(chain.at(-1)) !== normalizePartyToken(item.partido_novo)) {
      chain.push(item.partido_novo)
    }
  }

  if (partidoSigla && normalizePartyToken(chain.at(-1)) !== normalizePartyToken(partidoSigla)) {
    chain.push(partidoSigla)
  }

  if (
    switchCount === 0 &&
    chain.length === 1 &&
    firstAnchor?.ano &&
    !isObservedCurrentPartyAnchor(firstAnchor)
  ) {
    return `${chain[0]} desde ${firstAnchor.ano}`
  }

  return chain.join(" → ")
}

function SectionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 text-[12px] font-bold uppercase tracking-[0.06em] text-neutral-400 transition-colors hover:text-foreground"
    >
      {label} <ChevronRight className="size-3.5" />
    </button>
  )
}

function StatCard({
  icon,
  value,
  label,
  sub,
  trend,
}: {
  icon: React.ReactNode
  value: string
  label: string
  sub?: string
  trend?: "up" | "down" | null
}) {
  return (
    <Card>
      <CardHeader className="flex items-start gap-3 pb-1">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-foreground">
          {icon}
        </div>
        <span className="font-heading text-[28px] leading-none uppercase tracking-tight text-foreground sm:text-5xl">
          {value}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 pt-0">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        {sub && (
          <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
            {trend === "up" && <ChevronUp className="size-3.5 shrink-0" />}
            {trend === "down" && <ChevronDown className="size-3.5 shrink-0" />}
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function MetricRow({
  label,
  sublabel,
  value,
  progressPct,
  indicator,
}: {
  label: string
  sublabel?: string
  value: string
  progressPct?: number
  indicator?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-4 py-2.5">
      {indicator && (
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
          style={{ backgroundColor: indicator }}
        >
          {label.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{label}</p>
        {sublabel && <p className="text-[12px] text-muted-foreground">{sublabel}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[13px] font-bold tabular-nums text-foreground">{value}</span>
        {progressPct !== undefined && (
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{ width: `${Math.max(progressPct, 2)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main component ──────────────────────────── */

export function ProfileOverview({
  ficha,
  onNavigateTab,
}: {
  ficha: FichaCandidato
  onNavigateTab: (tabId: string) => void
}) {
  const patrimonio = ficha.patrimonio ?? []
  const financiamento = ficha.financiamento ?? []
  const processos = ficha.processos ?? []
  const votos = ficha.votos ?? []
  const historico = ficha.historico ?? []
  const mudancas = ficha.mudancas_partido ?? []
  const pontosAtencao = ficha.pontos_atencao ?? []
  const projetosLei = ficha.projetos_lei ?? []
  const gastos = ficha.gastos_parlamentares ?? []
  const { alertasGraves, pontosPositivos } = classifyAttentionPoints(pontosAtencao)

  const latestFin = financiamento.length > 0
    ? [...financiamento].sort((a, b) => b.ano_eleicao - a.ano_eleicao)[0]
    : null
  const topGastos = gastos.length > 0
    ? [...gastos].sort((a, b) => b.ano - a.ano)[0]
    : null
  const contradicoes = votos.filter((v) => v.contradicao)
  const criminais = processos.filter((p) => p.tipo === "criminal")
  const partySwitchCount = countPartySwitches(mudancas)

  const patrimonioSorted = [...patrimonio].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  const latestPatrimonio = patrimonioSorted.at(-1) ?? null
  const earliestPatrimonio = patrimonioSorted.length > 1 ? patrimonioSorted[0] : null
  const patrimonioGrowth =
    latestPatrimonio && earliestPatrimonio && earliestPatrimonio.valor_total > 0
      ? ((latestPatrimonio.valor_total - earliestPatrimonio.valor_total) / earliestPatrimonio.valor_total) * 100
      : null

  const finTotal = latestFin?.total_arrecadado ?? 0
  const finSegments = latestFin
    ? [
        { label: "Fundo Eleitoral", value: latestFin.total_fundo_eleitoral, color: "#0a0a0a" },
        { label: "Fundo Partidario", value: latestFin.total_fundo_partidario, color: "#525252" },
        { label: "Pessoa Fisica", value: latestFin.total_pessoa_fisica, color: "#a3a3a3" },
        { label: "Recursos Proprios", value: latestFin.total_recursos_proprios, color: "#d4d4d4" },
      ].filter((s) => s.value > 0)
    : []

  const timelineEventCount = buildTimelineEvents(ficha).length

  const hasAnything =
    patrimonio.length > 0 ||
    processos.length > 0 ||
    votos.length > 0 ||
    historico.length > 0 ||
    pontosAtencao.length > 0 ||
    projetosLei.length > 0 ||
    gastos.length > 0

  if (!hasAnything) {
    return (
      <Card className="px-8 py-16 text-center">
        <p className="font-heading text-[28px] uppercase tracking-tight text-foreground">Perfil em construcao</p>
        <p className="mt-2 text-[15px] text-muted-foreground">Estamos coletando dados publicos sobre este candidato.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">

      {/* ═══ ALERT BANNER ═══ */}
      {alertasGraves.length > 0 && (
        <Card className="bg-foreground text-background">
          <CardHeader className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 shrink-0 text-background/70" />
              <span className="font-heading text-[28px] leading-none uppercase tracking-tight">
                {alertasGraves.length} alerta{alertasGraves.length > 1 ? "s" : ""} grave{alertasGraves.length > 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() => onNavigateTab("alertas")}
              className="shrink-0 rounded-full border border-background/20 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wider text-background/80 transition-colors hover:border-background/50 hover:text-background"
            >
              Ver todos
            </button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {alertasGraves.slice(0, 3).map((p) => (
              <p key={p.id} className="text-[14px] font-medium leading-snug text-background/70">
                {p.titulo}
              </p>
            ))}
            {alertasGraves.length > 3 && (
              <p className="text-[13px] font-bold text-background/50">+{alertasGraves.length - 3} mais</p>
            )}
          </CardContent>
        </Card>
      )}

      {pontosPositivos.length > 0 && (
        <Card className="border-green-200 bg-green-50 text-green-950">
          <CardHeader className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="size-5 shrink-0 text-green-700" />
              <span className="font-heading text-[28px] leading-none uppercase tracking-tight">
                {pontosPositivos.length} ponto{pontosPositivos.length > 1 ? "s" : ""} positivo{pontosPositivos.length > 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() => onNavigateTab("alertas")}
              className="shrink-0 rounded-full border border-green-200 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wider text-green-800 transition-colors hover:border-green-300 hover:bg-green-100 hover:text-green-900"
            >
              Ver todos
            </button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {pontosPositivos.slice(0, 3).map((p) => (
              <p key={p.id} className="text-[14px] font-medium leading-snug text-green-800">
                {p.titulo}
              </p>
            ))}
            {pontosPositivos.length > 3 && (
              <p className="text-[13px] font-bold text-green-700">+{pontosPositivos.length - 3} mais</p>
            )}
          </CardContent>
        </Card>
      )}

      {timelineEventCount > 0 && (
        <Card className="border-dashed border-border/70 bg-secondary/20">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
              Veja cargos, partidos, patrimonio, processos, votacoes e mais no mesmo eixo temporal.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab("timeline")}
              className="shrink-0 rounded-full border border-foreground bg-transparent px-4 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Abrir Timeline
            </button>
          </CardContent>
        </Card>
      )}

      {/* ═══ STAT CARDS ═══ */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          icon={<Landmark className="size-4" />}
          value={latestPatrimonio ? formatCompact(latestPatrimonio.valor_total) : "N/D"}
          label="Patrimonio declarado"
          sub={
            patrimonioGrowth !== null
              ? `${patrimonioGrowth > 0 ? "+" : ""}${Math.round(patrimonioGrowth)}% desde ${earliestPatrimonio!.ano_eleicao}`
              : latestPatrimonio
              ? `Declarado em ${latestPatrimonio.ano_eleicao}`
              : undefined
          }
          trend={patrimonioGrowth !== null ? (patrimonioGrowth > 0 ? "up" : "down") : null}
        />
        <StatCard
          icon={<Scale className="size-4" />}
          value={String(processos.length)}
          label="Processos judiciais"
          sub={
            criminais.length > 0
              ? `${criminais.length} criminal`
              : processos.length === 0
              ? "Nenhum registrado"
              : processos.map((p) => p.tipo).filter((v, i, a) => a.indexOf(v) === i).join(", ")
          }
          trend={criminais.length > 0 ? "up" : null}
        />
        <StatCard
          icon={<ArrowRightLeft className="size-4" />}
          value={String(partySwitchCount)}
          label="Trocas de partido"
          sub={
            mudancas.length > 0
              ? buildPartyJourney(mudancas, ficha.partido_sigla)
              : "Sem mudancas"
          }
          trend={partySwitchCount >= 3 ? "up" : null}
        />
        <StatCard
          icon={<FileText className="size-4" />}
          value={projetosLei.length > 0 ? String(projetosLei.length) : "N/D"}
          label="Projetos de lei"
          sub={
            projetosLei.length > 0
              ? `${projetosLei.filter((p) => p.situacao === "aprovado").length} aprovados`
              : undefined
          }
        />
      </div>

      {/* ═══ CHARTS ROW ═══ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Patrimonio evolution */}
        {patrimonio.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between pb-0">
              <span className="text-[15px] font-semibold text-foreground">
                Evolucao patrimonial
              </span>
              <SectionLink label="Detalhes" onClick={() => onNavigateTab("dinheiro")} />
            </CardHeader>
            <CardContent>
              <PatrimonioChart
                data={patrimonio.map((p) => ({ ano: p.ano_eleicao, valor: p.valor_total }))}
              />
            </CardContent>
          </Card>
        )}

        {/* Financiamento breakdown */}
        {latestFin && (
          <Card>
            <CardHeader className="flex items-center justify-between pb-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">
                  Financiamento {latestFin.ano_eleicao}
                </span>
                <span className="font-heading text-[28px] leading-none uppercase tracking-tight text-foreground">
                  {formatCompact(finTotal)}
                </span>
              </div>
              <SectionLink label="Detalhes" onClick={() => onNavigateTab("dinheiro")} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <DonutChart
                  segments={finSegments}
                  centerValue={formatCompact(finTotal)}
                  centerLabel="Total"
                  size={160}
                  strokeWidth={24}
                />
              </div>
              {finSegments.length > 0 && (
                <div className="space-y-2">
                  {finSegments.map((s) => (
                    <MetricRow
                      key={s.label}
                      label={s.label}
                      value={formatCompact(s.value)}
                      progressPct={(s.value / finTotal) * 100}
                      indicator={s.color}
                    />
                  ))}
                </div>
              )}
              {latestFin.maiores_doadores.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Maiores doadores
                  </p>
                  <div className="space-y-1.5">
                    {latestFin.maiores_doadores.slice(0, 3).map((d, i) => (
                      <div key={`${d.nome}-${i}`} className="flex items-baseline justify-between">
                        <span className="text-[13px] font-medium text-foreground">{d.nome}</span>
                        <span className="text-[13px] font-bold tabular-nums text-foreground">
                          {formatCompact(d.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══ PROCESSOS + VOTACOES ═══ */}
      {(processos.length > 0 || votos.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {processos.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between pb-0">
                <span className="text-[15px] font-semibold text-foreground">
                  Processos judiciais
                </span>
                <SectionLink label="Todos" onClick={() => onNavigateTab("justica")} />
              </CardHeader>
              <CardContent className="space-y-2">
                {processos.slice(0, 4).map((p) => (
                  <MetricRow
                    key={p.id}
                    label={p.descricao ?? p.tipo}
                    sublabel={p.tipo}
                    value={p.status.replaceAll("_", " ")}
                    indicator={p.tipo === "criminal" ? "#0a0a0a" : "#737373"}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {votos.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold text-foreground">
                    Votacoes-chave
                  </span>
                  {contradicoes.length > 0 && (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-background">
                      {contradicoes.length} contradicao
                    </span>
                  )}
                </div>
                <SectionLink label="Todas" onClick={() => onNavigateTab("votos")} />
              </CardHeader>
              <CardContent className="space-y-2">
                {votos.slice(0, 4).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-start gap-3 rounded-md border border-border px-4 py-2.5"
                  >
                    <span className={`mt-0.5 inline-flex h-6 shrink-0 items-center rounded px-2 text-[10px] font-bold uppercase tracking-wide ${
                      v.voto === "sim"
                        ? "bg-foreground text-background"
                        : v.voto === "não"
                        ? "bg-secondary text-muted-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      {v.voto}
                    </span>
                    <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
                      {v.votacao?.titulo}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══ GASTOS CEAP ═══ */}
      {topGastos && (
        <Card>
          <CardHeader className="flex items-center justify-between pb-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-foreground">
                Cota parlamentar (CEAP)
              </span>
              <span className="font-heading text-[28px] leading-none uppercase tracking-tight text-foreground">
                {formatCompact(topGastos.total_gasto)}
              </span>
              <span className="text-[12px] font-medium text-muted-foreground">{topGastos.ano}</span>
            </div>
            <SectionLink label="Detalhes" onClick={() => onNavigateTab("dinheiro")} />
          </CardHeader>
          {(topGastos.detalhamento ?? []).length > 0 && (
            <CardContent className="space-y-2">
              {[...(topGastos.detalhamento ?? [])]
                .sort((a, b) => b.valor - a.valor)
                .slice(0, 6)
                .map((d, i) => {
                  const shades = ["#0a0a0a", "#262626", "#404040", "#525252", "#737373", "#a3a3a3"]
                  return (
                    <MetricRow
                      key={d.categoria}
                      label={d.categoria}
                      value={formatCompact(d.valor)}
                      progressPct={(d.valor / topGastos.total_gasto) * 100}
                      indicator={shades[i] ?? "#a3a3a3"}
                    />
                  )
                })}
            </CardContent>
          )}
        </Card>
      )}

      {/* ═══ TRAJETORIA ═══ */}
      {historico.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between pb-0">
            <span className="text-[15px] font-semibold text-foreground">
              Carreira politica
            </span>
            <SectionLink label="Completa" onClick={() => onNavigateTab("trajetoria")} />
          </CardHeader>
          <CardContent className="space-y-2">
            {[...historico]
              .sort((a, b) => (b.periodo_inicio ?? 0) - (a.periodo_inicio ?? 0))
              .slice(0, 4)
              .map((h) => (
                <MetricRow
                  key={h.id}
                  label={h.cargo}
                  sublabel={[h.partido, h.estado].filter(Boolean).join(" · ")}
                  value={`${h.periodo_inicio}${h.periodo_fim ? `–${h.periodo_fim}` : "–atual"}`}
                  indicator="#0a0a0a"
                />
              ))}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
