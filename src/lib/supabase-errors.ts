/**
 * PostgREST retorna o codigo `PGRST116` quando uma consulta com `.single()`
 * nao encontra nenhuma linha. Esse caso e semanticamente distinto de uma
 * falha real de backend (timeout, rede caiu, 500 etc): ele representa "slug
 * inexistente" e deve virar HTTP 404, nao uma pagina degradada com 200.
 *
 * Referencia: https://docs.postgrest.org/en/latest/errors.html#errors
 */
export function isSupabaseNoRowError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false
  return (error as { code?: unknown }).code === "PGRST116"
}

/**
 * `42703` (undefined_column): a consulta pediu coluna que o schema remoto ainda
 * não tem. Acontece quando o código é promovido antes da migration que cria a
 * coluna; só leituras com conjunto de colunas pré-migration conhecido podem
 * tratar esse código como recuperável.
 */
export function isSupabaseUndefinedColumnError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false
  return (error as { code?: unknown }).code === "42703"
}
