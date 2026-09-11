"use client"

import { useId, useState } from "react"
import { ArrowUpRight, ChevronDown, FileText, Info, List } from "lucide-react"
import Link from "next/link"
import type { StateProgram } from "@/lib/state-programs"
import type { ProgramaGovernoManifestoPublico, ProgramaGovernoResumo } from "@/lib/programa-governo"
import { STATE_PROGRAM_CORE_THEMES, stateProgramTheme } from "@/lib/state-program-themes"
import { IndicadorFonteTag } from "./IndicadorFonteTag"
import { PartyLogoMark } from "./PartyLogoMark"
import { getPartyLogoUrl } from "@/lib/utils"
import styles from "./StatePrograms.module.css"

export type StateProgramContext = { themeId: string; label: string; value: string; year: string; source: string }

function ProgramEvidence({ evidencias, manifesto }: {
  evidencias: ProgramaGovernoResumo["temas"][number]["evidencias"]
  manifesto: ProgramaGovernoManifestoPublico
}) {
  return <details className={styles.evidence}>
    <summary>Ver trechos e fonte <ChevronDown size={16} aria-hidden="true" /></summary>
    {evidencias.map((e, i) => {
      const fonte = manifesto.documentos?.find(d => d.documentoId === e.documentoId)?.fonte ?? manifesto.fonte
      const sourceUrl = fonte.pdfOriginalUrl ?? fonte.pacoteUrl ?? fonte.datasetUrl
      return <blockquote key={i}>
        <p>“{e.trecho}”</p>
        <footer>Página {e.pagina}{e.documentoId ? ` · Documento ${e.documentoId}` : ""}
          {sourceUrl && <> · <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Documento no TSE <ArrowUpRight size={14} aria-hidden="true" /></a></>}
        </footer>
      </blockquote>
    })}
  </details>
}

function ProgramSummary({ manifesto, slug, name }: { manifesto: ProgramaGovernoManifestoPublico; slug: string; name: string }) {
  const [expanded, setExpanded] = useState(false)
  const summaryId = useId()
  const resumo = manifesto.resumo!
  return <>
    <p id={summaryId} className={`${styles.summaryText} ${expanded ? "" : styles.preview}`}>{resumo.texto}</p>
    <div className={styles.actions}>
      <button type="button" aria-expanded={expanded} aria-controls={summaryId} aria-label={`${expanded ? "Recolher resumo" : "Ler resumo completo"} de ${name}`} onClick={() => setExpanded(!expanded)}>
        <ChevronDown size={17} aria-hidden="true" className={expanded ? styles.rotated : undefined} />
        {expanded ? "Recolher resumo" : "Ler resumo completo"}
      </button>
      <Link href={`/candidato/${slug}?tab=programa`} aria-label={`Abrir programa de ${name}`}>Abrir programa <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </div>
    {expanded && <ProgramEvidence evidencias={resumo.frases.flatMap(frase => frase.evidencias)} manifesto={manifesto} />}
  </>
}

