import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { buildImprensaNav, type ImprensaNavId } from "@/lib/imprensa-nav"
import styles from "./sala-sections.module.css"

type SalaSectionId = Exclude<ImprensaNavId, "sala">

/** Dado vivo de cada página, já formatado pela Sala. Página sem dado fica só com a descrição. */
export type SalaSectionLive = Partial<Record<SalaSectionId, string>>

/**
 * Cards das páginas da seção, lidos da mesma fonte da barra de abas. A Sala
 * fica de fora porque o bloco já está nela.
 */
export function SalaSectionsNav({ live = {} }: { live?: SalaSectionLive }) {
  const items = buildImprensaNav().filter((item): item is typeof item & { id: SalaSectionId } => item.id !== "sala")
  return (
    <nav aria-label="Páginas da sala de imprensa" className={styles.nav}>
      <ul className={styles.grid}>
        {items.map((item) => {
          const titleId = `nesta-sala-${item.id}-titulo`
          const textId = `nesta-sala-${item.id}-texto`
          const value = live[item.id]
          return (
            // O Kit herda a âncora #kit que a Sala já publicava.
            <li key={item.id} id={item.id === "kit" ? "kit" : undefined} className={styles.cell}>
              <Link href={item.href} className={styles.card} aria-labelledby={titleId} aria-describedby={textId}>
                <span className={styles.head}>
                  <span id={titleId} className={styles.title}>{item.label}</span>
                  <ArrowRight aria-hidden="true" className={styles.arrow} />
                </span>
                <span id={textId} className={styles.text}>
                  {item.description}
                  {value ? <span className={styles.live}>{value}</span> : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
