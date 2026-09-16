/**
 * Contrato de schema que o ingest TSE assume: patrimônio, ausência oficial e
 * verificação de financiamento são únicos por contexto TSE (SQ, e UF no caso
 * da verificação). Sem as migrations abaixo o PostgREST devolve 42P10 no
 * upsert ou coluna inexistente, sem dizer o que falta.
 */

type ContextTable = "patrimonio" | "patrimonio_ausencia_oficial" | "financiamento_verificacoes"

const CONTEXT_MIGRATION: Record<ContextTable, { migration: string; columns: string }> = {
  patrimonio: {
    migration: "20260915220000",
    columns: "ano_arquivo,sq_candidato,uf_candidatura,cargo_candidatura,data_eleicao,tipo_eleicao",
  },
  patrimonio_ausencia_oficial: {
    migration: "20260915220000",
    columns: "ano_arquivo,sq_candidato,uf_candidatura,cargo_candidatura,data_eleicao,tipo_eleicao",
  },
  financiamento_verificacoes: {
    migration: "20260915210000",
    columns: "sq_candidato,uf_candidatura,cargo_candidatura",
  },
}

/** 42P10: ON CONFLICT sem índice único; 42703/PGRST204: coluna inexistente. */
const PENDING_MIGRATION_CODES = new Set(["42P10", "42703", "PGRST204"])

interface SchemaError {
  code?: string
  message?: string
}

export function pendingContextMigrationError(error: SchemaError | null | undefined, table: ContextTable): Error | null {
  if (!error?.code || !PENDING_MIGRATION_CODES.has(error.code)) return null
  const { migration } = CONTEXT_MIGRATION[table]
  return new Error(
    `${table}: migration ${migration} pendente; o ingest TSE grava por contexto TSE e o banco respondeu ${error.code} (${error.message ?? "sem mensagem"})`,
  )
}

interface ProbeClient {
  from(table: string): {
    select(columns: string): { limit(count: number): PromiseLike<{ error: SchemaError | null }> }
  }
}

/**
 * Sonda, antes de qualquer escrita, as colunas de contexto das tabelas que o
 * ingest vai gravar. Coluna ausente vira a migration pendente nomeada; outro
 * erro (timeout, permissão) sobe intacto.
 */
export async function assertTseContextSchemaReady(
  client: ProbeClient,
  scope: { patrimonio: boolean; financiamento: boolean },
): Promise<void> {
  const tables: ContextTable[] = [
    ...(scope.patrimonio ? (["patrimonio", "patrimonio_ausencia_oficial"] as const) : []),
    ...(scope.financiamento ? (["financiamento_verificacoes"] as const) : []),
  ]
  for (const table of tables) {
    const { error } = await client.from(table).select(CONTEXT_MIGRATION[table].columns).limit(1)
    if (!error) continue
    throw pendingContextMigrationError(error, table) ?? error
  }
}
