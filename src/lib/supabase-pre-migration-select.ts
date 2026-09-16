import { isSupabaseUndefinedColumnError } from "./supabase-errors"

interface SelectResult<Row> {
  data: Row[] | null
  error: unknown
}

const warnedRelations = new Set<string>()

function parseColumns(columns: string): string[] {
  return columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
}

/**
 * Leitura tolerante à janela entre promover código e aplicar migration.
 *
 * Tenta primeiro `currentColumns`. Se o PostgREST responder `42703` (coluna
 * inexistente), refaz a consulta UMA vez com `preMigrationColumns`, que precisa
 * ser o conjunto já existente em produção, e devolve `null` nas colunas que o
 * schema antigo não tem. Qualquer outro erro, inclusive um `42703` no retry,
 * volta intacto para o chamador decidir (fail-closed onde ele já era).
 */
export async function selectWithPreMigrationColumns<Row extends Record<string, unknown>>(
  relation: string,
  currentColumns: string,
  preMigrationColumns: string,
  run: (columns: string) => PromiseLike<SelectResult<Row>>,
): Promise<SelectResult<Row>> {
  const current = await run(currentColumns)
  if (!isSupabaseUndefinedColumnError(current.error)) return current

  if (!warnedRelations.has(relation)) {
    warnedRelations.add(relation)
    const message = (current.error as { message?: unknown }).message
    console.warn(
      `${relation}: 42703 (${typeof message === "string" ? message : "coluna inexistente"}); ` +
        "migration de schema pendente, usando colunas pré-migration com campos novos nulos.",
    )
  }

  const legacy = await run(preMigrationColumns)
  if (legacy.error || !legacy.data) return legacy

  const legacySet = new Set(parseColumns(preMigrationColumns))
  const missing = parseColumns(currentColumns).filter((column) => !legacySet.has(column))
  return {
    data: legacy.data.map((row) => {
      const filled: Record<string, unknown> = { ...row }
      for (const column of missing) filled[column] = null
      return filled as Row
    }),
    error: null,
  }
}
