"use client"

import Link from "next/link"
import type {
  GastoExecutivo,
  FichaCandidato,
  Financiamento,
  GastoParlamentar,
  HistoricoPolitico,
  Patrimonio,
  Processo,
  VotoCandidato,
} from "@/lib/types"
import { buildDoadorReverseHref } from "@/lib/doador-reverse-shared"
import {
  resolvePatrimonioEleicoes,
  type PatrimonioEleicaoPublico,
} from "@/lib/public-profile-dto"
import {
  formatHistoricoCargoTituloPublico,
  formatHistoricoObservacaoPublica,
  formatHistoricoPeriodoDisplay,
} from "@/lib/historico-display"
import { prepareHistoricoPoliticoPublicDisplayList } from "@/lib/trajetoria-public-display"
import { formatFinanciamentoPleitoPublicLabelForRow } from "@/lib/financiamento-pleito-public-label"
import { formatCompact } from "@/lib/utils"
import { PatrimonioChart } from "./BarChart"
import { DonutChart } from "./DonutChart"
import { ChevronRight } from "lucide-react"
import { ContradictionsHighlight } from "@/components/ContradictionsHighlight"
import { isContradictionAttentionCategory } from "@/lib/attention-points"
import { MetaBadge } from "./MetaBadge"
import { ProcessoPublicSurface } from "./ProcessoPublicSurface"
import {
  FINANCING_BREAKDOWN_KEYS,
  fixedCopy,
  formatFinancingLabel,
  formatPatrimonioEleicaoEstadoLabel,
  formatProcessStatusLabel,
  formatProcessTypeLabel,
  formatPublicLabel,
  formatVoteBadgeLabel,
} from "@/lib/ui-labels"
import { financiamentoPleitoSubtitulo } from "@/lib/financiamento-pleito-display"
import { buildFinancingComposition } from "@/lib/financiamento-display"
import {
  isProcessStatusNeutral,
  isTerminalProcessStatus,
  processoBorderColor,
  processoFonteLabel,
  urlPublicaDoProcesso,
} from "@/lib/processos-display"
import {
  groupGastosExecutivoPorOrgao,
  pickOrgaoMaisRecente,
} from "@/lib/gastos-executivo-display"

/* ─── Pure helpers ──────────────────────────────────── */

type FinancingSegment = { label: string; value: number; color: string }

type PatrimonioSummary = {
  sorted: Patrimonio[]
  latest: Patrimonio | null
  earliest: Patrimonio | null
  growthPct: number | null
}

const FINANCING_COLOR_BY_KEY: Record<(typeof FINANCING_BREAKDOWN_KEYS)[number], string> = {
  fundo_eleitoral: "#0a0a0a",
  fundo_partidario: "#525252",
  pessoa_fisica: "#a3a3a3",
  recursos_proprios: "#d4d4d4",
  outros_recursos: "#e5e5e5",
}

function getPatrimonioSummary(patrimonio: Patrimonio[]): PatrimonioSummary {
  const sorted = [...patrimonio].sort((a, b) => a.ano_eleicao - b.ano_eleicao)
  const latest = sorted.at(-1) ?? null
  const earliest = sorted.length > 1 ? sorted[0] : null
  const growthPct =
    latest && earliest && earliest.valor_total > 0
      ? ((latest.valor_total - earliest.valor_total) / earliest.valor_total) * 100
      : null
  return { sorted, latest, earliest, growthPct }
}

function getLatestFinancing(financiamento: Financiamento[]): Financiamento | null {
  if (financiamento.length === 0) return null
  return [...financiamento].sort((a, b) => b.ano_eleicao - a.ano_eleicao)[0]
}

function getLatestSpending(gastos: GastoParlamentar[]): GastoParlamentar | null {
  if (gastos.length === 0) return null
  return [...gastos].sort((a, b) => b.ano - a.ano)[0]
}

function getFinancingSegments(latestFin: Financiamento | null): FinancingSegment[] {
  if (!latestFin) return []
  const composition = buildFinancingComposition(latestFin)
  if (!composition.chartIsSafe) return []
  return composition.segments.map(({ key, value }) => ({
    label: formatFinancingLabel(key),
    value,
    color: FINANCING_COLOR_BY_KEY[key],
  })).filter((segment) => segment.value > 0)
}

