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
