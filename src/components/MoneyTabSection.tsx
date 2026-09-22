"use client"

import Link from "next/link"
import { GlossaryTerm } from "./GlossaryTerm"
import { TrackedExternalSourceLink } from "@/components/TrackedExternalSourceLink"
import { EmptyState, getFinanciamentoEmptyState, getPatrimonioEmptyState } from "./EmptyState"
import { buildDoadorReverseHref } from "@/lib/doador-reverse-shared"
import { ExpandableCard } from "./ExpandableCard"
import { HorizontalBars, PatrimonioChart, StackedBar } from "./BarChart"
import { MetaBadge } from "./MetaBadge"
import { NoticePanel } from "./NoticePanel"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { formatDate, formatBRL, safeHref } from "@/lib/utils"
import type { Financiamento, GastoExecutivo, GastoParlamentar, HistoricoPolitico, Patrimonio, PatrimonioContextoPublico, SectionFreshnessInfo, TransparenciaFamiliaPublico } from "@/lib/types"
import { ExternalLink } from "lucide-react"
import { DataFreshnessNotice } from "./DataFreshnessNotice"
import { PatrimonioEvolucaoAlerta } from "./PatrimonioEvolucaoAlerta"
import { formatFinanciamentoPleitoPublicLabelForRow } from "@/lib/financiamento-pleito-public-label"
import { buildFinanciamentoEleicoes, descreverFinanciamentoEleicao, type FinanciamentoEleicaoPublico } from "@/lib/financiamento-eleicoes"
import type { PatrimonioEleicaoPublico } from "@/lib/public-profile-dto"
import { descreverDoacoes, type DoadorRecorrenteOutraCandidatura, type DoadorRecorrentePublico } from "@/lib/doador-recorrente-publico"
import { DOADOR_RECORRENTE_COPY, FINANCING_COLOR_BY_KEY, type FinancingBreakdownKey, formatFinanciamentoEleicaoEstadoLabel, formatFinancingLabel, formatPatrimonioEleicaoEstadoLabel, formatPublicLabel } from "@/lib/ui-labels"
import { financiamentoPleitoNotaRodape, financiamentoPleitoSubtitulo } from "@/lib/financiamento-pleito-display"
import { sanitizePublicText } from "@/lib/public-text"
import { buildFinancingComposition } from "@/lib/financiamento-display"
import { formatarStatusSigilo, groupGastosExecutivoPorOrgao, rotuloFonteGastosExecutivo, rotuloUnidadeGestora, type GastoExecutivoOrgaoResumo, type SigiloStatus } from "@/lib/gastos-executivo-display"
import type { SuggestAction } from "./candidato-profile-section-types"
import { patrimonioContextoLabel, patrimonioPorAnoSemAmbiguidade } from "@/lib/patrimonio-contexto"

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
            <TrackedExternalSourceLink
              area="ficha-eleicoes-fonte"
              href={fonte}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {rotuloFonte}
            </TrackedExternalSourceLink>
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

// Fonte unica em src/lib/ui-labels.ts: a copia local desta paleta era o segundo
// lugar onde o piso de contraste podia divergir.
const FINANCING_COLORS: Record<FinancingBreakdownKey, string> = FINANCING_COLOR_BY_KEY

/**
 * Linha de eleição (>= 2006) cujo patrimônio não está publicado. Ausência não
 * pode parecer ficha limpa nem ano oculto: vazio_confirmado mostra a fonte
 * oficial conferida e a data da verificação; nao_coletado exibe a pendência
 * sem insinuar que o candidato não tinha bens.
 */
