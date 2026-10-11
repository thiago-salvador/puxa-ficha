import type { GastoParlamentar } from "@/lib/types"

type GastoCategoria = GastoParlamentar["detalhamento"][number]

/**
 * `gastos_parlamentares.detalhamento` chega do banco em dois formatos: array
 * de categorias ou objeto legado `{ categorias: [...], proveniencia }` (915
 * linhas de 138 candidatos em 11/10/2026). O tipo declara só o array, então
 * todo consumidor da ficha crua passa por aqui. A rota da imagem da timeline
 * fazia spread do objeto e respondia 500 para 24 candidatos.
 */
export function normalizarDetalhamentoGasto(bruto: unknown): GastoCategoria[] {
  const itens: unknown[] = Array.isArray(bruto)
    ? bruto
    : bruto && typeof bruto === "object"
      ? Array.isArray((bruto as Record<string, unknown>).categorias)
        ? ((bruto as Record<string, unknown>).categorias as unknown[])
        : Object.entries(bruto).map(([categoria, valor]) => ({ categoria, valor }))
      : []

  return itens.map((item) => {
    const registro = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    return {
      categoria: typeof registro.categoria === "string" ? registro.categoria : "",
      valor: typeof registro.valor === "number" ? registro.valor : Number(registro.valor) || 0,
      fornecedor: typeof registro.fornecedor === "string" ? registro.fornecedor : undefined,
    }
  })
}
