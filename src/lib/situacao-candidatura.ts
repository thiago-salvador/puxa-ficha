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
 * Por que os tres primeiros, e nao mais, ate 03/09/2026: o pacote consulta_cand
 * do TSE para 2026 traz `#NE` em 20.456 de 20.456 candidaturas. A fonte nao
 * distingue estado nenhum dentro do universo registrado, entao qualquer valor a
 * mais seria distinção inventada.
 *
 * Por que os quatro de julgamento entraram em 03/09/2026: a premissa acima
 * estava certa sobre o ARQUIVO errado. O julgamento nao vive em `consulta_cand`,
 * vive em `consulta_cand_complementar`, outro pacote dos mesmos dados abertos,
 * na coluna `DS_SITUACAO_JULGAMENTO`. Lido em 03/09/2026 e cruzado por
 * SQ_CANDIDATO com as 206 fichas publicáveis que tem SQ: 134 DEFERIDO, 66
 * AGUARDANDO JULGAMENTO, 3 INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO, 2
 * DEFERIDO EM PRAZO RECURSAL OU COM RECURSO, 1 INDEFERIDO. Segunda fonte
 * oficial independente (DivulgaCandContas, 28 UFs no mesmo dia) concorda em 205
 * das 206. Cada valor abaixo espelha uma `descricaoSituacao` que a fonte emite;
 * nenhum e agrupado com outro, porque "deferido" e "deferido com recurso" sao
 * fatos jurídicos distintos.
 *
 * Continuam de fora, e cada ausência segue sendo decisão: `cassado`, `renuncia`,
 * `falecido` e afins entram quando o TSE emitir o código para esta coorte, com a
 * mesma fricção de PR deliberada.
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
  /** Registro deferido. `descricaoSituacao` "Deferido", `DS_SITUACAO_JULGAMENTO` DEFERIDO (cod 2). */
  "deferido",
  /** Deferido com recurso pendente. `DS_SITUACAO_JULGAMENTO` DEFERIDO EM PRAZO RECURSAL OU COM RECURSO (cod 16). */
  "deferido com recurso",
  /**
   * Registro indeferido. `DS_SITUACAO_JULGAMENTO` INDEFERIDO (cod 14). Nao e
   * sinonimo de fora da urna: o TSE pode seguir classificando a candidatura como
   * "Concorrendo" em `descricaoTotalizacao`, e a ficha precisa poder dizer as
   * duas coisas.
   */
  "indeferido",
  /** `DS_SITUACAO_JULGAMENTO` INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO (cod 4). */
  "indeferido com recurso",
] as const

/**
 * Os quatro estados que so existem depois de julgamento publicado. Consumido por
 * `candidatura-proveniencia.ts` para decidir quando um julgamento conhecido vence
 * um snapshot de chapa que diz apenas "situação não informada".
 */
export const SITUACAO_JULGAMENTO_PUBLICADO = [
  "deferido",
  "deferido com recurso",
  "indeferido",
  "indeferido com recurso",
] as const

/** Os dois estados de julgamento em que o registro foi negado. */
export const SITUACAO_JULGAMENTO_INDEFERIDO = ["indeferido", "indeferido com recurso"] as const
