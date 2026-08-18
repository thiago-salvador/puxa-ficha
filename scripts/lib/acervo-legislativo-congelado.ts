export const ACERVO_LEGISLATIVO_CONGELADO_KEY = "acervo_legislativo_congelado"

export type CasaLegislativa = "camara" | "senado"

type ReciboAcervoCongelado = {
  estado: "congelado"
  verificado_em: string
  contagens: Record<string, number>
  run_url?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isReciboValido(value: unknown): value is ReciboAcervoCongelado {
  if (!isRecord(value)) return false
  if (value.estado !== "congelado") return false
  if (typeof value.verificado_em !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.verificado_em)) {
    return false
  }
  if (!isRecord(value.contagens) || Object.keys(value.contagens).length === 0) return false
  return Object.values(value.contagens).every(
    (count) => typeof count === "number" && Number.isInteger(count) && count >= 0
  )
}

/**
 * Acervo congelado exige recibo explícito e completo por Casa. Valores truthy,
 * datas soltas ou contagens incompletas não autorizam pular a fonte.
 */
export function reciboAcervoCongelado(
  verificacaoCampos: unknown,
  casa: CasaLegislativa
): ReciboAcervoCongelado | null {
  if (!isRecord(verificacaoCampos)) return null
  const acervo = verificacaoCampos[ACERVO_LEGISLATIVO_CONGELADO_KEY]
  if (!isRecord(acervo)) return null
  const recibo = acervo[casa]
  return isReciboValido(recibo) ? recibo : null
}

export function deveProcessarAcervoLegislativo(
  verificacaoCampos: unknown,
  casa: CasaLegislativa,
  forceFrozen = false
): boolean {
  return forceFrozen || reciboAcervoCongelado(verificacaoCampos, casa) == null
}
