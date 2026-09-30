"use client"

// cspell:words timecode atribuidas

import { safeHref } from "@/lib/utils"
import { useState } from "react"
import { ExternalLink } from "lucide-react"

import {
  getApprovedAttributedFactChecks,
  type AttributedCheckSource,
  type AttributedFactCheck,
} from "@/lib/checagens-atribuidas"
import { formatarDataBusca, listarEmProsa, type ReciboChecagensVisivel } from "@/lib/buscas-recibos"
import { VeredictoPill } from "./VeredictoPill"

/** Cards por página: a lista vem da mais recente para a mais antiga e o total fica no filtro "Todos". */
const CHECAGENS_POR_PAGINA = 20

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function SourceList({ label, sources }: { label: string; sources: AttributedCheckSource[] }) {
  if (sources.length === 0) return null
  return (
    <div>
      <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h3>
      <ul className="mt-1 space-y-1">
        {sources.map((source) => (
          <li key={source.url ?? source.title}>
            {source.url ? <a
              href={safeHref(source.url) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-[length:var(--text-caption)] font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 break-all">{source.title ?? source.url}</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            </a> : (
              <span className="text-[length:var(--text-caption)] text-foreground">
                {source.title} <span className="text-muted-foreground">(sem link individual na checagem)</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AttributedFactCheckCard({ check }: { check: AttributedFactCheck }) {
  const citedSources = check.sources.filter((source) => source.origin === "cited_by_publisher")
  const consultedSources = check.sources.filter((source) => source.origin === "consulted_by_us")
  // Fala literal só aparece entre aspas, no bloco próprio; o destaque é a afirmação resumida.
  const literalQuote = check.claimFormat === "literal"
    ? check.claim
    : check.quoteText && check.quoteText !== check.claim
      ? check.quoteText
      : null

  return (
    <article
      id={`checagem-${check.id}`}
      data-pf-attributed-check-id={check.id}
      className="flex min-w-0 flex-col rounded-[12px] border border-border/60 bg-card px-5 py-5"
    >
      <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {check.publisher} · Publicada em {formatDate(check.publishedAt)}
      </p>

      {check.claimFormat !== "literal" && (
        <p className="mt-2 text-[19px] font-extrabold leading-snug tracking-[-0.01em] text-foreground">
          {check.claim}
        </p>
      )}
      <VeredictoPill label={check.originalLabel} className="mt-2 self-start" />

      {literalQuote && (
        <div className="mt-3 rounded-[8px] border-l-2 border-border bg-muted/40 px-3 py-2">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Fala registrada · citação literal
          </p>
          <blockquote className="mt-1 text-[length:var(--text-body-sm)] italic leading-relaxed text-foreground">
            “{literalQuote}”
          </blockquote>
        </div>
      )}

      <p className="mt-3 text-[length:var(--text-body-sm)] leading-relaxed text-foreground">
        <span className="font-bold">Por que o veículo classificou assim.</span> {check.summary}
      </p>

      {check.corrections.length > 0 && (
        <div className="mt-3 rounded-[10px] border border-amber-300/70 bg-amber-50 px-3 py-2 text-[length:var(--text-caption)] leading-relaxed text-amber-950">
          <strong>Correção ou versão:</strong>{" "}
          {check.corrections.map((correction, index) => (
            <span key={`${correction.version}-${correction.publishedAt}`}>
              {index > 0 ? " " : ""}{correction.version}, {formatDate(correction.publishedAt)}: {correction.summary}{" "}
              <a href={safeHref(correction.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
                Ver registro
              </a>
            </span>
          ))}
        </div>
      )}

      <details className="mt-3 text-[length:var(--text-caption)]">
        <summary className="cursor-pointer font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Contexto, fontes e revisão
        </summary>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt className="font-bold text-muted-foreground">Contexto da fala</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {check.event.context} · {formatDate(check.event.date)}
              {check.event.timecode ? ` · ${check.event.timecode}` : ""}
            </dd>
          </div>
          {check.event.question && (
            <div>
              <dt className="font-bold text-muted-foreground">Pergunta</dt>
              <dd className="mt-0.5 font-medium text-foreground">{check.event.question}</dd>
            </div>
          )}
        </dl>
        {(citedSources.length > 0 || consultedSources.length > 0) && (
          <div className="mt-3 grid gap-3">
            <SourceList label="Fontes citadas pelo veículo" sources={citedSources} />
            <SourceList label="Fontes consultadas pelo Puxa Ficha" sources={consultedSources} />
          </div>
        )}
        <p className="mt-3 font-medium leading-relaxed text-muted-foreground">
          A avaliação acima é do veículo citado. O Puxa Ficha não a apresenta como conclusão independente.
          Revisão: {check.review.reviewer} ({check.review.reviewerKind === "human" ? "humana" : "modelo principal"}), em {formatDate(check.review.reviewedAt)}.
        </p>
        {check.relatedChecks && check.relatedChecks.length > 0 && (
          <div className="mt-3">
            <h3 className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Avaliações relacionadas
            </h3>
            <ul className="mt-2 space-y-2">
              {check.relatedChecks.map((relation) => (
                <li key={`${relation.relationship}-${relation.checkId}`}>
                  <a
                    href={`#checagem-${relation.checkId}`}
                    className="font-bold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {relation.relationship === "same_occurrence" ? "Outra avaliação desta fala" : "A mesma afirmação em outra ocasião"}
                  </a>
                  <span className="ml-2 text-muted-foreground">{relation.rationale}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        <a
          href={safeHref(check.originalUrl) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] border border-border px-3 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ler checagem original <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <a
          href={safeHref(check.methodologyUrl) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.06em] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Metodologia <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </article>
  )
}

/** Texto do recibo da busca nominal. Só é chamado com recibo válido. */
function searchReceiptText(receipt: ReciboChecagensVisivel, publishedChecks: number): string {
  // Cobertura parcial sempre visível: a frase nunca cita só quem respondeu.
  const missing = receipt.naoResponderam.length === 0
    ? ""
    : ` (${listarEmProsa(receipt.naoResponderam)} ${receipt.naoResponderam.length === 1 ? "não respondeu" : "não responderam"} nesta busca)`
  // Arquivo de seção só cobre a partir do item mais antigo lido: a frase diz desde quando.
  const windows = receipt.janelas.length === 0
    ? ""
    : `; ${listarEmProsa(receipt.janelas.map((janela) => `${janela.agencia} a partir de ${janela.desde.split("-").reverse().join("/")}`))}`
  const when = `Busca feita em ${formatarDataBusca(receipt.searchedAt)} em ${listarEmProsa(receipt.agencias)}${missing}${windows}`
  if (publishedChecks > 0) return `${when}.`
  if (receipt.result === "vazio_confirmado") return `${when}: nenhuma checagem com o nome desta candidatura no título.`
  const matches = receipt.leads === 1 ? "1 matéria cita" : `${receipt.leads} matérias citam`
  return `${when}: ${matches} o nome desta candidatura no título. Nenhuma checagem de fala atribuída a ela foi conferida e publicada aqui até agora.`
}

export function AttributedFactChecks({
  candidateId,
  candidateSlug,
  office,
  uf,
  searchReceipt = null,
}: {
  candidateId: string
  candidateSlug: string
  office: string
  uf: string | null
  searchReceipt?: ReciboChecagensVisivel | null
}) {
  const [publisherFilter, setPublisherFilter] = useState<string | null>(null)
  const [limite, setLimite] = useState(CHECAGENS_POR_PAGINA)
  const checks = getApprovedAttributedFactChecks({
    candidate_id: candidateId,
    candidate_slug: candidateSlug,
    office,
    uf,
  })
  if (checks.length === 0 && !searchReceipt) return null

  const publisherCounts = [...checks.reduce((counts, check) => {
    counts.set(check.publisher, (counts.get(check.publisher) ?? 0) + 1)
    return counts
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
  const activeFilter = publisherFilter && publisherCounts.some(([publisher]) => publisher === publisherFilter)
    ? publisherFilter
    : null
  const filteredChecks = activeFilter ? checks.filter((check) => check.publisher === activeFilter) : checks
  const visibleChecks = filteredChecks.slice(0, limite)
  const restantes = filteredChecks.length - visibleChecks.length
  const escolherFiltro = (publisher: string | null) => {
    setPublisherFilter(publisher)
    setLimite(CHECAGENS_POR_PAGINA)
  }
  const receiptParagraph = searchReceipt ? (
    <p
      data-pf-checagens-busca={searchReceipt.result}
      data-pf-checagens-busca-em={searchReceipt.searchedAt}
      className="mt-2 max-w-3xl text-[length:var(--text-caption)] leading-relaxed text-foreground"
    >
      {searchReceiptText(searchReceipt, checks.length)}
    </p>
  ) : null
  const chipClassName = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[length:var(--text-caption)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
    }`

  return (
    <section
      aria-labelledby="attributed-fact-checks-title"
      className="space-y-4"
      data-pf-attributed-checks=""
    >
      <div>
        <h2 id="attributed-fact-checks-title" className="font-heading text-[20px] uppercase tracking-tight text-foreground sm:text-[24px]">
          Checagens atribuídas
        </h2>
        {checks.length > 0 && (
          <p className="mt-1 max-w-3xl text-[length:var(--text-body-sm)] leading-relaxed text-muted-foreground">
            Avaliações publicadas por veículos de checagem e associadas a esta afirmação após conferência editorial.
          </p>
        )}
        {checks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar checagens por veículo">
            <button
              type="button"
              aria-pressed={activeFilter === null}
              onClick={() => escolherFiltro(null)}
              className={chipClassName(activeFilter === null)}
            >
              Todos <span className="tabular-nums opacity-80">{checks.length}</span>
            </button>
            {publisherCounts.map(([publisher, count]) => (
              <button
                key={publisher}
                type="button"
                aria-pressed={activeFilter === publisher}
                onClick={() => escolherFiltro(publisher)}
                data-pf-checagens-filtro={publisher}
                className={chipClassName(activeFilter === publisher)}
              >
                {publisher} <span className="tabular-nums opacity-80">{count}</span>
              </button>
            ))}
          </div>
        )}
        {receiptParagraph && (checks.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-[length:var(--text-caption)] font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Onde buscamos
            </summary>
            {receiptParagraph}
          </details>
        ) : receiptParagraph)}
      </div>
      {visibleChecks.length > 0 && (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {visibleChecks.map((check) => <AttributedFactCheckCard key={check.id} check={check} />)}
        </div>
      )}
      {restantes > 0 && (
        <button
          type="button"
          onClick={() => setLimite((atual) => atual + CHECAGENS_POR_PAGINA)}
          data-pf-checagens-mais=""
          className="inline-flex min-h-11 items-center rounded-[8px] border border-border px-4 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Mostrar mais checagens <span className="ml-1 tabular-nums opacity-80">({restantes} restantes)</span>
        </button>
      )}
    </section>
  )
}
