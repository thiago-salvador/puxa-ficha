"use client"

import { useState } from "react"
import type { FichaCandidato } from "@/lib/types"
import { formatBRL, formatCompact, formatDate } from "@/lib/utils"
import { ProfileTabs, type Tab } from "./ProfileTabs"
import { AlertBanner } from "./AlertBanner"
import { GravityBadge } from "./GravityBadge"
import { PatrimonioChart, StackedBar, HorizontalBars } from "./BarChart"
import { ExpandableCard } from "./ExpandableCard"
import { SocialLinks } from "./SocialLinks"
import { NewsSection } from "./NewsSection"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { ProfileOverview } from "./ProfileOverview"
import { DataCompleteness } from "./DataCompleteness"
import { StateIndicators } from "./StateIndicators"
import { CandidateSnapshot } from "./CandidateSnapshot"
import { VotingDots } from "./VotingDots"
import {
  EmptyState,
  getPatrimonioEmptyState,
  getProcessosEmptyState,
  getVotosEmptyState,
  getTrajetoriaEmptyState,
  getLegislacaoEmptyState,
  getFinanciamentoEmptyState,
  getGastosEmptyState,
} from "./EmptyState"
import {
  Scale,
  Landmark,
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  FileText,
  ExternalLink,
} from "lucide-react"

