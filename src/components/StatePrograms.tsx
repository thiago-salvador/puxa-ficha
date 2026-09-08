"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import Link from "next/link"
import type { StateProgram } from "@/lib/state-programs"
import { STATE_PROGRAM_CORE_THEMES, stateProgramTheme } from "@/lib/state-program-themes"
import { IndicadorFonteTag } from "./IndicadorFonteTag"

export type StateProgramContext = { themeId: string; label: string; value: string; year: string; source: string }

export function StatePrograms({ programs, context = [], unavailable = false, showContext = true }: { programs: StateProgram[]; context?: StateProgramContext[]; unavailable?: boolean; showContext?: boolean }) {
  const themes = [...new Map(programs.flatMap(p => p.manifesto?.resumo?.temas ?? []).map(t => {
    const group = stateProgramTheme(t)
    return [group.id, group.title] as const
  })).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
  const coreThemes = STATE_PROGRAM_CORE_THEMES
  const otherThemes = themes.filter(([id]) => !coreThemes.some(([core]) => core === id))
  const [selected, setSelected] = useState("seguranca")
  const theme = selected
  const indicators = context.filter(c => c.themeId === theme)
  return <section id="programas" className="scroll-mt-24 space-y-6" aria-labelledby="state-programs-title">
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Programas de governo</p>
      <h2 id="state-programs-title" className="font-heading text-3xl uppercase">O que está nos programas</h2>
      <p className="mt-2 text-sm text-muted-foreground">Temas dos resumos revisados editorialmente. Os trechos podem incluir diagnóstico, realizações relatadas ou propostas; não comprovam execução.</p>
    </div>
    {unavailable && <p role="status" className="text-sm text-muted-foreground">Não foi possível carregar os programas agora. Consulte as fichas das candidaturas.</p>}
    <div className="flex flex-wrap items-center gap-2" aria-label="Tema do programa">
      {coreThemes.map(([id, title]) => <button type="button" key={id} aria-pressed={theme === id} onClick={() => setSelected(id)} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold ${theme === id ? "bg-foreground text-background" : "bg-card"}`}>{title}</button>)}
      {otherThemes.length > 0 && <label className="flex min-w-0 max-w-full flex-col gap-1 text-sm font-semibold sm:flex-row sm:items-center sm:gap-2">Outros temas<span className="relative min-w-0 max-w-full"><select aria-label="Outros temas do programa" className="min-h-11 w-full min-w-0 max-w-full appearance-none overflow-hidden text-ellipsis rounded-lg border bg-card py-2 pl-3 pr-10" value={otherThemes.some(([id]) => id === selected) ? selected : ""} onChange={e => { if (e.target.value) setSelected(e.target.value) }}><option value="">Selecionar tema</option>{otherThemes.map(([id,title]) => <option key={id} value={id}>{title}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" /></span></label>}
    </div>
    <div className={`grid items-start gap-5 ${showContext ? "lg:grid-cols-[240px_minmax(0,1fr)]" : ""}`}>
      {showContext && <aside className="rounded-xl border bg-card p-5">
        <h3 className="font-heading text-xl uppercase">Contexto do estado</h3>
        <p className="mt-2 text-sm text-muted-foreground">Indicadores de contexto, sem atribuição de causa ou de resultado às candidaturas.</p>
        {indicators.length > 0 ? indicators.map(c => <div key={c.label} className="mt-5"><p className="text-sm">{c.label}</p><p className="mt-1 font-heading text-3xl">{c.value}</p><p className="mt-1 text-xs text-muted-foreground">{c.year}</p><IndicadorFonteTag fonte={c.source} /></div>) : <p className="mt-5 text-sm text-muted-foreground">Indicador relacionado a este tema indisponível nesta cobertura.</p>}
      </aside>}
      <div className={`grid min-w-0 gap-4 md:grid-cols-2 ${showContext ? "" : "xl:grid-cols-3"}`}>{[...programs].sort((a,b) => a.nome_urna.localeCompare(b.nome_urna,"pt-BR")).map(p => {
        const items = p.manifesto?.resumo?.temas.filter(t => stateProgramTheme(t).id === theme) ?? []
        const sourceUrl = p.manifesto?.fonte.pdfOriginalUrl ?? p.manifesto?.fonte.pacoteUrl ?? p.manifesto?.fonte.datasetUrl
        return <article key={p.slug} className="min-w-0 rounded-xl border bg-card p-5">
          <h3 className="font-heading text-xl uppercase"><Link href={`/candidato/${p.slug}`}>{p.nome_urna}</Link></h3>
          {items.length > 0 ? items.map(item => <div key={item.id}>
            <p className="mt-4 text-xs font-bold uppercase text-muted-foreground">No programa · {item.titulo}</p>
            <p className="mt-2 text-sm leading-relaxed">{item.descricao}</p>
            <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Ver trechos e fonte</summary>
              {item.evidencias.map((e,i) => <blockquote key={i} className="mt-3 border-l-2 pl-3"><p>“{e.trecho}”</p><footer className="mt-1 text-xs text-muted-foreground">Página {e.pagina}{e.documentoId ? ` · Documento ${e.documentoId}` : ""}</footer></blockquote>)}
              {sourceUrl && <a className="mt-3 inline-block underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">Documento no TSE</a>}
            </details>
          </div>) : <p className="mt-4 text-sm text-muted-foreground">{p.manifesto ? "Tema não identificado no resumo revisado. Isso não significa ausência no documento completo." : "Programa revisado indisponível nesta cobertura."}</p>}
          <Link className="mt-4 inline-block text-sm font-semibold underline" href={`/candidato/${p.slug}?tab=programa`}>Abrir ficha e programa</Link>
        </article>
      })}</div>
    </div>
    {programs.length === 0 && !unavailable && <p className="text-sm text-muted-foreground">Nenhuma candidatura disponível nesta cobertura.</p>}
  </section>
}
