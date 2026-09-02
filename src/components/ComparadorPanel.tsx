"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  X,
  Check,
  Scale,
  Landmark,
  AlertCircle,
  ArrowRightLeft,
  ChevronDown,
  CircleDollarSign,
  Link2,
} from "lucide-react"

import { CandidatePhoto } from "@/components/CandidatePhoto"
import { formatCompact } from "@/lib/utils"
import { formatEvolucaoPatrimonialPct } from "@/lib/evolucao-patrimonial"
import {
  processosListaCount,
  processosMaiorVerificadoNaComparacao,
  processosOverviewDisplay,
  processosResumoLabel,
} from "@/lib/processos-display"
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion"
import { formatPartyPublicLabel } from "@/lib/party-utils"
import { formacaoPublicaDe } from "@/lib/formacao-display"
import type { CandidatoComparavel } from "@/lib/types"
import {
  COMPARADOR_EIXO_DEFAULT,
  COMPARADOR_EIXOS,
  type ComparadorEixo,
  comparadorEixoLabels,
  comparadorEixoShortLabels,
  normalizeComparadorEixo,
} from "@/lib/comparador-axis"
import {
  COMPARADOR_NAO_SE_APLICA,
  deveMostrarBlocoCongresso,
  maiorEntreValoresReais,
} from "@/lib/comparador-display"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { BRAZIL_STATES } from "@/data/brazil-states"
import { ANALYTICS_EVENTS } from "@/lib/analytics-events"
import { trackLaunchEvent } from "@/lib/analytics-client"

const VALID_UF_SIGLA = new Set<string>(BRAZIL_STATES.map((s) => s.sigla))

interface Props {
  candidatos: CandidatoComparavel[]
  /** Slugs de candidatos a selecionar na montagem (ex.: vindo de `?c1=&c2=` no quiz). */
  initialSelectedSlugs?: string[]
  /** Valor inicial de `?eixo=` vindo do servidor. */
  initialEixo?: string | null
}

function buildCompararQueryString(
  candidatos: CandidatoComparavel[],
  selectedIds: string[],
  eixo: ComparadorEixo,
  scope: { cargo: string; uf: string } | null
): string {
  const params = new URLSearchParams()
  selectedIds.slice(0, 4).forEach((id, index) => {
    const c = candidatos.find((x) => x.id === id)
    if (c) params.set(`c${index + 1}`, c.slug)
  })
  if (eixo !== COMPARADOR_EIXO_DEFAULT) {
    params.set("eixo", eixo)
  }
  if (scope) {
    params.set("cargo", scope.cargo)
    params.set("uf", scope.uf)
  }
  return params.toString()
}

function resolveInitialSelectedIds(
  candidatos: CandidatoComparavel[],
  initialSelectedSlugs: string[] | undefined
): string[] {
  if (!initialSelectedSlugs?.length) return []
  const next: string[] = []
  for (const slug of initialSelectedSlugs.slice(0, 4)) {
    const c = candidatos.find((x) => x.slug === slug)
    if (c && !next.includes(c.id)) next.push(c.id)
  }
  return next
}

