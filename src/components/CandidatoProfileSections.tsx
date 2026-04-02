import {
  EmptyState,
  getFinanciamentoEmptyState,
  getLegislacaoEmptyState,
  getPatrimonioEmptyState,
  getTrajetoriaEmptyState,
} from "./EmptyState"
import { ExpandableCard } from "./ExpandableCard"
import { HorizontalBars, PatrimonioChart, StackedBar } from "./BarChart"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { formatBRL, safeHref } from "@/lib/utils"
import type {
  Financiamento,
  GastoParlamentar,
  HistoricoPolitico,
  MudancaPartido,
  Patrimonio,
  ProjetoLei,
  SectionFreshnessInfo,
} from "@/lib/types"
import { AlertTriangle, ExternalLink } from "lucide-react"
import { DataFreshnessNotice } from "./DataFreshnessNotice"

export interface SuggestAction {
  label: string
  go: () => void
}

const FINANCING_COLORS = {
  "Fundo Eleitoral": "#0a0a0a",
  "Fundo Partidario": "#525252",
  "Pessoa Fisica": "#a3a3a3",
  "Recursos Proprios": "#d4d4d4",
}

interface MoneyTabSectionProps {
  patrimonio: Patrimonio[]
  financiamento: Financiamento[]
  gastos: GastoParlamentar[]
  historicoLength: number
  suggestion: SuggestAction | null
  freshness?: {
    patrimonio?: SectionFreshnessInfo
    financiamento?: SectionFreshnessInfo
    gastos_parlamentares?: SectionFreshnessInfo
  }
}

