"use client"

import { useId, useState } from "react"
import { ArrowUpRight, ChevronDown, FileText, Info, List } from "lucide-react"
import Link from "next/link"
import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import type { StateProgram } from "@/lib/state-programs"
import type { ProgramRunningMate } from "@/lib/vice-official-status"
import type { ProgramaGovernoManifestoPublico, ProgramaGovernoResumo } from "@/lib/programa-governo"
import { STATE_PROGRAM_CORE_THEMES, stateProgramTheme } from "@/lib/state-program-themes"
import { IndicadorFonteTag } from "./IndicadorFonteTag"
import { AbasFiltro } from "./AbasFiltro"
import { corDoPartido } from "@/lib/cores-finalistas"
import { safeHref } from "@/lib/utils"
import styles from "./StatePrograms.module.css"

/** Os 27 estados em ordem alfabética do nome, para o seletor de governadores. */
const ESTADOS = getEstadoUFs()
  .map((uf) => ({ uf: uf.toUpperCase(), nome: getEstadoNome(uf) ?? uf.toUpperCase() }))
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

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
          {sourceUrl && <> · <a href={safeHref(sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer">Documento no TSE <ArrowUpRight size={14} aria-hidden="true" /></a></>}
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
      <span aria-hidden="true" className={styles.actionDivider} />
      <Link prefetch={false} href={`/candidato/${slug}?tab=programa`} aria-label={`Abrir programa de ${name}`}>Abrir programa <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </div>
    {expanded && <ProgramEvidence evidencias={resumo.frases.flatMap(frase => frase.evidencias)} manifesto={manifesto} />}
  </>
}

/** Por tema: prévia do primeiro item do tema; o completo abre os demais itens com trechos e fonte. */
function ThemeSummary({ items, manifesto, slug, name }: {
  items: ProgramaGovernoResumo["temas"]
  manifesto: ProgramaGovernoManifestoPublico
  slug: string
  name: string
}) {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  return <>
    <div id={bodyId}>
      {expanded ? items.map(item => <div key={item.id} className={styles.themeItem}>
        <h5>No programa · {item.titulo}</h5>
        <p className={styles.summaryText}>{item.descricao}</p>
        <ProgramEvidence evidencias={item.evidencias} manifesto={manifesto} />
      </div>) : <p className={`${styles.summaryText} ${styles.preview}`}>{items[0].descricao}</p>}
    </div>
    <div className={styles.actions}>
      <button type="button" aria-expanded={expanded} aria-controls={bodyId} aria-label={`${expanded ? "Recolher resumo" : "Ler resumo completo"} de ${name}`} onClick={() => setExpanded(!expanded)}>
        <ChevronDown size={17} aria-hidden="true" className={expanded ? styles.rotated : undefined} />
        {expanded ? "Recolher resumo" : "Ler resumo completo"}
      </button>
      <span aria-hidden="true" className={styles.actionDivider} />
      <Link prefetch={false} href={`/candidato/${slug}?tab=programa`} aria-label={`Abrir programa de ${name}`}>Abrir programa <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </div>
  </>
}

/** Aba de quem segue na disputa (ou venceu) ao lado de "Todos os candidatos". */
export type AbaFinalistasProgramas = { rotulo: string; slugs: readonly string[] }

export function StatePrograms({ programs: programsTodos, context = [], unavailable = false, showContext = true, scopeTitle = "Visão geral dos programas", runningMates = {}, abaFinalistas, ufAtual }: {
  programs: StateProgram[]
  abaFinalistas?: AbaFinalistasProgramas
  context?: StateProgramContext[]
  unavailable?: boolean
  showContext?: boolean
  scopeTitle?: string
  runningMates?: Record<string, ProgramRunningMate>
  /** UF da página de estado; na home fica vazio e o seletor pede um estado. */
  ufAtual?: string
}) {
  const painelId = useId()
  const slugsFinalistas = new Set(abaFinalistas?.slugs ?? [])
  const finalistas = programsTodos.filter(p => slugsFinalistas.has(p.slug))
  // Abas só quando o recorte muda algo: há finalista com programa e há outros além deles.
  const comAbas = finalistas.length > 0 && finalistas.length < programsTodos.length
  const [aba, setAba] = useState<"finalistas" | "todos">("finalistas")
  const programs = comAbas && aba === "finalistas" ? finalistas : programsTodos
  const [view, setView] = useState<"summary" | "themes">("summary")
  const [themeEscolhido, setTheme] = useState("seguranca")
  const [candidate, setCandidate] = useState("all")
  const themes = [...new Map(programs.flatMap(p => p.manifesto?.estado === "aprovado" ? p.manifesto.resumo?.temas ?? [] : []).map(t => {
    const group = stateProgramTheme(t)
    return [group.id, group.title] as const
  })).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
  const otherThemes = themes.filter(([id]) => !STATE_PROGRAM_CORE_THEMES.some(([core]) => core === id))
  // Tema que só existe em programa fora do recorte atual (ex.: trocou de aba) volta ao padrão.
  const theme = STATE_PROGRAM_CORE_THEMES.some(([id]) => id === themeEscolhido) || themes.some(([id]) => id === themeEscolhido) ? themeEscolhido : "seguranca"
  const alphabetical = [...programs].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
  const filtered = alphabetical.filter(p => candidate === "all" || p.slug === candidate)
  const visible = filtered
  const themeTitle = [...STATE_PROGRAM_CORE_THEMES, ...otherThemes].find(([id]) => id === theme)?.[1] ?? theme
  const indicators = context.filter(c => c.themeId === theme)

  const listaProgramas = (
        <div id={painelId} className={`${styles.programs} ${visible.length === 2 ? styles.pair : ""}`} {...(comAbas ? { role: "tabpanel" } : {})}>
      {visible.map(p => {
        const manifesto = p.manifesto?.estado === "aprovado" && p.manifesto.resumo ? p.manifesto : null
        const items = manifesto?.resumo?.temas.filter(t => stateProgramTheme(t).id === theme) ?? []
        const party = p.partido_sigla ?? manifesto?.fonte.partido
        const partyColor = corDoPartido(party)?.cor ?? "var(--gray-950)"
        const runningMate = runningMates[p.slug]
        return <article key={`${p.slug}-${view}`} className={styles.program} aria-labelledby={`program-${p.slug}-title`}>
          <header className={styles.identity}>
            <span aria-hidden="true" className={styles.accent} style={{ background: partyColor }} />
            <h4 id={`program-${p.slug}-title`}><Link prefetch={false} href={`/candidato/${p.slug}`}>{p.nome_urna}</Link></h4>
            <p className={styles.party} style={{ color: partyColor }}>{party ? <><span className="sr-only">Partido </span>{party}</> : "Partido indisponível"}</p>
            <p className={styles.runningMate}>Vice: {typeof runningMate === "object"
              ? <>{runningMate.name} (<a href={safeHref(runningMate.source_url) ?? undefined} target="_blank" rel="noopener noreferrer" title={`Fonte consultada em ${runningMate.checked_at.slice(0, 10)}`}>{runningMate.status}</a>)</>
              : runningMate ?? "informação indisponível"}</p>
          </header>
          <div className={styles.content}>
            {!manifesto ? <>
              <p className={styles.notice}><FileText size={20} aria-hidden="true" />Programa revisado indisponível nesta cobertura.</p>
              <Link prefetch={false} className={styles.textLink} href={`/candidato/${p.slug}`}>Consultar ficha <ArrowUpRight size={17} aria-hidden="true" /></Link>
            </> : view === "summary" ? <ProgramSummary manifesto={manifesto} slug={p.slug} name={p.nome_urna} />
              : items.length > 0 ? <ThemeSummary items={items} manifesto={manifesto} slug={p.slug} name={p.nome_urna} /> : <>
                <p className={styles.notice}>Tema não identificado no resumo revisado. Isso não significa ausência no documento completo.</p>
                <Link prefetch={false} className={styles.textLink} href={`/candidato/${p.slug}?tab=programa`} aria-label={`Abrir programa de ${p.nome_urna}`}>Abrir programa <ArrowUpRight size={17} aria-hidden="true" /></Link>
              </>}
          </div>
        </article>
      })}
    </div>
  )

  return <section id="programas" className={styles.section} aria-labelledby="state-programs-title">
    <header className={styles.heading}>
      <p>Programas de governo</p>
      <h2 id="state-programs-title">O que está nos programas</h2>
      <div>Uma visão geral de cada programa. Escolha um tema para aprofundar.</div>
    </header>
    {comAbas && <AbasFiltro
      rotulo="Quais programas mostrar"
      abas={[{ id: "finalistas", label: abaFinalistas!.rotulo }, { id: "todos", label: "Todos os candidatos" }]}
      ativa={aba}
      onChange={(id) => { setAba(id); setCandidate("all") }}
      painelId={painelId}
    />}
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
        {/* Navegação completa de propósito: chega rolada em #programas e não exige o app router, que falta quando o componente é renderizado fora dele (testes). */}
        <label className={styles.governadores}>Governadores<select value={ufAtual ?? ""} onChange={e => {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ver comentário acima
          if (e.target.value) window.location.assign(`/uf/${e.target.value.toLowerCase()}#programas`)
        }}>
          {!ufAtual && <option value="">Escolha um estado</option>}
          {ESTADOS.map(({ uf, nome }) => <option key={uf} value={uf}>{nome}</option>)}
        </select></label>
      </div>
    </div>
    <div className={styles.listHeading}>
      <div><h3>{scopeTitle}</h3><p className={styles.neutralNote}>Candidaturas em ordem alfabética, sem avaliação ou preferência.</p></div>
      <details className={styles.help}>
        <summary>Como ler os resumos <Info size={16} aria-hidden="true" /></summary>
        <p>Os resumos são baseados nos documentos e revisados editorialmente. Abra o resumo completo para consultar os trechos e suas fontes. Na leitura por tema, a ausência no resumo não significa ausência no documento completo.</p>
      </details>
    </div>
    {unavailable && <p role="status" className={styles.notice}>Não foi possível carregar os programas agora. Consulte as fichas das candidaturas.</p>}
    <p className="sr-only" role="status">{visible.length} {visible.length === 1 ? "candidatura exibida" : "candidaturas exibidas"}. {view === "summary" ? "Resumo do programa" : `Tema: ${themeTitle}`}.</p>
    {view === "summary" ? listaProgramas : <div className={styles.themeLayout}>
      <nav className={styles.themeNav} aria-label="Tema do programa">
        <h4>Temas</h4>
        <ul>
          {STATE_PROGRAM_CORE_THEMES.map(([id, title]) => <li key={id}><button type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}>{title}</button></li>)}
        </ul>
        {otherThemes.length > 0 && <details className={styles.otherThemes} open={otherThemes.some(([id]) => id === theme) || undefined}>
          <summary className={styles.themeGroup}>Outros temas ({otherThemes.length}) <ChevronDown size={14} aria-hidden="true" /></summary>
          <ul>
            {otherThemes.map(([id, title]) => <li key={id}><button type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}>{title}</button></li>)}
          </ul>
        </details>}
      </nav>
      <div className={styles.themeBody}>
        <h4 className={styles.themeTitle}>{themeTitle}</h4>
        <p className={styles.themeLead}>Prévias dos resumos.</p>
        {showContext && <aside className={styles.context} aria-label="Contexto do estado">
          <h3>Contexto do estado</h3>
          {indicators.length > 0 ? indicators.map(c => <div key={c.label}>
            <p><strong>{c.value}</strong> {c.label} · {c.year}</p><IndicadorFonteTag fonte={c.source} />
          </div>) : <p>Indicador relacionado a este tema indisponível nesta cobertura.</p>}
          <p>Indicadores de contexto, sem atribuição de causa ou de resultado às candidaturas.</p>
        </aside>}
        {listaProgramas}
      </div>
    </div>}
    {visible.length === 0 && !unavailable && <p className={styles.notice}>Nenhuma candidatura disponível nesta cobertura.</p>}
    <p className={styles.disclaimer}><Info size={18} aria-hidden="true" />Os resumos apresentam o conteúdo dos documentos. Propostas e realizações relatadas não comprovam execução.</p>
  </section>
}
