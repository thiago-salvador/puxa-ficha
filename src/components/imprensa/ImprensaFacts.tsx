import Link from "next/link"
import { buildImprensaFactGroups, IMPRENSA_FACT_CARD_ORDER, type ImprensaFactCardId, type ImprensaFacts as ImprensaFactsData } from "@/lib/imprensa-facts"
import { imprensaHref, type ImprensaRecorte } from "@/lib/imprensa-nav"
import styles from "./imprensa-shell.module.css"

const NUMBER = new Intl.NumberFormat("pt-BR")

/**
 * Cards de fatos da seção, em grupos de leitura (Justiça, Dinheiro, Chapas)
 * com a cor do grupo. O mesmo componente e a mesma redação servem à Sala
 * (Brasil), ao pacote da UF e à Mesa. Zero continua visível, sempre com o
 * denominador e a ressalva.
 */
export function ImprensaFacts({
  facts,
  scopeLabel,
  recorte,
  ids = IMPRENSA_FACT_CARD_ORDER,
  linkToMesa = true,
}: {
  facts: ImprensaFactsData
  scopeLabel: string
  recorte?: ImprensaRecorte
  ids?: readonly ImprensaFactCardId[]
  linkToMesa?: boolean
}) {
  const scope = `${scopeLabel} · ${NUMBER.format(facts.total)} ${facts.total === 1 ? "candidato" : "candidatos"}`
  if (facts.total === 0) {
    return (
      <div className={styles.tokens}>
        <p className={styles.factsScope}>{scopeLabel}</p>
        <p className={styles.factsEmpty}>Nenhum candidato neste recorte. Sem linhas, não há fatos a mostrar.</p>
      </div>
    )
  }
  const groups = buildImprensaFactGroups(facts, ids)
  return (
    <div className={styles.tokens}>
      <p className={styles.factsScope}>{scope}</p>
      <div className={styles.factGroups}>
        {groups.map((group) => (
          <section key={group.id} className={styles.factGroup} data-tone={group.tone} aria-labelledby={`fatos-${group.id}`}>
            <header className={styles.factGroupHead}>
              <h3 id={`fatos-${group.id}`} className={styles.factGroupTitle}>{group.title}</h3>
              <p className={styles.factGroupText}>{group.description}</p>
            </header>
            <ul className={styles.factsGrid} aria-label={`${group.title}: ${scopeLabel}`}>
              {group.cards.map((card) => (
                <li key={card.id} className={styles.factCard} data-fact={card.id}>
                  <p className={styles.factValue}>{NUMBER.format(card.value)}</p>
                  <p className={styles.factLabel}>{card.label}</p>
                  <p className={styles.factDetail}>{card.detail}</p>
                  <p className={styles.factCaveat}>{card.caveat}</p>
                  {linkToMesa && (
                    <Link className={styles.factLink} href={imprensaHref("/imprensa/mesa", recorte, card.mesaQuery)}>
                      {card.cta}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