export function MoneyTabSection({
  patrimonio,
  financiamento,
  gastos,
  historicoLength,
  suggestion,
  freshness,
}: MoneyTabSectionProps) {
  return (
    <div className="space-y-12">
      {patrimonio.length > 0 && (
        <div>
          <SectionLabel>Patrimonio declarado</SectionLabel>
          <SectionTitle>Evolucao patrimonial</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.patrimonio} />
          </div>
          <div className="mt-6">
            <PatrimonioChart
              data={patrimonio.map((item) => ({
                ano: item.ano_eleicao,
                valor: item.valor_total,
              }))}
            />
          </div>
          <div className="mt-6 space-y-3">
            {[...patrimonio]
              .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
              .filter((item) => (item.bens ?? []).length > 0)
              .map((item) => (
                <ExpandableCard
                  key={item.id}
                  title={`${item.ano_eleicao}`}
                  subtitle={formatBRL(item.valor_total)}
                >
                  <div className="space-y-2">
                    {(item.bens ?? []).map((bem, index) => (
                      <div
                        key={index}
                        className="flex items-baseline justify-between rounded-[8px] bg-muted px-3 py-2"
                      >
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                            {bem.tipo}
                          </span>
                          <p className="text-[length:var(--text-body-sm)] font-medium text-foreground">
                            {bem.descricao}
                          </p>
                        </div>
                        <span className="ml-3 shrink-0 text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                          {formatBRL(bem.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                </ExpandableCard>
              ))}
          </div>
        </div>
      )}

      {financiamento.length > 0 && (
        <div>
          <SectionLabel>Financiamento de campanha</SectionLabel>
          <SectionTitle>De onde vem o dinheiro</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.financiamento} />
          </div>
          <div className="mt-6 space-y-6">
            {[...financiamento]
              .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
              .map((item) => (
                <div
                  key={item.id}
                  className="space-y-4 rounded-[16px] border border-border/50 px-5 py-5"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground">
                      {item.ano_eleicao}
                    </span>
                    <span className="text-[24px] font-bold tracking-tight text-foreground sm:text-[28px]">
                      {formatBRL(item.total_arrecadado)}
                    </span>
                  </div>
                  <StackedBar
                    segments={[
                      {
                        label: "Fundo Eleitoral",
                        value: item.total_fundo_eleitoral,
                        color: FINANCING_COLORS["Fundo Eleitoral"],
                      },
                      {
                        label: "Fundo Partidario",
                        value: item.total_fundo_partidario,
                        color: FINANCING_COLORS["Fundo Partidario"],
                      },
                      {
                        label: "Pessoa Fisica",
                        value: item.total_pessoa_fisica,
                        color: FINANCING_COLORS["Pessoa Fisica"],
                      },
                      {
                        label: "Recursos Proprios",
                        value: item.total_recursos_proprios,
                        color: FINANCING_COLORS["Recursos Proprios"],
                      },
                    ]}
                  />
                  {(item.maiores_doadores ?? []).length > 0 && (
                    <div className="mt-3 border-t border-border/50 pt-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Maiores doadores
                      </p>
                      <div className="space-y-1.5">
                        {(item.maiores_doadores ?? []).map((doador, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between text-[length:var(--text-body-sm)]"
                          >
                            <span className="font-medium text-foreground">
                              {doador.nome}
                            </span>
                            <span className="font-bold tabular-nums text-foreground">
                              {formatBRL(doador.valor)}
                            </span>
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

      {patrimonio.length === 0 && financiamento.length === 0 && (
        <div>
          <SectionLabel>Dinheiro</SectionLabel>
          <SectionTitle>Dados financeiros</SectionTitle>
          <EmptyState
            {...getPatrimonioEmptyState(historicoLength > 0)}
            suggestLabel={suggestion?.label}
            onSuggest={suggestion?.go}
          />
        </div>
      )}
      {patrimonio.length === 0 && financiamento.length > 0 && (
        <EmptyState {...getPatrimonioEmptyState(historicoLength > 0)} />
      )}
      {financiamento.length === 0 && patrimonio.length > 0 && (
        <EmptyState {...getFinanciamentoEmptyState()} />
      )}

      {gastos.length > 0 && (
        <div>
          <SectionLabel>Gastos parlamentares</SectionLabel>
          <SectionTitle>Uso da cota parlamentar (CEAP)</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.gastos_parlamentares} />
          </div>
          <div className="mt-6 space-y-4">
            {gastos.map((gasto) => (
              <ExpandableCard
                key={gasto.id}
                title={`${gasto.ano}`}
                subtitle={formatBRL(gasto.total_gasto)}
                defaultOpen={gastos.length === 1}
              >
                <div className="space-y-4">
                  {(gasto.detalhamento ?? []).length > 0 && (
                    <HorizontalBars
                      items={(gasto.detalhamento ?? []).map((item) => ({
                        label: item.categoria,
                        value: item.valor,
                      }))}
                    />
                  )}
                  {(gasto.gastos_destaque ?? []).length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-red-600">
                        Destaques
                      </p>
                      {(gasto.gastos_destaque ?? []).map((item, index) => (
                        <div key={index} className="rounded-[8px] bg-red-50 px-3 py-2">
                          <p className="text-[length:var(--text-body-sm)] font-medium text-red-900">
                            {item.descricao}
                          </p>
                          <p className="text-[length:var(--text-caption)] font-bold text-red-700">
                            {formatBRL(item.valor)}
                          </p>
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
  )
}

function formatHistoricoPeriodo(item: Pick<HistoricoPolitico, "periodo_inicio" | "periodo_fim">) {
  if (item.periodo_inicio != null && item.periodo_fim != null) {
    return `${item.periodo_inicio} - ${item.periodo_fim}`
  }

  if (item.periodo_inicio != null) {
    return `${item.periodo_inicio} - atual`
  }

  if (item.periodo_fim != null) {
    return `Até ${item.periodo_fim}`
  }

  return "Periodo nao determinado"
}

interface TrajectoryTabSectionProps {
  historico: HistoricoPolitico[]
  mudancas: MudancaPartido[]
  historicoDescartado: number
  timelinePartidariaIncompleta: boolean
  partidoAtualSigla: string | null
  partidoAtualNome: string | null
  suggestion: SuggestAction | null
  freshness?: {
    historico_politico?: SectionFreshnessInfo
    mudancas_partido?: SectionFreshnessInfo
  }
}

export function TrajectoryTabSection({
  historico,
  mudancas,
  historicoDescartado,
  timelinePartidariaIncompleta,
  partidoAtualSigla,
  partidoAtualNome,
  suggestion,
  freshness,
}: TrajectoryTabSectionProps) {
  const currentPartyLabel = [partidoAtualSigla, partidoAtualNome]
    .filter(Boolean)
    .join(" — ")

  return (
    <div className="space-y-12">
      {historicoDescartado > 0 || timelinePartidariaIncompleta ? (
        <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
                Trajetoria em revisao
              </p>
              {historicoDescartado > 0 && (
                <p className="text-[length:var(--text-body-sm)] font-medium text-amber-900">
                  Ocultamos {historicoDescartado} registro{historicoDescartado > 1 ? "s" : ""} de
                  trajetoria porque a origem nao confirma periodo ou filiacao com seguranca.
                </p>
              )}
              {timelinePartidariaIncompleta && currentPartyLabel && (
                <p className="text-[length:var(--text-body-sm)] font-medium text-amber-900">
                  Filiacao atual publicada: {currentPartyLabel}. A linha do tempo partidaria abaixo
                  ainda nao incorpora essa atualizacao.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {historico.length === 0 && mudancas.length === 0 && (
        <div>
          <SectionLabel>Trajetoria</SectionLabel>
          <SectionTitle>Historico politico</SectionTitle>
          <EmptyState
            {...getTrajetoriaEmptyState()}
            suggestLabel={suggestion?.label}
            onSuggest={suggestion?.go}
          />
        </div>
      )}

      {historico.length > 0 && (
        <div data-pf-trajetoria-count={historico.length}>
          <SectionLabel>Trajetoria politica</SectionLabel>
          <SectionTitle>Cargos e mandatos</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.historico_politico} />
          </div>
          <div className="mt-6">
            {[...historico]
              .sort((a, b) => (b.periodo_inicio ?? 0) - (a.periodo_inicio ?? 0))
              .map((item, index) => (
                <div
                  key={item.id}
                  className="relative flex gap-4 pb-6 last:pb-0 sm:gap-6"
                >
                  <div className="flex flex-col items-center">
                    <div className="size-3 rounded-full border-2 border-foreground bg-background" />
                    {index < historico.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 -mt-0.5">
                    <span className="text-[length:var(--text-caption)] font-bold tabular-nums text-muted-foreground sm:text-[length:var(--text-body-sm)]">
                      {formatHistoricoPeriodo(item)}
                    </span>
                    <p className="mt-0.5 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                      {item.cargo}
                    </p>
                    <p className="text-[length:var(--text-body-sm)] font-semibold text-muted-foreground">
                      {item.partido} {item.estado ? `(${item.estado})` : ""}
                    </p>
                    {item.observacoes && (
                      <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                        {item.observacoes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {mudancas.length > 0 && (
        <div data-pf-partidos-count={mudancas.length}>
          <SectionLabel>Mudancas de partido ({mudancas.length})</SectionLabel>
          <SectionTitle>Historico partidario</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.mudancas_partido} />
          </div>
          <div className="mt-6 space-y-0">
            {[...mudancas]
              .sort((a, b) => b.ano - a.ano)
              .map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-baseline gap-4 py-3 sm:gap-6 sm:py-4 ${index > 0 ? "border-t border-border/50" : ""}`}
                >
                  <span className="w-[50px] shrink-0 text-[length:var(--text-caption)] font-bold tabular-nums text-foreground sm:w-[60px] sm:text-[length:var(--text-body-sm)]">
                    {item.ano}
                  </span>
                  <div>
                    <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                      {item.partido_anterior} → {item.partido_novo}
                    </p>
                    {item.contexto && (
                      <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                        {item.contexto}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface LegislationTabSectionProps {
  projetosLei: ProjetoLei[]
  hasCurrentOffice: boolean
  suggestion: SuggestAction | null
  freshness?: SectionFreshnessInfo
}

export function LegislationTabSection({
  projetosLei,
  hasCurrentOffice,
  suggestion,
  freshness,
}: LegislationTabSectionProps) {
  return (
    <div>
      <SectionLabel>Projetos de lei ({projetosLei.length})</SectionLabel>
      <SectionTitle>Autoria legislativa</SectionTitle>
      {projetosLei.length > 0 && (
        <div className="mt-4">
          <DataFreshnessNotice info={freshness} />
        </div>
      )}
      {projetosLei.length === 0 && (
        <EmptyState
          {...getLegislacaoEmptyState(hasCurrentOffice)}
          suggestLabel={suggestion?.label}
          onSuggest={suggestion?.go}
        />
      )}
      <div className="mt-6 space-y-3">
        {[...projetosLei]
          .sort((a, b) => {
            if (a.destaque && !b.destaque) return -1
            if (!a.destaque && b.destaque) return 1
            return (b.ano ?? 0) - (a.ano ?? 0)
          })
          .map((projeto) => (
            <div
              key={projeto.id}
              className={`rounded-[12px] border px-5 py-4 ${projeto.destaque ? "border-foreground bg-muted" : "border-border/50"}`}
            >
              {(() => {
                const identifier = [
                  projeto.tipo,
                  projeto.numero && projeto.ano
                    ? `${projeto.numero}/${projeto.ano}`
                    : projeto.numero || projeto.ano,
                ]
                  .filter(Boolean)
                  .join(" ")

                return (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[length:var(--text-body)] font-bold text-foreground">
                        {identifier ||
                          (projeto.ementa
                            ? projeto.ementa.slice(0, 80) +
                              (projeto.ementa.length > 80 ? "..." : "")
                            : "Projeto de lei")}
                      </span>
                      {projeto.situacao && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${
                            projeto.situacao === "aprovado"
                              ? "bg-green-100 text-green-800"
                              : projeto.situacao === "tramitando"
                                ? "bg-blue-100 text-blue-800"
                                : projeto.situacao === "vetado"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {projeto.situacao}
                        </span>
                      )}
                      {projeto.destaque && (
                        <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-background">
                          Destaque
                        </span>
                      )}
                      {projeto.tema && (
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {projeto.tema}
                        </span>
                      )}
                    </div>
                    {projeto.ementa && identifier && (
                      <p className="mt-2 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                        {projeto.ementa}
                      </p>
                    )}
                  </>
                )
              })()}
              {projeto.destaque_motivo && (
                <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                  {projeto.destaque_motivo}
                </p>
              )}
              {safeHref(projeto.url_inteiro_teor) && (
                <a
                  href={safeHref(projeto.url_inteiro_teor)!}
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
  )
}
