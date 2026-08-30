"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import {
  EmptyState,
  getFinanciamentoEmptyState,
  getLegislacaoEmptyState,
  getPatrimonioEmptyState,
  getTrajetoriaEmptyState,
} from "./EmptyState"
import { buildDoadorReverseHref } from "@/lib/doador-reverse-shared"
import { ExpandableCard } from "./ExpandableCard"
import { HorizontalBars, PatrimonioChart, StackedBar } from "./BarChart"
import { MetaBadge } from "./MetaBadge"
import { NoticePanel } from "./NoticePanel"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { formatDate, formatBRL, safeHref } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { HorizontalScrollButtons } from "./HorizontalScrollButtons"
import type {
  Financiamento,
  GastoExecutivo,
  GastoParlamentar,
  HistoricoPolitico,
  LegislacaoMandatoExecutivo,
  MudancaPartido,
  Patrimonio,
  ProjetoLei,
  SectionFreshnessInfo,
  VotoCandidato,
} from "@/lib/types"
import {
  CHAVE_ESTADO_HISTORICO,
  lerEstadoCelulaSuperficie,
  type VerificacaoCampos,
} from "@/lib/verificacao-campos"
import { ExternalLink } from "lucide-react"
import { DataFreshnessNotice } from "./DataFreshnessNotice"
import { PatrimonioEvolucaoAlerta } from "./PatrimonioEvolucaoAlerta"
import * as historicoDisplay from "@/lib/historico-display"
import { countPartySwitches, formatPartyTransitionLabel, hasSameYearPartyReversal } from "@/lib/party-switches"
import { isUncertainParty, normalizePartySigla } from "@/lib/party-utils"
import { prepareHistoricoPoliticoPublicDisplayList } from "@/lib/trajetoria-public-display"
import { formatFinanciamentoPleitoPublicLabelForRow } from "@/lib/financiamento-pleito-public-label"
import {
  buildFinanciamentoEleicoes,
  descreverFinanciamentoEleicao,
  type FinanciamentoEleicaoPublico,
} from "@/lib/financiamento-eleicoes"
import type { PatrimonioEleicaoPublico } from "@/lib/public-profile-dto"
import {
  FINANCING_COLOR_BY_KEY,
  type FinancingBreakdownKey,
  formatFinanciamentoEleicaoEstadoLabel,
  formatFinancingLabel,
  formatPatrimonioEleicaoEstadoLabel,
  formatProjectStatusLabel,
  formatPublicLabel,
  formatTemaLabel,
  formatVoteBadgeLabel,
} from "@/lib/ui-labels"
import {
  financiamentoPleitoNotaRodape,
  financiamentoPleitoSubtitulo,
} from "@/lib/financiamento-pleito-display"
import {
  groupLegislacaoProfileItems,
  resolveExecutiveLegislationInventoryScope,
} from "@/lib/legislacao-profile-groups"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { sanitizePublicText } from "@/lib/public-text"
import { buildFinancingComposition } from "@/lib/financiamento-display"
import { contarPorNatureza, rotuloDoAcervo } from "@/lib/proposicao-natureza"
import {
  agruparProposicoesPorEmenta,
  descreverReapresentacoes,
} from "@/lib/proposicao-dedupe"
import {
  formatarStatusSigilo,
  groupGastosExecutivoPorOrgao,
  rotuloFonteGastosExecutivo,
  rotuloUnidadeGestora,
  type GastoExecutivoOrgaoResumo,
  type SigiloStatus,
} from "@/lib/gastos-executivo-display"

const LEGISLACAO_PAGE_SIZE = 25
const GASTOS_ESTRUTURA_GOVERNO_ANCHOR_ID = "gastos-estrutura-governo"

function formatMesExtrato(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-01$/)
  if (!match) return value
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)))
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function GastosExecutivoRecorteBox({
  orgaoNome,
  orgaoCodigo,
  portador,
  estabelecimento,
}: {
  orgaoNome: string
  orgaoCodigo: string
  portador: SigiloStatus
  estabelecimento: SigiloStatus
}) {
  return (
    <div
      data-pf-gastos-executivo-recorte
      className="mt-5 rounded-[16px] border border-border/70 bg-background px-4 py-4 sm:px-5"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[length:var(--text-body-sm)] font-bold text-foreground">
            O que este número é
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
            <li>
              Cartão de Pagamentos do Governo Federal (CPGF) do órgão {orgaoNome}{" "}
              (código SIAFI {orgaoCodigo}).
            </li>
            <li>
              Soma das transações do download oficial mensal do CPGF para esse órgão,
              composta por unidade gestora. A API de cartões só confere quantidade e UG;
              se o valor divergir, vale o CSV.
            </li>
            <li>
              Status de sigilo do portador e do estabelecimento medido na fonte, não uma
              lista de pessoas.
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[length:var(--text-body-sm)] font-bold text-foreground">
            O que este número não é
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
            <li>Gasto pessoal de quem ocupa o cargo</li>
            <li>Cota parlamentar</li>
            <li>Ministérios ou o governo federal inteiro</li>
            <li>Cartão de Pagamento da Defesa Civil (CPDC)</li>
            <li>Doação de campanha</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
        Totais que circulam misturam com frequência esses recortes. Aqui entra só o CPGF deste
        órgão.
      </p>
      <p
        data-pf-gastos-executivo-portador-status
        className="mt-2 text-[length:var(--text-caption)] text-muted-foreground"
      >
        {formatarStatusSigilo(portador, "Portador")}
      </p>
      <p
        data-pf-gastos-executivo-estabelecimento-status
        className="mt-1 text-[length:var(--text-caption)] text-muted-foreground"
      >
        {formatarStatusSigilo(estabelecimento, "Estabelecimento")}
      </p>
    </div>
  )
}

