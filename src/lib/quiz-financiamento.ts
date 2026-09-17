/** Contexto factual de financiamento declarado ao TSE, sem inferência política. */

function parseMaioresDoadoresDetailed(raw: unknown): { nome: string; valor: number; tipo: string | null }[] {
  if (!Array.isArray(raw)) return []
  const out: { nome: string; valor: number; tipo: string | null }[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const nome = typeof o.nome === "string" ? o.nome.trim() : ""
    const valor = typeof o.valor === "number" ? o.valor : Number(o.valor)
    const tipo = typeof o.tipo === "string" ? o.tipo.trim() : null
    if (!nome || !Number.isFinite(valor)) continue
    out.push({ nome, valor, tipo })
  }
  return out
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

export function buildFinanciamentoContexto(
  anoEleicao: number,
  totalArrecadado: number | null | undefined,
  maioresDoadores: unknown
): string | null {
  const top = parseMaioresDoadoresDetailed(maioresDoadores)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 1)[0]
  const parts: string[] = []
  if (top) {
    parts.push(`Maior doador declarado (${anoEleicao}): ${top.nome} (${brl.format(top.valor)}).`)
  }
  if (totalArrecadado != null && Number.isFinite(Number(totalArrecadado))) {
    parts.push(`Total arrecadado declarado: ${brl.format(Number(totalArrecadado))}.`)
  }
  if (parts.length === 0) return null
  return `${parts.join(
    " ",
  )} Fonte: TSE (prestação de contas da eleição de ${anoEleicao}; não indica o cargo disputado na coorte atual do perfil).`
}
