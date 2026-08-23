/**
 * Vocabulário fechado de `candidatos.situacao_candidatura`.
 *
 * Ate 16/08/2026 o campo era TEXT livre e o banco guardava onze grafias para
 * tres sentidos, porque cada rodada de ingestão inventou a própria redação. A
 * migration 20260816230000 normalizou os valores e criou o CHECK
 * `candidatos_situacao_candidatura_dominio`. Esta lista e o lado TypeScript do
 * mesmo domínio: mudou aqui, muda no CHECK na MESMA PR, e vice-versa. O teste
 * `tests/situacao-candidatura-dominio.test.ts` compara os dois por parse, para
 * a divergência falhar no CI em vez de aparecer no ar.
 *
 * Por que exatamente estes tres, e nao mais: o pacote consulta_cand do TSE para
 * 2026 traz `#NE` em 20.456 de 20.456 candidaturas. A fonte nao distingue estado
 * nenhum dentro do universo registrado, entao qualquer valor a mais seria
 * distinção inventada. `deferido` e `indeferido` entram no dia em que o TSE
 * publicar julgamento, numa PR deliberada.
 *
 * `null` e valor legitimo e nao esta nesta lista de proposito: significa
 * ausência de informação, o CHECK deixa passar por construcao, e nenhuma ficha
 * publicável pode ficar assim (regra em `published-consistency.ts`).
 *
 * Modulo puro: sem import de next/*, server-only, fs ou Supabase.
 */

export const SITUACAO_CANDIDATURA_DOMINIO = [
  /** Consta pedido de registro na base oficial do TSE, sem julgamento publicado. */
  "aguardando julgamento",
  /** Declarada publicamente e apurada pela equipe editorial, sem vinculo com pedido de registro neste snapshot. */
  "candidatura declarada",
  /** A equipe apurou e as fontes divergem. Estado editorial, nao "ainda nao checado". */
  "incerto",
] as const

export type SituacaoCandidatura = (typeof SITUACAO_CANDIDATURA_DOMINIO)[number]
