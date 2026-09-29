import type { ReactNode } from "react"
import styles from "./method.module.css"

/** Seção numerada das páginas O que mudou e Como coletamos. */
export function MethodSection({ id, num, title, children }: { id: string; num: string; title: string; children: ReactNode }) {
  const titleId = `${id}-title`
  return (
    <section id={id} className={styles.section} aria-labelledby={titleId}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionNum} aria-hidden="true">{num}</span>
        <h2 id={titleId} className={styles.sectionTitle}>{title}</h2>
      </div>
      {children}
    </section>
  )
}
