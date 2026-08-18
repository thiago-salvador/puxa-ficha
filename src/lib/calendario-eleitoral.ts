/**
 * Calendário eleitoral brasileiro como DADO, não como aritmética.
 *
 * "Ano par é ano de eleição" é falso nos dois sentidos: 1989 foi eleição
 * presidencial (ano ímpar) e 1980 não teve eleição (ano par). A ficha do Zema
 * publicava "eleição de 2023" porque a derivação tratava ano de posse como ano
 * de pleito; a correção precisa de calendário, não de módulo 2.
 *
 * Cada ano lista o CONJUNTO de pleitos daquele ano, porque 1982 teve geral e
 * municipal no mesmo dia e 1994 em diante junta presidencial com federal
 * e estadual. Um retorno único ("municipal ou geral") não representaria isso.
 *
 * Fonte: TSE, "Eleições anteriores"
 * (https://www.tse.jus.br/eleicoes/eleicoes-anteriores). Intervalo coberto:
 * 1970 a 2030, que contém com folga a base atual (menor `periodo_inicio`
 * persistido = 1972, maior = 2026).
 *
 * Eleição presidencial indireta (colégio eleitoral, ex.: janeiro de 1985) não
 * entra: não é pleito com registro de candidatura no TSE, que é o que as fichas
 * exibem.
 */

export type TipoDePleito = "presidencial" | "federal_estadual" | "municipal"

const CALENDARIO: ReadonlyMap<number, readonly TipoDePleito[]> = new Map([
  [1970, ["federal_estadual"]],
  [1972, ["municipal"]],
  [1974, ["federal_estadual"]],
  [1976, ["municipal"]],
  [1978, ["federal_estadual"]],
  [1982, ["federal_estadual", "municipal"]],
  [1985, ["municipal"]],
  [1986, ["federal_estadual"]],
  [1988, ["municipal"]],
  [1989, ["presidencial"]],
  [1990, ["federal_estadual"]],
  [1992, ["municipal"]],
  [1994, ["presidencial", "federal_estadual"]],
  [1996, ["municipal"]],
  [1998, ["presidencial", "federal_estadual"]],
  [2000, ["municipal"]],
  [2002, ["presidencial", "federal_estadual"]],
  [2004, ["municipal"]],
  [2006, ["presidencial", "federal_estadual"]],
  [2008, ["municipal"]],
  [2010, ["presidencial", "federal_estadual"]],
  [2012, ["municipal"]],
  [2014, ["presidencial", "federal_estadual"]],
  [2016, ["municipal"]],
  [2018, ["presidencial", "federal_estadual"]],
  [2020, ["municipal"]],
  [2022, ["presidencial", "federal_estadual"]],
  [2024, ["municipal"]],
  [2026, ["presidencial", "federal_estadual"]],
  [2028, ["municipal"]],
  [2030, ["presidencial", "federal_estadual"]],
])

/** Menor e maior ano cobertos pela tabela. Fora disso o calendário não opina. */
const CALENDARIO_ANO_MINIMO = 1970
const CALENDARIO_ANO_MAXIMO = 2030

/** Conjunto de pleitos do ano. Vazio = não houve eleição. */
export function tiposDePleitoDoAno(ano: number): readonly TipoDePleito[] {
  return CALENDARIO.get(ano) ?? []
}

/**
 * `true` só quando a tabela conhece um pleito naquele ano. Ano fora do intervalo
 * coberto devolve `false`, e quem chama trata como "não afirmável" — nunca como
 * "houve eleição".
 */
export function ehAnoDeEleicao(ano: number): boolean {
  return tiposDePleitoDoAno(ano).length > 0
}

/** Ano dentro do intervalo em que a tabela tem autoridade para negar um pleito. */
export function anoCobertoPeloCalendario(ano: number): boolean {
  return ano >= CALENDARIO_ANO_MINIMO && ano <= CALENDARIO_ANO_MAXIMO
}

/**
 * Presidência de INSTITUIÇÃO, não da República: Senado, Câmara, Assembleia,
 * casa legislativa, partido, sindicato, autarquia. Só existe uma eleição
 * presidencial no Brasil, e ela não é a da mesa diretora do Senado.
 *
 * Sem este corte, "Presidente do Senado Federal" do Rodrigo Pacheco casava com
 * o padrão presidencial e virava pleito presidencial em 2021 e 2023, anos em
 * que não houve eleição para presidente nenhuma.
 */
const PRESIDENCIA_DE_INSTITUICAO =
  /\bpresid(ente|ência|encia)\b(?:\s+(?:nacional|estadual|municipal|regional|executiv[oa]))*\s+(d[oa]s?|de|em)\b/i
/** "Presidente da República" é a exceção: aí sim é o cargo do pleito presidencial. */
const PRESIDENCIA_DA_REPUBLICA = /\bpresidente\s+d[ao]\s+rep(u|ú)blica\b/i

const CARGO_POR_TIPO: ReadonlyArray<{ tipo: TipoDePleito; padrao: RegExp }> = [
  { tipo: "municipal", padrao: /\b(prefeit|vice-prefeit|vereador|vereadora)/i },
  {
    tipo: "federal_estadual",
    padrao:
      /\b(governador|governadora|vice-governador|senador|senadora|deputad[oa] federal|deputad[oa] estadual|deputad[oa] distrital)/i,
  },
  {
    tipo: "presidencial",
    padrao: /\b(presidente|vice-presidente)\b/i,
  },
]

/**
 * Tipo de pleito que o cargo implica, ou `null` quando o texto não permite
 * dizer. Municipal e federal/estadual são testados ANTES de presidencial,
 * porque "Presidente" é a palavra mais ambígua da base: sozinha é o cargo do
 * pleito presidencial, mas seguida de instituição é função interna.
 */
export function tipoDePleitoDoCargo(cargo: string | null | undefined): TipoDePleito | null {
  const texto = (cargo ?? "").trim()
  if (!texto) return null
  if (PRESIDENCIA_DE_INSTITUICAO.test(texto) && !PRESIDENCIA_DA_REPUBLICA.test(texto)) {
    // "Presidente do Senado Federal", "Presidente da Assembleia Legislativa",
    // "Presidente Nacional do Partido X": nenhum é pleito.
    return null
  }
  for (const { tipo, padrao } of CARGO_POR_TIPO) {
    if (padrao.test(texto)) return tipo
  }
  return null
}

/**
 * Coerência cargo × ano: `false` só quando o calendário cobre o ano E o tipo do
 * cargo é conhecido E aquele tipo não estava em disputa. Qualquer incerteza
 * devolve `true`, porque a régua existe para barrar afirmação falsa, não para
 * esconder dado que ela não sabe julgar.
 */
export function cargoCoerenteComOAno(cargo: string | null | undefined, ano: number): boolean {
  if (!anoCobertoPeloCalendario(ano)) return true
  const texto = (cargo ?? "").trim()
  if (PRESIDENCIA_DE_INSTITUICAO.test(texto) && !PRESIDENCIA_DA_REPUBLICA.test(texto)) return false
  const tipo = tipoDePleitoDoCargo(cargo)
  if (tipo == null) return ehAnoDeEleicao(ano)
  return tiposDePleitoDoAno(ano).includes(tipo)
}
