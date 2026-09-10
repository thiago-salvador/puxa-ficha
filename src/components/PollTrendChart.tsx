"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { Check, ChevronLeft, ChevronRight, ExternalLink, UserRound, X } from "lucide-react"
import { CandidatePhoto } from "@/components/CandidatePhoto"
import { PollWeekDetails, PollWeekSource } from "./PollResearchDetails"
import { weekLabel, weekTitle, weekObservation, weeklySegments, type PollWeek } from "@/lib/poll-weeks"
import {
  formatPercent, formatPollDate, resultKey, seriesCandidates,
  type PollCandidate, type PollResult,
} from "@/lib/poll-series"
import styles from "./StatePolls.module.css"

const COLORS = ["var(--poll-blue)", "var(--poll-orange)", "var(--poll-teal)", "var(--poll-purple)", "var(--poll-rose)", "var(--poll-olive)"]
const MIN_HEIGHT = 320
const mobileQuery = "(max-width: 640px)"
const subscribeToViewport = (callback: () => void) => {
  const query = window.matchMedia(mobileQuery)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches
const serverSnapshot = () => false

function PollAvatar({ result, candidates }: { result: PollResult; candidates: PollCandidate[] }) {
  const candidate = result.matchStatus === "exact_alias" ? candidates.find(item => item.slug === result.candidateSlug) : undefined
  return <span className={styles.avatar} aria-hidden="true">
    {candidate?.foto_url ? <CandidatePhoto key={candidate.foto_url} src={candidate.foto_url} name={candidate.nome_urna} alt="" width={36} height={36} sizes="36px" className={styles.avatarPhoto} initialsClassName="text-xs" /> : <UserRound size={20} />}
  </span>
}

export function PollTrendChart({ weeks, candidates }: {
  weeks: PollWeek[]; candidates: PollCandidate[]
}) {
  const id = useId()
  const candidatesInSeries = seriesCandidates(weeks.flatMap(week => week.polls))
  const [selected, setSelected] = useState<string[]>(() => candidatesInSeries.map(resultKey))
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [mobileKey, setMobileKey] = useState<string | null>(null)
  const isMobile = useSyncExternalStore(subscribeToViewport, mobileSnapshot, serverSnapshot)
  const plotRef = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const suppressFocus = useRef(false)
  const [width, setWidth] = useState(800)
  const [axisWidth, setAxisWidth] = useState(46)
  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(1, entry.contentRect.width))
      setAxisWidth(plot.getBoundingClientRect().left - plot.parentElement!.getBoundingClientRect().left)
    })
    observer.observe(plot)
    return () => observer.disconnect()
  }, [])

  const dated = weeks.filter(week => week.date)
  const times = dated.map(poll => Date.parse(`${poll.date}T12:00:00Z`))
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const x = (date: string) => minTime === maxTime ? (width - axisWidth) / 2 : 32 + ((Date.parse(`${date}T12:00:00Z`) - minTime) / (maxTime - minTime)) * (width - 64)
  const plotted = candidatesInSeries.map((result, index) => ({
    result, color: COLORS[index % COLORS.length], dash: index < COLORS.length ? undefined : "5 4",
    observations: weeks.map(week => weekObservation(week, resultKey(result))),
  })).filter(item => selected.includes(resultKey(item.result)))
  const allValues = candidatesInSeries.flatMap(result => weeks.map(week => weekObservation(week, resultKey(result))).map(item => item.value ?? 0))
  // Keep the same scale when toggling candidates. Never truncate the zero baseline.
  const maximum = Math.max(50, Math.min(100, Math.ceil(Math.max(0, ...allValues) / 10) * 10))
  const height = isMobile ? 240 : MIN_HEIGHT
  const y = (value: number) => height - (value / maximum) * height
  const ticks = Array.from({ length: maximum / 10 + 1 }, (_, index) => index * 10)
  const latest = dated.at(-1)
  const mobilePoll = dated.find(poll => poll.id === mobileKey) ?? latest
  const mobileIndex = dated.findIndex(poll => poll === mobilePoll)
  const selectPoint = (poll: PollWeek) => {
    setMobileKey(poll.id)
    setActiveKey(poll.id)
  }
  const lastLabels = plotted.flatMap(item => {
    const point = item.observations.find(observation => latest && observation.week.id === latest.id)
    return point?.value !== null && point?.value !== undefined ? [{ ...item, value: point.value, top: y(point.value), left: 0 }] : []
  }).sort((a, b) => a.top - b.top)
  // Preserve the value's exact height. Resolve portrait collisions horizontally only.
  const anchor = latest ? x(latest.date!) : width / 2
  const columns = Array.from({ length: Math.ceil(width / 48) }, (_, index) => index * 48 + 24)
    .filter(left => left <= width - 24 && Math.abs(left - anchor) >= 30)
    .sort((a, b) => (a >= anchor ? a - anchor : width + anchor - a) - (b >= anchor ? b - anchor : width + anchor - b))
  for (let index = 0; index < lastLabels.length; index++) {
    const label = lastLabels[index]
    label.left = columns.find(left => lastLabels.slice(0, index).every(other => Math.abs(other.top - label.top) >= 54 || Math.abs(other.left - left) >= 48)) ?? columns[index % columns.length] ?? anchor
  }
  const active = dated.find(poll => poll.id === activeKey)
  const highlighted = isMobile ? mobilePoll : active
  const closeDetails = () => {
    setActiveKey(null)
    suppressFocus.current = true
    buttons.current[dated.findIndex(poll => poll.id === activeKey)]?.focus()
    suppressFocus.current = false
  }
  const validDates = new Set(dated.filter(poll => plotted.some(item => item.observations.some(point => point.week.id === poll.id && point.value !== null))).map(week => week.date))
  const dateLabels = [...new Set(dated.map(poll => poll.date!))].filter((_, index, values) => index === 0 || index === values.length - 1 || (width > 550 && index % Math.ceil(values.length / 5) === 0))

  const renderToggle = (result: PollResult, index: number) => {
    const checked = selected.includes(resultKey(result))
    const observations = weeks.map(week => weekObservation(week, resultKey(result)))
    const observation = mobilePoll ? observations.find(point => point.week.id === mobilePoll.id) : observations.at(-1)
    const value = observation?.value ?? null
    const coverage = mobilePoll?.results.find(item => resultKey(item.result) === resultKey(result))
    return <label key={resultKey(result)} className={styles.candidateToggle} data-pf-poll-candidate="">
      <input type="checkbox" checked={checked} onChange={() => setSelected(current => checked ? current.filter(key => key !== resultKey(result)) : [...current, resultKey(result)])} />
      <span className={styles.checkbox} style={{ borderColor: COLORS[index % COLORS.length], backgroundColor: checked ? COLORS[index % COLORS.length] : "transparent" }} aria-hidden="true">{checked && <Check size={14} />}</span>
      <PollAvatar result={result} candidates={candidates} /><span className={styles.toggleName}>{result.rawLabel}{coverage && coverage.count < coverage.total && <small>{coverage.count} de {coverage.total} pesquisas com resultado</small>}</span><strong>{value === null ? "Sem resultado" : formatPercent(value)}</strong>
      <span className={styles.mobileBar} aria-hidden="true">{value !== null && <span data-pf-poll-mobile-bar="" style={{ width: `${value / maximum * 100}%`, backgroundColor: COLORS[index % COLORS.length] }} />}</span>
    </label>
  }

  return <div className={styles.trend} data-pf-poll-trend="" data-single-poll={dated.length === 1}>
    {(mobilePoll ?? weeks.at(-1)) && <PollWeekSource week={(mobilePoll ?? weeks.at(-1))!} />}
    <p className={styles.chartDescription} id={`${id}-description`}>Cada ponto representa uma semana de segunda a domingo, agrupada pelo fim da coleta de cada pesquisa. Use Tab e as setas para selecionar um ponto e ver seus dados.</p>
    {dated.length === 0 ? <p className={styles.notice}>Sem datas de coleta verificadas para desenhar a evolução. Os resultados disponíveis estão abaixo.</p> : <>
      {validDates.size < 2 && selected.length > 0 && <p className={styles.notice} data-pf-poll-single-point="">{validDates.size === 1 ? <><span className={styles.desktopOnly}>Uma semana disponível neste cenário. Os traços horizontais guiam a leitura dos valores; ainda não há evolução no tempo.</span><span className={styles.mobileOnly}>Uma semana disponível neste cenário. Compare os resultados abaixo.</span></> : "Sem percentuais publicados para os candidatos selecionados neste período."}</p>}
      {selected.length === 0 && <p className={styles.notice} role="status">Selecione ao menos um candidato abaixo para visualizar os pontos.</p>}
      <div className={styles.chartLayout} data-pf-poll-chart="">
        <div className={styles.yAxis} aria-hidden="true">{ticks.map(tick => <span key={tick} style={{ top: y(tick) }}>{tick}%</span>)}</div>
        <div ref={plotRef} className={styles.plot} style={{ height }}>
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className={styles.svg} aria-hidden="true">
            {ticks.map(tick => <line key={tick} x1={0} x2={width} y1={y(tick)} y2={y(tick)} className={styles.gridLine} />)}
            {dateLabels.map(date => <line key={date} x1={x(date)} x2={x(date)} y1={0} y2={height} className={styles.gridLine} />)}
            {plotted.map(item => <g key={resultKey(item.result)}>
              {minTime === maxTime && item.observations.filter(point => point.date && point.value !== null).map(point => <line key={`guide-${point.week.id}`} data-pf-poll-guide="" x1={0} x2={x(point.date!)} y1={y(point.value!)} y2={y(point.value!)} stroke={item.color} strokeWidth={1.5} strokeOpacity={0.65} strokeDasharray="4 4" />)}
              {weeklySegments(item.observations).filter(segment => segment.length > 1).map((segment, index) => <polyline key={index} data-pf-poll-line="" points={segment.map(point => `${x(point.date!)},${y(point.value!)}`).join(" ")} fill="none" stroke={item.color} strokeWidth={2.5} strokeDasharray={item.dash} />)}
              {item.observations.filter(point => point.date && point.value !== null).map(point => <circle key={point.week.id} data-pf-poll-dot="" cx={x(point.date!)} cy={y(point.value!)} r={5.5} fill={item.color} stroke="var(--background)" strokeWidth={2} />)}
            </g>)}
            {lastLabels.map(item => <line key={`label-${resultKey(item.result)}`} className={styles.portraitGuide} x1={anchor} x2={item.left} y1={item.top} y2={item.top} stroke={item.color} strokeWidth={1.5} />)}
            {highlighted && <line data-pf-poll-cursor="" x1={x(highlighted.date!)} x2={x(highlighted.date!)} y1={0} y2={height} className={styles.cursor} />}
          </svg>
          <div role="group" aria-label="Pontos das pesquisas" aria-describedby={`${id}-description`}>
            {dated.map((poll, index) => <button key={poll.id} ref={node => { buttons.current[index] = node }} type="button" className={styles.pointTarget} style={{ left: x(poll.date!) }} aria-label={`${weekTitle(poll)}, semana ${formatPollDate(poll.date)}, institutos: ${poll.institutes.join(", ")}`} aria-pressed={highlighted === poll} onFocus={() => { if (!suppressFocus.current) selectPoint(poll) }} onClick={() => selectPoint(poll)} onKeyDown={event => {
              if (event.key === "Escape") setActiveKey(null)
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault()
                buttons.current[(index + (event.key === "ArrowRight" ? 1 : -1) + dated.length) % dated.length]?.focus()
              }
            }} />)}
          </div>
          <div className={styles.xAxis} aria-hidden="true">{dateLabels.map(date => <span key={date} style={{ left: x(date) }}>{formatPollDate(date, true)}</span>)}</div>
          <div className={styles.endpointLabels} aria-hidden="true">{lastLabels.map(item => <div className={styles.endpoint} data-pf-poll-endpoint="" data-value-y={item.top} key={resultKey(item.result)} style={{ top: item.top, left: item.left }} title={`${item.result.rawLabel}: ${formatPercent(item.value)}`}>
            <PollAvatar result={item.result} candidates={candidates} /><strong>{formatPercent(item.value)}</strong>
          </div>)}</div>
          {active && !isMobile && <div className={styles.tooltip} role="region" aria-label="Pesquisa selecionada" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); closeDetails() } }} style={{ left: Math.max(0, Math.min(width - Math.min(248, width), x(active.date!) - 124)) }}>
            <div className={styles.tooltipHeading}><strong>{weekTitle(active)} · {weekLabel(active)}</strong><button type="button" aria-label="Fechar detalhes do ponto" onClick={closeDetails}><X size={16} /></button></div>
            <p className={styles.tooltipInstitutes}>{active.institutes.join(" · ")}</p>
            <ul>{plotted.map(item => {
              const point = item.observations.find(observation => observation.week.id === active.id)!
              const coverage = active.results.find(result => resultKey(result.result) === resultKey(item.result))
              return <li key={resultKey(item.result)}><span className={styles.colorDot} style={{ backgroundColor: item.color }} /><span>{item.result.rawLabel}{coverage && coverage.count < coverage.total && <small className={styles.resultCoverage}>{coverage.count} de {coverage.total} pesquisas com resultado</small>}</span><strong>{point.value === null ? "Sem resultado" : formatPercent(point.value)}</strong></li>
            })}</ul>
            {active.polls.map(poll => <a key={poll.id} className={styles.textLink} href={poll.provenance.resultUrl} target="_blank" rel="noopener noreferrer">Fonte: {poll.instituto.value} <ExternalLink size={14} aria-hidden="true" /></a>)}
          </div>}
        </div>
      </div>
    </>}
    {mobilePoll && dated.length > 1 && <div className={styles.mobileResearch} data-pf-mobile-research="">
      <div className={styles.dateNavigation}>
        {dated.length > 1 && <button type="button" disabled={mobileIndex === 0} onClick={() => selectPoint(dated[mobileIndex - 1])}><ChevronLeft size={16} aria-hidden="true" />Anterior</button>}
        <div className={styles.selectedDate} aria-live="polite" aria-atomic="true"><span>Semana · {mobileIndex + 1} de {dated.length}</span><strong>{weekLabel(mobilePoll)}</strong><span>{weekTitle(mobilePoll)}</span></div>
        {dated.length > 1 && <button type="button" disabled={mobileIndex === dated.length - 1} onClick={() => selectPoint(dated[mobileIndex + 1])}>Próxima<ChevronRight size={16} aria-hidden="true" /></button>}
      </div>
    </div>}
    <fieldset className={styles.candidateToggles}><legend><span className={styles.desktopOnly}>Mostrar candidatos</span><span className={styles.mobileOnly}>Candidatos · intenção de voto</span></legend>
      {candidatesInSeries.map(renderToggle)}
    </fieldset>
    {(mobilePoll ?? weeks.at(-1)) && <PollWeekDetails key={(mobilePoll ?? weeks.at(-1))!.id} week={(mobilePoll ?? weeks.at(-1))!} candidateKeys={candidatesInSeries.map(resultKey)} />}
    <div className={styles.chartFootnote}><div><strong><span className={styles.desktopOnly}>Cada ponto é uma semana</span><span className={styles.mobileOnly}>{dated.length === 1 ? "Sobre esta semana" : "Cada ponto é uma semana"}</span></strong><p><span className={styles.desktopOnly}>Selecione uma semana para ver a média, os institutos e os resultados originais de cada pesquisa.</span><span className={styles.mobileOnly}>{dated.length > 1 && "Toque em um ponto ou use Anterior e Próxima para comparar as semanas. "}As fontes e fichas técnicas de cada pesquisa estão disponíveis acima.</span></p></div><p>Média simples: cada pesquisa tem o mesmo peso. Semanas sem dados interrompem a linha. A média não é uma previsão nem tem margem de erro própria.</p></div>
  </div>
}