function PatrimonioEleicaoSemDadoRow({
  eleicao,
  contexto,
}: {
  eleicao: PatrimonioEleicaoPublico
  contexto?: PatrimonioContextoPublico
}) {
  const fonteHref = safeHref(contexto?.fonte_url ?? eleicao.fonte_url)
  const verificadoEmRaw = contexto?.verificado_em ?? eleicao.verificado_em
  const verificadoEm = verificadoEmRaw ? formatDate(verificadoEmRaw) : null
  const detalhe = contexto?.detalhe ?? eleicao.detalhe
  const estado = contexto?.estado ?? eleicao.estado

  return (
    <div
      data-pf-patrimonio-eleicao={eleicao.ano}
      data-pf-patrimonio-eleicao-estado={estado}
      data-pf-patrimonio-contexto={contexto?.sq_candidato ?? undefined}
      data-pf-money-card="patrimonio"
      data-pf-money-card-year={eleicao.ano}
      data-pf-money-card-state={estado}
      className="rounded-[12px] border border-border/60 bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
          {contexto
            ? patrimonioContextoLabel({
                ano_eleicao: eleicao.ano,
                cargo_candidatura: contexto.cargo_candidatura,
                tipo_eleicao: contexto.tipo_eleicao,
              })
            : eleicao.ano}
        </span>
        <MetaBadge tone={estado === "vazio_confirmado" ? "neutral" : "muted"}>
          {formatPatrimonioEleicaoEstadoLabel(estado)}
        </MetaBadge>
      </div>
      <p className="mt-1.5 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        {estado === "vazio_confirmado"
          ? detalhe ??
            `Nenhum registro de bens foi localizado para esta candidatura no arquivo oficial de ${eleicao.ano} consultado. Isso não comprova ausência de patrimônio nem de declaração.`
          : `A coleta de bens da eleição de ${eleicao.ano} ainda não foi realizada. A ausência de dados aqui não significa ausência de bens.`}
      </p>
      {estado === "vazio_confirmado" && (verificadoEm || fonteHref) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
          {verificadoEm && <span>Verificado em {verificadoEm}</span>}
          {fonteHref && (
            <TrackedExternalSourceLink
              area="ficha-fonte-oficial"
              href={fonteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-foreground underline"
            >
              Fonte oficial <ExternalLink className="size-3 shrink-0" />
            </TrackedExternalSourceLink>
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
          {patrimonioContextoLabel(patrimonio)}
        </p>
        <p className="mt-0.5 text-[length:var(--text-caption)] font-semibold leading-snug text-muted-foreground sm:text-[length:var(--text-body-sm)]">
          Total declarado ao TSE. Esta declaração não traz detalhamento de bens.
        </p>
      </div>
      <span className="shrink-0 text-[24px] font-bold tabular-nums tracking-tight text-foreground sm:text-right sm:text-[length:var(--text-heading)]">
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
  const contexto = eleicao.cargo_candidatura?.trim()
    ? ` - ${eleicao.cargo_candidatura.trim()}`
    : ""
  // `data-pf-financiamento-eleicao` continua sendo só o ano: testes de
  // superfície e readbacks leem o atributo como número. A candidatura (SQ/UF)
  // vai em atributo próprio, presente apenas quando o pleito tem contexto.
  const candidaturaKey = eleicao.sq_candidato || eleicao.uf_candidatura
    ? `${eleicao.sq_candidato ?? ""}|${eleicao.uf_candidatura ?? ""}`
    : undefined

  return (
    <div
      data-pf-financiamento-eleicao={eleicao.ano}
      data-pf-financiamento-contexto={candidaturaKey}
      data-pf-financiamento-eleicao-estado={eleicao.estado}
      data-pf-money-card="financiamento"
      data-pf-money-card-year={eleicao.ano}
      data-pf-money-card-state={eleicao.estado}
      className="rounded-[12px] border border-border/60 bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
          {eleicao.ano}{contexto}
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
            <TrackedExternalSourceLink
              area="ficha-fonte-oficial"
              href={fonteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-foreground underline"
            >
              Fonte oficial <ExternalLink className="size-3 shrink-0" />
            </TrackedExternalSourceLink>
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
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Situação dos pleitos sem valor positivo publicado
      </p>
      <div className="mt-2 space-y-3">
        {eleicoes.map((eleicao) => (
          <FinanciamentoEleicaoSemDadoRow
            key={`${eleicao.ano}|${eleicao.sq_candidato ?? ""}|${eleicao.uf_candidatura ?? ""}`}
            eleicao={eleicao}
          />
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
  const semDadoPublicado: Array<{
    eleicao: PatrimonioEleicaoPublico
    contexto?: PatrimonioContextoPublico
  }> = eleicoes.flatMap<{
    eleicao: PatrimonioEleicaoPublico
    contexto?: PatrimonioContextoPublico
  }>((eleicao) => {
    const contextos = (eleicao.contextos ?? []).filter(
      (contexto) => contexto.estado === "vazio_confirmado",
    )
    if (contextos.length > 0) return contextos.map((contexto) => ({ eleicao, contexto }))
    return eleicao.estado !== "publicado" ? [{ eleicao, contexto: undefined }] : []
  }).sort((a, b) => b.eleicao.ano - a.eleicao.ano)
  if (semDadoPublicado.length === 0) return null

  return (
    <div data-pf-patrimonio-eleicoes-sem-dado={semDadoPublicado.length}>
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Eleições sem dado publicado
      </p>
      <div className="mt-2 space-y-3">
        {semDadoPublicado.map(({ eleicao, contexto }) => (
          <PatrimonioEleicaoSemDadoRow
            key={`${eleicao.ano}|${contexto?.sq_candidato ?? "sem-contexto"}`}
            eleicao={eleicao}
            contexto={contexto}
          />
        ))}
      </div>
    </div>
  )
}

const DOADOR_RECORRENTE_OUTRAS_VISIVEIS = 5

/**
 * Doadores desta ficha que também aparecem em outra candidatura publicada.
 * Lista vazia é estado lido e explícito; `null` (leitura falhou) nem monta.
 */
function DoadoresRecorrentesBlock({ doadores }: { doadores: DoadorRecorrentePublico[] }) {
  const copy = DOADOR_RECORRENTE_COPY
  return (
    <div
      data-pf-doadores-recorrentes={doadores.length}
      className="mt-6 space-y-4 rounded-[16px] border border-border/50 px-5 py-5"
    >
      <div>
        <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {copy.eyebrow}
        </p>
        <h3 className="mt-1 text-[length:var(--text-body-lg)] font-bold leading-snug text-foreground">
          {copy.titulo}
        </h3>
        <p className="mt-2 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
          {copy.descricao}
        </p>
      </div>

      {doadores.length === 0 ? (
        <p
          data-pf-doadores-recorrentes-vazio
          className="rounded-[12px] bg-muted/40 px-4 py-3 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground"
        >
          {copy.vazio}
        </p>
      ) : (
        <ul className="space-y-4">
          {doadores.map((doador, ordem) => {
            const visiveis = doador.outras_candidaturas.slice(0, DOADOR_RECORRENTE_OUTRAS_VISIVEIS)
            const restantes = doador.outras_candidaturas.slice(DOADOR_RECORRENTE_OUTRAS_VISIVEIS)
            return (
              <li
                key={`${ordem}-${doador.doador_nome}`}
                data-pf-doador-recorrente={doador.doacoes.length}
                className="border-t border-border/50 pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <Link
                    href={buildDoadorReverseHref(doador.doador_nome)}
                    className="min-w-0 break-words font-bold leading-snug text-foreground underline-offset-2 hover:underline"
                  >
                    {doador.doador_nome}
                  </Link>
                  <span className="shrink-0 text-[length:var(--text-body-sm)] font-medium tabular-nums text-muted-foreground">
                    {descreverDoacoes(doador.doacoes, formatBRL)}
                  </span>
                </div>
                <p className="mt-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {copy.tambemFinancia}
                </p>
                <ul className="mt-1 space-y-1">
                  {visiveis.map((outra) => (
                    <DoadorRecorrenteOutraLinha key={outra.slug} outra={outra} />
                  ))}
                </ul>
                {restantes.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer py-1 text-[length:var(--text-body-sm)] font-bold text-foreground underline-offset-2 hover:underline">
                      {copy.maisCandidaturas(restantes.length)}
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {restantes.map((outra) => (
                        <DoadorRecorrenteOutraLinha key={outra.slug} outra={outra} />
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="space-y-2 border-t border-border/50 pt-3 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        <p data-pf-doadores-recorrentes-limite>{copy.limite}</p>
        <p>{copy.regra}</p>
        <p>
          {copy.fonte}{" "}
          <Link href={copy.metodologiaHref} className="font-bold text-foreground underline underline-offset-2">
            {copy.metodologiaLabel}
          </Link>
        </p>
      </div>
    </div>
  )
}

function DoadorRecorrenteOutraLinha({ outra }: { outra: DoadorRecorrenteOutraCandidatura }) {
  return (
    <li className="flex flex-col gap-0.5 text-[length:var(--text-body-sm)] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <Link
        href={`/candidato/${encodeURIComponent(outra.slug)}`}
        className="min-w-0 break-words py-0.5 font-medium text-foreground underline underline-offset-2"
      >
        {outra.nome_urna ?? outra.slug}
      </Link>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {descreverDoacoes(outra.doacoes, formatBRL)}
      </span>
    </li>
  )
}

interface MoneyTabSectionProps {
  patrimonio: Patrimonio[]
  financiamento: Financiamento[]
  /** Doadores em comum com outras candidaturas; `null`/ausente = seção omitida. */
  doadoresRecorrentes?: DoadorRecorrentePublico[] | null
  financiamentoEleicoes?: FinanciamentoEleicaoPublico[] | null
  /** Bruto (API); usado só para rótulos de pleito em financiamento, não para `cargo_disputado` atual. */
  historico: HistoricoPolitico[]
  gastos: GastoParlamentar[]
  transparencia?: TransparenciaFamiliaPublico[]
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
  doadoresRecorrentes = null,
  financiamentoEleicoes,
  historico,
  gastos,
  transparencia = [],
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
    (eleicao) => eleicao.estado !== "publicado" || eleicao.contextos?.some((contexto) => contexto.estado === "vazio_confirmado"),
  )
  const patrimonioSerieAnual = patrimonioPorAnoSemAmbiguidade(patrimonio)
  const patrimonioContagemPorAno = patrimonio.reduce((acc, row) => {
    acc.set(row.ano_eleicao, (acc.get(row.ano_eleicao) ?? 0) + 1)
    return acc
  }, new Map<number, number>())
  const patrimonioAnosComMultiplasDeclaracoes = [...patrimonioContagemPorAno]
    .filter(([, quantidade]) => quantidade > 1)
    .map(([ano]) => ano)
    .sort((a, b) => b - a)
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
          <PatrimonioEvolucaoAlerta patrimonio={patrimonioSerieAnual} className="mt-4" />
          {patrimonioAnosComMultiplasDeclaracoes.length > 0 && (
            <NoticePanel
              data-pf-patrimonio-contextos-separados={patrimonioAnosComMultiplasDeclaracoes.join(",")}
              className="mt-4"
              tone="neutral"
              eyebrow="Declarações por candidatura"
              description={`O gráfico não combina candidaturas distintas em ${patrimonioAnosComMultiplasDeclaracoes.join(", ")}. Esses anos estão detalhados separadamente nos cartões abaixo.`}
            />
          )}
          {patrimonioSerieAnual.length > 1 && (
            <div className="mt-6">
              <PatrimonioChart
                data={patrimonioSerieAnual.map((item) => ({
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
                      title={patrimonioContextoLabel(item)}
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
                              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.05em] text-muted-foreground">
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
                      <p className="mt-1 text-[length:var(--text-eyebrow)] font-medium leading-snug text-muted-foreground">
                        {financiamentoPleitoSubtitulo()}
                      </p>
                    </div>
                    <span
                      data-pf-financiamento-total-visivel
                      className={`shrink-0 font-bold text-foreground sm:text-right ${
                        Number(item.total_arrecadado) === 0 &&
                        (item.maiores_doadores ?? []).length === 0
                          ? "max-w-[320px] text-[length:var(--text-body)] leading-snug"
                          : "text-[24px] tracking-tight sm:text-[length:var(--text-heading)]"
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
                      <p className="mb-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
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
                              className="py-0.5 font-medium leading-5 text-foreground underline-offset-2 hover:underline"
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
          {financiamento.length > 0 && doadoresRecorrentes && (
            <DoadoresRecorrentesBlock doadores={doadoresRecorrentes} />
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

      {(gastos.length > 0 || freshness?.gastos_parlamentares?.status === "not_applicable") && (
        <div>
          <SectionLabel>Gastos parlamentares</SectionLabel>
          <SectionTitle>Uso da cota parlamentar (<GlossaryTerm term="CEAP" />)</SectionTitle>
          <div className="mt-4">
            <DataFreshnessNotice info={freshness?.gastos_parlamentares} />
          </div>
          {gastos.length > 0 && <div className="mt-6 space-y-4">
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
                      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
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
          </div>}
        </div>
      )}

      {transparencia.length > 0 && (
        <section data-pf-transparencia>
          <SectionLabel>Portal da Transparência</SectionLabel>
          <SectionTitle>Registros por família de consulta</SectionTitle>
          <p className="mt-3 text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
            Os registros abaixo pertencem a consultas públicas distintas. Eles não compõem a cota parlamentar nem um total pessoal; a presença de dados também não comprova cobertura completa.
          </p>
          <div className="mt-6 space-y-4">
            {transparencia.map((familia) => {
              const label = familia.familia === "cartoes" ? "Cartões por portador" : familia.familia === "viagens" ? "Viagens por CPF" : "Contratos por CPF/CNPJ"
              const estado = familia.resultado === "encontrado"
                ? `${familia.volume} registro(s); escopo consultado verificado`
                : familia.resultado === "vazio_confirmado"
                  ? "Nenhum registro retornado neste escopo"
                  : "Consulta inconclusiva"
              return (
                <div key={familia.familia} className="rounded-[20px] border border-border/70 bg-card p-5 sm:p-6" data-pf-transparencia-familia={familia.familia}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-bold text-foreground">{label}</p>
                    <MetaBadge tone={familia.resultado === "encontrado" ? "caution" : "neutral"}>{estado}</MetaBadge>
                  </div>
                  {familia.registros.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[600px] text-left text-[length:var(--text-caption)]">
                        <thead className="border-b border-border/60 text-muted-foreground"><tr><th className="pb-2 pr-3">Data</th><th className="pb-2 pr-3">Órgão</th><th className="pb-2 pr-3">Categoria</th><th className="pb-2 text-right">Valor</th></tr></thead>
                        <tbody>
                          {familia.registros.map((registro, index) => (
                            <tr key={`${familia.familia}-${registro.id ?? index}`} className="border-b border-border/40 last:border-0">
                              <td className="py-2 pr-3 text-foreground">{registro.data ?? "Data não informada"}{registro.data_fim ? ` a ${registro.data_fim}` : ""}</td>
                              <td className="py-2 pr-3 text-muted-foreground">{registro.orgao ?? registro.unidade ?? "Não informado"}</td>
                              <td className="py-2 pr-3 text-muted-foreground">{registro.categoria ?? registro.descricao ?? "Não informado"}</td>
                              <td className="py-2 text-right font-semibold text-foreground">{registro.valor == null ? "Valor não informado" : formatBRL(registro.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {familia.registros.length === 0 && familia.resultado === "encontrado" && <p className="mt-3 text-[length:var(--text-body-sm)] text-muted-foreground">Dados encontrados, mas sem registro público materializado nesta ficha.</p>}
                  <p className="mt-3 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                    Consulta realizada em {familia.executado_em ? formatDate(familia.executado_em) : "data não informada"}; páginas 1 a {familia.paginas}; escopo: {familia.endpoint ?? "não informado"}.
                  </p>
                  {familia.endpoint && <TrackedExternalSourceLink area="ficha-transparencia" href={familia.endpoint} className="mt-4 inline-flex text-[length:var(--text-caption)]">Fonte consultada <ExternalLink className="ml-1 h-3 w-3" /></TrackedExternalSourceLink>}
                </div>
              )
            })}
          </div>
        </section>
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
