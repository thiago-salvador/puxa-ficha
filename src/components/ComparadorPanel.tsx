"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  X,
  Check,
  Scale,
  Landmark,
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
} from "lucide-react"

import { formatCompact, shouldBypassImageOptimization } from "@/lib/utils"
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion"
import type { CandidatoComparavel } from "@/lib/types"

interface Props {
  candidatos: CandidatoComparavel[]
}

export function ComparadorPanel({ candidatos }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const prefersReducedMotion = usePrefersReducedMotion()
  const comparisonRef = useRef<HTMLDivElement>(null)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 4) {
        next.add(id)
      }
      return next
    })
  }

  const clearAll = () => setSelected(new Set())
  const selectedCandidatos = candidatos.filter((candidato) => selected.has(candidato.id))
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

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-16 z-30 border-b border-border/50 bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-3 md:px-12">
            <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {selected.size}/4 selecionados
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
                Ver comparacao <ChevronDown className="size-3" />
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
            const isSelected = selected.has(candidato.id)
            const bypassPhotoOptimization = shouldBypassImageOptimization(candidato.foto_url)

            return (
              <button
                key={candidato.id}
                type="button"
                onClick={() => toggle(candidato.id)}
                className={`flex w-full items-center gap-3 rounded-[12px] border px-4 py-3.5 text-left transition-all ${
                  isSelected
                    ? "border-foreground bg-foreground/[0.03]"
                    : "border-border/50 hover:border-border"
                }`}
              >
                <div
                  className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? "border-foreground bg-foreground"
                      : "border-border"
                  }`}
                >
                  {isSelected && <Check className="size-3 text-background" />}
                </div>

                {candidato.foto_url && (
                  <Image
                    src={candidato.foto_url}
                    alt={candidato.nome_urna}
                    width={40}
                    height={40}
                    sizes="40px"
                    unoptimized={bypassPhotoOptimization}
                    className="size-10 shrink-0 rounded-full object-cover object-top"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
                    {candidato.partido_sigla}
                  </span>
                  <p className="truncate font-heading text-[16px] uppercase leading-tight text-foreground">
                    {candidato.nome_urna}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[length:var(--text-eyebrow)] font-bold text-muted-foreground">
                  {candidato.idade && <span>{candidato.idade}</span>}
                  <span>{candidato.total_processos}p</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="w-12 pb-3 pr-3">
                    <span className="sr-only">Selecionar</span>
                  </th>
                  {["Candidato", "Partido", "Idade", "Formacao", "Patrimonio", "Processos", "Alertas"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="pb-3 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {candidatos.map((candidato) => {
                  const isSelected = selected.has(candidato.id)
                  const bypassPhotoOptimization = shouldBypassImageOptimization(candidato.foto_url)

                  return (
                    <tr
                      key={candidato.id}
                      className={`border-b transition-colors ${
                        isSelected
                          ? "border-border/50 bg-foreground/[0.03]"
                          : "border-border/30"
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => toggle(candidato.id)}
                          aria-pressed={isSelected}
                          aria-label={`${isSelected ? "Remover" : "Adicionar"} ${candidato.nome_urna} da comparacao`}
                          className={`flex size-8 items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-foreground hover:border-foreground/50"
                          }`}
                        >
                          {isSelected ? (
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
                            <Image
                              src={candidato.foto_url}
                              alt={candidato.nome_urna}
                              width={40}
                              height={40}
                              sizes="40px"
                              unoptimized={bypassPhotoOptimization}
                              className="size-10 shrink-0 rounded-full object-cover object-top"
                            />
                          )}
                          <span className="font-heading text-[16px] uppercase leading-tight text-foreground">
                            {candidato.nome_urna}
                          </span>
                        </button>
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-bold text-foreground">
                        {candidato.partido_sigla}
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-semibold tabular-nums text-foreground">
                        {candidato.idade ?? "--"}
                      </td>
                      <td className="max-w-[200px] truncate py-3 pr-4 text-[length:var(--text-body-sm)] font-medium text-foreground">
                        {candidato.formacao ?? "--"}
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {candidato.patrimonio_declarado
                          ? formatCompact(candidato.patrimonio_declarado)
                          : "--"}
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {candidato.total_processos}
                      </td>
                      <td className="py-3 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
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
        <section ref={comparisonRef} className="mx-auto max-w-7xl px-5 pb-12 md:px-12">
          <div className="rounded-[20px] border border-foreground/10 bg-muted/50 p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading)]">
                Comparacao
              </h2>
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {selectedCandidatos.length} candidatos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="w-32 pb-4 text-left text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground" />
                    {selectedCandidatos.map((candidato) => (
                      <th key={candidato.id} className="pb-4 text-center">
                        <Link href={`/candidato/${candidato.slug}`} className="group inline-block">
                          {candidato.foto_url && (
                            <Image
                              src={candidato.foto_url}
                              alt={candidato.nome_urna}
                              width={80}
                              height={80}
                              sizes="(max-width: 640px) 64px, 80px"
                              unoptimized={shouldBypassImageOptimization(candidato.foto_url)}
                              className="mx-auto mb-2 size-16 rounded-full object-cover object-top transition-transform group-hover:scale-105 sm:size-20"
                            />
                          )}
                          <span className="block font-heading text-[length:var(--text-body-lg)] uppercase text-foreground group-hover:underline">
                            {candidato.nome_urna}
                          </span>
                          <span className="block text-[length:var(--text-eyebrow)] font-bold text-muted-foreground">
                            {candidato.partido_sigla}
                          </span>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompRow label="Idade" icon={null}>
                    {selectedCandidatos.map((candidato) => (
                      <td key={candidato.id} className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                        {candidato.idade ? `${candidato.idade} anos` : "--"}
                      </td>
                    ))}
                  </CompRow>
                  <CompRow label="Formacao" icon={null}>
                    {selectedCandidatos.map((candidato) => (
                      <td key={candidato.id} className="py-3 text-center text-[length:var(--text-body-sm)] font-medium text-foreground">
                        {candidato.formacao ?? "--"}
                      </td>
                    ))}
                  </CompRow>
                  <CompRow label="Patrimonio" icon={<Landmark className="size-3.5" />}>
                    {selectedCandidatos.map((candidato) => {
                      const values = selectedCandidatos.map((item) => item.patrimonio_declarado ?? 0)
                      const max = Math.max(...values)
                      const value = candidato.patrimonio_declarado ?? 0
                      const allEqual = values.every((item) => item === max)
                      const isMax = value === max && value > 0 && !allEqual

                      return (
                        <td key={candidato.id} className="py-3 text-center">
                          <span className={`text-[length:var(--text-body)] font-bold tabular-nums ${isMax ? "text-destructive" : "text-foreground"}`}>
                            {value > 0 ? formatCompact(value) : "--"}
                          </span>
                          {isMax && (
                            <span className="ml-1.5 inline-block rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                              maior
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </CompRow>
                  <CompRow label="Processos" icon={<Scale className="size-3.5" />}>
                    {selectedCandidatos.map((candidato) => {
                      const values = selectedCandidatos.map((item) => item.total_processos)
                      const max = Math.max(...values)
                      const allEqual = values.every((item) => item === max)
                      const isMax =
                        candidato.total_processos === max &&
                        candidato.total_processos > 0 &&
                        !allEqual

                      return (
                        <td key={candidato.id} className="py-3 text-center">
                          <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                            {candidato.total_processos}
                          </span>
                          {isMax && (
                            <span className="ml-1.5 inline-block rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
                              maior
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </CompRow>
                  <CompRow label="Trocas de partido" icon={<ArrowRightLeft className="size-3.5" />}>
                    {selectedCandidatos.map((candidato) => (
                      <td key={candidato.id} className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                        {candidato.mudancas_partido}
                      </td>
                    ))}
                  </CompRow>
                  <CompRow label="Alertas graves" icon={<AlertTriangle className="size-3.5" />}>
                    {selectedCandidatos.map((candidato) => {
                      const values = selectedCandidatos.map((item) => item.alertas_graves)
                      const max = Math.max(...values)
                      const allEqual = values.every((item) => item === max)
                      const isMax =
                        candidato.alertas_graves === max &&
                        candidato.alertas_graves > 0 &&
                        !allEqual

                      return (
                        <td key={candidato.id} className="py-3 text-center">
                          <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                            {candidato.alertas_graves}
                          </span>
                          {isMax && (
                            <span className="ml-1.5 inline-block rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
                              maior
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </CompRow>
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

function CompRow({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <tr className="border-t border-border/30">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
        </div>
      </td>
      {children}
    </tr>
  )
}