function hasOverviewData(ficha: FichaCandidato): boolean {
  return (
    (ficha.patrimonio?.length ?? 0) > 0 ||
    resolvePatrimonioEleicoes(ficha).length > 0 ||
    (ficha.financiamento?.length ?? 0) > 0 ||
    (ficha.processos?.length ?? 0) > 0 ||
    (ficha.votos?.length ?? 0) > 0 ||
    (ficha.historico?.length ?? 0) > 0 ||
    (ficha.pontos_atencao?.length ?? 0) > 0 ||
    (ficha.projetos_lei?.length ?? 0) > 0 ||
    (ficha.legislacao_mandato_executivo?.length ?? 0) > 0 ||
    (ficha.gastos_parlamentares?.length ?? 0) > 0 ||
    (ficha.gastos_executivo?.length ?? 0) > 0
  )
}

function formatCareerTeaserObservation(observacoes: string | null | undefined): string | null {
  const formatted = formatHistoricoObservacaoPublica(observacoes)
  if (!formatted) return null

  const trimmed = formatted.trim()
  if (/^ELEITO \(TSE \d{4}\)$/i.test(trimmed)) return null

  return trimmed
}

function getPatrimonioGrowthIndicator(
  growthPct: number | null,
): { arrow: string; color: string } | null {
  if (growthPct === null) return null
  if (growthPct > 0) return { arrow: "↑", color: "text-green-700" }
  if (growthPct < 0) return { arrow: "↓", color: "text-red-600" }
  return { arrow: "", color: "text-muted-foreground" }
}

function getVotoBadgeClassName(voto: VotoCandidato["voto"]): string {
  if (voto === "sim") return "bg-foreground text-background"
  return "bg-secondary text-foreground"
}

/* ─── Card shell ──────────────────────────────────── */

