import Link from "next/link"
import { buildImprensaNav, formatImprensaStamp, type ImprensaNavId, type ImprensaRecorte } from "@/lib/imprensa-nav"
import styles from "./imprensa-shell.module.css"

/** Barra da seção /imprensa, com a página atual marcada e o selo de data do dataset. */
export function ImprensaSubnav({
  current,
  recorte,
  generatedAt,
}: {
  current: ImprensaNavId
  recorte?: ImprensaRecorte
  generatedAt?: string | null
}) {
  const items = buildImprensaNav(recorte)
  const stamp = formatImprensaStamp(generatedAt)
  return (
    <div className={`${styles.tokens} ${styles.subnav}`}>
      <div className={styles.subnavInner}>
        <nav className={styles.subnavScroll} aria-label="Seções da imprensa">
          <ul className={styles.subnavList}>
            {items.map((item) => (
              <li key={item.id}>
                <Link className={styles.subnavLink} href={item.href} aria-current={item.id === current ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className={styles.stamp}>
          {stamp && generatedAt ? <time dateTime={generatedAt}>{stamp}</time> : "Data dos dados indisponível"}
        </p>
      </div>
    </div>
  )
}
