/**
 * Coorte do comparador a partir dos slugs pedidos em `/comparar?c1=...&c2=...`.
 *
 * Motivo (auditoria de integridade 2026-07-24): a pagina lia os slugs da query
 * string para pre-selecionar candidatos, mas carregava a lista chamando
 * `getCandidatosComparaveisResource()` SEM argumento, que cai no default
 * "Presidente". Link compartilhado de dois governadores abria com os 13
 * presidenciáveis e nenhum dos dois selecionados, porque
 * `resolveInitialSelectedIds` nao encontrava os slugs na lista carregada.
 *
 * Mesmo padrao de `src/app/(site)/rankings/[slug]/page.tsx`: normalizar o
 * recorte pedido na URL e passar cargo (e estado quando aplicavel) ao resource,
 * em vez de deixar o default decidir.
 *
 * Modulo puro (sem rede e sem Supabase) para ser testável: a pagina resolve os
 * metadados e passa as linhas ja carregadas para ca.
 */

/** Slug publico do Puxa Ficha: minusculas, dígitos e hífen. */
const SLUG_PARAM_RE = /^[a-z0-9][a-z0-9-]{0,79}$/

export interface ComparadorCohortInput {
  cargo_disputado?: string | null
  estado?: string | null
}

export interface ComparadorCohort {
  cargo?: string
  estado?: string
}

/** Descarta lixo de query string antes de qualquer consulta ao banco. */
export function isComparadorSlugParam(value: string | null | undefined): boolean {
  return typeof value === "string" && SLUG_PARAM_RE.test(value)
}

/**
 * Decide a coorte a partir dos metadados dos slugs pedidos.
 *
 * Regras:
 *  - o cargo vem do PRIMEIRO slug que resolveu (a ordem da URL e a intenção do usuário);
 *  - o estado so restringe quando o cargo e "Governador" E todos os slugs desse
 *    mesmo cargo sao do mesmo estado. Comparar governadores de UFs diferentes
 *    continua funcionando, com coorte nacional;
 *  - nenhum slug resolvido devolve `{}`, e a pagina mantem o comportamento
 *    default anterior.
 */
export function resolveComparadorCohort(
  metas: readonly (ComparadorCohortInput | null | undefined)[],
): ComparadorCohort {
  const resolvidos = metas.filter(
    (meta): meta is ComparadorCohortInput => Boolean(meta?.cargo_disputado?.trim()),
  )
  const cargo = resolvidos[0]?.cargo_disputado?.trim()
  if (!cargo) return {}

  const mesmoCargo = resolvidos.filter((meta) => meta.cargo_disputado?.trim() === cargo)
  const ufs = mesmoCargo
    .map((meta) => meta.estado?.trim().toUpperCase())
    .filter((uf): uf is string => Boolean(uf))
  const ufsDistintas = new Set(ufs)

  // Restringe por UF apenas quando TODOS os slugs desse cargo declaram estado e
  // e o mesmo. Se um deles nao tem estado, restringir sumiria com ele da lista.
  const estado =
    cargo === "Governador" && ufsDistintas.size === 1 && ufs.length === mesmoCargo.length
      ? [...ufsDistintas][0]
      : undefined

  return { cargo, estado }
}

/**
 * Resolve os metadados somente para slugs públicos válidos e aplica a mesma
 * regra de coorte usada pela página e pelas imagens sociais do comparador.
 */
export async function resolveComparadorCohortFromSlugs(
  slugs: readonly (string | null | undefined)[],
  loadMetadata: (slug: string) => Promise<ComparadorCohortInput | null | undefined>,
): Promise<ComparadorCohort> {
  const candidateSlugs = slugs.filter(
    (slug): slug is string => isComparadorSlugParam(slug),
  )
  if (candidateSlugs.length === 0) return {}

  return resolveComparadorCohort(await Promise.all(candidateSlugs.map(loadMetadata)))
}