function TeaserCard({
  title,
  linkLabel,
  onNavigate,
  children,
  className,
  moneyCardKind,
}: {
  title: string
  linkLabel: string
  onNavigate: () => void
  children: React.ReactNode
  className?: string
  moneyCardKind?: "patrimonio" | "financiamento" | "gasto"
}) {
  return (
    <div
      data-pf-money-overview-card={moneyCardKind}
      className={`rounded-[12px] border border-border/50 bg-card px-5 py-4 ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        <button
          type="button"
          onClick={onNavigate}
          className="inline-flex items-center gap-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {linkLabel} <ChevronRight className="size-3" />
        </button>
      </div>
      <div data-pf-money-overview-content={moneyCardKind}>{children}</div>
    </div>
  )
}

/* ─── Subcomponents (one teaser per section) ──────────────────────────────────── */

function EmptyOverviewState() {
  return (
    <div className="rounded-[12px] border border-border/50 bg-card px-8 py-16 text-center">
      <h2 className="font-heading text-[28px] uppercase tracking-tight text-foreground">Perfil em construção</h2>
      <p className="mt-2 text-[15px] text-muted-foreground">Estamos coletando dados públicos sobre este candidato.</p>
    </div>
  )
}

function PatrimonioTeaser({
  patrimonio,
  summary,
  eleicoes,
  onNavigate,
}: {
  patrimonio: Patrimonio[]
  summary: PatrimonioSummary
  eleicoes: PatrimonioEleicaoPublico[]
  onNavigate: () => void
}) {
  const { latest, earliest, growthPct } = summary
  if (!latest) {
    // Sem patrimônio publicado: a eleição ainda assim existe e não pode sumir
    // da visão geral (ausência não é ficha limpa nem ano oculto).
    const semDado = eleicoes
      .filter((eleicao) => eleicao.estado !== "publicado")
      .sort((a, b) => b.ano - a.ano)
    if (semDado.length === 0) return null
    return (
      <TeaserCard
        title="Patrimônio declarado"
        linkLabel="DETALHES"
        onNavigate={onNavigate}
        moneyCardKind="patrimonio"
      >
        <div className="space-y-2" data-pf-patrimonio-eleicoes-sem-dado={semDado.length}>
          {semDado.slice(0, 4).map((eleicao) => (
            <div
              key={eleicao.ano}
              data-pf-patrimonio-eleicao={eleicao.ano}
              data-pf-patrimonio-eleicao-estado={eleicao.estado}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">
                {eleicao.ano}
              </span>
              <span className="min-w-0 flex-1 text-right text-[12px] font-medium leading-snug text-muted-foreground">
                {formatPatrimonioEleicaoEstadoLabel(eleicao.estado)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] font-medium leading-snug text-muted-foreground">
          Eleições disputadas sem dado de patrimônio publicado.
        </p>
      </TeaserCard>
    )
  }

  if (patrimonio.length === 1) {
    // Mesma ordem de leitura do card de financiamento (contexto, escopo, valor):
    // o número cai na mesma altura nos dois cards da linha, em vez de abrir o
    // card com um valor sem referência e jogar o contexto para baixo dele.
    return (
      <TeaserCard
        title="Patrimônio declarado"
        linkLabel="DETALHES"
        onNavigate={onNavigate}
        moneyCardKind="patrimonio"
      >
        <p className="text-[12px] font-semibold leading-snug text-foreground">
          Declarado em {latest.ano_eleicao}
        </p>
        <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">
          Registro único disponível.
        </p>
        <p className="mt-2 font-heading text-[22px] leading-none tracking-tight text-foreground">
          {formatCompact(latest.valor_total)}
        </p>
      </TeaserCard>
    )
  }

  const indicator = getPatrimonioGrowthIndicator(growthPct)

  return (
    <TeaserCard
      title="Evolução patrimonial"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="patrimonio"
    >
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-heading text-[22px] leading-none tracking-tight text-foreground">
          {formatCompact(latest.valor_total)}
        </span>
        {indicator && earliest && growthPct !== null && (
          <span className={`text-[12px] font-bold ${indicator.color}`}>
            {indicator.arrow} {Math.abs(Math.round(growthPct))}% desde {earliest.ano_eleicao}
          </span>
        )}
      </div>
      <PatrimonioChart
        data={patrimonio.map((p) => ({ id: p.id, ano: p.ano_eleicao, valor: p.valor_total }))}
      />
    </TeaserCard>
  )
}

function FinancingTeaserDoadores({ doadores }: { doadores: Financiamento["maiores_doadores"] }) {
  if (doadores.length === 0) return null
  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Maiores doadores
      </p>
      <div className="space-y-1">
        {doadores.slice(0, 3).map((d, i) => (
          <div key={`${d.nome}-${i}`} className="flex items-baseline justify-between gap-2">
            <Link
              href={buildDoadorReverseHref(d.nome)}
              className="min-w-0 truncate text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              {d.nome}
            </Link>
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">
              {formatCompact(d.valor)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinancingTeaserSegments({
  segments,
  total,
}: {
  segments: FinancingSegment[]
  total: number
}) {
  if (segments.length === 0) return null
  return (
    <div className="mt-3 grid grid-cols-1 items-center gap-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-5">
      <div className="flex justify-center sm:justify-start">
        <DonutChart
          segments={segments}
          centerLabel="Total"
          size={112}
          strokeWidth={16}
          showLegend={false}
        />
      </div>
      <div className="min-w-0 space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-start gap-2">
            <div className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug text-muted-foreground">
              {s.label} ({Math.round((s.value / total) * 100)}%)
            </span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-foreground">
              {formatCompact(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FinancingTeaser({
  latestFin,
  pleitoLabel,
  segments,
  onNavigate,
}: {
  latestFin: Financiamento | null
  pleitoLabel: string | null
  segments: FinancingSegment[]
  onNavigate: () => void
}) {
  if (!latestFin) return null
  return (
    <TeaserCard
      title="Financiamento de campanha"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="financiamento"
    >
      <p className="text-[12px] font-semibold leading-snug text-foreground">{pleitoLabel}</p>
      <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">
        {financiamentoPleitoSubtitulo()}
      </p>
      <p className="mt-2 font-heading text-[22px] leading-none tracking-tight text-foreground">
        {formatCompact(latestFin.total_arrecadado)}
      </p>
      <FinancingTeaserSegments segments={segments} total={latestFin.total_arrecadado} />
      <FinancingTeaserDoadores doadores={latestFin.maiores_doadores} />
    </TeaserCard>
  )
}

function ProcessesTeaser({
  processos,
  onNavigate,
}: {
  processos: Processo[]
  onNavigate: () => void
}) {
  if (processos.length === 0) return null
  return (
    <TeaserCard title="Processos judiciais" linkLabel="TODOS" onNavigate={onNavigate}>
      <div className="space-y-2">
        {processos.slice(0, 3).map((p) => {
          const href = urlPublicaDoProcesso(p)
          return (
          <ProcessoPublicSurface
            key={p.id}
            processo={p}
            className="rounded-lg border border-border/50 border-l-[3px] px-3 py-2"
            style={{ borderLeftColor: processoBorderColor(p) }}
          >
            <div className="flex items-center gap-2">
              <MetaBadge tone={
                !isTerminalProcessStatus(p.status) &&
                !isProcessStatusNeutral(p.status) &&
                p.tipo === "criminal"
                  ? "critical"
                  : "muted"
              }>
                {isTerminalProcessStatus(p.status)
                  ? "Histórico judicial"
                  : isProcessStatusNeutral(p.status)
                    ? "Comunicação processual"
                    : formatProcessTypeLabel(p.tipo)}
              </MetaBadge>
              <span className="text-[10px] font-semibold text-muted-foreground">
                {formatProcessStatusLabel(p.status)}
              </span>
            </div>
            <p className="mt-1 text-[12px] font-medium leading-snug text-foreground">
              {p.descricao ?? p.tipo}
            </p>
            {href && (
              <span className="mt-1 inline-flex text-[10px] font-bold text-foreground underline underline-offset-2">
                {processoFonteLabel({ ...p, url_fonte: href })}
              </span>
            )}
          </ProcessoPublicSurface>
          )
        })}
      </div>
    </TeaserCard>
  )
}

function VotesTeaser({
  votos,
  contradicoes,
  onNavigate,
}: {
  votos: VotoCandidato[]
  contradicoes: VotoCandidato[]
  onNavigate: () => void
}) {
  if (votos.length === 0) return null
  return (
    <TeaserCard title={fixedCopy.keyVotes} linkLabel="TODAS" onNavigate={onNavigate}>
      {contradicoes.length > 0 && (
        <div className="mb-3">
          <MetaBadge tone="caution">
            {contradicoes.length} {contradicoes.length === 1 ? "Contradição" : fixedCopy.contradictions}
          </MetaBadge>
        </div>
      )}
      <div className="space-y-2">
        {votos.slice(0, 4).map((v) => (
          <div key={v.id} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getVotoBadgeClassName(v.voto)}`}
            >
              {formatVoteBadgeLabel(v.voto)}
            </span>
            <p className="min-w-0 flex-1 line-clamp-1 text-[13px] font-medium leading-snug text-foreground">
              {v.votacao?.titulo}
            </p>
          </div>
        ))}
      </div>
    </TeaserCard>
  )
}


