"use client"

import { useState } from "react"
import Link from "next/link"
import { formatCompact } from "@/lib/utils"
import type { CandidatoComparavel } from "@/lib/types"
import { X, Check, Scale, Landmark, AlertTriangle, ArrowRightLeft } from "lucide-react"

interface Props {
  candidatos: CandidatoComparavel[]
}

export function ComparadorPanel({ candidatos }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

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

  const selectedCandidatos = candidatos.filter((c) => selected.has(c.id))
  const isComparing = selectedCandidatos.length >= 2

  return (
    <>
      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-30 border-b border-border/50 bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-3 md:px-12">
            <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {selected.size}/4 selecionados
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {selectedCandidatos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-[length:var(--text-caption)] font-semibold text-background transition-opacity hover:opacity-80"
                >
                  {c.nome_urna}
                  <X className="size-3" />
                </button>
              ))}
            </div>
            <button
              onClick={clearAll}
              className="text-[length:var(--text-caption)] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Candidate list with checkboxes */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:py-12 md:px-12 lg:py-16">
        {/* Mobile: cards */}
        <div className="space-y-3 md:hidden">
          {candidatos.map((c) => {
            const isSelected = selected.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`flex w-full items-center gap-3 rounded-[12px] border px-4 py-3.5 text-left transition-all ${
                  isSelected
                    ? "border-foreground bg-foreground/[0.03]"
                    : "border-border/50 hover:border-border"
                }`}
              >
                {/* Checkbox */}
                <div
                  className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? "border-foreground bg-foreground"
                      : "border-border"
                  }`}
                >
                  {isSelected && <Check className="size-3 text-background" />}
                </div>

                {c.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.foto_url}
                    alt={c.nome_urna}
                    className="size-10 shrink-0 rounded-full object-cover object-top"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
                    {c.partido_sigla}
                  </span>
                  <p className="truncate font-heading text-[16px] uppercase leading-tight text-foreground">
                    {c.nome_urna}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[length:var(--text-eyebrow)] font-bold text-muted-foreground">
                  {c.idade && <span>{c.idade}</span>}
                  <span>{c.total_processos}p</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Desktop: table with checkboxes */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pb-3 pr-3 w-8" />
                  {["Candidato", "Partido", "Idade", "Formacao", "Patrimonio", "Processos", "Alertas"].map(
                    (h) => (
                      <th
                        key={h}
                        className="pb-3 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-foreground"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => {
                  const isSelected = selected.has(c.id)
                  return (
                    <tr
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(c.id) } }}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isSelected}
                      className={`cursor-pointer border-b transition-colors ${
                        isSelected
                          ? "border-border/50 bg-foreground/[0.03]"
                          : "border-border/30 hover:bg-muted"
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <div
                          className={`flex size-5 items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? "border-foreground bg-foreground"
                              : "border-border"
                          }`}
                        >
                          {isSelected && <Check className="size-3 text-background" />}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          {c.foto_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.foto_url}
                              alt={c.nome_urna}
                              className="size-10 shrink-0 rounded-full object-cover object-top"
                            />
                          )}
                          <span className="font-heading text-[16px] uppercase leading-tight text-foreground">
                            {c.nome_urna}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-bold text-foreground">
                        {c.partido_sigla}
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-semibold tabular-nums text-foreground">
                        {c.idade ?? "--"}
                      </td>
                      <td className="max-w-[200px] truncate py-3 pr-4 text-[length:var(--text-body-sm)] font-medium text-foreground">
                        {c.formacao ?? "--"}
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {c.patrimonio_declarado
                          ? formatCompact(c.patrimonio_declarado)
                          : "--"}
                      </td>
                      <td className="py-3 pr-4 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {c.total_processos}
                      </td>
                      <td className="py-3 text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground">
                        {c.alertas_graves}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Comparison panel */}
      {isComparing && (
        <section className="mx-auto max-w-7xl px-5 pb-12 md:px-12">
          <div className="rounded-[20px] border border-foreground/10 bg-muted/50 p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-heading text-[length:var(--text-heading-sm)] uppercase leading-[0.95] text-foreground sm:text-[length:var(--text-heading)]">
                Comparacao
              </h2>
              <span className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {selectedCandidatos.length} candidatos
              </span>
            </div>

            {/* Comparison grid */}
            <div className="overflow-x-auto">
              <table className="w-full">
                {/* Photos + names */}
                <thead>
                  <tr>
                    <th className="w-32 pb-4 text-left text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground" />
                    {selectedCandidatos.map((c) => (
                      <th key={c.id} className="pb-4 text-center">
                        <Link href={`/candidato/${c.slug}`} className="group inline-block">
                          {c.foto_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.foto_url}
                              alt={c.nome_urna}
                              className="mx-auto mb-2 size-16 rounded-full object-cover object-top transition-transform group-hover:scale-105 sm:size-20"
                            />
                          )}
                          <span className="block font-heading text-[length:var(--text-body-lg)] uppercase text-foreground group-hover:underline">
                            {c.nome_urna}
                          </span>
                          <span className="block text-[length:var(--text-eyebrow)] font-bold text-muted-foreground">
                            {c.partido_sigla}
                          </span>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Idade */}
                  <CompRow label="Idade" icon={null}>
                    {selectedCandidatos.map((c) => (
                      <td key={c.id} className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                        {c.idade ? `${c.idade} anos` : "--"}
                      </td>
                    ))}
                  </CompRow>
                  {/* Formacao */}
                  <CompRow label="Formacao" icon={null}>
                    {selectedCandidatos.map((c) => (
                      <td key={c.id} className="py-3 text-center text-[length:var(--text-body-sm)] font-medium text-foreground">
                        {c.formacao ?? "--"}
                      </td>
                    ))}
                  </CompRow>
                  {/* Patrimonio */}
                  <CompRow label="Patrimonio" icon={<Landmark className="size-3.5" />}>
                    {selectedCandidatos.map((c) => {
                      const values = selectedCandidatos.map((x) => x.patrimonio_declarado ?? 0)
                      const max = Math.max(...values)
                      const val = c.patrimonio_declarado ?? 0
                      const isMax = val === max && val > 0
                      return (
                        <td key={c.id} className="py-3 text-center">
                          <span className={`text-[length:var(--text-body)] font-bold tabular-nums ${isMax ? "text-destructive" : "text-foreground"}`}>
                            {val > 0 ? formatCompact(val) : "--"}
                          </span>
                          {isMax && val > 0 && (
                            <span className="ml-1.5 inline-block rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                              maior
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </CompRow>
                  {/* Processos */}
                  <CompRow label="Processos" icon={<Scale className="size-3.5" />}>
                    {selectedCandidatos.map((c) => {
                      const values = selectedCandidatos.map((x) => x.total_processos)
                      const max = Math.max(...values)
                      const isMax = c.total_processos === max && c.total_processos > 0
                      return (
                        <td key={c.id} className="py-3 text-center">
                          <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                            {c.total_processos}
                          </span>
                          {isMax && c.total_processos > 0 && (
                            <span className="ml-1.5 inline-block rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
                              maior
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </CompRow>
                  {/* Mudancas de partido */}
                  <CompRow label="Trocas de partido" icon={<ArrowRightLeft className="size-3.5" />}>
                    {selectedCandidatos.map((c) => (
                      <td key={c.id} className="py-3 text-center text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                        {c.mudancas_partido}
                      </td>
                    ))}
                  </CompRow>
                  {/* Alertas */}
                  <CompRow label="Alertas graves" icon={<AlertTriangle className="size-3.5" />}>
                    {selectedCandidatos.map((c) => {
                      const values = selectedCandidatos.map((x) => x.alertas_graves)
                      const max = Math.max(...values)
                      const isMax = c.alertas_graves === max && c.alertas_graves > 0
                      return (
                        <td key={c.id} className="py-3 text-center">
                          <span className="text-[length:var(--text-body)] font-bold tabular-nums text-foreground">
                            {c.alertas_graves}
                          </span>
                          {isMax && c.alertas_graves > 0 && (
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

            {/* Links to full profiles */}
            <div className="mt-6 flex flex-wrap gap-2">
              {selectedCandidatos.map((c) => (
                <Link
                  key={c.id}
                  href={`/candidato/${c.slug}`}
                  className="pill-hover rounded-full border border-foreground px-4 py-2 text-[length:var(--text-caption)] font-semibold text-foreground"
                >
                  Ficha de {c.nome_urna} →
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
