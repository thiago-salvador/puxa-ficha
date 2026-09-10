import { ChevronDown, ExternalLink } from "lucide-react"
import type { StatePollScenario } from "@/lib/state-polls"
import { formatPercent, formatPollDate, publishedValue, resultKey } from "@/lib/poll-series"
import { weekLabel, weekTitle, type PollWeek } from "@/lib/poll-weeks"
import styles from "./StatePolls.module.css"

export function PollWeekSource({ week }: { week: PollWeek }) {
  return <div data-pf-week-source="">
    <p className={styles.weekHeading}><strong>{weekTitle(week)}</strong> · {weekLabel(week)}</p>
    {week.polls.length === 1 ? <PollSource poll={week.polls[0]} /> : <div className={styles.researchSource} data-pf-poll-source="">
      <div><strong>{week.institutes.join(" · ")}</strong><p>Média simples, com o mesmo peso para cada pesquisa. Semana definida pelo fim da coleta.</p></div>
      <div className={styles.weekSources}>{week.polls.map(poll => <a key={poll.id} href={poll.provenance.resultUrl} target="_blank" rel="noopener noreferrer">Fonte: {poll.instituto.value} · {formatPollDate(poll.fieldwork.end.value)} <ExternalLink size={14} aria-hidden="true" /></a>)}</div>
    </div>}
  </div>
}

export function PollWeekDetails({ week, candidateKeys }: { week: PollWeek; candidateKeys: string[] }) {
  if (week.polls.length === 1) return <PollResearchDetails poll={week.polls[0]} candidateKeys={candidateKeys} />
  return <div className={styles.weekDetails} data-pf-week-details=""><h4>Pesquisas que compõem a média</h4><p>Resultados originais e fichas técnicas. Margens de erro e amostras pertencem a cada pesquisa, não à média.</p>
    {week.polls.map(poll => <details key={poll.id} className={styles.contributingPoll} data-pf-week-member=""><summary>{poll.instituto.value} · Coleta: {formatPollDate(poll.fieldwork.end.value)} <ChevronDown size={16} aria-hidden="true" /></summary><PollResearchDetails poll={poll} candidateKeys={[]} /></details>)}
  </div>
}

function PollSource({ poll }: { poll: StatePollScenario }) {
  return <div className={styles.researchSource} data-pf-poll-source="">
    <div><strong>{poll.instituto.value ?? "Instituto não informado"}</strong><p>Coleta: {formatPollDate(poll.fieldwork.start.value)} a {formatPollDate(poll.fieldwork.end.value)} · Publicação: {formatPollDate(poll.publicationDate.value)}</p></div>
    <a href={poll.provenance.resultUrl} target="_blank" rel="noopener noreferrer">Fonte da pesquisa <ExternalLink size={14} aria-hidden="true" /></a>
  </div>
}

function PollResearchDetails({ poll, candidateKeys }: { poll: StatePollScenario; candidateKeys: string[] }) {
  const remaining = poll.scenario.resultados.filter(result => !candidateKeys.includes(resultKey(result)))
  const facts = [
    ["Publicação", formatPollDate(poll.publicationDate.value)],
    ["Amostra", poll.sample.size.value === null ? "Não informada" : `${poll.sample.size.value.toLocaleString("pt-BR")} entrevistas`],
    ["Margem de erro", poll.marginErrorPp.value === null ? "Não informada" : `±${poll.marginErrorPp.value.toLocaleString("pt-BR")} pontos percentuais`],
    ["Confiança", poll.confidencePercent.value === null ? "Não informada" : formatPercent(poll.confidencePercent.value)],
    ["Método", poll.method.value ?? "Não informado"], ["Contratante", poll.contratante.value ?? "Não informado"],
    ["População", poll.sample.population.value ?? "Não informada"], ["Registro", poll.registration.code.value ?? "Não informado"],
  ]
  return <div data-pf-poll-details="">
    {remaining.length > 0 && <ul className={styles.additionalResults} aria-label={candidateKeys.length ? "Demais respostas da pesquisa" : "Resultados originais da pesquisa"}>{remaining.map((result, index) => {
      const value = publishedValue(poll, result)
      return <li key={`${resultKey(result)}:${index}`}><span>{result.rawLabel}{result.matchStatus === "indeterminado" && <small>Vínculo com candidatura não confirmado</small>}</span><strong>{value === null ? "Sem resultado" : formatPercent(value)}</strong></li>
    })}</ul>}
    <div className={styles.technical}>
      <div className={styles.quickFacts}><span><strong>{poll.sample.size.value?.toLocaleString("pt-BR") ?? "Amostra não informada"}</strong>{poll.sample.size.value !== null && " entrevistas"}</span><span>Margem: <strong>{poll.marginErrorPp.value === null ? "não informada" : `±${poll.marginErrorPp.value.toLocaleString("pt-BR")} p.p.`}</strong></span><span>Confiança: <strong>{poll.confidencePercent.value === null ? "não informada" : formatPercent(poll.confidencePercent.value)}</strong></span><span>{poll.method.value ?? "Método não informado"}</span></div>
      <details><summary>Ficha técnica e fonte <ChevronDown size={16} aria-hidden="true" /></summary><dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{poll.scenario.question.value && <p>Pergunta: {poll.scenario.question.value}</p>}<p>Consulta da fonte: {formatPollDate(poll.provenance.consultedAt.slice(0, 10))}.</p><div className={styles.sourceLinks}><a href={poll.provenance.resultUrl} target="_blank" rel="noopener noreferrer">Ler pesquisa ou matéria <ExternalLink size={14} aria-hidden="true" /></a>{poll.registration.url.value && <a href={poll.registration.url.value} target="_blank" rel="noopener noreferrer">Registro no TSE <ExternalLink size={14} aria-hidden="true" /></a>}</div></details>
    </div>
  </div>
}