function ExecutiveSpendingTeaser({
  gastosExecutivo,
  onNavigate,
}: {
  gastosExecutivo: GastoExecutivo[]
  onNavigate: () => void
}) {
  // Regra do Thiago (16/08): o resumo dos gastos institucionais aparece na
  // Visão Geral como o da cota parlamentar. Enquadramento é inegociável:
  // gasto do ÓRGÃO, nunca da pessoa. E como na aba Dinheiro, total é sempre
  // POR ÓRGÃO: nunca somar valores de órgãos diferentes numa cifra só.
  const orgaos = groupGastosExecutivoPorOrgao(gastosExecutivo)
  const orgao = pickOrgaoMaisRecente(orgaos)
  if (!orgao) return null
  const outrosOrgaos = orgaos.length - 1

  return (
    <TeaserCard
      title="Gastos da estrutura de governo"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="gasto"
    >
      <p className="text-[12px] font-medium text-muted-foreground">{orgao.nome}</p>
      <p
        data-pf-gastos-executivo-total-mandato
        className="mt-2 font-heading text-[22px] leading-none tracking-tight text-foreground"
      >
        {formatCompact(orgao.totalMandato)}
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Total no mandato</p>
      <p
        data-pf-gastos-executivo-total-ano={orgao.anoCorrente}
        className="mt-3 text-[15px] font-bold tabular-nums text-foreground"
      >
        {formatCompact(orgao.totalAnoCorrente)}
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
        Total em {orgao.anoCorrente}
      </p>
      {orgao.ultimoMesComMovimento && (
        <>
          <p
            data-pf-gastos-executivo-ultimo-mes={orgao.ultimoMesComMovimento.mes_extrato}
            className="mt-3 text-[15px] font-bold tabular-nums text-foreground"
          >
            {formatCompact(orgao.ultimoMesComMovimento.valor_total)}
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
            Último mês com movimento: {formatMesExtratoCurto(orgao.ultimoMesComMovimento.mes_extrato)}
          </p>
        </>
      )}
      {outrosOrgaos > 0 && (
        <p className="mt-2 text-[12px] font-medium text-muted-foreground">
          +{outrosOrgaos} {outrosOrgaos === 1 ? "outro órgão detalhado" : "outros órgãos detalhados"} na aba
          Dinheiro.
        </p>
      )}
    </TeaserCard>
  )
}

function formatMesExtratoCurto(mesExtrato: string): string {
  const [ano, mes] = mesExtrato.split("-")
  return `${mes}/${ano}`
}

