export interface HistoricoCandidaturaGateRow {
  id: string | null
  tipo_evento: string | null
  periodo_inicio: number | null
  observacoes: string | null
}

const RESULTADOS_FINAIS = [
  ["ELEITO POR MEDIA", "ELEITO POR MÉDIA"],
  ["REGISTRO NEGADO", "REGISTRO NEGADO"],
  ["NAO ELEITO", "NÃO ELEITO"],
  ["DESISTIU", "DESISTIU"],
  ["RENUNCIA", "RENÚNCIA"],
  ["SUPLENTE", "SUPLENTE"],
  ["INAPTO", "INAPTO"],
  ["ELEITO", "ELEITO"],
] as const

function normalizar(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
}

export function extrairResultadoFinal(observacoes: string | null | undefined): string | null {
  const texto = normalizar(observacoes ?? "")
  for (const [token, canonico] of RESULTADOS_FINAIS) {
    if (texto.includes(token)) return canonico
  }
  return null
}

export function linhasSemResultadoFinal(
  rows: HistoricoCandidaturaGateRow[],
  cicloCorrente = 2026,
): HistoricoCandidaturaGateRow[] {
  return rows.filter((row) =>
    normalizar(row.tipo_evento ?? "") === "CANDIDATURA" &&
    typeof row.periodo_inicio === "number" &&
    row.periodo_inicio < cicloCorrente &&
    extrairResultadoFinal(row.observacoes) === null
  )
}

export function parseCiclo(value: string | null | undefined, fallback = 2026): number {
  const raw = value == null || value === "" ? String(fallback) : value
  if (!/^\d+$/.test(raw)) throw new Error(`--ciclo inválido: ${raw}`)
  const ciclo = Number(raw)
  if (!Number.isSafeInteger(ciclo) || ciclo <= 0) throw new Error(`--ciclo inválido: ${raw}`)
  return ciclo
}
