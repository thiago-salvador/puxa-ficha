"use client"

import { safeHref } from "@/lib/utils"
import { useEffect, useMemo, useState } from "react"
import {
  TIME_ZONE_EVIDENCE,
  TSE_CDE_URL,
  TSE_LOOKUP_LINKS,
  TRE_URLS,
  TRE_DIRECTORY_EVIDENCE,
  getGuideFacts,
  getGuideFactStatus,
  type GuiaUf,
} from "@/lib/guia-votacao"

function formatCheckedAt(value: string): string {
  const [, month, day] = value.split("-")
  return `${day}/${month}`
}

function sourceLink(href: string, children: string) {
  return <a href={safeHref(href) ?? undefined} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`${children} (abre em nova aba)`} className="underline underline-offset-2">{children}</a>
}

export function AntesDeVotar({ uf }: { uf: string | null }) {
  const [now, setNow] = useState<Date | null>(null)
  const normalizedUf = uf?.toUpperCase() as GuiaUf | undefined
  const facts = useMemo(() => getGuideFacts(normalizedUf ?? null), [normalizedUf])

  useEffect(() => {
    let timer: number | undefined
    const refresh = () => {
      const current = new Date()
      setNow(current)
      window.clearTimeout(timer)
      const remaining = [...facts, TIME_ZONE_EVIDENCE, TRE_DIRECTORY_EVIDENCE]
        .map((fact) => new Date(fact.reviewUntil).getTime() - current.getTime())
        .filter((value) => value > 0)
      if (remaining.length > 0) timer = window.setTimeout(refresh, Math.min(...remaining, 60_000) + 1)
    }
    const initialTimer = window.setTimeout(refresh, 0)
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("focus", refresh)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(initialTimer)
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [facts])

  const visibleFacts = facts.map((fact) => ({ fact, status: now ? getGuideFactStatus(fact, now) : "expired" as const }))
  const expired = visibleFacts.filter(({ status }) => status !== "valid")
  const treHref = normalizedUf && TRE_URLS[normalizedUf]
  const treValid = now && getGuideFactStatus(TRE_DIRECTORY_EVIDENCE, now) === "valid"

  return (
    <section id="antes-de-votar" aria-labelledby="antes-de-votar-titulo" className="mt-8 scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Guia rápido</p>
      <h3 id="antes-de-votar-titulo" className="mt-1 font-heading text-2xl uppercase leading-none text-foreground">Antes de votar</h3>
      <div className="mt-5 space-y-5">
        {visibleFacts.map(({ fact, status }) => (
          <article key={fact.id} className="space-y-2">
            <h4 className="font-bold text-foreground">{fact.title}{"uf" in fact ? ` em ${fact.uf}` : ""}</h4>
            {status === "valid" ? <p className="text-sm leading-relaxed text-foreground">{"label" in fact ? fact.label : fact.body}</p> : <p className="text-sm font-semibold text-foreground">Confira no TSE antes de votar.</p>}
            <p className="text-xs leading-relaxed text-muted-foreground">Fonte: TSE, conferido em {formatCheckedAt(fact.checkedAt)}. {sourceLink(fact.sourceUrl, status === "valid" ? "Abrir fonte" : "Confira no TSE")}</p>
          </article>
        ))}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-semibold text-foreground">Consultas oficiais</p>
        <ul className="mt-2 space-y-2 text-sm">
          {Object.values(TSE_LOOKUP_LINKS).map((link) => <li key={link.href}>{sourceLink(link.href, link.label)}</li>)}
          {treHref && <li>{sourceLink(treValid ? treHref : TRE_DIRECTORY_EVIDENCE.sourceUrl, treValid ? `Site do TRE de ${normalizedUf}` : "Confira o TRE no TSE")}
            <p className="mt-1 text-xs text-muted-foreground">Fonte: TSE, conferido em {formatCheckedAt(TRE_DIRECTORY_EVIDENCE.checkedAt)}.</p>
          </li>}
        </ul>
        {!normalizedUf && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Escolha a UF na sua colinha para ver o horário local e o site do TRE correspondente.</p>}
        <p className="mt-2 text-xs text-muted-foreground">{sourceLink(TSE_CDE_URL, "Ver informações oficiais do TSE")}</p>
      </div>
      {expired.length > 0 && <p className="mt-4 text-xs leading-relaxed text-amber-800">Algumas informações precisam ser conferidas novamente no TSE.</p>}
    </section>
  )
}
