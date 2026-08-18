/** Helpers leves de UF/estado compartilháveis entre server, client e scripts. */
const UF_NAMES = {
  ac: "Acre",
  al: "Alagoas",
  am: "Amazonas",
  ap: "Amapá",
  ba: "Bahia",
  ce: "Ceará",
  df: "Distrito Federal",
  es: "Espírito Santo",
  go: "Goiás",
  ma: "Maranhão",
  mg: "Minas Gerais",
  ms: "Mato Grosso do Sul",
  mt: "Mato Grosso",
  pa: "Pará",
  pb: "Paraíba",
  pe: "Pernambuco",
  pi: "Piauí",
  pr: "Paraná",
  rj: "Rio de Janeiro",
  rn: "Rio Grande do Norte",
  ro: "Rondônia",
  rr: "Roraima",
  rs: "Rio Grande do Sul",
  sc: "Santa Catarina",
  se: "Sergipe",
  sp: "São Paulo",
  to: "Tocantins",
} as const

export type BrUf = keyof typeof UF_NAMES

const UF_ORDER = Object.keys(UF_NAMES) as BrUf[]

/**
 * Aliases extras além do nome oficial do estado.
 * Mantemos a lista curta para não alargar equivalências sem intenção.
 */
const UF_EXTRA_ALIASES: Partial<Record<BrUf, readonly string[]>> = {
  df: ["brasilia"],
  rj: ["estado do rio de janeiro"],
  sp: ["estado de sao paulo"],
}

export function normalizeBrUfToken(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

function isBrUf(value: string): value is BrUf {
  return value in UF_NAMES
}

const UF_LONG_FORMS: Record<BrUf, readonly string[]> = UF_ORDER.reduce(
  (acc, uf) => {
    const aliases = new Set<string>([
      normalizeBrUfToken(UF_NAMES[uf]),
      ...(UF_EXTRA_ALIASES[uf] ?? []),
    ])
    acc[uf] = [...aliases]
    return acc
  },
  {} as Record<BrUf, readonly string[]>,
)

export function getEstadoNome(uf: string): string | null {
  const normalized = normalizeBrUfToken(uf)
  return isBrUf(normalized) ? UF_NAMES[normalized] : null
}

export function getEstadoUFs(): BrUf[] {
  return [...UF_ORDER]
}

/**
 * Resolve uma referência textual de estado para a sigla UF canônica.
 * Aceita sigla de 2 letras ou nomes/aliases conhecidos.
 */
export function resolveEstadoUf(value: string | null | undefined): BrUf | null {
  const normalized = normalizeBrUfToken(value)
  if (!normalized) return null
  if (isBrUf(normalized)) return normalized

  for (const uf of UF_ORDER) {
    if (UF_LONG_FORMS[uf].includes(normalized)) return uf
  }

  return null
}

/**
 * Resolve qualquer referência textual de estado para a sigla UF canônica
 * de armazenamento (uppercase, ex.: "SP", "RJ").
 * Retorna `null` se o valor não for reconhecido.
 */
export function canonicalizeEstadoForStorage(
  value: string | null | undefined,
): string | null {
  const uf = resolveEstadoUf(value)
  return uf ? uf.toUpperCase() : null
}

/** Pares (alias, uf) ordenados por comprimento decrescente do alias para longest-match-first. */
const UF_LONG_FORM_PAIRS: ReadonlyArray<readonly [string, BrUf]> = (() => {
  const pairs: Array<[string, BrUf]> = []
  for (const uf of UF_ORDER) {
    for (const alias of UF_LONG_FORMS[uf]) {
      pairs.push([alias, uf])
    }
  }
  return pairs.sort((a, b) => b[0].length - a[0].length)
})()

/**
 * Extrai a sigla UF canônica (uppercase) de um texto que pode conter
 * o nome de um estado (ex.: "Governador de São Paulo" -> "SP").
 * Usa longest-match-first para evitar falsos positivos com substrings
 * (ex.: "Paraíba" não casa prematuramente com "Pará").
 * Retorna `null` se nenhum estado reconhecido for encontrado.
 */
export function extractEstadoFromText(
  text: string | null | undefined,
): string | null {
  const normalized = normalizeBrUfToken(text)
  if (!normalized) return null
  const exact = resolveEstadoUf(text)
  if (exact) return exact.toUpperCase()
  for (const [alias, uf] of UF_LONG_FORM_PAIRS) {
    if (normalized.includes(alias)) return uf.toUpperCase()
  }
  return null
}

/**
 * Compatibilidade estrita sigla UF ↔ forma longa conhecida.
 * Não tenta inferir equivalência entre dois textos longos distintos.
 */
export function longFormMatchesUfSigla(
  ufSigla: string | null | undefined,
  longForm: string | null | undefined,
): boolean {
  const uf = resolveEstadoUf(ufSigla)
  const normalizedLong = normalizeBrUfToken(longForm)
  if (!uf || !normalizedLong || normalizedLong.length <= 2) return false
  return UF_LONG_FORMS[uf].some(
    (alias) =>
      normalizedLong === alias ||
      normalizedLong.startsWith(`${alias} `) ||
      normalizedLong.startsWith(`${alias}/`) ||
      normalizedLong.startsWith(`${alias}(`) ||
      normalizedLong.startsWith(`${alias},`),
  )
}
