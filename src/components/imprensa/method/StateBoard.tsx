import { IMPRENSA_DATA_BUCKETS } from "@/lib/imprensa-facts"
import type { MethodStateBoardRow } from "@/lib/imprensa-frescor"
import shell from "../imprensa-shell.module.css"
import styles from "./method.module.css"

const NUMBER = new Intl.NumberFormat("pt-BR")

/** Quantos candidatos estão em cada um dos quatro estados, por tipo de dado. */
export function StateBoard({ rows, total }: { rows: readonly MethodStateBoardRow[]; total: number }) {
  return (
    <div
      className={`${styles.tableWrap} ${styles.board} ${shell.tokens}`}
      role="region"
      aria-label="Candidatos por estado do dado"
      tabIndex={0}
    >
      <table className={styles.table}>
        <caption className="sr-only">Candidatos por estado do dado, entre {NUMBER.format(total)} fichas publicadas</caption>
        <thead>
          <tr>
            <th scope="col">Dado</th>
            {IMPRENSA_DATA_BUCKETS.map((bucket) => (
              <th key={bucket.id} scope="col">
                <span className={styles.boardHead}>
                  <span className={shell.stateMark} data-bucket={bucket.id} aria-hidden="true" />
                  {bucket.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              {IMPRENSA_DATA_BUCKETS.map((bucket) => (
                <td key={bucket.id}>{NUMBER.format(row.counts[bucket.id])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