function GastosExecutivoOrgaoBlock({
  orgao,
  expandAllForAudit,
}: {
  orgao: GastoExecutivoOrgaoResumo
  expandAllForAudit: boolean
}) {
  const ultimaColeta = [...orgao.rows].sort((a, b) => b.coletado_em.localeCompare(a.coletado_em))[0]
  const fonte = safeHref(ultimaColeta?.fonte)
  const rotuloFonte = rotuloFonteGastosExecutivo(ultimaColeta?.fonte)
  const anosComBarra = [...orgao.anos]
    .filter((ano) => ano.total > 0)
    .sort((a, b) => a.ano - b.ano)
  const anoAberto = orgao.anos[0]?.ano

  return (
    <div data-pf-gastos-executivo-orgao={orgao.codigo}>
      <div className="mt-6 rounded-[20px] border border-border/70 bg-card p-5 sm:p-6">
        <p className="text-[length:var(--text-caption)] font-bold text-muted-foreground">
          {orgao.nome}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[length:var(--text-caption)] font-semibold text-muted-foreground">
              Total no mandato
            </p>
            <p
              data-pf-gastos-executivo-total-mandato
              className="mt-1 text-[length:var(--text-heading-lg)] font-bold tracking-tight text-foreground"
            >
              {formatBRL(orgao.totalMandato)}
            </p>
          </div>
          <div>
            <p className="text-[length:var(--text-caption)] font-semibold text-muted-foreground">
              {orgao.anoCorrente == null ? "Total no recorte" : `Total em ${orgao.anoCorrente}`}
            </p>
            <p
              data-pf-gastos-executivo-total-ano={orgao.anoCorrente ?? ""}
              data-pf-gastos-executivo-total-ano-estado={orgao.totalAnoCorrente == null ? "vazio" : "publicado"}
              className={
                orgao.totalAnoCorrente == null
                  ? "mt-1 text-[length:var(--text-body)] text-muted-foreground"
                  : "mt-1 text-[length:var(--text-heading-lg)] font-bold tracking-tight text-foreground"
              }
            >
              {orgao.totalAnoCorrente == null ? "Sem dado neste recorte" : formatBRL(orgao.totalAnoCorrente)}
            </p>
          </div>
          <div>
            <p className="text-[length:var(--text-caption)] font-semibold text-muted-foreground">
              Último mês com movimento
            </p>
            {orgao.ultimoMesComMovimento ? (
              <>
                <p
                  data-pf-gastos-executivo-ultimo-mes={orgao.ultimoMesComMovimento.mes_extrato}
                  className="mt-1 text-[length:var(--text-heading-lg)] font-bold tracking-tight text-foreground"
                >
                  {formatBRL(orgao.ultimoMesComMovimento.valor_total)}
                </p>
                <p className="mt-1 text-[length:var(--text-caption)] text-muted-foreground">
                  {formatMesExtrato(orgao.ultimoMesComMovimento.mes_extrato)}
                </p>
              </>
            ) : (
              <p
                data-pf-gastos-executivo-ultimo-mes=""
                className="mt-1 text-[length:var(--text-body)] text-muted-foreground"
              >
                Sem movimento na série
              </p>
            )}
          </div>
        </div>

        {orgao.unidades.some((ug) => ug.valorTotal > 0) && (
          <div className="mt-6" data-pf-gastos-executivo-ug-composicao>
            <p className="text-[length:var(--text-caption)] font-bold text-muted-foreground">
              Composição por unidade gestora
            </p>
            <div className="mt-3">
              <HorizontalBars
                items={orgao.unidades
                  .filter((ug) => ug.valorTotal > 0)
                  .map((ug) => ({
                    label: rotuloUnidadeGestora(ug, orgao.unidades),
                    value: ug.valorTotal,
                    dataAttributes: {
                      "data-pf-gastos-executivo-ug": ug.codigo,
                    },
                  }))}
              />
            </div>
            {orgao.unidades.length > 1 && orgao.unidades.length <= 8 && (
              <ul className="mt-3 space-y-1">
                {orgao.unidades.map((ug) => (
                  <li
                    key={ug.codigo}
                    className="text-[length:var(--text-caption)] text-muted-foreground"
                  >
                    {rotuloUnidadeGestora(ug, orgao.unidades)}:{" "}
                    {formatarStatusSigilo(ug.portador)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <GastosExecutivoRecorteBox
          orgaoNome={orgao.nome}
          orgaoCodigo={orgao.codigo}
          portador={orgao.portador}
          estabelecimento={orgao.estabelecimento}
        />

        <p className="mt-4 text-[length:var(--text-caption)] text-muted-foreground">
          Fonte: {fonte ? (
            <Link
              href={fonte}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {rotuloFonte}
            </Link>
          ) : (
            rotuloFonte
          )}
          {ultimaColeta?.coletado_em
            ? `, coleta em ${formatDate(ultimaColeta.coletado_em)}.`
            : "."}
        </p>
      </div>

      {anosComBarra.length > 0 && (
        <div className="mt-6" data-pf-gastos-executivo-barras-ano>
          <HorizontalBars
            items={anosComBarra.map((ano) => ({
              label: String(ano.ano),
              value: ano.total,
              dataAttributes: {
                "data-pf-gastos-executivo-ano-bar": String(ano.ano),
              },
            }))}
          />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {orgao.anos.map((ano) => (
          <div key={ano.ano} data-pf-gastos-executivo-ano={ano.ano}>
            <ExpandableCard
              title={String(ano.ano)}
              valor={formatBRL(ano.total)}
              defaultOpen={expandAllForAudit || ano.ano === anoAberto}
            >
              {ano.rows.some((row) => row.valor_total > 0) && (
                <div className="mb-4" data-pf-gastos-executivo-barras-mes={ano.ano}>
                  <HorizontalBars
                    items={ano.rows
                      .filter((row) => row.valor_total > 0)
                      .map((row) => ({
                        label: formatMesExtrato(row.mes_extrato),
                        value: row.valor_total,
                        dataAttributes: {
                          "data-pf-gasto-executivo-mes-bar": row.mes_extrato,
                        },
                      }))}
                  />
                </div>
              )}
              <div className="divide-y divide-border/60">
                {ano.rows.map((row) => (
                  <div
                    key={row.id}
                    data-pf-gasto-executivo-mes={row.mes_extrato}
                    className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {formatMesExtrato(row.mes_extrato)}
                      </p>
                      <p className="text-[length:var(--text-caption)] text-muted-foreground">
                        {row.qtd_transacoes} {row.qtd_transacoes === 1 ? "transação" : "transações"}
                      </p>
                    </div>
                    <p className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                      {formatBRL(row.valor_total)}
                    </p>
                  </div>
                ))}
              </div>
            </ExpandableCard>
          </div>
        ))}
      </div>
    </div>
  )
}

interface SuggestAction {
  label: string
  go: () => void
}

// Fonte unica em src/lib/ui-labels.ts: a copia local desta paleta era o segundo
// lugar onde o piso de contraste podia divergir.
const FINANCING_COLORS: Record<FinancingBreakdownKey, string> = FINANCING_COLOR_BY_KEY

const PROJECT_STATUS_BADGES: Record<
  string,
  { tone: "neutral" | "muted" | "positive" | "critical" }
> = {
  aprovado: { tone: "positive" },
  tramitando: { tone: "neutral" },
  vetado: { tone: "critical" },
}

function formatYearList(years: number[]) {
  if (years.length <= 2) return years.join(" e ")
  return `${years.slice(0, -1).join(", ")} e ${years.at(-1)}`
}

/**
 * Linha de eleição (>= 2006) cujo patrimônio não está publicado. Ausência não
 * pode parecer ficha limpa nem ano oculto: vazio_confirmado mostra a fonte
 * oficial conferida e a data da verificação; nao_coletado exibe a pendência
 * sem insinuar que o candidato não tinha bens.
 */
function PatrimonioEleicaoSemDadoRow({ eleicao }: { eleicao: PatrimonioEleicaoPublico }) {
  const fonteHref = safeHref(eleicao.fonte_url)
  const verificadoEm = eleicao.verificado_em ? formatDate(eleicao.verificado_em) : null

  return (
    <div
      data-pf-patrimonio-eleicao={eleicao.ano}
      data-pf-patrimonio-eleicao-estado={eleicao.estado}
      data-pf-money-card="patrimonio"
      data-pf-money-card-year={eleicao.ano}
      data-pf-money-card-state={eleicao.estado}
      className="rounded-[12px] border border-border/60 bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
          {eleicao.ano}
        </span>
        <MetaBadge tone={eleicao.estado === "vazio_confirmado" ? "neutral" : "muted"}>
          {formatPatrimonioEleicaoEstadoLabel(eleicao.estado)}
        </MetaBadge>
      </div>
      <p className="mt-1.5 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        {eleicao.estado === "vazio_confirmado"
          ? `Sem bens declarados ao TSE em ${eleicao.ano}. O pacote oficial de bens desta eleição foi conferido e não traz registros para este candidato.`
          : `A coleta de bens da eleição de ${eleicao.ano} ainda não foi realizada. A ausência de dados aqui não significa ausência de bens.`}
      </p>
      {eleicao.estado === "vazio_confirmado" && (verificadoEm || fonteHref) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
          {verificadoEm && <span>Verificado em {verificadoEm}</span>}
          {fonteHref && (
            <a
              href={fonteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-foreground underline"
            >
              Fonte oficial <ExternalLink className="size-3 shrink-0" />
            </a>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * Declaração publicada que não tem detalhamento de bens para abrir. Sem esta
 * carta o valor ficaria só no gráfico, e o gráfico não é desenhado quando há um
 * único registro (uma barra sozinha é um bloco chapado, não uma comparação).
 * O desenho é o mesmo do cabeçalho dos cards de financiamento: rótulo do pleito
 * à esquerda, valor em destaque à direita.
 */
function PatrimonioValorCard({ patrimonio }: { patrimonio: Patrimonio }) {
  return (
    <div
      data-pf-patrimonio-valor={patrimonio.ano_eleicao}
      data-pf-money-card="patrimonio"
      data-pf-money-card-year={patrimonio.ano_eleicao}
      data-pf-money-card-state="publicado"
      className="flex flex-col gap-1 rounded-[12px] border border-border/50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:rounded-[16px] sm:px-5 sm:py-4"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground sm:text-[15px]">
          {patrimonio.ano_eleicao}
        </p>
        <p className="mt-0.5 text-[length:var(--text-caption)] font-semibold leading-snug text-muted-foreground sm:text-[length:var(--text-body-sm)]">
          Total declarado ao TSE. Esta declaração não traz detalhamento de bens.
        </p>
      </div>
      <span className="shrink-0 text-[24px] font-bold tabular-nums tracking-tight text-foreground sm:text-right sm:text-[28px]">
        {formatBRL(patrimonio.valor_total)}
      </span>
    </div>
  )
}

/**
 * Pleito disputado cujo financiamento não está publicado. Espelha a linha de
 * patrimônio, e pela mesma razão: até 10/08/2026 esses pleitos simplesmente
 * sumiam da aba, e o leitor não distinguia "o TSE não publica" de "nós não
 * coletamos". `fora_da_serie_oficial` é o único estado que AFIRMA ausência, e
 * por isso é o único que mostra fonte e data.
 */
function FinanciamentoEleicaoSemDadoRow({ eleicao }: { eleicao: FinanciamentoEleicaoPublico }) {
  const fonteHref = safeHref(eleicao.fonte_url)
  const verificadoEm = eleicao.verificado_em ? formatDate(eleicao.verificado_em) : null

  return (
    <div
      data-pf-financiamento-eleicao={eleicao.ano}
      data-pf-financiamento-eleicao-estado={eleicao.estado}
      data-pf-money-card="financiamento"
      data-pf-money-card-year={eleicao.ano}
      data-pf-money-card-state={eleicao.estado}
      className="rounded-[12px] border border-border/60 bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
          {eleicao.ano}
        </span>
        <MetaBadge
          tone={
            eleicao.estado === "fora_da_serie_oficial" ||
            eleicao.estado === "ausencia_oficial" ||
            eleicao.estado === "erro"
              ? "neutral"
              : "muted"
          }
        >
          {formatFinanciamentoEleicaoEstadoLabel(eleicao.estado)}
        </MetaBadge>
      </div>
      <p className="mt-1.5 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        {descreverFinanciamentoEleicao(eleicao)}
      </p>
      {(verificadoEm || fonteHref) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
          {verificadoEm && <span>Verificado em {verificadoEm}</span>}
          {fonteHref && (
            <a
              href={fonteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-foreground underline"
            >
              Fonte oficial <ExternalLink className="size-3 shrink-0" />
            </a>
          )}
        </p>
      )}
    </div>
  )
}

function FinanciamentoEleicoesSemDado({
  eleicoes,
}: {
  eleicoes: FinanciamentoEleicaoPublico[]
}) {
  if (eleicoes.length === 0) return null

  return (
    <div data-pf-financiamento-eleicoes-sem-dado={eleicoes.length}>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Situação dos pleitos sem valor positivo publicado
      </p>
      <div className="mt-2 space-y-3">
        {eleicoes.map((eleicao) => (
          <FinanciamentoEleicaoSemDadoRow key={eleicao.ano} eleicao={eleicao} />
        ))}
      </div>
    </div>
  )
}

function PatrimonioEleicoesSemDado({
  eleicoes,
}: {
  eleicoes: PatrimonioEleicaoPublico[]
}) {
  const semDadoPublicado = eleicoes
    .filter((eleicao) => eleicao.estado !== "publicado")
    .sort((a, b) => b.ano - a.ano)
  if (semDadoPublicado.length === 0) return null

  return (
    <div data-pf-patrimonio-eleicoes-sem-dado={semDadoPublicado.length}>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Eleições sem dado publicado
      </p>
      <div className="mt-2 space-y-3">
        {semDadoPublicado.map((eleicao) => (
          <PatrimonioEleicaoSemDadoRow key={eleicao.ano} eleicao={eleicao} />
        ))}
      </div>
    </div>
  )
}

interface MoneyTabSectionProps {
  patrimonio: Patrimonio[]
  financiamento: Financiamento[]
  financiamentoEleicoes?: FinanciamentoEleicaoPublico[] | null
  /** Bruto (API); usado só para rótulos de pleito em financiamento, não para `cargo_disputado` atual. */
  historico: HistoricoPolitico[]
  gastos: GastoParlamentar[]
  gastosExecutivo?: GastoExecutivo[]
  historicoLength: number
  suggestion: SuggestAction | null
  /**
   * Série pública de patrimônio por eleição aplicável (>= 2006), mais recente
   * primeiro, no formato do DTO público. Pleitos sem dado publicado
   * (vazio_confirmado ou nao_coletado) são exibidos com estado explícito.
   */
  patrimonioEleicoes?: PatrimonioEleicaoPublico[] | null
  /** Id do evento na timeline (`patrimonio-…`, `gasto-…`) para abrir card e permitir scroll/highlight. */
  highlightTimelineRef?: string | null
  /** Abre todos os detalhes apenas no render isolado do auditor visual. */
  expandAllForAudit?: boolean
  freshness?: {
    patrimonio?: SectionFreshnessInfo
    financiamento?: SectionFreshnessInfo
    gastos_parlamentares?: SectionFreshnessInfo
    gastos_executivo?: SectionFreshnessInfo
  }
}

export function MoneyTabSection({
  patrimonio,
  financiamento,
  financiamentoEleicoes,
  historico,
  gastos,
  gastosExecutivo = [],
  historicoLength,
  suggestion,
  patrimonioEleicoes,
  highlightTimelineRef,
  expandAllForAudit = false,
  freshness,
}: MoneyTabSectionProps) {
  /**
   * Eleições aplicáveis sem valor publicado. O filtro fica aqui, e não só
   * dentro do componente de lista, para os três pontos de montagem gatearem
   * pelo que de fato têm a mostrar: com todos os anos publicados, os gates
   * abriam uma moldura vazia. Sem patrimônio nenhum, os empty states abaixo
   * (`patrimonio.length === 0`) é que carregam a lista.
   */
  const patrimonioEleicoesSemDado = (patrimonioEleicoes ?? []).filter(
    (eleicao) => eleicao.estado !== "publicado",
  )
  /**
   * Estado por pleito para financiamento. Diferente de patrimônio, esta série
   * pode ser composta aqui: os dois insumos (`financiamento` e `historico`)
   * viajam inteiros no DTO público, então a composição sobre o payload do
   * browser é fiel. O que quebrava em patrimônio era a ausência de
   * `patrimonio_ausencias_oficiais` no DTO, que não tem equivalente aqui.
   */
  const financiamentoEleicoesSemDado = (
    financiamentoEleicoes ?? buildFinanciamentoEleicoes(financiamento, historico)
  ).filter((eleicao) => eleicao.estado !== "publicado")
  // O contrato do schema permite mais de um órgão por candidato (governador
  // terá o órgão estadual dele). Somar órgãos diferentes numa série só
  // misturaria dados de fontes distintas; cada órgão rende um bloco próprio.
  const gastosExecutivoPorOrgao = groupGastosExecutivoPorOrgao(gastosExecutivo)
  return (
    <div className="space-y-12" data-pf-money-tab>
      {patrimonio.length > 0 && (
        <div>
          <SectionLabel>Patrimônio declarado</SectionLabel>
          <SectionTitle>{patrimonio.length > 1 ? "Evolução patrimonial" : "Patrimônio declarado"}</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.patrimonio} />
          </div>
          <PatrimonioEvolucaoAlerta patrimonio={patrimonio} className="mt-4" />
          {patrimonio.length > 1 && (
            <div className="mt-6">
              <PatrimonioChart
                data={patrimonio.map((item) => ({
                  id: item.id,
                  ano: item.ano_eleicao,
                  valor: item.valor_total,
                }))}
              />
            </div>
          )}
          {/*
            Um sort só, um map só. Separar em duas passadas (com bens e sem
            bens) agrupava por formato de card e quebrava a ordem cronológica
            global: uma declaração de 2010 sem detalhamento subia acima de uma
            de 2022 com detalhamento. A escolha do componente é por item, dentro
            do map; a ordem é do ano, para a lista inteira.
          */}
          <div className="mt-6 space-y-3">
            {[...patrimonio]
              .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
              .map((item, index) => (
                <div
                  key={item.id}
                  data-pf-timeline-ref={`patrimonio-${item.id}`}
                  data-pf-money-card={(item.bens ?? []).length > 0 ? "patrimonio" : undefined}
                  data-pf-money-card-year={(item.bens ?? []).length > 0 ? item.ano_eleicao : undefined}
                  data-pf-money-card-state={(item.bens ?? []).length > 0 ? "publicado" : undefined}
                >
                  {(item.bens ?? []).length === 0 ? (
                    <PatrimonioValorCard patrimonio={item} />
                  ) : (
                    <ExpandableCard
                      title={`${item.ano_eleicao}`}
                      valor={formatBRL(item.valor_total)}
                      defaultOpen={
                        index === 0 ||
                        expandAllForAudit ||
                        highlightTimelineRef === `patrimonio-${item.id}`
                      }
                    >
                      <div className="space-y-2">
                        {(item.bens ?? []).map((bem, index) => (
                          <div
                            key={index}
                            className="flex items-baseline justify-between rounded-[8px] bg-muted px-3 py-2"
                          >
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                                {sanitizePublicText(bem.tipo) || "Tipo não informado"}
                              </span>
                              <p className="text-[length:var(--text-body-sm)] font-medium text-foreground">
                                {sanitizePublicText(bem.descricao) || "Descrição não informada"}
                              </p>
                            </div>
                            <span className="ml-3 shrink-0 text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                              {formatBRL(bem.valor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ExpandableCard>
                  )}
                </div>
              ))}
          </div>
          {patrimonioEleicoesSemDado.length > 0 && (
            <div className="mt-6">
              <PatrimonioEleicoesSemDado eleicoes={patrimonioEleicoesSemDado} />
            </div>
          )}
        </div>
      )}

      {(financiamento.length > 0 || financiamentoEleicoesSemDado.length > 0) && (
        <div>
          <SectionLabel>Financiamento de campanha</SectionLabel>
          <SectionTitle>De onde vem o dinheiro</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.financiamento} />
          </div>
          {financiamento.length > 0 && (
          <div className="mt-6 space-y-6">
            {[...financiamento]
              .sort((a, b) => b.ano_eleicao - a.ano_eleicao)
              .map((item) => (
                <div
                  key={item.id}
                  data-pf-timeline-ref={`financiamento-${item.id}`}
                  data-pf-money-card="financiamento"
                  data-pf-money-card-year={item.ano_eleicao}
                  data-pf-money-card-state={
                    Number(item.total_arrecadado) === 0 &&
                    (item.maiores_doadores ?? []).length === 0
                      ? "sem_receitas_declaradas"
                      : "publicado"
                  }
                  data-pf-financiamento-publicado={JSON.stringify({
                    ano: item.ano_eleicao,
                    total_arrecadado: Number(item.total_arrecadado ?? 0),
                    total_fundo_partidario: Number(item.total_fundo_partidario ?? 0),
                    total_fundo_eleitoral: Number(item.total_fundo_eleitoral ?? 0),
                    total_pessoa_fisica: Number(item.total_pessoa_fisica ?? 0),
                    total_recursos_proprios: Number(item.total_recursos_proprios ?? 0),
                    categorias_origem: item.categorias_origem
                      ? Object.fromEntries(
                          Object.entries(item.categorias_origem)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, value]) => [key, Number(value)]),
                        )
                      : null,
                    composicao: (() => {
                      const composition = buildFinancingComposition(item)
                      return {
                        segments: composition.segments.map(({ key, value }) => ({
                          key,
                          value: Number(value),
                        })),
                        knownTotal: Number(composition.knownTotal),
                        residual: Number(composition.residual),
                        overage: Number(composition.overage),
                        chartIsSafe: composition.chartIsSafe,
                      }
                    })(),
                    maiores_doadores: (item.maiores_doadores ?? []).map((doador) => ({
                      nome: doador.nome,
                      valor: Number(doador.valor),
                      tipo: doador.tipo,
                    })),
                  })}
                  className="space-y-4 rounded-[16px] border border-border/50 px-5 py-5"
                  title={financiamentoPleitoNotaRodape()}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[length:var(--text-eyebrow)] font-bold tracking-[0.04em] text-foreground">
                        {formatFinanciamentoPleitoPublicLabelForRow(item, historico)}
                      </p>
                      <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">
                        {financiamentoPleitoSubtitulo()}
                      </p>
                    </div>
                    <span
                      data-pf-financiamento-total-visivel
                      className={`shrink-0 font-bold text-foreground sm:text-right ${
                        Number(item.total_arrecadado) === 0 &&
                        (item.maiores_doadores ?? []).length === 0
                          ? "max-w-[320px] text-[length:var(--text-body)] leading-snug"
                          : "text-[24px] tracking-tight sm:text-[28px]"
                      }`}
                    >
                      {Number(item.total_arrecadado) === 0 &&
                      (item.maiores_doadores ?? []).length === 0
                        ? `Sem receitas declaradas na prestação de contas (TSE ${item.ano_eleicao})`
                        : formatBRL(item.total_arrecadado)}
                    </span>
                  </div>
                  {!(
                    Number(item.total_arrecadado) === 0 &&
                    (item.maiores_doadores ?? []).length === 0
                  ) && (() => {
                    const composition = buildFinancingComposition(item)
                    return composition.chartIsSafe ? (
                      <div data-pf-financiamento-composicao-visivel>
                        <StackedBar
                          segments={composition.segments.map(({ key, value }) => ({
                            label: formatFinancingLabel(key),
                            value,
                            color: FINANCING_COLORS[key],
                          }))}
                        />
                      </div>
                    ) : (
                      <div data-pf-financiamento-composicao-visivel>
                        <NoticePanel
                          tone="caution"
                          eyebrow="Composição em revisão"
                          description="As categorias disponíveis somam mais que o total registrado. O gráfico fica oculto até a reconciliação com a prestação oficial."
                        />
                      </div>
                    )
                  })()}
                  {(item.maiores_doadores ?? []).length > 0 && (
                    <div className="mt-3 border-t border-border/50 pt-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Maiores doadores
                      </p>
                      <div className="space-y-1.5">
                        {(item.maiores_doadores ?? []).map((doador, index) => (
                          <div
                            key={index}
                            data-pf-financiamento-doador-visivel
                            className="flex items-center justify-between text-[length:var(--text-body-sm)]"
                          >
                            <Link
                              href={buildDoadorReverseHref(doador.nome)}
                              className="font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              {doador.nome}
                            </Link>
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
          )}
          {financiamentoEleicoesSemDado.length > 0 && (
            <div className="mt-6">
              <FinanciamentoEleicoesSemDado eleicoes={financiamentoEleicoesSemDado} />
            </div>
          )}
        </div>
      )}

      {patrimonio.length === 0 && financiamento.length === 0 && (
        <div>
          <SectionLabel>Dinheiro</SectionLabel>
          <SectionTitle>Dados financeiros</SectionTitle>
          <EmptyState
            {...getPatrimonioEmptyState(historicoLength > 0, patrimonioEleicoes)}
            suggestLabel={suggestion?.label}
            onSuggest={suggestion?.go}
          />
          {patrimonioEleicoesSemDado.length > 0 && (
            <div className="mt-6">
              <PatrimonioEleicoesSemDado eleicoes={patrimonioEleicoesSemDado} />
            </div>
          )}
        </div>
      )}
      {patrimonio.length === 0 && financiamento.length > 0 && (
        <div>
          <EmptyState {...getPatrimonioEmptyState(historicoLength > 0, patrimonioEleicoes)} />
          {patrimonioEleicoesSemDado.length > 0 && (
            <div className="mt-6">
              <PatrimonioEleicoesSemDado eleicoes={patrimonioEleicoesSemDado} />
            </div>
          )}
        </div>
      )}
      {/*
        Só sobra estado vazio quando não há NENHUM pleito a descrever: com
        pleito disputado, a seção acima já lista cada ano com o estado dele. O
        gate antigo (`financiamento === 0 && patrimonio > 0`) publicava uma
        afirmação sobre o acervo do TSE em 18 fichas sem ter consultado o TSE.
      */}
      {financiamento.length === 0 &&
        financiamentoEleicoesSemDado.length === 0 &&
        patrimonio.length > 0 && <EmptyState {...getFinanciamentoEmptyState()} />}

      {gastos.length > 0 && (
        <div>
          <SectionLabel>Gastos parlamentares</SectionLabel>
          <SectionTitle>Uso da cota parlamentar (CEAP)</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.gastos_parlamentares} />
          </div>
          <div className="mt-6 space-y-4">
            {[...gastos].sort((a, b) => b.ano - a.ano).map((gasto) => (
              <div
                key={gasto.id}
                data-pf-timeline-ref={`gasto-${gasto.id}`}
                data-pf-money-card="gasto"
                data-pf-money-card-year={gasto.ano}
                data-pf-money-card-state="publicado"
              >
              <ExpandableCard
                title={`${gasto.ano}`}
                valor={formatBRL(gasto.total_gasto)}
                defaultOpen={
                  expandAllForAudit ||
                  gastos.length === 1 ||
                  highlightTimelineRef === `gasto-${gasto.id}`
                }
              >
                <div className="space-y-4">
                  {(gasto.detalhamento ?? []).length > 0 && (
                    <HorizontalBars
                      items={(gasto.detalhamento ?? []).map((item) => ({
                        label: formatPublicLabel(item.categoria),
                        value: item.valor,
                      }))}
                    />
                  )}
                  {(gasto.gastos_destaque ?? []).length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Destaques
                      </p>
                      {(gasto.gastos_destaque ?? []).map((item, index) => (
                        <div key={index} className="rounded-[12px] border border-border/60 bg-background px-3 py-3">
                          <MetaBadge tone="critical">Destaque</MetaBadge>
                          <p className="mt-2 text-[length:var(--text-body-sm)] font-medium text-foreground">
                            {item.descricao}
                          </p>
                          <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                            {formatPublicLabel(item.categoria)}
                          </p>
                          <p className="mt-1 text-[length:var(--text-caption)] font-bold text-muted-foreground">
                            {formatBRL(item.valor)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ExpandableCard>
              </div>
            ))}
          </div>
        </div>
      )}

      {gastosExecutivoPorOrgao.length > 0 && (
        <section id={GASTOS_ESTRUTURA_GOVERNO_ANCHOR_ID} data-pf-gastos-executivo>
          <SectionLabel>Gastos da estrutura de governo</SectionLabel>
          <SectionTitle>Totais do órgão</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.gastos_executivo} />
          </div>

          {gastosExecutivoPorOrgao.map((orgao) => (
            <GastosExecutivoOrgaoBlock
              key={orgao.codigo}
              orgao={orgao}
              expandAllForAudit={expandAllForAudit}
            />
          ))}
        </section>
      )}
    </div>
  )
}

interface TrajectoryTabSectionProps {
  historico: HistoricoPolitico[]
  mudancas: MudancaPartido[]
  historicoDescartado: number
  timelinePartidariaIncompleta: boolean
  partidoAtualSigla: string | null
  partidoAtualNome: string | null
  verificacaoCampos?: VerificacaoCampos | null
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
  verificacaoCampos,
  suggestion,
  freshness,
}: TrajectoryTabSectionProps) {
  const historicoOrdenado = prepareHistoricoPoliticoPublicDisplayList(historico)
  const mudancasEfetivas = countPartySwitches(mudancas)
  const currentPartyLabel = [partidoAtualSigla, partidoAtualNome]
    .filter((value): value is string => Boolean(value) && !isUncertainParty(value))
    .join(" · ")
  const currentPartyTokens = [partidoAtualSigla, partidoAtualNome]
    .map(normalizePartySigla)
    .filter(Boolean)
  const currentPartyHistoricoYears = Array.from(
    new Set(
      historico
        .filter((item) => currentPartyTokens.includes(normalizePartySigla(item.partido)))
        .map((item) => item.periodo_inicio)
        .filter((year): year is number => typeof year === "number")
    )
  ).sort((a, b) => a - b)
  const shouldShowPartySection = mudancas.length > 0 || Boolean(currentPartyLabel)
  // Phase 0 containment: block sections with structural contradictions until
  // editorial curation lands.
  const partyTimelineBlocked = hasSameYearPartyReversal(mudancas)

  return (
    <div className="space-y-12">
      {historicoDescartado > 0 || timelinePartidariaIncompleta ? (
        <NoticePanel
          tone="caution"
          eyebrow="Limites dos dados exibidos"
          description={
            <div className="space-y-2">
              {historicoDescartado > 0 && (
                <p>
                  Ocultamos {historicoDescartado} registro{historicoDescartado > 1 ? "s" : ""} de
                  trajetória porque a origem não confirma período ou filiação com segurança.
                </p>
              )}
              {timelinePartidariaIncompleta && currentPartyLabel && (
                <p>
                  Filiação atual publicada: {currentPartyLabel}. A linha do tempo partidária abaixo
                  ainda não incorpora essa atualização.
                </p>
              )}
            </div>
          }
        />
      ) : null}

      {historico.length === 0 && mudancas.length === 0 && (
        <div
          data-pf-trajetoria-empty-state={
            lerEstadoCelulaSuperficie(verificacaoCampos, CHAVE_ESTADO_HISTORICO)?.estado ===
            "vazio_confirmado"
              ? "materializado"
              : "pendente"
          }
        >
          <SectionLabel>Trajetória</SectionLabel>
          <SectionTitle>Histórico político</SectionTitle>
          <EmptyState
            {...getTrajetoriaEmptyState(verificacaoCampos)}
            suggestLabel={suggestion?.label}
            onSuggest={suggestion?.go}
          />
        </div>
      )}

      {historico.length > 0 && (
        <div data-pf-trajetoria-count={historicoOrdenado.length}>
          <SectionLabel>Trajetória política</SectionLabel>
          <SectionTitle>Cargos e mandatos</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.historico_politico} />
          </div>
          <div className="mt-6">
            {historicoOrdenado.map((item, index) => (
                <div
                  key={item.id}
                  data-pf-timeline-ref={`cargo-${item.id}`}
                  className="relative flex gap-4 pb-6 last:pb-0 sm:gap-6"
                >
                  <div className="flex flex-col items-center">
                    <div className="size-3 rounded-full border-2 border-foreground bg-background" />
                    {index < historicoOrdenado.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 -mt-0.5">
                    <span className="text-[length:var(--text-caption)] font-bold tabular-nums text-muted-foreground sm:text-[length:var(--text-body-sm)]">
                      {historicoDisplay.formatHistoricoPeriodoDisplay(item, historicoOrdenado)}
                    </span>
                    <p className="mt-0.5 text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                      {historicoDisplay.formatHistoricoCargoTituloPublico(item)}
                    </p>
                    <p className="text-[length:var(--text-body-sm)] font-semibold text-muted-foreground">
                      {historicoDisplay.formatHistoricoPartidoEstadoLine(item)}
                    </p>
                    {(() => {
                      const obs = historicoDisplay.formatHistoricoObservacaoPublica(
                        item.observacoes,
                      )
                      return obs ? (
                      <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                        {obs}
                      </p>
                    ) : null })()}
                  </div>
                </div>
            ))}
          </div>
        </div>
      )}

      {shouldShowPartySection && partyTimelineBlocked && (
        <div data-pf-partidos-blocked="same-year-reversal">
          <SectionLabel>Histórico partidário</SectionLabel>
          <SectionTitle>Histórico partidário</SectionTitle>
          <div className="mt-4">
            <NoticePanel
              tone="caution"
              eyebrow="Dados inconsistentes"
              description={
                <p>
                  A linha do tempo partidária contém uma reversão A→B e B→A no
                  mesmo ano, padrão estruturalmente impossível que indica
                  mistura de homônimos ou ordem incorreta na ingestão. Ocultamos
                  a lista até que as fontes permitam reconstruir a sequência.
                </p>
              }
            />
          </div>
        </div>
      )}

      {shouldShowPartySection && !partyTimelineBlocked && (
        <div data-pf-partidos-count={mudancasEfetivas}>
          <SectionLabel>Histórico partidário</SectionLabel>
          <SectionTitle>
            {mudancasEfetivas === 0
              ? "Partidos confirmados"
              : mudancasEfetivas === 1
                ? "1 troca de partido"
                : `${mudancasEfetivas} trocas de partido`}
          </SectionTitle>
          {mudancas.length > 0 ? (
            <>
              <div className="mt-4">
                <DataFreshnessNotice info={freshness?.mudancas_partido} />
              </div>
              <div className="mt-6 space-y-0">
                {[...mudancas]
                  .sort((a, b) => b.ano - a.ano)
                  .map((item, index) => (
                    <div
                      key={item.id}
                      data-pf-timeline-ref={`partido-${item.id}`}
                      className={`flex items-baseline gap-4 py-3 sm:gap-6 sm:py-4 ${index > 0 ? "border-t border-border/50" : ""}`}
                    >
                      <span className="w-[50px] shrink-0 text-[length:var(--text-caption)] font-bold tabular-nums text-foreground sm:w-[60px] sm:text-[length:var(--text-body-sm)]">
                        {item.ano}
                      </span>
                      <div>
                        <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                          {formatPartyTransitionLabel(item)}
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
            </>
          ) : (
            <div className="mt-6 flex items-baseline gap-4 py-3 sm:gap-6 sm:py-4">
              <span className="w-[50px] shrink-0 text-[length:var(--text-caption)] font-bold text-foreground sm:w-[60px] sm:text-[length:var(--text-body-sm)]">
                Atual
              </span>
              <div>
                <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                  Filiação atual: {currentPartyLabel}
                </p>
                <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                  Sem trocas de partido registradas na base.
                  {currentPartyHistoricoYears.length > 0
                    ? ` Candidaturas estruturadas: ${formatYearList(currentPartyHistoricoYears)}.`
                    : ""}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface LegislationTabSectionProps {
  projetosLei: ProjetoLei[]
  legislacaoMandatoExecutivo: LegislacaoMandatoExecutivo[]
  votos: VotoCandidato[]
  cargoDisputado?: string | null
  hasLegislativeHistory: boolean
  suggestion: SuggestAction | null
  freshness?: SectionFreshnessInfo
  projetosLeiLoadState?: "idle" | "loading" | "loaded" | "failed"
  projetosLeiTotal?: number
  legislacaoExecutivoLoadState?: "idle" | "loading" | "loaded" | "failed"
  legislacaoExecutivoTotal?: number
  initialSubtab?: LegislationSubtabId
  initialPage?: number
}

export type LegislationSubtabId =
  | "destaques"
  | "todas"
  | "propostas"
  | "votadas"
  | "aprovadas"
  | "executivo"

const EXECUTIVE_RELATION_LABELS: Record<LegislacaoMandatoExecutivo["tipo_relacao"], string> = {
  lei_sancionada: "Lei sancionada",
  projeto_enviado_pelo_executivo: "Projeto enviado pelo Executivo",
  lei_promulgada_pelo_legislativo: "Promulgada pelo Legislativo",
}

function LegislationSubtabCount({ count }: { count: number }) {
  return (
    <span className="ml-1 shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
      {count}
    </span>
  )
}

function LegislationInventoryScopeNotice({ description }: { description: string }) {
  return (
    <p
      data-pf-legislation-inventory-scope
      className="max-w-3xl text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground"
    >
      {description}
    </p>
  )
}

function LegislationSubtabEmpty({ title }: { title: string }) {
  return (
    <NoticePanel
      tone="neutral"
      eyebrow="Sem registros"
      title={title}
      description="A base pública não tem itens classificados nesta categoria para este candidato."
    />
  )
}

function LegislationPaginationControls({
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  totalItems,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  pageStart: number
  pageEnd: number
  totalItems: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  const canGoBack = currentPage > 1
  const canGoForward = currentPage < totalPages

  return (
    <div
      className="mt-4 flex flex-col gap-3 rounded-[8px] border border-border/50 bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-pf-legislation-pagination
    >
      <p className="text-[length:var(--text-caption)] font-bold text-muted-foreground">
        Mostrando {pageStart + 1}-{pageEnd} de {totalItems} itens
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-[8px] border border-border bg-background px-3 text-[length:var(--text-caption)] font-bold text-foreground transition-colors hover:border-foreground/30 disabled:pointer-events-none disabled:opacity-40"
          disabled={!canGoBack}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Anterior
        </button>
        <span className="min-w-[5.5rem] text-center text-[length:var(--text-caption)] font-bold tabular-nums text-muted-foreground">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-[8px] border border-border bg-background px-3 text-[length:var(--text-caption)] font-bold text-foreground transition-colors hover:border-foreground/30 disabled:pointer-events-none disabled:opacity-40"
          disabled={!canGoForward}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  )
}

function ExecutiveLegislationList({
  items,
  label = `Atos do Executivo no mandato (${items.length})`,
  title = "Legislação do Executivo",
  description = resolveExecutiveLegislationInventoryScope(items).listDescription,
  featured = false,
  initialPage = 1,
}: {
  items: LegislacaoMandatoExecutivo[]
  label?: string
  title?: string
  description?: string
  featured?: boolean
  initialPage?: number
}) {
  const [page, setPage] = useState(initialPage)
  const totalPages = Math.max(1, Math.ceil(items.length / LEGISLACAO_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * LEGISLACAO_PAGE_SIZE
  const pageEnd = Math.min(pageStart + LEGISLACAO_PAGE_SIZE, items.length)
  const visibleItems = useMemo(
    () => items.slice(pageStart, pageEnd),
    [items, pageEnd, pageStart],
  )

  if (items.length === 0) return null

  return (
    <div
      data-pf-executive-legislation-list
      data-pf-legislation-list-kind="executivo"
      data-pf-legislation-total={items.length}
      data-pf-legislation-page-size={LEGISLACAO_PAGE_SIZE}
      data-pf-legislation-current-page={currentPage}
      data-pf-legislation-visible-count={visibleItems.length}
    >
      <SectionLabel>{label}</SectionLabel>
      <SectionTitle>{title}</SectionTitle>
      {description && (
        <p className="mt-2 max-w-3xl text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      <LegislationPaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageStart={pageStart}
        pageEnd={pageEnd}
        totalItems={items.length}
        onPageChange={setPage}
      />
      <div className="mt-6 max-w-full space-y-3">
        {visibleItems.map((lei) => {
          const identifier = [
            lei.tipo_norma,
            lei.numero && lei.ano ? `${lei.numero}/${lei.ano}` : lei.numero || lei.ano,
          ]
            .filter(Boolean)
            .join(" ")

          const tipoRelacaoLabel = EXECUTIVE_RELATION_LABELS[lei.tipo_relacao] ?? "Ato do Executivo"

          return (
            <div
              key={lei.id}
              data-pf-timeline-ref={`lme-${lei.id}`}
              data-pf-executive-legislation-card
              data-pf-legislation-card-proof={JSON.stringify(lei)}
              className={`max-w-full overflow-hidden rounded-[12px] border px-4 py-4 transition-colors sm:px-5 ${
                featured
                  ? "border-foreground/20 border-l-[4px] border-l-foreground bg-foreground/[0.025] shadow-[0_10px_24px_-20px_rgba(0,0,0,0.5)]"
                  : "border-border/50 bg-card"
              }`}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 break-words text-[length:var(--text-body)] font-bold text-foreground">
                  {identifier || "Norma"}
                </span>
                {/* "Relevância pública", não "Destaque editorial": a seleção deste
                    recorte é algorítmica (scoreLegislationTextPublicRelevance, regex
                    de palavra-chave na ementa) e `legislacao_mandato_executivo` não
                    tem campo de curadoria. Prometer julgamento editorial aqui seria
                    afirmar além do que se sabe, o mesmo erro dos alertas que eram só
                    ausência de mandato. O selo editorial de verdade vive na lista
                    parlamentar, condicionado a `projeto.destaque`, com o
                    `destaque_motivo` exibido embaixo. */}
                {featured && <MetaBadge tone="neutral">Relevância pública</MetaBadge>}
                <MetaBadge tone="muted">{tipoRelacaoLabel}</MetaBadge>
                {lei.data_norma && (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {formatDate(lei.data_norma)}
                  </span>
                )}
                {lei.autoridade_papel === "titular" && (
                  <MetaBadge tone="neutral">Titular</MetaBadge>
                )}
              </div>
              {lei.ementa && (
                <p className="mt-2 break-words text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                  {lei.ementa}
                </p>
              )}
              {lei.signatario && (
                <p className="mt-1 break-words text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                  Signatário: {lei.signatario}
                </p>
              )}
              {safeHref(lei.fonte_primaria_url) && (
                <a
                  href={safeHref(lei.fonte_primaria_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1 break-words text-[length:var(--text-caption)] font-semibold text-foreground underline"
                >
                  Fonte oficial <ExternalLink className="size-3 shrink-0" />
                </a>
              )}
            </div>
          )
        })}
      </div>
      <LegislationPaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageStart={pageStart}
        pageEnd={pageEnd}
        totalItems={items.length}
        onPageChange={setPage}
      />
    </div>
  )
}

function ProjetoLeiList({
  items,
  label: labelProp,
  title = "Autoria legislativa",
  description,
  hasLegislativeHistory,
  suggestion,
  freshness,
  showEmptyState = false,
  initialPage = 1,
}: {
  items: ProjetoLei[]
  label?: string
  title?: string
  description?: string
  hasLegislativeHistory: boolean
  suggestion: SuggestAction | null
  freshness?: SectionFreshnessInfo
  showEmptyState?: boolean
  initialPage?: number
}) {
  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.destaque && !b.destaque) return -1
        if (!a.destaque && b.destaque) return 1
        return (b.ano ?? 0) - (a.ano ?? 0)
      }),
    [items],
  )
  /**
   * Item 8 da triagem de 09/08/2026. `cabo-daciolo` repetiu 24 vezes, entre 2016
   * e 2018, o requerimento de inclusão da PEC 446/09 na pauta do Plenário, e a
   * ficha listava as 24 linhas como 24 fatos. A lista passa a mostrar uma
   * proposição por ementa com a contagem de reapresentações declarada no
   * cartão; nenhuma linha some do acervo, e os contadores abaixo continuam
   * medindo o acervo inteiro, não o colapsado.
   */
  const grupos = useMemo(() => agruparProposicoesPorEmenta(sortedItems), [sortedItems])
  /**
   * Issue #138. A lista sempre se chamou "Projetos de lei (N)", mas o acervo
   * autoral da Câmara traz requerimento, requerimento de informação, indicação e
   * emenda junto: das 339 linhas curadas na migration `20260507130000`, 94 são
   * projeto de lei e 245 não são. Chamar as 339 de projeto de lei é o rótulo que o
   * `OBJECTIVE.md` manda remover, então o rótulo passa a dizer o que a lista tem
   * e a composição aparece logo abaixo.
   */
  const composicao = useMemo(
    () => contarPorNatureza(sortedItems.map((item) => item.tipo)),
    [sortedItems],
  )
  const misturaNaturezas = composicao.outrasProposicoes > 0 && composicao.projetosLei > 0
  const label =
    labelProp ??
    (composicao.outrasProposicoes > 0
      ? `Proposições de autoria (${items.length})`
      : `Projetos de lei (${items.length})`)
  const composicaoTexto = misturaNaturezas
    ? `${composicao.projetosLei} projeto(s) de lei e ${composicao.outrasProposicoes} outra(s) proposição(ões) de autoria (requerimento, indicação, emenda).`
    : null

  const [page, setPage] = useState(initialPage)
  const totalPages = Math.max(1, Math.ceil(grupos.length / LEGISLACAO_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * LEGISLACAO_PAGE_SIZE
  const pageEnd = Math.min(pageStart + LEGISLACAO_PAGE_SIZE, grupos.length)
  const visibleGrupos = useMemo(
    () => grupos.slice(pageStart, pageEnd),
    [grupos, pageEnd, pageStart],
  )
  const linhasColapsadas = sortedItems.length - grupos.length

  return (
    <div
      data-pf-legislative-project-list={items.length > 0 ? true : undefined}
      data-pf-legislation-list-kind={items.length > 0 ? "projetos" : undefined}
      data-pf-legislation-total={items.length > 0 ? sortedItems.length : undefined}
      data-pf-legislation-page-size={items.length > 0 ? LEGISLACAO_PAGE_SIZE : undefined}
      data-pf-legislation-current-page={items.length > 0 ? currentPage : undefined}
      data-pf-legislation-visible-count={items.length > 0 ? visibleGrupos.length : undefined}
      data-pf-legislation-grupos={items.length > 0 ? grupos.length : undefined}
      data-pf-legislation-linhas-colapsadas={items.length > 0 ? linhasColapsadas : undefined}
      data-pf-legislation-projetos-lei={items.length > 0 ? composicao.projetosLei : undefined}
      data-pf-legislation-outras-proposicoes={
        items.length > 0 ? composicao.outrasProposicoes : undefined
      }
    >
      <SectionLabel>{label}</SectionLabel>
      <SectionTitle>{title}</SectionTitle>
      {description && (
        <p className="mt-2 max-w-3xl text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {composicaoTexto && (
        <p className="mt-2 max-w-3xl text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
          {composicaoTexto}
        </p>
      )}
      {items.length > 0 && freshness && (
        <div className="mt-4">
          <DataFreshnessNotice info={freshness} />
        </div>
      )}
      {items.length === 0 && showEmptyState && (
        <EmptyState
          {...getLegislacaoEmptyState(hasLegislativeHistory)}
          suggestLabel={suggestion?.label}
          onSuggest={suggestion?.go}
        />
      )}
      {items.length > 0 && (
        <>
          {linhasColapsadas > 0 && (
            <p className="mt-2 max-w-3xl text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
              {grupos.length} proposição(ões) distinta(s) por ementa. {linhasColapsadas} linha(s)
              do acervo são reapresentações do mesmo texto e aparecem agrupadas no cartão da
              proposição correspondente.
            </p>
          )}
          <LegislationPaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            totalItems={grupos.length}
            onPageChange={setPage}
          />
          <div className="mt-6 max-w-full space-y-3">
            {visibleGrupos.map((grupo) => {
              const projeto = grupo.representante
              const reapresentacoes = descreverReapresentacoes(grupo)

              return (
              <div
                key={projeto.id}
                data-pf-proposicao-reapresentacoes={
                  grupo.totalNoGrupo > 1 ? grupo.totalNoGrupo : undefined
                }
                data-pf-timeline-ref={`pl-${projeto.id}`}
                data-pf-legislation-card-proof={JSON.stringify(grupo)}
                className={`max-w-full overflow-hidden rounded-[12px] border border-border/50 bg-card px-4 py-4 sm:px-5 ${
                  projeto.destaque ? "border-l-[3px] border-l-foreground" : ""
                }`}
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
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words text-[length:var(--text-body)] font-bold text-foreground">
                          {identifier ||
                            (projeto.ementa
                              ? projeto.ementa.slice(0, 80) +
                                (projeto.ementa.length > 80 ? "..." : "")
                              : "Projeto de lei")}
                        </span>
                        {projeto.situacao && (
                          <MetaBadge
                            tone={PROJECT_STATUS_BADGES[projeto.situacao]?.tone ?? "muted"}
                          >
                            {formatProjectStatusLabel(projeto.situacao)}
                          </MetaBadge>
                        )}
                        {projeto.destaque && (
                          <MetaBadge tone="neutral">
                            Destaque
                          </MetaBadge>
                        )}
                        {projeto.tema && (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {formatTemaLabel(projeto.tema)}
                          </span>
                        )}
                      </div>
                      {projeto.ementa && identifier && (
                        <p className="mt-2 break-words text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                          {projeto.ementa}
                        </p>
                      )}
                    </>
                  )
                })()}
                {projeto.destaque_motivo && (
                  <p className="mt-1 break-words text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                    {projeto.destaque_motivo}
                  </p>
                )}
                {reapresentacoes && (
                  <p
                    data-pf-proposicao-reapresentacoes-texto
                    className="mt-2 break-words text-[length:var(--text-caption)] font-semibold text-muted-foreground"
                  >
                    {reapresentacoes}
                  </p>
                )}
                {safeHref(projeto.url_inteiro_teor) && (
                  <a
                    href={safeHref(projeto.url_inteiro_teor)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex max-w-full items-center gap-1 break-words text-[length:var(--text-caption)] font-semibold text-foreground underline"
                  >
                    Página oficial da proposta <ExternalLink className="size-3 shrink-0" />
                  </a>
                )}
              </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function VotedLegislationList({ items }: { items: VotoCandidato[] }) {
  if (items.length === 0) return <LegislationSubtabEmpty title="Nenhuma votação isolada encontrada" />

  return (
    <div>
      <SectionLabel>Votou sem autoria registrada ({items.length})</SectionLabel>
      <SectionTitle>Votações em legislação</SectionTitle>
      <div className="mt-6 space-y-3">
        {items.map((voto) => (
          <div
            key={voto.id}
            data-pf-voto-card
            data-pf-voto-id={voto.votacao_id}
            data-pf-voto-date={voto.votacao?.data_votacao ?? ""}
            data-pf-voto-title={voto.votacao?.titulo ?? ""}
            data-pf-timeline-ref={`voto-${voto.id}`}
            className={`rounded-[12px] border border-border/50 bg-card px-5 py-4 ${
              voto.contradicao ? "border-l-[3px] border-l-amber-400/80" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-[length:var(--text-body)] font-bold text-foreground sm:text-[15px]">
                  {voto.votacao?.titulo ? sanitizePtBrText(voto.votacao.titulo) : "Votação"}
                </p>
                {voto.votacao?.descricao && (
                  <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                    {sanitizePtBrText(voto.votacao.descricao)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {voto.votacao?.tema && (
                    <MetaBadge tone="muted">
                      {formatTemaLabel(voto.votacao.tema)}
                    </MetaBadge>
                  )}
                  {voto.votacao?.casa && (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {voto.votacao.casa} | {voto.votacao.data_votacao ? formatDate(voto.votacao.data_votacao) : ""}
                    </span>
                  )}
                </div>
                {voto.contradicao && voto.contradicao_descricao && (
                  <div className="mt-3 border-l-2 border-amber-400/70 bg-muted/30 px-3 py-2.5">
                    <p className="text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] text-foreground">
                      Contradição editorial
                    </p>
                    <p className="mt-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
                      {sanitizePtBrText(voto.contradicao_descricao)}
                    </p>
                  </div>
                )}
                {voto.votacao?.impacto_popular && (
                  <p className="mt-1.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                    Impacto: {voto.votacao.impacto_popular}
                  </p>
                )}
              </div>
              <span
                className={`mt-1 shrink-0 rounded-full px-3.5 py-1.5 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] ${
                  voto.voto === "sim"
                    ? "bg-foreground text-background"
                    : voto.voto === "não"
                      ? "border border-foreground bg-transparent text-foreground"
                      : "bg-secondary text-foreground"
                }`}
              >
                {formatVoteBadgeLabel(voto.voto)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LegislationTabSection({
  projetosLei,
  legislacaoMandatoExecutivo,
  votos,
  cargoDisputado,
  hasLegislativeHistory,
  suggestion,
  freshness,
  projetosLeiLoadState = "loaded",
  projetosLeiTotal = projetosLei.length,
  legislacaoExecutivoLoadState = "loaded",
  legislacaoExecutivoTotal = legislacaoMandatoExecutivo.length,
  initialSubtab,
  initialPage = 1,
}: LegislationTabSectionProps) {
  const groups = groupLegislacaoProfileItems({
    projetosLei,
    legislacaoMandatoExecutivo,
    legislacaoMandatoExecutivoTotal: legislacaoExecutivoTotal,
    votos,
    cargoDisputado,
  })
  const hasAnyLegislation = groups.totalCount > 0
  const hasFeaturedLegislation = groups.hasLegislationHighlights
  const defaultSubtab = initialSubtab === "destaques" && !hasFeaturedLegislation
    ? "todas"
    : (initialSubtab ?? (hasFeaturedLegislation ? "destaques" : "todas"))
  const inventoryTabLabel = hasAnyLegislation ? groups.inventoryScope.tabLabel : "Todas"
  const shouldShowInventoryScopeNotice =
    hasAnyLegislation && Boolean(groups.inventoryScope.listDescription)
  const legislationSubtabsRef = useRef<HTMLDivElement | null>(null)
  const renderInventoryScopeNotice = () =>
    shouldShowInventoryScopeNotice ? (
      <LegislationInventoryScopeNotice description={groups.inventoryScope.listDescription} />
    ) : null

  return (
    <Tabs
      defaultValue={defaultSubtab}
      className="gap-8"
      data-pf-projetos-load-state={projetosLeiLoadState}
      data-pf-executivo-load-state={legislacaoExecutivoLoadState}
    >
      {projetosLeiLoadState === "loading" && (
        <NoticePanel tone="neutral">
          Carregando o inventário legislativo completo ({projetosLeiTotal} projetos)…
        </NoticePanel>
      )}
      {projetosLeiLoadState === "failed" && (
        <NoticePanel tone="caution">
          Não foi possível carregar todos os {projetosLeiTotal} projetos agora. A prévia disponível continua abaixo.
        </NoticePanel>
      )}
      {legislacaoExecutivoLoadState === "loading" && (
        <NoticePanel tone="neutral">
          Carregando o inventário completo do Executivo ({legislacaoExecutivoTotal} atos)…
        </NoticePanel>
      )}
      {legislacaoExecutivoLoadState === "failed" && (
        <NoticePanel tone="caution">
          Não foi possível carregar os {legislacaoExecutivoTotal} atos do Executivo agora. A prévia disponível continua abaixo.
        </NoticePanel>
      )}
      <div className="relative max-w-full min-w-0 overflow-hidden" data-pf-legislation-subtabs-scroll>
        <div
          ref={legislationSubtabsRef}
          className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth px-0 scrollbar-none sm:px-9"
        >
          <TabsList className="min-w-full w-max max-w-none justify-start">
            {hasFeaturedLegislation && (
              <TabsTrigger value="destaques" data-pf-legislation-subtab="destaques" className="max-w-[72vw] flex-none overflow-hidden sm:max-w-none">
                <span className="truncate">Destaques</span>
                <LegislationSubtabCount count={groups.featuredCount} />
              </TabsTrigger>
            )}
            <TabsTrigger value="todas" data-pf-legislation-subtab="todas" className="max-w-[72vw] flex-none overflow-hidden sm:max-w-none">
              <span className="truncate">{inventoryTabLabel}</span>
              <LegislationSubtabCount count={groups.totalCount} />
            </TabsTrigger>
            <TabsTrigger value="propostas" data-pf-legislation-subtab="propostas" className="max-w-[72vw] flex-none overflow-hidden sm:max-w-none">
              <span className="truncate">Propôs</span>
              <LegislationSubtabCount count={groups.proposedCount} />
            </TabsTrigger>
            <TabsTrigger value="votadas" data-pf-legislation-subtab="votadas" className="max-w-[72vw] flex-none overflow-hidden sm:max-w-none">
              <span className="truncate">Votou</span>
              <LegislationSubtabCount count={groups.votosApenas.length} />
            </TabsTrigger>
            <TabsTrigger value="aprovadas" data-pf-legislation-subtab="aprovadas" className="max-w-[72vw] flex-none overflow-hidden sm:max-w-none">
              <span className="truncate">Aprovadas</span>
              <LegislationSubtabCount count={groups.approvedCount} />
            </TabsTrigger>
            <TabsTrigger value="executivo" data-pf-legislation-subtab="executivo" className="max-w-[72vw] flex-none overflow-hidden sm:max-w-none">
              <span className="truncate">Executivo</span>
              <LegislationSubtabCount count={groups.executivoCount} />
            </TabsTrigger>
          </TabsList>
        </div>
        <HorizontalScrollButtons
          scrollRef={legislationSubtabsRef}
          ariaLabel="subabas de Legislação"
        />
      </div>

      {hasFeaturedLegislation && (
        <TabsContent value="destaques" data-pf-legislation-content="destaques" className="space-y-12">
          {renderInventoryScopeNotice()}
          <ExecutiveLegislationList
            items={groups.destaquesExecutivo}
            label={`Destaques do Executivo (${groups.destaquesExecutivo.length})`}
            title="Destaques legislativos"
            description={groups.inventoryScope.featuredDescription}
            featured
            initialPage={initialPage}
          />
          {groups.destaquesParlamentares.length > 0 && (
            <ProjetoLeiList
              items={groups.destaquesParlamentares}
              label={
                rotuloDoAcervo(groups.destaquesParlamentares.map((p) => p.tipo)) ===
                "Projetos de lei"
                  ? `Projetos em destaque (${groups.destaquesParlamentares.length})`
                  : `Proposições em destaque (${groups.destaquesParlamentares.length})`
              }
              title="Autoria legislativa em destaque"
              description="Recorte inicial de relevância pública na autoria legislativa: inclui destaques editoriais quando existirem e sinais heurísticos na ementa. Não é uma curadoria editorial definitiva item a item."
              hasLegislativeHistory={hasLegislativeHistory}
              suggestion={suggestion}
              freshness={freshness}
              initialPage={initialPage}
            />
          )}
        </TabsContent>
      )}

      <TabsContent value="todas" data-pf-legislation-content="todas" className="space-y-12">
        {!hasAnyLegislation && (
          <EmptyState
            {...getLegislacaoEmptyState(hasLegislativeHistory)}
            suggestLabel={suggestion?.label}
            onSuggest={suggestion?.go}
          />
        )}
        {renderInventoryScopeNotice()}
        <ExecutiveLegislationList items={groups.executivo} initialPage={initialPage} />
        <ProjetoLeiList
          items={groups.propostasParlamentares}
          hasLegislativeHistory={hasLegislativeHistory}
          suggestion={suggestion}
          freshness={freshness}
          initialPage={initialPage}
        />
        {groups.votosApenas.length > 0 && <VotedLegislationList items={groups.votosApenas} />}
      </TabsContent>

      <TabsContent value="propostas" data-pf-legislation-content="propostas" className="space-y-12">
        {renderInventoryScopeNotice()}
        <ExecutiveLegislationList
          items={groups.propostasExecutivo}
          label={`Projetos enviados pelo Executivo (${groups.propostasExecutivo.length})`}
          title="Propostas do Executivo"
          initialPage={initialPage}
        />
        <ProjetoLeiList
          items={groups.propostasParlamentares}
          hasLegislativeHistory={hasLegislativeHistory}
          suggestion={suggestion}
          freshness={freshness}
          showEmptyState={groups.propostasExecutivo.length === 0}
          initialPage={initialPage}
        />
      </TabsContent>

      <TabsContent value="votadas" data-pf-legislation-content="votadas" className="space-y-12">
        {renderInventoryScopeNotice()}
        <VotedLegislationList items={groups.votosApenas} />
      </TabsContent>

      <TabsContent value="aprovadas" data-pf-legislation-content="aprovadas" className="space-y-12">
        {renderInventoryScopeNotice()}
        {groups.approvedCount === 0 && (
          <LegislationSubtabEmpty title="Nenhum projeto aprovado ou lei sancionada encontrada" />
        )}
        <ExecutiveLegislationList
          items={groups.leisSancionadas}
          label={`Leis sancionadas (${groups.leisSancionadas.length})`}
          title="Aprovação no Executivo"
          initialPage={initialPage}
        />
        <ProjetoLeiList
          items={groups.projetosAprovados}
          label={
            rotuloDoAcervo(groups.projetosAprovados.map((p) => p.tipo)) === "Projetos de lei"
              ? `Projetos de autoria aprovados (${groups.projetosAprovados.length})`
              : `Proposições de autoria aprovadas (${groups.projetosAprovados.length})`
          }
          title="Autoria legislativa aprovada"
          hasLegislativeHistory={hasLegislativeHistory}
          suggestion={suggestion}
          freshness={freshness}
          initialPage={initialPage}
        />
      </TabsContent>

      <TabsContent value="executivo" data-pf-legislation-content="executivo" className="space-y-12">
        {renderInventoryScopeNotice()}
        {groups.executivo.length === 0 ? (
          <LegislationSubtabEmpty title="Nenhum ato do Executivo encontrado" />
        ) : (
          <ExecutiveLegislationList items={groups.executivo} initialPage={initialPage} />
        )}
      </TabsContent>
    </Tabs>
  )
}
