import type { ImprensaPageDataset } from "@/lib/imprensa-cache"

export const IMPRENSA_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

export type ImprensaUf = (typeof IMPRENSA_UFS)[number]

export function isImprensaUf(value: string): value is ImprensaUf {
  return (IMPRENSA_UFS as readonly string[]).includes(value.toUpperCase())
}

export function countRowsByCargo(dataset: ImprensaPageDataset): Array<{ cargo: string; total: number }> {
  const counts = new Map<string, number>()
  for (const row of dataset.rows) counts.set(row.cargo, (counts.get(row.cargo) ?? 0) + 1)
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([cargo, total]) => ({ cargo, total }))
}

export function rowGaps(row: ImprensaPageDataset["rows"][number]): string[] {
  const gaps: string[] = []
  if (row.chapa.estado === "sem_dado") gaps.push("composição da chapa sem dado confirmado")
  if (row.chapa.estado === "indeterminado" || row.chapa.estado === "indisponivel") gaps.push("composição da chapa exige conferência")
  if (row.chapa.estado === "vinculo_em_revisao") gaps.push("vínculo do vice em revisão")
  if (!["publicado", "sem_dado", "indeterminado", "indisponivel", "vinculo_em_revisao", "indeferidos_comprovados"].includes(row.chapa.estado)) gaps.push("estado da chapa exige conferência")
  if (row.cargo === "Senador" && !["publicado", "indeferidos_comprovados"].includes(row.chapa.suplentesEstado)) gaps.push("suplentes exigem conferência")
  if (row.sites.estado === "sem_dado") gaps.push("sites sem dado publicado")
  if (!["publicado", "vazio_confirmado", "sem_dado"].includes(row.sites.estado)) gaps.push("estado dos sites exige conferência")
  if (!["publicado", "vazio_confirmado"].includes(row.processos.estado)) gaps.push(
    ["cobertura_parcial", "indeterminado", "nao_buscado", "erro", "desatualizado", "sem_dado"].includes(row.processos.estado)
      ? `processos: ${row.processos.estado.replaceAll("_", " ")}`
      : "estado dos processos exige conferência",
  )
  return gaps
}

export function chapaSummary(row: ImprensaPageDataset["rows"][number]): string {
  if (row.cargo === "Senador") {
    if (row.chapa.suplentesEstado === "publicado" && row.chapa.suplentes.length) return `Suplentes: ${row.chapa.suplentes.join(", ")}`
    if (row.chapa.suplentesEstado === "indeferidos_comprovados") return "Suplentes indeferidos (comprovante do TSE)"
    return "Suplentes: exige conferência"
  }
  if (row.chapa.estado === "publicado" && row.chapa.viceNome) return `Vice: ${row.chapa.viceNome}`
  if (row.chapa.estado === "vinculo_em_revisao") return "Vínculo do vice em revisão"
  if (row.chapa.estado === "sem_dado") return "Vice sem dado confirmado"
  return "Composição da chapa exige conferência"
}
