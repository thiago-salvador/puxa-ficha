/** Aceita a grafia oficial e o valor canônico persistido, sem ampliar votos válidos. */
export function normalizeDestaquesVote(value: unknown): string | null {
  const normalized = String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase()
  if (normalized === "sim") return "sim"
  if (normalized === "nao") return "não"
  if (normalized === "abstencao") return "abstencao"
  if (normalized === "obstrucao") return "obstrucao"
  if (normalized === "ausente") return "ausente"
  if (normalized === "artigo 17" || normalized === "artigo_17") return "artigo_17"
  return null
}