function ParliamentarySpendingTeaser({
  topGastos,
  onNavigate,
}: {
  topGastos: GastoParlamentar | null
  onNavigate: () => void
}) {
  if (!topGastos) return null
  const sortedDet = [...(topGastos.detalhamento ?? [])].sort((a, b) => b.valor - a.valor)
  const maxVal = sortedDet[0]?.valor ?? 1
  const shades = ["#0a0a0a", "#404040", "#737373"]

  return (
    <TeaserCard
      title="Cota parlamentar"
      linkLabel="DETALHES"
      onNavigate={onNavigate}
      moneyCardKind="gasto"
    >
      <p className="font-heading text-[22px] leading-none tracking-tight text-foreground">
        {formatCompact(topGastos.total_gasto)}
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
        Ano do registro: {topGastos.ano} (mais recente com dados CEAP na ficha)
      </p>
      {sortedDet.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {sortedDet.slice(0, 3).map((d, i) => (
            <div key={d.categoria}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
                  {formatPublicLabel(d.categoria)}
                </span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">
                  {formatCompact(d.valor)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max((d.valor / maxVal) * 100, 2)}%`,
                    backgroundColor: shades[i] ?? "#a3a3a3",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </TeaserCard>
  )
}

function CareerTeaser({
  historico,
  historicoOrdenado,
  onNavigate,
}: {
  historico: HistoricoPolitico[]
  historicoOrdenado: HistoricoPolitico[]
  onNavigate: () => void
}) {
  if (historico.length === 0) return null
  return (
    <TeaserCard title={fixedCopy.politicalCareer} linkLabel="COMPLETA" onNavigate={onNavigate}>
      <div className="space-y-2.5">
        {historicoOrdenado.slice(0, 3).map((h) => {
          const observation = formatCareerTeaserObservation(h.observacoes)
          return (
            <div key={h.id} className="flex items-start gap-2.5">
              <div className="mt-1 size-2.5 shrink-0 rounded-full bg-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  {formatHistoricoCargoTituloPublico(h)}
                </p>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {formatHistoricoPeriodoDisplay(h, historicoOrdenado)}
                </span>
                {observation && (
                  <p className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-snug text-muted-foreground">
                    {observation}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </TeaserCard>
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
  if (!hasOverviewData(ficha)) {
    return <EmptyOverviewState />
  }

  const patrimonio = ficha.patrimonio ?? []
  const financiamento = ficha.financiamento ?? []
  const processos = ficha.processos ?? []
  const votos = ficha.votos ?? []
  const historico = ficha.historico ?? []
  const historicoOrdenado = prepareHistoricoPoliticoPublicDisplayList(historico)
  const pontosAtencao = ficha.pontos_atencao ?? []
  const gastos = ficha.gastos_parlamentares ?? []
  const gastosExecutivo = ficha.gastos_executivo ?? []

  const pontosContradicao = pontosAtencao.filter((p) => isContradictionAttentionCategory(p.categoria))
  const contradicoes = votos.filter((v) => v.contradicao)

  const patrimonioSummary = getPatrimonioSummary(patrimonio)
  const patrimonioEleicoes = resolvePatrimonioEleicoes(ficha)
  const latestFin = getLatestFinancing(financiamento)
  const latestFinPleitoLabel =
    latestFin != null ? formatFinanciamentoPleitoPublicLabelForRow(latestFin, historico) : null
  const finSegments = getFinancingSegments(latestFin)
  const topGastos = getLatestSpending(gastos)

  return (
    // `items-start` porque a grade esticava cada card até a altura do vizinho:
    // um card curto (patrimônio de registro único) ao lado do card denso de
    // financiamento virava uma caixa com centenas de pixels vazios dentro.
    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
      <PatrimonioTeaser
        patrimonio={patrimonio}
        summary={patrimonioSummary}
        eleicoes={patrimonioEleicoes}
        onNavigate={() => onNavigateTab("dinheiro")}
      />
      <FinancingTeaser
        latestFin={latestFin}
        pleitoLabel={latestFinPleitoLabel}
        segments={finSegments}
        onNavigate={() => onNavigateTab("dinheiro")}
      />
      <ContradictionsHighlight
        votosContradicao={contradicoes}
        pontosContradicao={pontosContradicao}
        onNavigateTab={onNavigateTab}
      />
      <ProcessesTeaser processos={processos} onNavigate={() => onNavigateTab("justica")} />
      <VotesTeaser
        votos={votos}
        contradicoes={contradicoes}
        onNavigate={() => onNavigateTab("votos")}
      />
      <ParliamentarySpendingTeaser
        topGastos={topGastos}
        onNavigate={() => onNavigateTab("dinheiro")}
      />
      <ExecutiveSpendingTeaser
        gastosExecutivo={gastosExecutivo}
        onNavigate={() => onNavigateTab("dinheiro")}
      />
      <CareerTeaser
        historico={historico}
        historicoOrdenado={historicoOrdenado}
        onNavigate={() => onNavigateTab("trajetoria")}
      />
    </div>
  )
}
