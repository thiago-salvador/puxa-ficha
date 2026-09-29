import { IMPRENSA_DATA_BUCKETS } from "@/lib/imprensa-facts"
import styles from "./imprensa-shell.module.css"

/**
 * Legenda dos quatro estados do dado, com a mesma palavra e a mesma cor em
 * toda a seção. `detailed` mostra uma frase por estado (uso em Como coletamos).
 */
export function DataStateLegend({ detailed = false }: { detailed?: boolean }) {
  if (detailed) {
    return (
      <ul className={`${styles.tokens} ${styles.legendList}`} aria-label="Estados do dado">
        {IMPRENSA_DATA_BUCKETS.map((bucket) => (
          <li key={bucket.id} className={styles.legendItem}>
            <span className={styles.stateMark} data-bucket={bucket.id} aria-hidden="true" />
            <div>
              <span className={styles.legendLabel}>{bucket.label}</span>
              <p>{bucket.description}</p>
            </div>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className={`${styles.tokens} ${styles.legend}`} aria-label="Estados do dado">
      {IMPRENSA_DATA_BUCKETS.map((bucket) => (
        <li key={bucket.id} className={styles.legendItem}>
          <span className={styles.stateMark} data-bucket={bucket.id} aria-hidden="true" />
          <span className={styles.legendLabel}>{bucket.label}</span>
        </li>
      ))}
    </ul>
  )
}
