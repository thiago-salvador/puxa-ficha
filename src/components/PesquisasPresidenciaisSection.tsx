"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react"

// cspell:ignore cenario periodo

import type {
  EstadoPesquisa,
  PesquisaEleitoralDoCandidato,
} from "@/lib/pesquisas-eleitorais"
import { NoticePanel } from "./NoticePanel"
import { SectionLabel, SectionTitle } from "./SectionHeader"

interface PesquisasProps {
  pesquisas: PesquisaEleitoralDoCandidato[]
}

const ESTADO_LABEL: Record<EstadoPesquisa, string> = {
  publicado: "Publicado",
  antigo: "Pesquisa antiga",
  indeterminado: "Resultado indeterminado",
  erro: "Resultado indisponível",
  sem_pesquisa_qualificada: "Sem pesquisa qualificada",
}

function formatarDataIso(value: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "não informado"
}

function formatarPeriodo(pesquisa: PesquisaEleitoralDoCandidato): string {
  const inicio = formatarDataIso(pesquisa.fieldwork.start.value)
  const fim = formatarDataIso(pesquisa.fieldwork.end.value)
  return inicio === fim ? inicio : `${inicio} a ${fim}`
}

function formatarAmostra(pesquisa: PesquisaEleitoralDoCandidato): string {
  const value = pesquisa.sample.size.value
  return value === null ? "não informada" : `${value.toLocaleString("pt-BR")} entrevistas`
}

function formatarMargem(pesquisa: PesquisaEleitoralDoCandidato): string {
  const value = pesquisa.marginErrorPp.value
  if (value === null) return "não informada"
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
  return `${formatted} ${value === 1 ? "ponto percentual" : "pontos percentuais"}`
}

function resultadoPublicado(pesquisa: PesquisaEleitoralDoCandidato): boolean {
  return (
    pesquisa.state === "publicado" &&
    pesquisa.resultado.status === "publicado" &&
    pesquisa.resultado.valuePercent !== null
  )
}

function resultadoLabel(pesquisa: PesquisaEleitoralDoCandidato): string {
  if (resultadoPublicado(pesquisa)) {
    return `${pesquisa.resultado.valuePercent!.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    })}%`
  }
  const state = pesquisa.state === "publicado" ? pesquisa.resultado.status : pesquisa.state
  return ESTADO_LABEL[state]
}

function pesquisaKey(pesquisa: PesquisaEleitoralDoCandidato): string {
  return `${pesquisa.id}:${pesquisa.cenario.id}:${pesquisa.resultado.candidateSlug}`
}

function EmptyResearchState({ className = "" }: { className?: string }) {
  return (
    <NoticePanel
      data-pf-pesquisas-empty=""
      tone="neutral"
      className={className}
      eyebrow="Cobertura da pesquisa"
      title="Sem pesquisa qualificada recente para este candidato"
      description="As fontes incluídas no piloto ainda não publicaram um resultado comparável para esta candidatura."
    />
  )
}

