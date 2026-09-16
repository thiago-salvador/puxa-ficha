import type { Patrimonio } from "@/lib/types"

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
