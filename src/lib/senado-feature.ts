/** Feature gate for the local Senado surface.
 *
 * The default is deliberately closed. Public routes, links and generic
 * candidate consumers must opt in together so an unpublished Senate cohort
 * cannot leak through a broad query.
 */
export function isSenadoEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.SENADO_ENABLED?.trim().toLowerCase() === "true"
}

export function shouldExposeCargo(
  cargo: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return cargo !== "Senador" || isSenadoEnabled(env)
}

export const SENADO_SOURCE_URL =
  "https://www.tse.jus.br/comunicacao/noticias/2026/Setembro/faltam-21-dias-conheca-os-cargos-em-disputa-nas-eleicoes-2026"
