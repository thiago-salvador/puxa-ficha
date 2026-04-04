"use client"

import { memo, useState } from "react"
import type { FichaCandidato } from "@/lib/types"
import { classifyAttentionPoints } from "@/lib/attention-points"
import { formatCompact, formatDate, safeHref } from "@/lib/utils"
import { ProfileTabs, type Tab } from "./ProfileTabs"
import { GravityBadge } from "./GravityBadge"
import { SocialLinks } from "./SocialLinks"
import { NewsSection } from "./NewsSection"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { ProfileOverview } from "./ProfileOverview"
import { StateIndicators } from "./StateIndicators"
import { VotingDots } from "./VotingDots"
import { DataFreshnessNotice } from "./DataFreshnessNotice"
import {
  EmptyState,
  getProcessosEmptyState,
  getVotosEmptyState,
} from "./EmptyState"
import {
  LegislationTabSection,
  MoneyTabSection,
  TrajectoryTabSection,
} from "./CandidatoProfileSections"
import {
  Scale,
  Landmark,
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  FileText,
  ExternalLink,
  Bot,
} from "lucide-react"

const StatCard = memo(function StatCard({
  value,
  label,
  icon: Icon,
  alert,
  sub,
  trend,
  dataValueAttr,
  dataRawValue,
}: {
  value: string | number
  label: string
  icon: React.ComponentType<{ className?: string }>
  alert?: boolean
  sub?: string
  trend?: { value: string; positive?: boolean }
  dataValueAttr?: string
  dataRawValue?: string | number | null
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[16px] border border-border/50 bg-card px-4 py-4 sm:rounded-[20px] sm:px-5 sm:py-5">
      <div className="flex items-center gap-1.5">
        <div className={`flex size-9 items-center justify-center rounded-[10px] sm:size-10 ${alert ? "bg-red-100" : "bg-secondary"}`}>
          <Icon className={`size-[18px] sm:size-5 ${alert ? "text-red-600" : "text-foreground"}`} />
        </div>
      </div>
      <div>
        <span
          {...(dataValueAttr ? { [dataValueAttr]: String(value) } : {})}
          data-pf-overview-raw={dataRawValue ?? undefined}
          className={`block font-heading text-[30px] leading-[0.9] tracking-tight sm:text-[38px] lg:text-[44px] ${alert ? "text-red-700" : "text-foreground"}`}
        >
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
})

export function CandidatoProfile({ ficha }: { ficha: FichaCandidato }) {
  // Null-safe arrays (Supabase can return null for empty relations)
  const patrimonio = ficha.patrimonio ?? []
  const financiamento = ficha.financiamento ?? []
  const processos = ficha.processos ?? []
  const votos = ficha.votos ?? []
  const historico = ficha.historico ?? []
  const mudancas = ficha.mudancas_partido ?? []
  const historicoDescartado = ficha.historico_descartado ?? 0
  const timelinePartidariaIncompleta = ficha.timeline_partidaria_incompleta ?? false
  const pontosAtencao = ficha.pontos_atencao ?? []
  const projetosLei = ficha.projetos_lei ?? []
  const gastos = ficha.gastos_parlamentares ?? []
  const redesSociais = ficha.redes_sociais ?? {}
  const sectionFreshness = ficha.section_freshness ?? {}
  const { alertasGraves, alertasNaoPositivos, pontosPositivos } = classifyAttentionPoints(pontosAtencao)

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
      {sectionFreshness.perfil_atual && (
        <section className="mx-auto max-w-7xl px-5 pt-4 md:px-12">
          <DataFreshnessNotice info={sectionFreshness.perfil_atual} />
        </section>
      )}

      {/* Stats strip */}
      <section className="mx-auto max-w-7xl px-5 py-4 sm:py-6 md:px-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            <StatCard
              value={ficha.total_processos ?? 0}
              label="Processos"
              icon={Scale}
              dataValueAttr="data-pf-overview-processos"
              dataRawValue={ficha.total_processos ?? 0}
              sub={(ficha.processos_criminais ?? 0) > 0 ? `${ficha.processos_criminais} criminal` : undefined}
            />
            <StatCard
              value={latestPatrimonio ? formatCompact(latestPatrimonio.valor_total) : "N/D"}
              label="Patrimonio"
              icon={Landmark}
              dataValueAttr="data-pf-overview-patrimonio"
              dataRawValue={latestPatrimonio?.valor_total ?? null}
              trend={patrimonioVariacao ? {
                value: `${Math.abs(patrimonioVariacao.pct)}% (${patrimonioVariacao.from}-${patrimonioVariacao.to})`,
                positive: patrimonioVariacao.pct > 0 ? undefined : false,
              } : undefined}
            />
            <StatCard
              value={ficha.total_mudancas_partido ?? 0}
              label="Trocas de partido"
              icon={ArrowRightLeft}
              dataValueAttr="data-pf-overview-mudancas"
              dataRawValue={ficha.total_mudancas_partido ?? 0}
            />
            <StatCard
              value={alertasGraves.length}
              label="Alertas graves"
              icon={AlertTriangle}
              alert={alertasGraves.length > 0}
            />
            <StatCard
              value={projetosLei.length > 0 ? projetosLei.length : totalGastos != null ? formatCompact(totalGastos) : "N/D"}
              label={projetosLei.length > 0 ? "Projetos de lei" : "Gastos CEAP"}
              icon={projetosLei.length > 0 ? FileText : Banknote}
              sub={projetosLei.length > 0 ? `${projetosLei.filter(p => p.destaque).length} em destaque` : gastos.length > 0 ? `${gastos.length} ano${gastos.length > 1 ? "s" : ""}` : undefined}
            />
        </div>
      </section>


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
              <MoneyTabSection
                patrimonio={patrimonio}
                financiamento={financiamento}
                gastos={gastos}
                historicoLength={historico.length}
                suggestion={suggestFor("dinheiro")}
                freshness={{
                  patrimonio: sectionFreshness.patrimonio,
                  financiamento: sectionFreshness.financiamento,
                  gastos_parlamentares: sectionFreshness.gastos_parlamentares,
                }}
              />
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
              <TrajectoryTabSection
                historico={historico}
                mudancas={mudancas}
                historicoDescartado={historicoDescartado}
                timelinePartidariaIncompleta={timelinePartidariaIncompleta}
                partidoAtualSigla={ficha.partido_sigla}
                partidoAtualNome={ficha.partido_atual}
                suggestion={suggestFor("trajetoria")}
                freshness={{
                  historico_politico: sectionFreshness.historico_politico,
                  mudancas_partido: sectionFreshness.mudancas_partido,
                }}
              />
            )}

            {/* LEGISLACAO TAB */}
            {activeTab === "legislacao" && (
              <LegislationTabSection
                projetosLei={projetosLei}
                hasCurrentOffice={!!ficha.cargo_atual}
                suggestion={suggestFor("legislacao")}
                freshness={sectionFreshness.projetos_lei}
              />
            )}

            {/* ALERTAS TAB */}
            {activeTab === "alertas" && (
              <div>
                <SectionLabel>Pontos de atencao e feitos ({pontosAtencao.length})</SectionLabel>
                <SectionTitle>O que voce precisa saber</SectionTitle>
                <div className="mt-6 space-y-8">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Alertas e pontos de atencao ({alertasNaoPositivos.length})
                      </h3>
                    </div>
                    {alertasNaoPositivos.length === 0 && (
                      <div className="rounded-[16px] border border-border/50 bg-secondary/40 px-5 py-4">
                        <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                          Nenhum alerta negativo visivel registrado no momento.
                        </p>
                      </div>
                    )}
                    {alertasNaoPositivos.map((p) => (
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
                          {p.gerado_por === "ia" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-violet-700">
                              <Bot className="size-3" /> Gerado por IA
                            </span>
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
                            {(p.fontes ?? []).filter(f => safeHref(f.url)).map((f, i) => (
                              <a
                                key={i}
                                href={safeHref(f.url)!}
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
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-green-700">
                        Pontos positivos ({pontosPositivos.length})
                      </h3>
                    </div>
                    {pontosPositivos.length === 0 && (
                      <div className="rounded-[16px] border border-green-200 bg-green-50 px-5 py-4">
                        <p className="text-[length:var(--text-body-sm)] font-medium text-green-800">
                          Nenhum ponto positivo destacado no momento.
                        </p>
                      </div>
                    )}
                    {pontosPositivos.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-[16px] border border-green-200 border-l-[3px] bg-green-50 px-5 py-4"
                        style={{ borderLeftColor: "#16a34a" }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-green-800">
                            Ponto positivo
                          </span>
                          {p.verificado && (
                            <span className="text-[10px] font-semibold text-green-700">Verificado</span>
                          )}
                          {p.gerado_por === "ia" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-violet-700">
                              <Bot className="size-3" /> Gerado por IA
                            </span>
                          )}
                        </div>
                        <h4 className="mt-2 text-[length:var(--text-body)] font-bold text-green-950 sm:text-[15px]">
                          {p.titulo}
                        </h4>
                        <p className="mt-1 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-green-900">
                          {p.descricao}
                        </p>
                        {(p.fontes ?? []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(p.fontes ?? []).filter(f => safeHref(f.url)).map((f, i) => (
                              <a
                                key={i}
                                href={safeHref(f.url)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[length:var(--text-caption)] font-semibold text-green-900 underline decoration-green-500/60"
                              >
                                {f.titulo} <ExternalLink className="size-2.5" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
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
