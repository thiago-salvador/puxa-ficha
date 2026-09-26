/**
 * Regras puras da conferência de totais CEAP/CEAPS contra a fonte oficial.
 * Usadas pelo preflight somente leitura
 * scripts/audit/preflight-gastos-parlamentares-universo.mjs e pelos testes.
 */
import { stripAccents } from "../../../src/lib/strip-accents"

export type CasaGasto = "camara" | "senado" | "fora_da_regra"

export type StatusConferencia =
  | "confere_api"
  | "confere_csv"
  | "confere_zero"
  | "diverge"
  | "fonte_sem_linhas"
  | "sem_id_oficial"

export interface TotalOficial {
  cents: number
  rows: number
}

/** Tolerância aprovada: R$ 50 ou 1% do total oficial, o que for maior. */
export const TOLERANCIA_MINIMA_CENTS = 5000
export const TOLERANCIA_RELATIVA = 0.01

export function toleranciaCents(oficialCents: number): number {
  return Math.max(TOLERANCIA_MINIMA_CENTS, Math.round(Math.abs(oficialCents) * TOLERANCIA_RELATIVA))
}

export function dentroDaTolerancia(dbCents: number, oficialCents: number): boolean {
  return Math.abs(dbCents - oficialCents) <= toleranciaCents(oficialCents)
}

export function casaDaFonte(fonte: string | null | undefined): CasaGasto {
  const texto = stripAccents(fonte ?? "").toLowerCase()
  if (texto.includes("portal da transparencia")) return "fora_da_regra"
  if (/senado|ceaps/.test(texto)) return "senado"
  if (/camara|ceap/.test(texto)) return "camara"
  return "fora_da_regra"
}

/**
 * Legislaturas da Câmara que cobrem algum dia do ano civil. A legislatura N
 * começa em 1º de fevereiro de 1991 + 4 * (N - 49) e termina em 31 de janeiro
 * quatro anos depois; o ano de posse tem, portanto, janeiro na legislatura
 * anterior e fevereiro a dezembro na nova.
 */
export function legislaturasDoAno(ano: number): number[] {
  if (!Number.isInteger(ano) || ano < 1991) throw new Error(`Ano fora do catálogo da Câmara: ${ano}`)
  const legislatura = 49 + Math.floor((ano - 1991) / 4)
  return (ano - 1991) % 4 === 0 && legislatura > 49 ? [legislatura - 1, legislatura] : [legislatura]
}

export function centavos(valor: unknown): number {
  const numero = typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor)
  if (!Number.isFinite(numero)) throw new Error(`Valor inválido: ${String(valor)}`)
  return Math.round(numero * 100)
}

export interface EntradaClassificacao {
  dbCents: number
  idOficial: number | null
  api: TotalOficial | null
  csv?: TotalOficial | null
}

/**
 * Confere com a API (Câmara por deputado com todas as legislaturas do ano, ou
 * CEAPS anual do Senado). Na Câmara, o CSV anual oficial é segunda fonte: o
 * total que bate com ele dentro da tolerância é diferença legítima de fonte.
 */
export function classificarLinha(entrada: EntradaClassificacao): StatusConferencia {
  if (entrada.idOficial == null) return "sem_id_oficial"
  const api = entrada.api
  const csv = entrada.csv ?? null
  if (api && api.rows > 0 && dentroDaTolerancia(entrada.dbCents, api.cents)) return "confere_api"
  if (csv && csv.rows > 0 && dentroDaTolerancia(entrada.dbCents, csv.cents)) return "confere_csv"
  if ((api?.rows ?? 0) === 0 && (csv?.rows ?? 0) === 0) {
    // Zero publicado e zero gravado é o mesmo total (0 = 0), não ausência de fonte.
    return api && entrada.dbCents === 0 ? "confere_zero" : "fonte_sem_linhas"
  }
  return "diverge"
}

export function statusVaiParaQuarentena(status: StatusConferencia): boolean {
  return status !== "confere_api" && status !== "confere_csv" && status !== "confere_zero"
}

/**
 * Causa provável de uma divergência, para o relatório. Não muda a decisão.
 */
export function causaDivergencia(args: {
  dbCents: number
  ano: number
  anoCorrente: number
  api: TotalOficial | null
  porLegislatura?: Record<string, number>
}): string {
  const { dbCents, ano, anoCorrente, api, porLegislatura } = args
  if (!api || api.rows === 0) return "sem_lancamentos_na_fonte"
  const parciais = Object.values(porLegislatura ?? {})
  if (parciais.length > 1 && parciais.some((parcial) => dentroDaTolerancia(dbCents, parcial))) {
    return "ano_de_posse_com_uma_legislatura_so"
  }
  if (ano >= anoCorrente - 1 && dbCents < api.cents) return "coleta_defasada_ano_em_curso"
  return dbCents > api.cents ? "banco_acima_da_fonte" : "banco_abaixo_da_fonte"
}

const PARTICULAS = new Set(["DAS", "DOS", "DES"])

function tokensNome(nome: string): string[] {
  return stripAccents(nome)
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !PARTICULAS.has(token))
}

/**
 * Identidade mínima: mesma data de nascimento e pelo menos dois nomes em
 * comum. A data sozinha não basta: há deputados distintos nascidos no mesmo
 * dia na mesma legislatura. O primeiro nome não é exigido porque a grafia
 * varia entre TSE e Câmara (Zacarias/Zacharias).
 */
export function identidadeConfere(
  fonte: { nome: string | null | undefined; nascimento: string | null | undefined },
  ficha: { nome: string | null | undefined; nascimento: string | null | undefined },
): boolean {
  if (!fonte.nome || !ficha.nome || !fonte.nascimento || !ficha.nascimento) return false
  if (fonte.nascimento.slice(0, 10) !== ficha.nascimento.slice(0, 10)) return false
  const a = tokensNome(fonte.nome)
  const b = new Set(tokensNome(ficha.nome))
  return new Set(a.filter((token) => b.has(token))).size >= 2
}