function PesquisaDetalhada({ pesquisa }: { pesquisa: PesquisaEleitoralDoCandidato }) {
  const instituto = pesquisa.instituto.value ?? "Instituto não informado"
  const hasPublishedResult = resultadoPublicado(pesquisa)

  return (
    <article
      data-pf-pesquisa-card=""
      data-pf-pesquisa-source={pesquisa.sourceId}
      data-pf-pesquisa-turno={pesquisa.cenario.turn}
      className="min-w-0 rounded-[18px] border border-border/70 bg-card p-5 sm:p-6"
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--text-caption)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {instituto}
          </p>
          <p
            data-pf-pesquisa-resultado=""
            className={
              hasPublishedResult
                ? "mt-2 font-heading text-[42px] leading-none tabular-nums text-foreground sm:text-[48px]"
                : "mt-2 text-[length:var(--text-body)] font-bold leading-snug text-foreground"
            }
          >
            {resultadoLabel(pesquisa)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {pesquisa.cenario.turn}º turno
        </span>
      </div>

      <p data-pf-pesquisa-cenario="" className="mt-4 text-[length:var(--text-body-sm)] font-semibold leading-relaxed text-foreground">
        {pesquisa.cenario.labelRaw}
      </p>

      <dl className="mt-5 grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 border-t border-border/60 pt-4 text-[length:var(--text-caption)] sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="font-bold uppercase tracking-[0.06em] text-muted-foreground">Período de campo</dt>
          <dd data-pf-pesquisa-periodo="" className="mt-1 font-semibold text-foreground">{formatarPeriodo(pesquisa)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold uppercase tracking-[0.06em] text-muted-foreground">Amostra</dt>
          <dd className="mt-1 font-semibold text-foreground">{formatarAmostra(pesquisa)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold uppercase tracking-[0.06em] text-muted-foreground">Margem de erro</dt>
          <dd className="mt-1 font-semibold text-foreground">{formatarMargem(pesquisa)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-bold uppercase tracking-[0.06em] text-muted-foreground">Instituto</dt>
          <dd className="mt-1 break-words font-semibold text-foreground">{instituto}</dd>
        </div>
      </dl>

      <a
        data-pf-pesquisa-link=""
        href={pesquisa.provenance.resultUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border px-4 py-2 text-[length:var(--text-body-sm)] font-bold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        aria-label={`Ver divulgação pública de ${instituto} (abre em nova aba)`}
      >
        <span className="truncate">Ver divulgação pública</span>
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
      </a>
    </article>
  )
}

export function PesquisasPresidenciaisHero({ pesquisas }: PesquisasProps) {
  const primeiroTurno = pesquisas.filter(
    (pesquisa) => pesquisa.cenario.turn === 1 && resultadoPublicado(pesquisa),
  )
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (primeiroTurno.length < 2) return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (media.matches) return
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % primeiroTurno.length)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [primeiroTurno.length])

  const pesquisa = primeiroTurno[activeIndex % Math.max(primeiroTurno.length, 1)]

  if (!pesquisa) {
    return (
      <div
        data-pf-pesquisa-hero=""
        data-pf-pesquisa-hero-empty=""
        className="min-w-0 rounded-[14px] border border-border/70 bg-card px-4 py-3 lg:w-[220px]"
      >
        <p className="text-[length:var(--text-caption)] font-bold leading-snug text-foreground">
          Sem pesquisa qualificada recente
        </p>
      </div>
    )
  }

  return (
    <div
      data-pf-pesquisa-hero=""
      data-pf-pesquisa-hero-index={activeIndex}
      className="min-w-0 rounded-[14px] border border-border/70 bg-card px-4 py-3 lg:w-[220px]"
    >
      <p data-pf-pesquisa-hero-instituto="" className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {pesquisa.instituto.value ?? "Instituto não informado"}
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p data-pf-pesquisa-hero-periodo="" className="min-w-0 text-[10px] font-semibold leading-tight text-muted-foreground">
          {formatarPeriodo(pesquisa)}
        </p>
        <p data-pf-pesquisa-hero-resultado="" className="shrink-0 font-heading text-[30px] leading-none tabular-nums text-foreground">
          {resultadoLabel(pesquisa)}
        </p>
      </div>
    </div>
  )
}

export function PesquisasPresidenciaisOverview({
  pesquisas,
  onOpenTab,
}: PesquisasProps & { onOpenTab: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const pesquisa = pesquisas[activeIndex % Math.max(pesquisas.length, 1)]
  const hasMultiple = pesquisas.length > 1

  const selectPrevious = () => {
    setActiveIndex((current) => (current - 1 + pesquisas.length) % pesquisas.length)
  }
  const selectNext = () => {
    setActiveIndex((current) => (current + 1) % pesquisas.length)
  }

  return (
    <section data-pf-pesquisas-overview="" aria-labelledby="pesquisas-overview-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Eleições 2026</SectionLabel>
          <SectionTitle>
            <span id="pesquisas-overview-title">Intenção de voto</span>
          </SectionTitle>
        </div>
        <button
          type="button"
          onClick={onOpenTab}
          className="min-h-11 text-[length:var(--text-caption)] font-bold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        >
          Ver todas na aba Pesquisas
        </button>
      </div>

      {pesquisa ? (
        <div className="mt-6 grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={selectPrevious}
            disabled={!hasMultiple}
            aria-label="Pesquisa anterior"
            className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <div data-pf-pesquisa-overview-current={activeIndex} className="min-w-0">
            <PesquisaDetalhada key={pesquisaKey(pesquisa)} pesquisa={pesquisa} />
          </div>
          <button
            type="button"
            onClick={selectNext}
            disabled={!hasMultiple}
            aria-label="Próxima pesquisa"
            className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <EmptyResearchState className="mt-6" />
      )}

      <p className="mt-5 max-w-3xl text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
        Esta é uma fotografia do período em que as entrevistas foram realizadas, não uma previsão
        do resultado da eleição.
      </p>
    </section>
  )
}

export function PesquisasPresidenciaisTab({ pesquisas }: PesquisasProps) {
  return (
    <section data-pf-pesquisas-tab="" aria-labelledby="pesquisas-tab-title">
      <SectionLabel>Eleições 2026</SectionLabel>
      <SectionTitle>
        <span id="pesquisas-tab-title">Pesquisas de intenção de voto</span>
      </SectionTitle>
      <p className="mt-3 max-w-3xl text-[length:var(--text-body-sm)] font-medium leading-relaxed text-muted-foreground">
        Resultados das fontes qualificadas para este piloto. Cada número pertence ao cenário
        descrito pela própria pesquisa.
      </p>

      {pesquisas.length === 0 ? (
        <EmptyResearchState className="mt-6" />
      ) : (
        <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {pesquisas.map((pesquisa) => (
            <PesquisaDetalhada key={pesquisaKey(pesquisa)} pesquisa={pesquisa} />
          ))}
        </div>
      )}

      <p className="mt-5 max-w-3xl text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground">
        Esta é uma fotografia do período em que as entrevistas foram realizadas, não uma previsão
        do resultado da eleição.
      </p>
    </section>
  )
}
