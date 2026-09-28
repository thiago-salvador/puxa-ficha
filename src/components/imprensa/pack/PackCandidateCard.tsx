// cspell:words justica
import Link from "next/link"
import type { ImprensaPageRow } from "@/lib/imprensa-cache"
import { candidateCitation, packCardLines, packChapaLine } from "@/lib/imprensa-uf-pack"
import { CiteBox } from "@/components/imprensa/CiteBox"
import shell from "@/components/imprensa/imprensa-shell.module.css"
import styles from "./pack.module.css"

/**
 * Card de um candidato no pacote: patrimônio, processos, sanções, cota (quando
 * publicada) e vice ou suplentes. Cada linha leva ao dado na ficha.
 */
export function PackCandidateCard({ row, generatedAt }: { row: ImprensaPageRow; generatedAt: string }) {
  const lines = packCardLines(row)
  const chapa = packChapaLine(row)
  return (
    <article className={styles.card} data-pack-candidate={row.slug} data-cargo={row.cargo}>
      <p className={styles.cardMeta}>{row.cargo} · {row.partido ?? "partido sem dado"}</p>
      <h4 className={styles.cardName}><Link href={row.fichaUrl}>{row.nome}</Link></h4>
      <dl className={styles.lines}>
        {lines.map((line) => (
          <div key={line.id} className={styles.line} data-line={line.id} data-bucket={line.bucket}>
            <dt className={styles.lineLabel}>{line.label}</dt>
            <dd className={styles.lineBody}>
              <Link className={styles.lineValue} href={`${row.fichaUrl}?tab=${line.tab}`}>
                <span className={shell.stateMark} data-bucket={line.bucket} aria-hidden="true" />
                <span>{line.value}</span>
              </Link>
              {line.detail && <p className={styles.lineDetail}>{line.detail}</p>}
            </dd>
          </div>
        ))}
        <div className={styles.line} data-line="chapa" data-bucket={chapa.bucket}>
          <dt className={styles.lineLabel}>{chapa.label}</dt>
          <dd className={styles.lineBody}>
            <span className={styles.lineValue}>
              <span className={shell.stateMark} data-bucket={chapa.bucket} aria-hidden="true" />
              <span>{chapa.value}</span>
            </span>
          </dd>
        </div>
      </dl>
      <div className={styles.cardActions}>
        <Link href={row.fichaUrl}>Ficha</Link>
        <Link href={`${row.fichaUrl}?tab=justica`}>Justiça</Link>
        <a href={`/api/card/${encodeURIComponent(row.slug)}?format=feed&v=2`} rel="noreferrer">Card</a>
        <details className={styles.citeToggle}>
          <summary>Citar</summary>
          <CiteBox citation={candidateCitation(row, generatedAt)} label={`Como citar: ${row.nome}`} />
        </details>
      </div>
    </article>
  )
}
