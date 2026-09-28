import Link from "next/link"
import { getImprensaUfName } from "@/lib/imprensa-uf-pack"
import type { UpdatesFacets, UpdatesQuery } from "./updates-view"
import styles from "./updates.module.css"

/**
 * Filtros por UF, cargo e tipo de mudança. Formulário GET: funciona sem
 * JavaScript e o resultado fica no link, que dá para copiar e mandar.
 */
export function UpdatesFilters({ query, facets }: { query: UpdatesQuery; facets: UpdatesFacets }) {
  return (
    <form className={styles.filters} method="get" action="/imprensa/atualizacoes" aria-label="Filtrar mudanças">
      <div className={styles.field}>
        <label htmlFor="atualizacoes-uf">Estado</label>
        <select id="atualizacoes-uf" name="uf" defaultValue={query.uf ?? ""}>
          <option value="">Todos os estados</option>
          {facets.uf.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value} · {getImprensaUfName(option.value)} ({option.count})
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="atualizacoes-cargo">Cargo</label>
        <select id="atualizacoes-cargo" name="cargo" defaultValue={query.cargo ?? ""}>
          <option value="">Todos os cargos</option>
          {facets.cargo.map((option) => (
            <option key={option.value} value={option.value}>{option.value} ({option.count})</option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="atualizacoes-tipo">Tipo de mudança</label>
        <select id="atualizacoes-tipo" name="tipo" defaultValue={query.tipo ?? ""}>
          <option value="">Todos os tipos</option>
          {facets.tipo.map((option) => (
            <option key={option.value} value={option.value}>{option.label} ({option.count})</option>
          ))}
        </select>
      </div>
      <div className={styles.actions}>
        <button className={styles.submit} type="submit">Filtrar</button>
        <Link className={styles.reset} href="/imprensa/atualizacoes">Limpar</Link>
      </div>
    </form>
  )
}
