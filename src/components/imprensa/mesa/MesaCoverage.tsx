// cspell:words homonimos
import { IMPRENSA_DATA_BUCKETS } from "@/lib/imprensa-facts"
import shell from "@/components/imprensa/imprensa-shell.module.css"
import styles from "@/app/(site)/imprensa/imprensa.module.css"
import type { MesaCoverageFamily } from "./mesa-model"

const NUMBER = new Intl.NumberFormat("pt-BR")

function pct(part: number, total: number): string {
  return total ? `${((part / total) * 100).toFixed(2)}%` : "0%"
}

/**
 * "O que ainda não sabemos": uma barra por família, com o denominador e a
 * contagem de cada estado escrita ao lado. A cor nunca é a única pista.
 */
export function MesaCoverage({ families, homonimos }: { families: MesaCoverageFamily[]; homonimos: number }) {
  return (
    <div className={shell.tokens}>
      <ul className={styles.coverage}>
        {families.map((family) => (
          <li key={family.id} className={styles.coverageRow}>
            <div className={styles.coverageHead}>
              <h3>{family.label}</h3>
              <p className={styles.coverageTotal}>{NUMBER.format(family.total)} {family.total === 1 ? "candidato" : "candidatos"}</p>
            </div>
            <div className={styles.bar} aria-hidden="true">
              {IMPRENSA_DATA_BUCKETS.map((bucket) => family.counts[bucket.id] > 0 && (
                <span key={bucket.id} className={styles.barSegment} data-bucket={bucket.id} style={{ width: pct(family.counts[bucket.id], family.total) }} />
              ))}
            </div>
            <ul className={styles.coverageCounts}>
              {IMPRENSA_DATA_BUCKETS.map((bucket) => (
                <li key={bucket.id}>
                  <span className={shell.stateMark} data-bucket={bucket.id} aria-hidden="true" />
                  <span>{bucket.label}</span>
                  <strong>{NUMBER.format(family.counts[bucket.id])}</strong>
                </li>
              ))}
            </ul>
            {family.id === "processos" && (
              <p className={styles.coverageNote}>
                {homonimos === 0
                  ? "Nenhuma busca deste recorte achou nome igual sem confirmação da pessoa."
                  : `${NUMBER.format(homonimos)} ${homonimos === 1 ? "busca achou" : "buscas acharam"} um nome igual sem um segundo dado oficial que confirme a pessoa. A busca foi feita, mas não publicamos sem confirmar que é a mesma pessoa. Isso protege o leitor de atribuir um processo a um homônimo.`}
              </p>
            )}
            {family.id === "tcu" && family.counts.parcial > 0 && (
              <p className={styles.coverageNote}>Registro do TCU em revisão editorial ainda não entra nos destaques.</p>
            )}
            {family.id === "sites" && (
              <p className={styles.coverageNote}>Sites são os endereços declarados no arquivo oficial do TSE, sem afirmar que são todos os sites da pessoa.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
