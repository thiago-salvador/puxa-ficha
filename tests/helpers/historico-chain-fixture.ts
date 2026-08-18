/**
 * Lightweight Supabase chain mock for historico_politico.
 * Exercises the same SELECT/UPDATE chain shapes as the real backfill script.
 */

interface RawRow {
  id: string
  candidato_id: string
  cargo_canonico: string
  periodo_inicio: number
  periodo_fim: number | null
  observacoes: string | null
  tipo_evento: string | null
  candidatos: { slug: string }
}

export interface ChainUpdate {
  id: string
  payload: Record<string, unknown>
}

export class HistoricoChainFixture {
  readonly updates: ChainUpdate[] = []
  readonly queryLog: string[] = []

  constructor(private rows: RawRow[]) {}

  createClient() {
    return { from: (table: string) => this.handleFrom(table) }
  }

  private handleFrom(table: string) {
    if (table !== "historico_politico") {
      throw new Error(`Unexpected table: ${table}`)
    }
    this.queryLog.push(`from(${table})`)
    return new ChainBuilder(this)
  }

  getRows() {
    return this.rows
  }

  applyUpdate(id: string, payload: Record<string, unknown>) {
    this.updates.push({ id, payload })
    const row = this.rows.find((r) => r.id === id)
    if (row) Object.assign(row, payload)
  }
}

type FilterFn = (row: RawRow) => boolean

class ChainBuilder {
  private mode: "select" | "update" = "select"
  private columns: string | null = null
  private filters: FilterFn[] = []
  private ordering: { field: string; asc: boolean } | null = null
  private updatePayload: Record<string, unknown> | null = null

  constructor(private fixture: HistoricoChainFixture) {}

  select(cols: string) {
    this.mode = "select"
    this.columns = cols
    this.fixture.queryLog.push(`select(${cols})`)
    return this
  }

  update(payload: Record<string, unknown>) {
    this.mode = "update"
    this.updatePayload = payload
    this.fixture.queryLog.push(`update(${JSON.stringify(payload)})`)
    return this
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => (row as unknown as Record<string, unknown>)[field] === value)
    this.fixture.queryLog.push(`eq(${field},${value})`)
    return this
  }

  not(field: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => (row as unknown as Record<string, unknown>)[field] !== null && (row as unknown as Record<string, unknown>)[field] !== undefined)
    }
    this.fixture.queryLog.push(`not(${field},${operator},${value})`)
    return this
  }

  order(field: string, opts?: { ascending?: boolean }) {
    this.ordering = { field, asc: opts?.ascending !== false }
    this.fixture.queryLog.push(`order(${field},asc=${this.ordering.asc})`)
    return this
  }

  then<T, U>(
    onfulfilled?: ((v: { data: unknown; error: null }) => T) | null,
    onrejected?: ((r: unknown) => U) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute() {
    if (this.mode === "update") {
      const matching = this.fixture.getRows().filter((r) => this.filters.every((f) => f(r)))
      for (const row of matching) {
        this.fixture.applyUpdate(row.id, this.updatePayload!)
      }
      return { data: matching, error: null }
    }

    let rows = this.fixture.getRows().filter((r) => this.filters.every((f) => f(r)))

    if (this.ordering) {
      const { field, asc } = this.ordering
      rows = [...rows].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[field]
        const bv = (b as unknown as Record<string, unknown>)[field]
        if (av === bv) return 0
        const cmp = (av as number) < (bv as number) ? -1 : 1
        return asc ? cmp : -cmp
      })
    }

    return { data: rows, error: null }
  }
}
