import { formatPartyPublicLabel, isUncertainParty } from "@/lib/party-utils"

/**
 * Centraliza a sanitizacao publica de partido em payloads que cruzam para client/RSC.
 *
 * Pos-Bloco 1 (review 2026-04-24), 4 fronteiras pontuais aplicavam essa transformacao
 * em CandidatoFichaView, embed/page.tsx, uf/[uf]/page.tsx e preview/candidato/[slug]/page.tsx.
 * Esta funcao e a fonte unica que substitui as 4: aplicada nos resources de
 * `src/lib/api.ts` ANTES de o payload sair em qualquer rota publica, ela garante que:
 *  - `partido_sigla = "incerto"` (ou variantes uncertain) vira string vazia no payload publico,
 *    mesma semantica que `formatPartyPublicLabel` retorna; preserva back-compat com componentes
 *    downstream que ainda chamam `.toLowerCase()`/`.includes()` defensivamente sobre o campo;
 *  - partidos reais sao canonicalizados para o display label publico (ex.: PODEMOS -> PODE),
 *    espelhando o que `CandidatoFichaView` ja fazia para `data-pf-hero-party`;
 *  - `partido_atual` recebe o mesmo tratamento;
 *  - `situacao_candidatura` NAO e tocada (campo interno legitimo).
 *
 * Componentes downstream (RankingTable, ComparadorPanel, EmbedWidget, etc.) podem
 * continuar chamando `formatPartyPublicLabel` defensivamente -- aplicacao do helper
 * sobre valor ja sanitizado e idempotente (string vazia segue retornando string vazia).
 */
export function sanitizePublicPartyValue(
  value: string | null | undefined,
): string {
  if (isUncertainParty(value)) return ""
  return formatPartyPublicLabel(value)
}

/**
 * Aplica `sanitizePublicPartyValue` a `partido_sigla` e/ou `partido_atual` mantendo
 * o restante do row intocado. Usa o tipo `T` para preservar a forma do objeto.
 *
 * Importante: NAO altera referencia in-place; retorna shallow clone.
 */
export function sanitizePublicPartyFields<
  T extends { partido_sigla?: string | null; partido_atual?: string | null },
>(row: T): T {
  const next: T = { ...row }
  if ("partido_sigla" in next) {
    // Cast: o tipo do campo no DB/Supabase aceita `string | null`; aqui devolvemos
    // sempre `string` (vazia para incerto) para preservar back-compat com chamadas
    // downstream tipo `partido_sigla.toLowerCase()` em componentes existentes.
    next.partido_sigla = sanitizePublicPartyValue(next.partido_sigla) as T["partido_sigla"]
  }
  if ("partido_atual" in next) {
    next.partido_atual = sanitizePublicPartyValue(next.partido_atual) as T["partido_atual"]
  }
  return next
}

/**
 * Sanitizacao de uma lista; util para resources que retornam arrays.
 */
export function sanitizePublicPartyFieldsList<
  T extends { partido_sigla?: string | null; partido_atual?: string | null },
>(rows: readonly T[]): T[] {
  return rows.map((row) => sanitizePublicPartyFields(row))
}
