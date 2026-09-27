/**
 * Regras de data de nascimento compartilhadas pelos ingests.
 *
 * Duas formas de data não são nascimento de ninguém e não podem chegar à ficha
 * vindas de fonte secundária:
 *
 * - sentinela: ano anterior a 1910. A API do Senado devolve `1900-01-01` para
 *   parlamentar sem data cadastrada (senador 3613, lido em 26/09/2026), e esse
 *   valor chegou a uma ficha pública.
 * - só ano: `AAAA-01-01`. É o formato que Wikidata (precisão de ano) e
 *   curadorias sem a data completa produzem. `1968-01-01` ficou publicado numa
 *   ficha cujo registro no TSE traz 25/05/1968.
 *
 * O TSE é a fonte da data (issue #472). Um 1º de janeiro vindo do cadastro de
 * candidatura é data real (há candidato nascido em 01/01/1973) e continua
 * aceito por quem lê o TSE; as fontes secundárias é que não podem gravar esse
 * formato.
 */

export const DATA_NASCIMENTO_MINIMA = "1910-01-01"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Normaliza para AAAA-MM-DD; devolve null se não for uma data de calendário. */
export function isoBirthDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim().replace(/^\+/, "").split("T")[0]
  const match = ISO_DATE.exec(raw)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null
  return raw
}

export function isSentinelBirthDate(value: unknown): boolean {
  const iso = isoBirthDate(value)
  return iso !== null && iso < DATA_NASCIMENTO_MINIMA
}

export function isYearOnlyBirthDate(value: unknown): boolean {
  const iso = isoBirthDate(value)
  return iso !== null && iso.endsWith("-01-01")
}

/** Sentinela ou só ano: não é uma data que a ficha possa afirmar sem o TSE. */
export function isPlaceholderBirthDate(value: unknown): boolean {
  return isSentinelBirthDate(value) || isYearOnlyBirthDate(value)
}

/**
 * Data aceitável de fonte secundária (Senado, Câmara, Wikidata, Wikipedia,
 * curadoria): data de calendário válida e que não seja sentinela nem só ano.
 * Devolve a data normalizada ou null.
 */
export function secondarySourceBirthDate(value: unknown): string | null {
  const iso = isoBirthDate(value)
  if (!iso || isPlaceholderBirthDate(iso)) return null
  return iso
}