function StatCard({
  value,
  label,
  icon: Icon,
  alert,
  sub,
  trend,
}: {
  value: string | number
  label: string
  icon: React.ComponentType<{ className?: string }>
  alert?: boolean
  sub?: string
  trend?: { value: string; positive?: boolean }
}) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-center gap-1.5">
        <div className={`flex size-9 items-center justify-center rounded-[10px] sm:size-10 ${alert ? "bg-red-100" : "bg-secondary"}`}>
          <Icon className={`size-[18px] sm:size-5 ${alert ? "text-red-600" : "text-foreground"}`} />
        </div>
      </div>
      <div>
        <span className={`block font-heading text-[30px] leading-[0.9] tracking-tight sm:text-[38px] lg:text-[44px] ${alert ? "text-red-700" : "text-foreground"}`}>
          {value}
        </span>
        <span className={`mt-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] sm:text-[length:var(--text-eyebrow)] ${alert ? "text-red-500" : "text-muted-foreground"}`}>
          {label}
        </span>
      </div>
      {(sub || trend) && (
        <div className="flex items-center gap-1.5">
          {trend && (
            <span className={`flex items-center gap-0.5 text-[10px] font-bold sm:text-[length:var(--text-caption)] ${trend.positive === false ? "text-red-600" : trend.positive ? "text-green-600" : "text-muted-foreground"}`}>
              {trend.positive ? "↑" : trend.positive === false ? "↓" : ""}{trend.value}
            </span>
          )}
          {sub && !trend && (
            <span className="text-[10px] font-semibold text-muted-foreground sm:text-[length:var(--text-caption)]">
              {sub}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const FINANCING_COLORS = {
  "Fundo Eleitoral": "#0a0a0a",
  "Fundo Partidario": "#525252",
  "Pessoa Fisica": "#a3a3a3",
  "Recursos Proprios": "#d4d4d4",
}

export function CandidatoProfile({ ficha }: { ficha: FichaCandidato }) {
  // Null-safe arrays (Supabase can return null for empty relations)
  const patrimonio = ficha.patrimonio ?? []
  const financiamento = ficha.financiamento ?? []
  const processos = ficha.processos ?? []
  const votos = ficha.votos ?? []
  const historico = ficha.historico ?? []
  const mudancas = ficha.mudancas_partido ?? []
  const pontosAtencao = ficha.pontos_atencao ?? []
  const projetosLei = ficha.projetos_lei ?? []
  const gastos = ficha.gastos_parlamentares ?? []
  const redesSociais = ficha.redes_sociais ?? {}

  // Tab definitions
  const tabDefs = [
    { id: "geral", label: "Visao Geral", dataCount: 0 },
    { id: "dinheiro", label: "Dinheiro", dataCount: patrimonio.length + financiamento.length + gastos.length },
    { id: "justica", label: "Justica", dataCount: processos.length },
    { id: "votos", label: "Votos", dataCount: votos.length },
    { id: "trajetoria", label: "Trajetoria", dataCount: historico.length + mudancas.length },
    { id: "legislacao", label: "Legislacao", dataCount: projetosLei.length },
    { id: "alertas", label: "Alertas", dataCount: pontosAtencao.length },
  ]

  const [activeTab, setActiveTab] = useState("geral")

  const tabs: Tab[] = tabDefs.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.dataCount || undefined,
  }))

  const latestPatrimonio =
    patrimonio.length > 0
      ? [...patrimonio].sort((a, b) => b.ano_eleicao - a.ano_eleicao)[0]
      : null

  const patrimonioVariacao =
    patrimonio.length >= 2
      ? (() => {
          const sorted = [...patrimonio].sort((a, b) => b.ano_eleicao - a.ano_eleicao)
          const latest = sorted[0]
          const prev = sorted[1]
          const pct = ((latest.valor_total - prev.valor_total) / prev.valor_total) * 100
          return { pct: Math.round(pct), from: prev.ano_eleicao, to: latest.ano_eleicao }
        })()
      : null

  const totalGastos =
    gastos.length > 0
      ? gastos.reduce((acc, g) => acc + g.total_gasto, 0)
      : null

  // For empty states: suggest navigating to a tab that has data
  function suggestFor(currentTabId: string): { label: string; go: () => void } | null {
    const other = tabDefs
      .filter((t) => t.id !== currentTabId && t.dataCount > 0)
      .sort((a, b) => b.dataCount - a.dataCount)[0]
    if (!other) return null
    return { label: `Ver ${other.label} (${other.dataCount})`, go: () => setActiveTab(other.id) }
  }

  return (
    <>
      {/* Stats strip */}
      <section className="mx-auto max-w-7xl px-5 py-4 sm:py-6 md:px-12">
        <div className="rounded-[16px] border border-border/50 bg-card sm:rounded-[20px]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:border-border/30">
            <StatCard value={ficha.total_processos ?? 0} label="Processos" icon={Scale} sub={(ficha.processos_criminais ?? 0) > 0 ? `${ficha.processos_criminais} criminal` : undefined} />
            <StatCard
              value={latestPatrimonio ? formatCompact(latestPatrimonio.valor_total) : "N/D"}
              label="Patrimonio"
              icon={Landmark}
              trend={patrimonioVariacao ? {
                value: `${Math.abs(patrimonioVariacao.pct)}% (${patrimonioVariacao.from}-${patrimonioVariacao.to})`,
                positive: patrimonioVariacao.pct > 0 ? undefined : false,
              } : undefined}
            />
            <StatCard value={ficha.total_mudancas_partido ?? 0} label="Trocas de partido" icon={ArrowRightLeft} />
            <StatCard
              value={ficha.pontos_criticos ?? 0}
              label="Alertas criticos"
              icon={AlertTriangle}
              alert={(ficha.pontos_criticos ?? 0) > 0}
            />
            <StatCard
              value={projetosLei.length > 0 ? projetosLei.length : totalGastos != null ? formatCompact(totalGastos) : "N/D"}
              label={projetosLei.length > 0 ? "Projetos de lei" : "Gastos CEAP"}
              icon={projetosLei.length > 0 ? FileText : Banknote}
              sub={projetosLei.length > 0 ? `${projetosLei.filter(p => p.destaque).length} em destaque` : gastos.length > 0 ? `${gastos.length} ano${gastos.length > 1 ? "s" : ""}` : undefined}
            />
          </div>
        </div>
      </section>

      {/* Alert banner for critical items */}
      {pontosAtencao.some((p) => p.gravidade === "critica") && (
        <div className="mx-auto max-w-7xl px-5 pb-4 md:px-12">
          <AlertBanner pontos={pontosAtencao} />
        </div>
      )}

      {/* Social links */}
      {(Object.keys(redesSociais).length > 0 || ficha.site_campanha) && (
        <div className="mx-auto max-w-7xl px-5 pb-4 md:px-12">
          <SocialLinks redes={redesSociais} site={ficha.site_campanha} />
        </div>
      )}

      {/* Tab navigation */}
      {tabs.length > 0 && (
        <>
          <ProfileTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
            {/* VISAO GERAL TAB */}
            {activeTab === "geral" && (
              <div className="space-y-12">
                <ProfileOverview ficha={ficha} onNavigateTab={setActiveTab} />
                {ficha.cargo_disputado === "Governador" && (ficha.indicadores_estaduais ?? []).length > 0 && (
                  <StateIndicators indicadores={ficha.indicadores_estaduais!} estado={ficha.estado ?? ""} />
                )}
                {ficha.noticias && ficha.noticias.length > 0 && (
                  <NewsSection noticias={ficha.noticias} />
                )}
              </div>
            )}

            {/* DINHEIRO TAB */}
            {activeTab === "dinheiro" && (
              <div className="space-y-12">
                {/* Patrimonio */}
                {patrimonio.length > 0 && (
                  <div>
                    <SectionLabel>Patrimonio declarado</SectionLabel>
                    <SectionTitle>Evolucao patrimonial</SectionTitle>
                    <div className="mt-6">
                      <PatrimonioChart
                        data={patrimonio.map((p) => ({ ano: p.ano_eleicao, valor: p.valor_total }))}
                      />
                    </div>
                    {/* Bens detalhados (expandable) */}
                    <div className="mt-6 space-y-3">
                      {[...patrimonio]
                        .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
                        .filter((p) => (p.bens ?? []).length > 0)
                        .map((p) => (
                          <ExpandableCard
                            key={p.id}
                            title={`${p.ano_eleicao}`}
                            subtitle={formatBRL(p.valor_total)}
                          >
                            <div className="space-y-2">
                              {(p.bens ?? []).map((b, i) => (
                                <div key={i} className="flex items-baseline justify-between rounded-[8px] bg-muted px-3 py-2">
                                  <div>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{b.tipo}</span>
                                    <p className="text-[length:var(--text-body-sm)] font-medium text-foreground">{b.descricao}</p>
                                  </div>
                                  <span className="ml-3 shrink-0 text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                                    {formatBRL(b.valor)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </ExpandableCard>
                        ))}
                    </div>
                  </div>
                )}

                {/* Financiamento */}
                {financiamento.length > 0 && (
                  <div>
                    <SectionLabel>Financiamento de campanha</SectionLabel>
                    <SectionTitle>De onde vem o dinheiro</SectionTitle>
                    <div className="mt-6 space-y-6">
                      {[...financiamento]
                        .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
                        .map((f) => (
                          <div key={f.id} className="space-y-4 rounded-[16px] border border-border/50 px-5 py-5">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">{f.ano_eleicao}</span>
                              <span className="text-[24px] font-bold tracking-tight text-foreground sm:text-[28px]">{formatBRL(f.total_arrecadado)}</span>
                            </div>
                            <StackedBar
                              segments={[
                                { label: "Fundo Eleitoral", value: f.total_fundo_eleitoral, color: FINANCING_COLORS["Fundo Eleitoral"] },
                                { label: "Fundo Partidario", value: f.total_fundo_partidario, color: FINANCING_COLORS["Fundo Partidario"] },
                                { label: "Pessoa Fisica", value: f.total_pessoa_fisica, color: FINANCING_COLORS["Pessoa Fisica"] },
                                { label: "Recursos Proprios", value: f.total_recursos_proprios, color: FINANCING_COLORS["Recursos Proprios"] },
                              ]}
                            />
                            {/* Maiores doadores */}
                            {(f.maiores_doadores ?? []).length > 0 && (
                              <div className="mt-3 border-t border-border/50 pt-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Maiores doadores</p>
                                <div className="space-y-1.5">
                                  {(f.maiores_doadores ?? []).map((d, i) => (
                                    <div key={i} className="flex items-center justify-between text-[length:var(--text-body-sm)]">
                                      <span className="font-medium text-foreground">{d.nome}</span>
                                      <span className="font-bold tabular-nums text-foreground">{formatBRL(d.valor)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Empty states for patrimonio + financiamento */}
                {patrimonio.length === 0 && financiamento.length === 0 && (
                  <div>
                    <SectionLabel>Dinheiro</SectionLabel>
                    <SectionTitle>Dados financeiros</SectionTitle>
                    {(() => { const e = getPatrimonioEmptyState(historico.length > 0); const s = suggestFor("dinheiro"); return <EmptyState {...e} suggestLabel={s?.label} onSuggest={s?.go} /> })()}
                  </div>
                )}
                {patrimonio.length === 0 && financiamento.length > 0 && (
                  <div>
                    {(() => { const e = getPatrimonioEmptyState(historico.length > 0); return <EmptyState {...e} /> })()}
                  </div>
                )}
                {financiamento.length === 0 && patrimonio.length > 0 && (
                  <div>
                    {(() => { const e = getFinanciamentoEmptyState(); return <EmptyState {...e} /> })()}
                  </div>
                )}

                {/* Gastos parlamentares */}
                {gastos.length > 0 && (
                  <div>
                    <SectionLabel>Gastos parlamentares</SectionLabel>
                    <SectionTitle>Uso da cota parlamentar (CEAP)</SectionTitle>
                    <div className="mt-6 space-y-4">
                      {gastos.map((g) => (
                        <ExpandableCard
                          key={g.id}
                          title={`${g.ano}`}
                          subtitle={formatBRL(g.total_gasto)}
                          defaultOpen={gastos.length === 1}
                        >
                          <div className="space-y-4">
                            {(g.detalhamento ?? []).length > 0 && (
                              <HorizontalBars
                                items={(g.detalhamento ?? []).map((d) => ({ label: d.categoria, value: d.valor }))}
                              />
                            )}
                            {(g.gastos_destaque ?? []).length > 0 && (
                              <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-red-600">Destaques</p>
                                {(g.gastos_destaque ?? []).map((d, i) => (
                                  <div key={i} className="rounded-[8px] bg-red-50 px-3 py-2">
                                    <p className="text-[length:var(--text-body-sm)] font-medium text-red-900">{d.descricao}</p>
                                    <p className="text-[length:var(--text-caption)] font-bold text-red-700">{formatBRL(d.valor)}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </ExpandableCard>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* JUSTICA TAB */}
            {activeTab === "justica" && (
              <div>
                <SectionLabel>Processos judiciais ({processos.length})</SectionLabel>
                <SectionTitle>Situacao na justica</SectionTitle>
                {processos.length === 0 && (() => { const s = suggestFor("justica"); return <EmptyState {...getProcessosEmptyState()} suggestLabel={s?.label} onSuggest={s?.go} /> })()}
                {/* Group by type */}
                {(["criminal", "improbidade", "eleitoral", "civil"] as const).map((tipo) => {
                  const grouped = processos.filter((p) => p.tipo === tipo)
                  if (grouped.length === 0) return null
                  return (
                    <div key={tipo} className="mt-6">
                      <h3 className="mb-3 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {tipo} ({grouped.length})
                      </h3>
                      <div className="space-y-3">
                        {grouped.map((p) => (
                          <div
                            key={p.id}
                            className="rounded-[12px] border border-border/50 border-l-[3px] px-5 py-4"
                            style={{
                              borderLeftColor: p.gravidade === "alta" ? "#dc2626" : p.gravidade === "media" ? "#f59e0b" : "#d4d4d4",
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <GravityBadge gravidade={p.gravidade} />
                              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-foreground">
                                {p.status.replaceAll("_", " ")}
                              </span>
                              {p.data_inicio && (
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  Desde {formatDate(p.data_inicio)}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-[length:var(--text-body)] font-medium leading-snug text-foreground">
                              {p.descricao}
                            </p>
                            {p.tribunal && (
                              <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                                {p.tribunal} {p.numero_processo ? `| ${p.numero_processo}` : ""}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* VOTOS TAB */}
            {activeTab === "votos" && (
              <div>
                <SectionLabel>Votacoes-chave ({votos.length})</SectionLabel>
                <SectionTitle>Como votou em temas importantes</SectionTitle>
                {/* Visual dot grid */}
                {votos.length > 0 && (
                  <div className="mt-6">
                    <VotingDots votos={votos} />
                  </div>
                )}
                {votos.length === 0 && (() => { const s = suggestFor("votos"); return <EmptyState {...getVotosEmptyState(!!ficha.cargo_atual)} suggestLabel={s?.label} onSuggest={s?.go} /> })()}
                <div className="mt-6 space-y-3">
                  {votos.map((v) => (
                    <div
                      key={v.id}
                      className={`rounded-[12px] border px-5 py-4 ${v.contradicao ? "border-amber-300 bg-amber-50" : "border-border/50"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                            {v.votacao?.titulo ?? "Votacao"}
                          </p>
                          {v.votacao?.descricao && (
                            <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                              {v.votacao.descricao}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {v.votacao?.tema && (
                              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-foreground">
                                {v.votacao.tema}
                              </span>
                            )}
                            {v.votacao?.casa && (
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {v.votacao.casa} | {v.votacao.data_votacao ? formatDate(v.votacao.data_votacao) : ""}
                              </span>
                            )}
                          </div>
                          {v.contradicao && v.contradicao_descricao && (
                            <div className="mt-2 flex items-start gap-1.5 rounded-[8px] bg-amber-100 px-3 py-2">
                              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700" />
                              <p className="text-[length:var(--text-caption)] font-semibold text-amber-800">
                                {v.contradicao_descricao}
                              </p>
                            </div>
                          )}
                          {v.votacao?.impacto_popular && (
                            <p className="mt-1.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                              Impacto: {v.votacao.impacto_popular}
                            </p>
                          )}
                        </div>
                        <span
                          className={`mt-1 shrink-0 rounded-full px-3.5 py-1.5 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] ${
                            v.voto === "sim"
                              ? "bg-foreground text-background"
                              : v.voto === "não"
                                ? "border border-foreground bg-transparent text-foreground"
                                : "bg-secondary text-foreground"
                          }`}
                        >
                          {v.voto}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TRAJETORIA TAB */}
            {activeTab === "trajetoria" && (
              <div className="space-y-12">
                {historico.length === 0 && mudancas.length === 0 && (
                  <div>
                    <SectionLabel>Trajetoria</SectionLabel>
                    <SectionTitle>Historico politico</SectionTitle>
                    {(() => { const s = suggestFor("trajetoria"); return <EmptyState {...getTrajetoriaEmptyState()} suggestLabel={s?.label} onSuggest={s?.go} /> })()}
                  </div>
                )}
                {/* Timeline historico */}
                {historico.length > 0 && (
                  <div>
                    <SectionLabel>Trajetoria politica</SectionLabel>
                    <SectionTitle>Cargos e mandatos</SectionTitle>
                    <div className="mt-6">
                      {[...historico]
                        .sort((a, b) => (b.periodo_inicio ?? 0) - (a.periodo_inicio ?? 0))
                        .map((h, i) => (
                          <div
                            key={h.id}
                            className="relative flex gap-4 pb-6 last:pb-0 sm:gap-6"
                          >
                            {/* Timeline line */}
                            <div className="flex flex-col items-center">
                              <div className="size-3 rounded-full border-2 border-foreground bg-background" />
                              {i < historico.length - 1 && (
                                <div className="w-px flex-1 bg-border" />
                              )}
                            </div>
                            <div className="flex-1 -mt-0.5">
                              <span className="text-[length:var(--text-caption)] font-bold tabular-nums text-muted-foreground sm:text-[length:var(--text-body-sm)]">
                                {h.periodo_inicio}{h.periodo_fim ? ` - ${h.periodo_fim}` : " - atual"}
                              </span>
                              <p className="mt-0.5 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">{h.cargo}</p>
                              <p className="text-[length:var(--text-body-sm)] font-semibold text-muted-foreground">
                                {h.partido} {h.estado ? `(${h.estado})` : ""}
                              </p>
                              {h.observacoes && (
                                <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">{h.observacoes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Mudancas de partido */}
                {mudancas.length > 0 && (
                  <div>
                    <SectionLabel>Mudancas de partido ({mudancas.length})</SectionLabel>
                    <SectionTitle>Historico partidario</SectionTitle>
                    <div className="mt-6 space-y-0">
                      {[...mudancas]
                        .sort((a, b) => b.ano - a.ano)
                        .map((m, i) => (
                          <div
                            key={m.id}
                            className={`flex items-baseline gap-4 py-3 sm:gap-6 sm:py-4 ${i > 0 ? "border-t border-border/50" : ""}`}
                          >
                            <span className="w-[50px] shrink-0 text-[length:var(--text-caption)] font-bold tabular-nums text-foreground sm:w-[60px] sm:text-[length:var(--text-body-sm)]">
                              {m.ano}
                            </span>
                            <div>
                              <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                                {m.partido_anterior} → {m.partido_novo}
                              </p>
                              {m.contexto && (
                                <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">{m.contexto}</p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* LEGISLACAO TAB */}
            {activeTab === "legislacao" && (
              <div>
                <SectionLabel>Projetos de lei ({projetosLei.length})</SectionLabel>
                <SectionTitle>Autoria legislativa</SectionTitle>
                {projetosLei.length === 0 && (() => { const s = suggestFor("legislacao"); return <EmptyState {...getLegislacaoEmptyState(!!ficha.cargo_atual)} suggestLabel={s?.label} onSuggest={s?.go} /> })()}
                <div className="mt-6 space-y-3">
                  {[...projetosLei]
                    .sort((a, b) => {
                      if (a.destaque && !b.destaque) return -1
                      if (!a.destaque && b.destaque) return 1
                      return (b.ano ?? 0) - (a.ano ?? 0)
                    })
                    .map((p) => (
                      <div
                        key={p.id}
                        className={`rounded-[12px] border px-5 py-4 ${p.destaque ? "border-foreground bg-muted" : "border-border/50"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[length:var(--text-body)] font-bold text-foreground">
                            {p.tipo} {p.numero}/{p.ano}
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${
                            p.situacao === "aprovado" ? "bg-green-100 text-green-800" :
                            p.situacao === "tramitando" ? "bg-blue-100 text-blue-800" :
                            p.situacao === "vetado" ? "bg-red-100 text-red-800" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {p.situacao}
                          </span>
                          {p.destaque && (
                            <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-background">
                              Destaque
                            </span>
                          )}
                          {p.tema && (
                            <span className="text-[10px] font-semibold text-muted-foreground">{p.tema}</span>
                          )}
                        </div>
                        {p.ementa && (
                          <p className="mt-2 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                            {p.ementa}
                          </p>
                        )}
                        {p.destaque_motivo && (
                          <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                            {p.destaque_motivo}
                          </p>
                        )}
                        {p.url_inteiro_teor && (
                          <a
                            href={p.url_inteiro_teor}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-[length:var(--text-caption)] font-semibold text-foreground underline"
                          >
                            Inteiro teor <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ALERTAS TAB */}
            {activeTab === "alertas" && (
              <div>
                <SectionLabel>Pontos de atencao ({pontosAtencao.length})</SectionLabel>
                <SectionTitle>O que voce precisa saber</SectionTitle>
                <div className="mt-6 space-y-3">
                  {[...pontosAtencao]
                    .sort((a, b) => {
                      const order = { critica: 0, alta: 1, media: 2, baixa: 3 }
                      return (order[a.gravidade as keyof typeof order] ?? 2) - (order[b.gravidade as keyof typeof order] ?? 2)
                    })
                    .map((p) => (
                      <div
                        key={p.id}
                        className="rounded-[16px] border border-border/50 border-l-[3px] px-5 py-4"
                        style={{
                          borderLeftColor:
                            p.gravidade === "critica" ? "#dc2626" :
                            p.gravidade === "alta" ? "#f97316" :
                            p.gravidade === "media" ? "#f59e0b" : "#d4d4d4",
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <GravityBadge gravidade={p.gravidade} />
                          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-foreground">
                            {p.categoria.replaceAll("_", " ")}
                          </span>
                          {p.verificado && (
                            <span className="text-[10px] font-semibold text-green-700">Verificado</span>
                          )}
                        </div>
                        <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                          {p.titulo}
                        </h4>
                        <p className="mt-1 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                          {p.descricao}
                        </p>
                        {(p.fontes ?? []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(p.fontes ?? []).map((f, i) => (
                              <a
                                key={i}
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[length:var(--text-caption)] font-semibold text-foreground underline decoration-muted-foreground"
                              >
                                {f.titulo} <ExternalLink className="size-2.5" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Source footer */}
      <div className="mx-auto max-w-7xl px-5 pb-4 md:px-12">
        <p className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
          Fonte: {(ficha.fonte_dados ?? []).join(", ") || "TSE"} | Atualizado em{" "}
          {formatDate(ficha.ultima_atualizacao)}
        </p>
      </div>
    </>
  )
}
