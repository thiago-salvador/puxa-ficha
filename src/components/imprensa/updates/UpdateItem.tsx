import Link from "next/link"
import { formatUpdateValue } from "@/lib/verified-candidate-updates"
import { formatFullDate, updateFieldLabel, type UpdateRow } from "./updates-view"
import styles from "./updates.module.css"

function place(row: UpdateRow): string {
  if (!row.cargo) return "Cargo e UF indisponíveis"
  if (row.cargo === "Presidente") return "Presidente · Brasil"
  return row.uf ? `${row.cargo} · ${row.uf}` : row.cargo
}

/** Uma mudança: quem, onde, qual campo, antes e depois, quando e a fonte. */
export function UpdateItem({ row }: { row: UpdateRow }) {
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <div>
          <h3 className={styles.name}><Link href={`/candidato/${row.candidate_slug}`}>{row.nome}</Link></h3>
          <p className={styles.meta}>{place(row)}</p>
        </div>
        <p className={styles.detected}>
          Detectada em <time dateTime={row.detected_at}>{formatFullDate(row.detected_at)}</time>
        </p>
      </div>
      <p className={styles.change}>
        <span className={styles.fieldName}>{updateFieldLabel(row.field)}, eleição de {row.year}</span>
        <span className={styles.before}><span className="sr-only">Antes: </span>{formatUpdateValue(row, row.before_value)}</span>
        <span className={styles.arrow} aria-hidden="true">→</span>
        <span className={styles.after}><span className="sr-only">Depois: </span>{formatUpdateValue(row, row.after_value)}</span>
      </p>
      <div className={styles.itemLinks}>
        <a href={row.source_url} target="_blank" rel="noreferrer">
          Fonte oficial no TSE<span className="sr-only"> (abre em nova aba)</span><span aria-hidden="true">&nbsp;↗</span>
        </a>
        <Link href={`/candidato/${row.candidate_slug}`}>Ver ficha</Link>
      </div>
    </li>
  )
}
