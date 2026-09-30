import { safeHref } from "@/lib/utils"
import {
  METHOD_SITUACAO_LABELS,
  methodCadenceLabel,
  methodDeadlineLabel,
  type MethodSourceRow,
} from "@/lib/imprensa-frescor"
import styles from "./method.module.css"

const FULL_DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })

/** Uma linha por fonte: o que traz, última coleta bem-sucedida, ritmo e situação. */
export function SourcesTable({ rows }: { rows: readonly MethodSourceRow[] }) {
  return (
    <div className={`${styles.tableWrap} ${styles.stack}`}>
      <table className={styles.table}>
        <caption className="sr-only">Fontes das fichas e a última coleta bem-sucedida de cada uma</caption>
        <thead>
          <tr>
            <th scope="col">Fonte</th>
            <th scope="col">O que traz</th>
            <th scope="col">Última coleta bem-sucedida</th>
            <th scope="col">Ritmo previsto</th>
            <th scope="col">Situação</th>
            <th scope="col">Fonte oficial</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ source, situacao, ultimaColeta }) => {
            const deadline = methodDeadlineLabel(source.maxAgeHours)
            return (
              <tr key={source.id}>
                <th scope="row">{source.label}</th>
                <td data-label="O que traz" className={styles.wideCell}>{source.traz}</td>
                <td data-label="Última coleta bem-sucedida" className={styles.date}>
                  {ultimaColeta ? <time dateTime={ultimaColeta}>{FULL_DATE.format(new Date(ultimaColeta))}</time> : "Sem registro"}
                </td>
                <td data-label="Ritmo previsto">
                  {methodCadenceLabel(source.cadence)}
                  {deadline ? <span className={styles.cellSub}>{deadline}</span> : null}
                </td>
                <td data-label="Situação">
                  <span className={styles.situacao} data-situacao={situacao}>
                    <span className={styles.dot} aria-hidden="true" />
                    {METHOD_SITUACAO_LABELS[situacao]}
                  </span>
                </td>
                <td data-label="Fonte oficial">
                  <a className={styles.sourceLink} href={safeHref(source.authorityUrl) ?? undefined} target="_blank" rel="noreferrer">
                    Abrir<span className="sr-only"> {source.label} (abre em nova aba)</span>
                    <span aria-hidden="true">&nbsp;↗</span>
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
