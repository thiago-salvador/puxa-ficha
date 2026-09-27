import { stripAccents } from "@/lib/strip-accents"
import type { Patrimonio } from "@/lib/types"

/**
 * O que um total declarado ao TSE significa. Total zero não é um tipo só: nos
 * dados abertos ele aparece quando a pessoa declarou não ter bens ("Nenhum bem
 * a declarar"), quando declarou um bem com valor zero, e também quando a
 * declaração foi entregue como anexo ou listou bens sem valor. Nos dois
 * últimos casos o zero é ausência de valor, não patrimônio nulo.
 */
export type PatrimonioValorEstado =
  | "valor_informado"
  | "zero_sem_detalhamento"
  | "sem_bens_declarados"
  | "bens_valor_zero"
  | "valor_nao_informado"

type BemComValor = { descricao?: string | null; valor?: unknown }

/** Linha mínima que o classificador lê; valores podem chegar como texto. */
export type PatrimonioValorLinha = {
  valor_total: unknown
  bens?: ReadonlyArray<BemComValor> | null
}

// Formas de "não tenho bens" nos dados abertos, já sem acento e em minúsculas.
const SEM_BENS_RE =
  /\b(?:nenhum bem|nada a declarar|nao (?:possui|possuo|tem|tenho|ha) (?:nenhum )?(?:bem|bens)|declar(?:a|o|ou) nao possuir (?:bem|bens)|sem bens|inexistencia de bens)\b/
const ANEXO_RE = /\banexo\b/

/**
 * Valor monetário vindo do banco ou do DTO. Número finito passa; texto aceita
 * "R$ 1.234,56", "1234.56" ou "1234"; qualquer outra forma vira null (não
 * informado), nunca zero.
 */
export function parseValorPatrimonio(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null
  if (typeof valor !== "string") return null
  const limpo = valor.replace(/R\$/gi, "").replace(/\s|\u00a0/g, "")
  if (limpo === "") return null
  let normalizado: string
  if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(limpo) || /^-?\d+,\d+$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".")
  } else if (/^-?\d+(?:\.\d+)?$/.test(limpo)) {
    normalizado = limpo
  } else {
    return null
  }
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

export function estadoValorPatrimonio(row: PatrimonioValorLinha): PatrimonioValorEstado {
  const total = parseValorPatrimonio(row.valor_total)
  if (total === null || total < 0) return "valor_nao_informado"
  if (total > 0) return "valor_informado"

  const bens = row.bens ?? []
  // Total zero no arquivo oficial sem lista de bens: é o valor que o TSE
  // publicou para a candidatura (contrato X10), exibido como R$ 0 sem rótulo.
  if (bens.length === 0) return "zero_sem_detalhamento"
  // Total zero com item de valor positivo ou sem valor: o total não fecha com
  // os itens, então o zero não é valor declarado.
  if (bens.some((bem) => parseValorPatrimonio(bem.valor) !== 0)) return "valor_nao_informado"
  const descricoes = bens.map((bem) => stripAccents(bem.descricao ?? "").toLowerCase())
  if (descricoes.some((descricao) => ANEXO_RE.test(descricao))) return "valor_nao_informado"
  if (descricoes.every((descricao) => SEM_BENS_RE.test(descricao))) return "sem_bens_declarados"
  // Vários bens todos com valor zero: a lista existe, os valores não.
  if (bens.length > 1) return "valor_nao_informado"
  return "bens_valor_zero"
}

export function patrimonioValorEstadoLabel(estado: PatrimonioValorEstado): string | null {
  switch (estado) {
    case "sem_bens_declarados":
      return "Declarou não ter bens"
    case "bens_valor_zero":
      return "Declarou bens de valor zero"
    case "valor_nao_informado":
      return "Valor não informado nos dados abertos"
    default:
      return null
  }
}

/** Valor que pode entrar em gráfico e comparação entre anos. */
export function patrimonioTemValorComparavel(row: PatrimonioValorLinha): boolean {
  return estadoValorPatrimonio(row) !== "valor_nao_informado"
}

/**
 * Variação percentual entre duas declarações. Só existe com base positiva e
 * informada e com ponta final comparável: base zero não tem porcentagem, e
 * zero que é ausência de valor não é queda de 100%.
 */
export function variacaoPatrimonialPct(
  anterior: PatrimonioValorLinha,
  atual: PatrimonioValorLinha,
): number | null {
  if (estadoValorPatrimonio(anterior) !== "valor_informado") return null
  if (!patrimonioTemValorComparavel(atual)) return null
  const base = parseValorPatrimonio(anterior.valor_total)!
  return ((parseValorPatrimonio(atual.valor_total)! - base) / base) * 100
}

export function patrimonioPorAnoSemAmbiguidade(rows: readonly Patrimonio[]): Patrimonio[] {
  const porAno = new Map<number, Patrimonio[]>()
  for (const row of rows) porAno.set(row.ano_eleicao, [...(porAno.get(row.ano_eleicao) ?? []), row])
  return [...porAno.entries()]
    .filter(([, candidaturas]) => candidaturas.length === 1)
    .map(([, candidaturas]) => candidaturas[0])
    .sort((a, b) => a.ano_eleicao - b.ano_eleicao)
}

export function patrimonioMaisRecenteSemEscolhaArbitraria(rows: readonly Patrimonio[]): {
  ano: number | null
  quantidade: number
  patrimonio: Patrimonio | null
} {
  if (rows.length === 0) return { ano: null, quantidade: 0, patrimonio: null }
  const ano = Math.max(...rows.map((row) => row.ano_eleicao))
  const candidaturas = rows.filter((row) => row.ano_eleicao === ano)
  return {
    ano,
    quantidade: candidaturas.length,
    patrimonio: candidaturas.length === 1 ? candidaturas[0] : null,
  }
}

export function patrimonioContextoLabel(row: Pick<Patrimonio, "ano_eleicao" | "cargo_candidatura" | "tipo_eleicao">): string {
  const cargo = row.cargo_candidatura?.trim()
  const tipo = row.tipo_eleicao?.toLocaleLowerCase("pt-BR").replace(/^eleição\s+/, "")
  return [cargo, tipo ? `eleição ${tipo} de ${row.ano_eleicao}` : `eleição de ${row.ano_eleicao}`]
    .filter(Boolean)
    .join(" · ")
}