export function ComparadorPanel({ candidatos, initialSelectedSlugs, initialEixo }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hubScope = useMemo(() => {
    const m = pathname.match(/^\/uf\/([a-z]{2})\/?$/i)
    if (!m) return null
    const uf = m[1].toUpperCase()
    if (!VALID_UF_SIGLA.has(uf)) return null
    return { cargo: "Governador", uf }
  }, [pathname])
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    resolveInitialSelectedIds(candidatos, initialSelectedSlugs)
  )
  const urlEixo = useMemo(
    () => normalizeComparadorEixo(searchParams.get("eixo") ?? initialEixo),
    [initialEixo, searchParams]
  )
  const [eixoOverride, setEixoOverride] = useState<ComparadorEixo | null>(null)
  const eixo = eixoOverride ?? urlEixo
  const [copied, setCopied] = useState(false)
  const comparisonStartedRef = useRef(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const comparisonRef = useRef<HTMLDivElement>(null)

  const selectedCandidatos = useMemo(
    () =>
      selectedIds
        .map((id) => candidatos.find((c) => c.id === id))
        .filter((c): c is CandidatoComparavel => Boolean(c)),
    [candidatos, selectedIds]
  )

  const showCongresso = useMemo(
    () => deveMostrarBlocoCongresso(selectedCandidatos),
    [selectedCandidatos],
  )

  const isSelected = useCallback((id: string) => selectedIds.includes(id), [selectedIds])

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const i = prev.indexOf(id)
      if (i >= 0) return prev.filter((x) => x !== id)
      if (prev.length >= 4) return prev
      return [...prev, id]
    })
  }

  const clearAll = () => setSelectedIds([])
  const isComparing = selectedCandidatos.length >= 2

  const scrollToComparison = useCallback(() => {
    comparisonRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    })
  }, [prefersReducedMotion])

  useEffect(() => {
    if (isComparing && comparisonRef.current) {
      scrollToComparison()
    }
  }, [isComparing, scrollToComparison])

  useEffect(() => {
    if (!isComparing) {
      comparisonStartedRef.current = false
      return
    }
    if (comparisonStartedRef.current) return
    comparisonStartedRef.current = true
    trackLaunchEvent(ANALYTICS_EVENTS.comparisonStart, {
      candidate_count: selectedCandidatos.length,
      eixo,
      scope: hubScope ? "uf" : "global",
    })
  }, [eixo, hubScope, isComparing, selectedCandidatos.length])

  useEffect(() => {
    if (candidatos.length === 0) return
    const qs = buildCompararQueryString(candidatos, selectedIds, eixo, hubScope)
    const current = searchParams.toString()
    if (qs === current) return
    if (selectedIds.length === 0) {
      if (current.length > 0) {
        router.replace(pathname, { scroll: false })
      }
      return
    }
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [candidatos, eixo, hubScope, pathname, router, searchParams, selectedIds])

  const shareUrl =
    typeof window !== "undefined" && candidatos.length > 0 && selectedIds.length >= 2
      ? `${window.location.origin}${pathname}?${buildCompararQueryString(candidatos, selectedIds, eixo, hubScope)}`
      : ""

  const copyShareLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const eixoHint = useMemo(() => {
    switch (eixo) {
      case "patrimonio":
        return "Valores da última declaração disponível no Puxa Ficha."
      case "gastos":
        return "Soma da cota parlamentar de deputado federal (CEAP) e senador (CEAPS) nos anos disponíveis. Não inclui Presidência nem governo estadual."
      default:
        return ""
    }
  }, [eixo])

  return (
    <>
      {selectedIds.length > 0 && (
        <div className="sticky top-16 z-30 border-b border-border/50 bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-3 md:px-12">
            <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {selectedIds.length}/4 selecionados
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {selectedCandidatos.map((candidato) => (
                <button
                  key={candidato.id}
                  type="button"
                  onClick={() => toggle(candidato.id)}
                  className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-[length:var(--text-caption)] font-semibold text-background transition-opacity hover:opacity-80"
                >
                  {candidato.nome_urna}
                  <X className="size-3" />
                </button>
              ))}
            </div>
            {isComparing && (
              <button
                type="button"
                onClick={scrollToComparison}
                className="flex shrink-0 items-center gap-1 rounded-full border border-foreground px-3 py-1 text-[length:var(--text-caption)] font-bold text-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                Ver comparação <ChevronDown className="size-3" />
              </button>
            )}
            <button
              type="button"
              onClick={clearAll}
              className="text-[length:var(--text-caption)] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        <div className="space-y-3 md:hidden">
          {candidatos.map((candidato) => {
            const selected = isSelected(candidato.id)

            return (
              <button
                key={candidato.id}
                type="button"
                onClick={() => toggle(candidato.id)}
                aria-pressed={selected}
                aria-label={`${selected
                  ? `Remover ${candidato.nome_urna} da comparação`
                  : `Adicionar ${candidato.nome_urna} à comparação`}. ${
                  candidato.idade ? `${candidato.idade} anos, ` : ""
                }${processosResumoLabel(candidato.total_processos)}, evolução patrimonial ${formatEvolucaoPatrimonialPct(candidato.evolucao_patrimonial_pct)}`}
                className={`flex w-full items-center gap-3 rounded-[12px] border px-4 py-3.5 text-left transition-all ${
                  selected
                    ? "border-foreground bg-foreground/[0.03]"
                    : "border-border/50 hover:border-border"
                }`}
              >
                <div
                  className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    selected ? "border-foreground bg-foreground" : "border-border"
                  }`}
                >
                  {selected && <Check className="size-3 text-background" />}
                </div>

                {candidato.foto_url && (
                  <CandidatePhoto
                    src={candidato.foto_url}
                    alt=""
                    name={candidato.nome_urna}
                    width={40}
                    height={40}
                    sizes="40px"
                    className="size-10 shrink-0 rounded-full object-cover object-top"
                    fallbackClassName="size-10 shrink-0 rounded-full"
                    initialsClassName="text-xs"
                  />
                )}
                <div aria-hidden="true" className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
                    {formatPartyPublicLabel(candidato.partido_sigla)}
                  </span>
                  <p className="truncate font-heading text-[16px] uppercase leading-tight text-foreground">
                    {candidato.nome_urna}
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className="flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap text-right text-[length:var(--text-eyebrow)] font-bold text-muted-foreground"
                >
                  {candidato.idade && <span>{candidato.idade} anos</span>}
                  <span>{processosResumoLabel(candidato.total_processos)}</span>
                  <span>
                    {formatEvolucaoPatrimonialPct(candidato.evolucao_patrimonial_pct)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="hidden md:block">
          <div
            className="overflow-x-auto overscroll-x-contain"
            role="region"
            aria-label="Lista de candidatos para comparar. Role na horizontal se as colunas não couberem."
            tabIndex={0}
          >
            {/*
              A 768px a tabela media 754px num wrapper de 657px: ja rolava, mas
              `table-auto` deixava a coluna do nome sem largura, e ela quebrava
              em linhas de 2 a 3 letras ("AU / GU / STO / CU / RY"). O piso sobe
              para 56rem e o nome deixa de quebrar, entao a tabela rola em vez
              de esmagar. O wrapper acima ja e uma `region` que recebe foco, com
              aria-label explicando o scroll, e abaixo de `md` a lista vira
              cards.
            */}
            <table className="w-full min-w-[56rem] table-auto text-left">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="w-12 pb-3 pr-4">
                    <span className="sr-only">Selecionar</span>
                  </th>
                  {[
                    { heading: "Candidato", numeric: false },
                    { heading: "Partido", numeric: false },
                    { heading: "Idade", numeric: true },
                    { heading: "Formação", numeric: false },
                    { heading: "Patrimônio", numeric: true },
                    { heading: "Processos", numeric: true },
                    { heading: "Alertas graves", numeric: true },
                  ].map(({ heading, numeric }) => (
                    <th
                      key={heading}
                      scope="col"
                      className={`whitespace-nowrap pb-3 pr-4 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground last:pr-0 ${
                        numeric ? "text-right" : "text-left"
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidatos.map((candidato) => {
                  const selected = isSelected(candidato.id)

                  return (
                    <tr
                      key={candidato.id}
                      data-pf-comparador-row
                      data-pf-comparador-slug={candidato.slug}
                      data-pf-comparador-name={candidato.nome_urna}
                      data-pf-comparador-party={candidato.partido_sigla}
                      data-pf-comparador-age={candidato.idade ?? ""}
                      data-pf-comparador-formacao={formacaoPublicaDe(candidato) ?? ""}
                      data-pf-comparador-patrimonio={candidato.patrimonio_declarado ?? ""}
                      data-pf-comparador-evolucao={
                        candidato.evolucao_patrimonial_pct ?? "N/A"
                      }
                      data-pf-comparador-gastos={candidato.total_gasto_parlamentar ?? ""}
                      data-pf-comparador-processos={candidato.total_processos}
                      data-pf-comparador-alertas={candidato.alertas_graves}
                      className={`border-b transition-colors ${
                        selected
                          ? "border-border/50 bg-foreground/[0.03]"
                          : "border-border/30"
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => toggle(candidato.id)}
                          aria-pressed={selected}
                          aria-label={
                            selected
                              ? `Remover ${candidato.nome_urna} da comparação`
                              : `Adicionar ${candidato.nome_urna} à comparação`
                          }
                          className={`flex size-8 items-center justify-center rounded border transition-colors ${
                            selected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-foreground hover:border-foreground/50"
                          }`}
                        >
                          {selected ? (
                            <Check className="size-3 text-current" />
                          ) : (
                            <span className="size-2 rounded-full bg-current" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => toggle(candidato.id)}
                          className="flex items-center gap-3 text-left"
                        >
                          {candidato.foto_url && (
                            <CandidatePhoto
                              src={candidato.foto_url}
                              alt=""
                              name={candidato.nome_urna}
                              width={40}
                              height={40}
                              sizes="40px"
                              className="size-10 shrink-0 rounded-full object-cover object-top"
                              fallbackClassName="size-10 shrink-0 rounded-full"
                              initialsClassName="text-xs"
                            />
                          )}
                          <span className="whitespace-nowrap font-heading text-[16px] uppercase leading-tight text-foreground">
                            {candidato.nome_urna}
                          </span>
                        </button>
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-bold text-foreground">
                        {formatPartyPublicLabel(candidato.partido_sigla)}
                      </td>
                      <td className="py-3 pr-4 text-right text-[length:var(--text-body-sm)] font-semibold tabular-nums text-foreground">
                        {candidato.idade != null ? (
                          candidato.idade
                        ) : (
                          <span className="font-medium text-muted-foreground">não informada</span>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate py-3 pr-4 text-[length:var(--text-body-sm)] font-medium text-foreground">
                        {formacaoPublicaDe(candidato) ?? (
                          <span className="text-muted-foreground">não informada</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {candidato.patrimonio_declarado != null ? (
                          <span className="block">
                            {formatCompact(candidato.patrimonio_declarado)}
                          </span>
                        ) : (
                          <span className="block font-medium text-muted-foreground">sem declaração</span>
                        )}
                        <span
                          className="mt-0.5 block text-[11px] font-semibold text-muted-foreground"
                        >
                          <span className="sr-only">Evolução patrimonial: </span>
                          {formatEvolucaoPatrimonialPct(candidato.evolucao_patrimonial_pct)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {processosListaCount(candidato.total_processos)}
                      </td>
                      <td className="py-3 text-right text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {candidato.alertas_graves}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isComparing && (
        <section
          ref={comparisonRef}
          className="mx-auto max-w-7xl px-5 pb-12 md:px-12"
          data-pf-comparacao-root
          data-pf-comparacao-count={selectedCandidatos.length}
          data-pf-comparacao-eixo={eixo}
        >
          <div className="rounded-[20px] border border-foreground/10 bg-muted/50 p-6 sm:p-8">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading)]">
                  Comparação
                </h2>
                <p className="mt-2 max-w-2xl text-[length:var(--text-body-sm)] text-muted-foreground">
                  {eixoHint}
                </p>
              </div>
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {selectedCandidatos.length} candidatos
              </span>
            </div>

            <div className="mb-6">
              <p
                id="comparador-eixo-label"
                className="mb-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground"
              >
                Comparar por
              </p>
              <div
                role="tablist"
                aria-labelledby="comparador-eixo-label"
                className="flex flex-wrap gap-2"
              >
                {COMPARADOR_EIXOS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={eixo === key}
                    data-pf-comparador-eixo-tab={key}
                    onClick={() => setEixoOverride(key)}
                    className={`rounded-full border px-4 py-2 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.06em] transition-colors ${
                      eixo === key
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:border-foreground/40"
                    }`}
                  >
                    {comparadorEixoShortLabels[key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void copyShareLink()}
                disabled={!shareUrl}
                className="inline-flex items-center gap-2 rounded-full border border-foreground px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-40"
              >
                <Link2 className="size-3.5" />
                {copied ? "Link copiado" : "Copiar link para compartilhar"}
              </button>
              <span className="text-[length:var(--text-caption)] text-muted-foreground">
                Prévia em redes: cartão com os dois primeiros na ordem selecionada.
              </span>
            </div>

            <p className="mb-2 text-[length:var(--text-caption)] text-muted-foreground md:hidden">
              Role a tabela para o lado para ver todos os candidatos.
            </p>
            <div
              className="overflow-x-auto overscroll-x-contain"
              role="region"
              aria-label="Tabela de comparação. Role na horizontal para ver todas as colunas."
              tabIndex={0}
            >
              <table className="w-full min-w-[36rem]">
                <thead>
                  <tr>
                    <th className="w-32 pb-4 text-left text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground" />
                    {selectedCandidatos.map((candidato) => (
                      <th
                        key={candidato.id}
                        className="pb-4 text-center"
                        data-pf-comparacao-candidato={candidato.slug}
                        data-pf-comparacao-party={candidato.partido_sigla}
                      >
                        <Link href={`/candidato/${candidato.slug}`} className="group inline-block">
                          {candidato.foto_url && (
                            <CandidatePhoto
                              src={candidato.foto_url}
                              alt=""
                              name={candidato.nome_urna}
                              width={80}
                              height={80}
                              sizes="(max-width: 640px) 64px, 80px"
                              className="mx-auto mb-2 size-16 rounded-full object-cover object-top transition-transform group-hover:scale-105 sm:size-20"
                              fallbackClassName="mx-auto mb-2 size-16 rounded-full sm:size-20"
                              initialsClassName="text-lg"
                            />
                          )}
                          <span className="block font-heading text-[length:var(--text-body-lg)] uppercase text-foreground group-hover:underline">
                            {candidato.nome_urna}
                          </span>
                          <span className="block text-[length:var(--text-eyebrow)] font-bold text-muted-foreground">
                            {formatPartyPublicLabel(candidato.partido_sigla)}
                          </span>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompRow label="Cargo atual" icon={null} highlight={false}>
                    {selectedCandidatos.map((candidato) => {
                      const cargo = candidato.cargo_atual?.trim()
                      return (
                        <td
                          key={candidato.id}
                          className="py-3 text-center text-[length:var(--text-body-sm)] font-medium text-foreground"
                        >
                          {cargo ? (
                            sanitizePtBrText(cargo)
                          ) : (
                            <span className="text-muted-foreground">não informado</span>
                          )}
                        </td>
                      )
                    })}
                  </CompRow>
                  <CompRow label="Idade" icon={null} highlight={false}>
                    {selectedCandidatos.map((candidato) => (
                      <td
                        key={candidato.id}
                        className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground"
                      >
                        {candidato.idade ? (
                          `${candidato.idade} anos`
                        ) : (
                          <span className="font-medium text-muted-foreground">
                            não informada
                          </span>
                        )}
                      </td>
                    ))}
                  </CompRow>
                  <CompRow label="Formação" icon={null} highlight={false}>
                    {selectedCandidatos.map((candidato) => (
                      <td
                        key={candidato.id}
                        className="py-3 text-center text-[length:var(--text-body-sm)] font-medium text-foreground"
                      >
                        {formacaoPublicaDe(candidato) ?? (
                          <span className="text-muted-foreground">não informada</span>
                        )}
                      </td>
                    ))}
                  </CompRow>
                  <CompRow
                    label={comparadorEixoLabels.patrimonio}
                    rowKey="patrimonio"
                    icon={<Landmark className="size-3.5" />}
                    highlight={eixo === "patrimonio"}
                  >
                    {selectedCandidatos.map((candidato) => {
                      const isMax = maiorEntreValoresReais(
                        candidato.patrimonio_declarado,
                        selectedCandidatos.map((item) => item.patrimonio_declarado),
                      )

                      return (
                        <td key={candidato.id} className="py-3 text-center">
                          {candidato.patrimonio_declarado != null ? (
                            <span
                              className={`text-[length:var(--text-body)] font-bold tabular-nums ${isMax ? "text-destructive" : "text-foreground"}`}
                            >
                              {formatCompact(candidato.patrimonio_declarado)}
                            </span>
                          ) : (
                            <span className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                              sem declaração
                            </span>
                          )}
                          {isMax && <MaiorBadge />}
                        </td>
                      )
                    })}
                  </CompRow>
                  <CompRow label="Evolução patrimonial" icon={null} highlight={false}>
                    {selectedCandidatos.map((candidato) => (
                      <td
                        key={candidato.id}
                        className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground"
                      >
                        {candidato.evolucao_patrimonial_pct == null ? (
                          <span className="font-medium text-muted-foreground">N/A</span>
                        ) : (
                          formatEvolucaoPatrimonialPct(candidato.evolucao_patrimonial_pct)
                        )}
                      </td>
                    ))}
                  </CompRow>
                  <CompRow label="Processos" icon={<Scale className="size-3.5" />} highlight={false}>
                    {selectedCandidatos.map((candidato) => {
                      const values = selectedCandidatos.map((item) => item.total_processos)
                      const isMax = processosMaiorVerificadoNaComparacao(
                        candidato.total_processos,
                        values,
                      )

                      const display = processosOverviewDisplay(candidato.total_processos)

                      return (
                        <td key={candidato.id} className="py-3 text-center">
                          <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                            {display.value}
                          </span>
                          {display.sub && (
                            <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">
                              {display.sub}
                            </span>
                          )}
                          {isMax && <MaiorBadge />}
                        </td>
                      )
                    })}
                  </CompRow>
                  <CompRow
                    label="Alertas graves"
                    icon={<AlertCircle className="size-3.5" />}
                    highlight={false}
                  >
                    {selectedCandidatos.map((candidato) => (
                      <td
                        key={candidato.id}
                        className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground"
                      >
                        {candidato.alertas_graves}
                      </td>
                    ))}
                  </CompRow>
                  <CompRow
                    label="Trocas de partido"
                    icon={<ArrowRightLeft className="size-3.5" />}
                    highlight={false}
                  >
                    {selectedCandidatos.map((candidato) => (
                      <td
                        key={candidato.id}
                        className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground"
                      >
                        {candidato.mudancas_partido}
                      </td>
                    ))}
                  </CompRow>
                  {showCongresso && (
                    <CompRow
                      label="Cota parlamentar (CEAP/CEAPS)"
                      rowKey="gastos"
                      icon={<CircleDollarSign className="size-3.5" />}
                      highlight={eixo === "gastos"}
                      caption="Não inclui Presidência nem governo estadual."
                    >
                      {selectedCandidatos.map((candidato) => {
                        const isMax = maiorEntreValoresReais(
                          candidato.total_gasto_parlamentar,
                          selectedCandidatos.map((item) => item.total_gasto_parlamentar),
                        )

                        return (
                          <td key={candidato.id} className="py-3 text-center">
                            {candidato.total_gasto_parlamentar != null ? (
                              <span
                                className={`text-[length:var(--text-body)] font-bold tabular-nums ${isMax ? "text-destructive" : "text-foreground"}`}
                              >
                                {formatCompact(candidato.total_gasto_parlamentar)}
                              </span>
                            ) : (
                              <span className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
                                {COMPARADOR_NAO_SE_APLICA}
                              </span>
                            )}
                            {isMax && <MaiorBadge />}
                          </td>
                        )
                      })}
                    </CompRow>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {selectedCandidatos.map((candidato) => (
                <Link
                  key={candidato.id}
                  href={`/candidato/${candidato.slug}`}
                  className="pill-hover rounded-full border border-foreground px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground"
                >
                  Ficha de {candidato.nome_urna} →
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}

function MaiorBadge() {
  return (
    <span className="ml-1.5 inline-block rounded-full bg-foreground/10 px-1.5 py-0.5 text-[11px] font-bold uppercase text-muted-foreground">
      maior
    </span>
  )
}

function CompRow({
  label,
  icon,
  children,
  highlight,
  rowKey,
  caption,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
  highlight: boolean
  rowKey?: ComparadorEixo
  caption?: string
}) {
  return (
    <tr
      className={`border-t border-border/30 ${highlight ? "bg-foreground/[0.07]" : ""}`}
      data-pf-comparacao-row-eixo={rowKey ?? ""}
    >
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
        </div>
        {caption && (
          <span className="mt-1 block max-w-[11rem] text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
            {caption}
          </span>
        )}
      </td>
      {children}
    </tr>
  )
}
