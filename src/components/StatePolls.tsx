"use client"

import { useId, useMemo, useState } from "react"
import { Info, SlidersHorizontal, TrendingUp } from "lucide-react"
import type { StatePollScenario } from "@/lib/state-polls"
import { type PollCandidate } from "@/lib/poll-series"
import { groupWeeklyPollSeries } from "@/lib/poll-weeks"
import { PollTrendChart } from "./PollTrendChart"
import styles from "./StatePolls.module.css"

export function StatePolls({ polls, unavailable = false, candidates = [] }: {
  polls: StatePollScenario[]; unavailable?: boolean; candidates?: PollCandidate[]
}) {
  const id = useId()
  const [turn, setTurn] = useState<1 | 2>(1)
  const [institute, setInstitute] = useState("")
  const [seriesId, setSeriesId] = useState("")
  const [period, setPeriod] = useState("all")
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const eligiblePolls = useMemo(() => polls.filter(poll => poll.sourceStatus === "aprovado" && poll.state === "publicado"), [polls])
  const institutes = [...new Set(eligiblePolls.filter(poll => poll.scenario.turn === turn).map(poll => poll.instituto.value ?? "Instituto não informado"))].sort()
  const activeInstitute = institutes.includes(institute) ? institute : "all"
  const choices = useMemo(() => groupWeeklyPollSeries(eligiblePolls.filter(poll => poll.scenario.turn === turn && (activeInstitute === "all" || poll.instituto.value === activeInstitute))), [eligiblePolls, turn, activeInstitute])
  const series = choices.find(group => group.id === seriesId) ?? choices[0]
  const months = [...new Set((series?.weeks ?? []).flatMap(week => week.date ? [week.date.slice(0, 7)] : []))].sort().reverse()
  const activePeriod = months.includes(period) ? period : "all"
  const visibleWeeks = (series?.weeks ?? []).filter(week => activePeriod === "all" || week.date?.startsWith(activePeriod))
  const current = visibleWeeks.at(-1)
  const reset = () => { setSeriesId(""); setPeriod("all") }
  const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })

  return <section id="pesquisas" className={styles.section} aria-labelledby={`${id}-title`} data-pf-polls="">
    <header className={styles.heading}><p>Eleições · Pesquisas</p><h2 id={`${id}-title`}>A evolução da disputa</h2><div>Uma linha por candidato. Um ponto por semana.</div></header>
    <div className={styles.toolbar}>
      <div className={styles.viewLabel}><TrendingUp size={20} aria-hidden="true" />Evolução</div>
      <button className={styles.filterToggle} type="button" aria-label="Filtros de pesquisa" aria-expanded={filtersExpanded} aria-controls={`${id}-filters`} onClick={() => setFiltersExpanded(value => !value)}><SlidersHorizontal size={18} aria-hidden="true" /></button>
      <div id={`${id}-filters`} className={styles.filters} data-expanded={filtersExpanded}>
        <label>Turno<select value={turn} onChange={event => { setTurn(Number(event.target.value) as 1 | 2); setInstitute(""); reset() }}><option value={1}>1º turno</option><option value={2}>2º turno</option></select></label>
        {series && <><label>Instituto<select value={activeInstitute} onChange={event => { setInstitute(event.target.value); reset() }}><option value="all">Todos os institutos</option>{institutes.map(name => <option key={name}>{name}</option>)}</select></label>
          <label className={styles.scenarioFilter}>Cenário<select title={series.label} value={series.id} onChange={event => { setSeriesId(event.target.value); setPeriod("all") }}>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
          <label>Período<select value={activePeriod} onChange={event => setPeriod(event.target.value)}><option value="all">Todo o período</option>{months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></label></>}
      </div>
    </div>
    <div className={styles.panel}>
      {!current ? <p className={styles.notice}>{unavailable ? "Não foi possível carregar as pesquisas agora." : "Sem pesquisa qualificada disponível para este turno na cobertura atual."} <a href="https://pesqele-divulgacao.tse.jus.br/" target="_blank" rel="noopener noreferrer">Consultar registros no TSE</a></p> : <>
        <div className={styles.chartHeader}><h3>{visibleWeeks.length === 1 ? "Intenção de voto na semana" : "Intenção de voto semana a semana"}</h3><p>{series.label}</p></div>
        <details className={styles.comparisonHelp}><summary>Como calculamos a média <Info size={16} aria-hidden="true" /></summary><p>Semanas de segunda a domingo, definidas pelo fim da coleta. Cada pesquisa tem o mesmo peso na média simples de cada candidato. Combinamos institutos e métodos de entrevista diferentes somente dentro do mesmo cenário verificado, população e lista de candidatos. Resultados ausentes não viram zero; informamos quantas pesquisas têm resultado para cada candidato. Semanas sem dados interrompem a linha. O filtro de período considera o início da semana, mantendo a média da semana inteira. Esta é uma agregação descritiva, sem correção por instituto ou margem de erro calculada para a média; não é uma previsão.</p></details>
        <PollTrendChart key={`${series.id}:${activeInstitute}:${activePeriod}`} weeks={visibleWeeks} candidates={candidates} />
      </>}
    </div>
    <p className={styles.disclaimer}>Pesquisas retratam o período de coleta e não são previsão do resultado.</p>
  </section>
}