export function StatePrograms({ programs, context = [], unavailable = false, showContext = true, scopeTitle = "Visão geral dos programas", runningMates = {} }: {
  programs: StateProgram[]
  context?: StateProgramContext[]
  unavailable?: boolean
  showContext?: boolean
  scopeTitle?: string
  runningMates?: Record<string, string>
}) {
  const [view, setView] = useState<"summary" | "themes">("summary")
  const [theme, setTheme] = useState("seguranca")
  const [candidate, setCandidate] = useState("all")
  const [order, setOrder] = useState("asc")
  const themes = [...new Map(programs.flatMap(p => p.manifesto?.estado === "aprovado" ? p.manifesto.resumo?.temas ?? [] : []).map(t => {
    const group = stateProgramTheme(t)
    return [group.id, group.title] as const
  })).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
  const otherThemes = themes.filter(([id]) => !STATE_PROGRAM_CORE_THEMES.some(([core]) => core === id))
  const alphabetical = [...programs].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
  const filtered = alphabetical.filter(p => candidate === "all" || p.slug === candidate)
  const visible = order === "desc" ? filtered.toReversed() : filtered
  const indicators = context.filter(c => c.themeId === theme)

  return <section id="programas" className={styles.section} aria-labelledby="state-programs-title">
    <header className={styles.heading}>
      <p>Programas de governo</p>
      <h2 id="state-programs-title">O que está nos programas</h2>
      <div>Uma visão geral de cada programa. Escolha um tema para aprofundar.</div>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.views} role="group" aria-label="Visualização dos programas">
        <button type="button" aria-pressed={view === "summary"} onClick={() => setView("summary")}><FileText size={20} aria-hidden="true" />Resumo do programa</button>
        <button type="button" aria-pressed={view === "themes"} onClick={() => setView("themes")}><List size={20} aria-hidden="true" />Por tema</button>
      </div>
      <div className={styles.filters}>
        <label>Candidaturas<select value={candidate} onChange={e => setCandidate(e.target.value)}>
          <option value="all">Todas as candidaturas</option>
          {alphabetical.map(p => <option key={p.slug} value={p.slug}>{p.nome_urna}</option>)}
        </select></label>
        <label>Ordenação<select value={order} onChange={e => setOrder(e.target.value)}>
          <option value="asc">Nome: A a Z</option><option value="desc">Nome: Z a A</option>
        </select></label>
      </div>
    </div>
    {view === "themes" && <div className={styles.themeBar}>
      <label>Tema do programa<select value={theme} onChange={e => setTheme(e.target.value)}>
        <optgroup label="Temas principais">{STATE_PROGRAM_CORE_THEMES.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</optgroup>
        {otherThemes.length > 0 && <optgroup label="Outros temas">{otherThemes.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</optgroup>}
      </select></label>
      {showContext && <aside className={styles.context} aria-label="Contexto do estado">
        <h3>Contexto do estado</h3>
        {indicators.length > 0 ? indicators.map(c => <div key={c.label}>
          <p><strong>{c.value}</strong> {c.label} · {c.year}</p><IndicadorFonteTag fonte={c.source} />
        </div>) : <p>Indicador relacionado a este tema indisponível nesta cobertura.</p>}
        <p>Indicadores de contexto, sem atribuição de causa ou de resultado às candidaturas.</p>
      </aside>}
    </div>}
    <div className={styles.listHeading}>
      <div><h3>{scopeTitle}</h3><p>{order === "asc" ? "Candidaturas em ordem alfabética" : "Candidaturas em ordem alfabética inversa"}, sem avaliação ou preferência.</p></div>
      <details className={styles.help}>
        <summary>Como ler os resumos <Info size={16} aria-hidden="true" /></summary>
        <p>Os resumos são baseados nos documentos e revisados editorialmente. Abra o resumo completo para consultar os trechos e suas fontes. Na leitura por tema, a ausência no resumo não significa ausência no documento completo.</p>
      </details>
    </div>
    {unavailable && <p role="status" className={styles.notice}>Não foi possível carregar os programas agora. Consulte as fichas das candidaturas.</p>}
    <p className="sr-only" role="status">{visible.length} {visible.length === 1 ? "candidatura exibida" : "candidaturas exibidas"}. {view === "summary" ? "Resumo do programa" : `Tema: ${[...STATE_PROGRAM_CORE_THEMES, ...otherThemes].find(([id]) => id === theme)?.[1] ?? theme}`}.</p>
    <div className={styles.programs}>
      {visible.map(p => {
        const manifesto = p.manifesto?.estado === "aprovado" && p.manifesto.resumo ? p.manifesto : null
        const items = manifesto?.resumo?.temas.filter(t => stateProgramTheme(t).id === theme) ?? []
        const party = p.partido_sigla ?? manifesto?.fonte.partido
        const hasPartyLogo = party && getPartyLogoUrl(party)
        return <article key={`${p.slug}-${view}`} className={styles.program} aria-labelledby={`program-${p.slug}-title`}>
          <header className={styles.identity}>
            <h4 id={`program-${p.slug}-title`}><Link href={`/candidato/${p.slug}`}>{p.nome_urna}</Link></h4>
            {hasPartyLogo ? <span className={styles.partyLogo} role="img" aria-label={`Partido ${party}`}>
              <PartyLogoMark sigla={party} className="h-8 w-12 rounded-none border-0 p-0 shadow-none sm:h-8 sm:w-12 sm:rounded-none sm:p-0" />
            </span> : <span className="sr-only">{party ? `Partido ${party}. Logo indisponível.` : "Partido indisponível."}</span>}
            <p className={styles.runningMate}>Vice: {runningMates[p.slug] ?? "informação indisponível"}</p>
          </header>
          <div className={styles.content}>
            {!manifesto ? <>
              <p className={styles.notice}><FileText size={20} aria-hidden="true" />Programa revisado indisponível nesta cobertura.</p>
              <Link className={styles.textLink} href={`/candidato/${p.slug}`}>Consultar ficha <ArrowUpRight size={17} aria-hidden="true" /></Link>
            </> : view === "summary" ? <ProgramSummary manifesto={manifesto} slug={p.slug} name={p.nome_urna} /> : <>
              {items.length > 0 ? items.map(item => <div key={item.id} className={styles.themeItem}>
                <h5>No programa · {item.titulo}</h5>
                <p className={styles.summaryText}>{item.descricao}</p>
                <ProgramEvidence evidencias={item.evidencias} manifesto={manifesto} />
              </div>) : <p className={styles.notice}>Tema não identificado no resumo revisado. Isso não significa ausência no documento completo.</p>}
              <Link className={styles.textLink} href={`/candidato/${p.slug}?tab=programa`} aria-label={`Abrir programa de ${p.nome_urna}`}>Abrir programa <ArrowUpRight size={17} aria-hidden="true" /></Link>
            </>}
          </div>
        </article>
      })}
    </div>
    {visible.length === 0 && !unavailable && <p className={styles.notice}>Nenhuma candidatura disponível nesta cobertura.</p>}
    <p className={styles.disclaimer}><Info size={18} aria-hidden="true" />Os resumos apresentam o conteúdo dos documentos. Propostas e realizações relatadas não comprovam execução.</p>
  </section>
}
