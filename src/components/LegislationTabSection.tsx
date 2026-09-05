"use client"

import { TrackedExternalSourceLink } from "@/components/TrackedExternalSourceLink"
import { useMemo, useRef, useState } from "react"
import { EmptyState, getLegislacaoEmptyState } from "./EmptyState"
import { MetaBadge } from "./MetaBadge"
import { NoticePanel } from "./NoticePanel"
import { SectionLabel, SectionTitle } from "./SectionHeader"
import { formatDate, safeHref } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { HorizontalScrollButtons } from "./HorizontalScrollButtons"
import type { LegislacaoMandatoExecutivo, ProjetoLei, SectionFreshnessInfo, VotoCandidato } from "@/lib/types"
import { ExternalLink } from "lucide-react"
import { DataFreshnessNotice } from "./DataFreshnessNotice"
import { formatProjectStatusLabel, formatTemaLabel, formatVoteBadgeLabel, formatVoteNote } from "@/lib/ui-labels"
import { groupLegislacaoProfileItems, resolveExecutiveLegislationInventoryScope } from "@/lib/legislacao-profile-groups"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { contarPorNatureza, rotuloDoAcervo } from "@/lib/proposicao-natureza"
import { agruparProposicoesPorEmenta, descreverReapresentacoes } from "@/lib/proposicao-dedupe"
import type { SuggestAction } from "./candidato-profile-section-types"

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
const LEGISLACAO_PAGE_SIZE = 25

const PROJECT_STATUS_BADGES: Record<
  string,
  { tone: "neutral" | "muted" | "positive" | "critical" }
> = {
  aprovado: { tone: "positive" },
  tramitando: { tone: "neutral" },
  vetado: { tone: "critical" },
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
    <span className="ml-1 shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[length:var(--text-eyebrow)] font-bold tabular-nums text-muted-foreground">
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
                  <span className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
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
                <TrackedExternalSourceLink
                  area="ficha-legislacao-fonte"
                  href={safeHref(lei.fonte_primaria_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1 break-words text-[length:var(--text-caption)] font-semibold text-foreground underline"
                >
                  Fonte oficial <ExternalLink className="size-3 shrink-0" />
                </TrackedExternalSourceLink>
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
                          <span className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
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
                  <TrackedExternalSourceLink
                    area="ficha-projeto-lei-fonte"
                    href={safeHref(projeto.url_inteiro_teor)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex max-w-full items-center gap-1 break-words text-[length:var(--text-caption)] font-semibold text-foreground underline"
                  >
                    Página oficial da proposta <ExternalLink className="size-3 shrink-0" />
                  </TrackedExternalSourceLink>
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
        {items.map((voto) => {
          const notaDoVoto = formatVoteNote(voto.voto)
          return (
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
                    <span className="text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground">
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
              <div className="mt-1 flex max-w-[220px] shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-3.5 py-1.5 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.05em] ${
                    voto.voto === "sim"
                      ? "bg-foreground text-background"
                      : voto.voto === "não"
                        ? "border border-foreground bg-transparent text-foreground"
                        : "bg-secondary text-foreground"
                  }`}
                >
                  {formatVoteBadgeLabel(voto.voto)}
                </span>
                {notaDoVoto && (
                  <span
                    data-pf-vote-note
                    className="text-right text-[length:var(--text-eyebrow)] font-semibold normal-case leading-snug text-muted-foreground"
                  >
                    {notaDoVoto}
                  </span>
                )}
              </div>
            </div>
          </div>
          )
        })}
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
