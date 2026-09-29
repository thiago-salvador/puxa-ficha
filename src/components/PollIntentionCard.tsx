"use client"

// cspell:ignore cenario periodo espontanea espontaneo

import { useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react"
import type { PesquisaEleitoralDoCandidato } from "@/lib/pesquisas-eleitorais"
import { ordenarPesquisasDoCard } from "@/lib/pesquisas-card"
import { stripAccents } from "@/lib/strip-accents"
import { formatarPeriodo, resultadoLabel, resultadoPublicado } from "./PesquisasPresidenciaisSection"

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

// O Senado tem turno único; o selo "1º turno" sugeriria uma segunda votação.
function turnoLabel(pesquisa: PesquisaEleitoralDoCandidato): string {
  return pesquisa.office === "Senador" ? "Turno único" : `${pesquisa.cenario.turn}º turno`
}

function modalidadeLabel(pesquisa: PesquisaEleitoralDoCandidato): string | null {
  const modo = stripAccents(pesquisa.cenario.comparabilityKey.split("|")[4] ?? "").toLowerCase()
  if (modo === "estimulado" || modo === "estimulada") return "estimulada"
  if (modo === "espontaneo" || modo === "espontanea") return "espontânea"
  return null
}

const NAV_BUTTON_CLASS =
  "flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35"

/**
 * Card "Intenção de voto" da visão geral. As setas percorrem todas as
 * pesquisas do candidato (rodada recente, rodadas anteriores, segundo turno e
 * pergunta espontânea), da mais recente para a mais antiga. Cada número vale
 * só para o cenário descrito ao lado dele.
 */
export function PollIntentionCard({ pesquisas: todas }: { pesquisas: PesquisaEleitoralDoCandidato[] }) {
  const pesquisas = ordenarPesquisasDoCard(todas)
  const [activeIndex, setActiveIndex] = useState(0)
  if (pesquisas.length === 0) return null

  const total = pesquisas.length
  const current = activeIndex % total
  const pesquisa = pesquisas[current]
  const instituto = pesquisa.instituto.value ?? "Instituto não informado"
  const modalidade = modalidadeLabel(pesquisa) === "espontânea" ? "pergunta espontânea" : null
  const descricao = [pesquisa.cenario.labelRaw, modalidade].filter(Boolean).join(" · ")
  const hasMultiple = total > 1

  return (
    <section
      data-pf-pesquisas-overview=""
      aria-labelledby="pesquisas-overview-title"
      className="flex min-w-0 flex-col rounded-[12px] border border-border/50 bg-card px-5 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="pesquisas-overview-title" className="text-[length:var(--text-body-sm)] font-semibold text-foreground">
          Intenção de voto
        </h2>
        <span
          data-pf-pesquisa-turno-label=""
          className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground"
        >
          {turnoLabel(pesquisa)}
        </span>
      </div>

      <article
        data-pf-pesquisa-card=""
        data-pf-pesquisa-source={pesquisa.sourceId}
        data-pf-pesquisa-turno={pesquisa.cenario.turn}
        data-pf-pesquisa-grupo={pesquisa.grupo ?? "recente"}
        data-pf-pesquisa-overview-current={current}
        className="mt-2 min-w-0"
      >
        <p className="truncate text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {instituto}
        </p>
        <div className="mt-1.5 flex min-w-0 items-center gap-4">
          <p
            data-pf-pesquisa-resultado=""
            className={
              resultadoPublicado(pesquisa)
                ? "shrink-0 font-heading text-[length:var(--text-heading-lg)] leading-none tabular-nums text-foreground"
                : "shrink-0 text-[length:var(--text-body)] font-bold leading-snug text-foreground"
            }
          >
            {resultadoLabel(pesquisa)}
          </p>
          <p data-pf-pesquisa-cenario="" className="min-w-0 line-clamp-3 text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground">
            {descricao}
          </p>
        </div>

        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-y border-border/60 py-2.5 text-[length:var(--text-eyebrow)] sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="font-bold uppercase tracking-[0.06em] text-muted-foreground">Período</dt>
            <dd data-pf-pesquisa-periodo="" className="mt-0.5 font-semibold leading-snug text-foreground">
              {formatarPeriodo(pesquisa)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-bold uppercase tracking-[0.06em] text-muted-foreground">Amostra</dt>
            <dd className="mt-0.5 font-semibold leading-snug text-foreground">{formatarAmostra(pesquisa)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-bold uppercase tracking-[0.06em] text-muted-foreground">Margem de erro</dt>
            <dd className="mt-0.5 font-semibold leading-snug text-foreground">{formatarMargem(pesquisa)}</dd>
          </div>
        </dl>
      </article>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
        <a
          data-pf-pesquisa-link=""
          href={pesquisa.provenance.resultUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[length:var(--text-eyebrow)] font-bold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
          aria-label={`Ver divulgação pública de ${instituto} (abre em nova aba)`}
        >
          Fonte pública
          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        </a>
        <p className="order-3 min-w-0 basis-full text-[length:var(--text-eyebrow)] font-medium leading-snug text-muted-foreground sm:order-none sm:flex-1 sm:basis-auto">
          Fotografia do período das entrevistas, não uma previsão eleitoral.
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          <span
            data-pf-pesquisa-contador=""
            aria-live="polite"
            className="mr-0.5 text-[length:var(--text-eyebrow)] font-semibold tabular-nums text-muted-foreground"
          >
            {current + 1} de {total}
          </span>
          <button
            type="button"
            onClick={() => setActiveIndex((value) => (value - 1 + total) % total)}
            disabled={!hasMultiple}
            aria-label="Pesquisa anterior"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActiveIndex((value) => (value + 1) % total)}
            disabled={!hasMultiple}
            aria-label="Próxima pesquisa"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
