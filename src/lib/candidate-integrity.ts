import type { MudancaPartido } from "@/lib/types"

function normalizePartyValue(value: string | null | undefined): string | null {
  if (!value) return null

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
}

export function hasIncompletePartyTimeline(
  mudancas: MudancaPartido[],
  partidoSigla: string | null | undefined,
  partidoAtual: string | null | undefined
): boolean {
  if (mudancas.length === 0) return false

  const latest = [...mudancas].sort((a, b) => b.ano - a.ano)[0]
  const latestToken = normalizePartyValue(latest?.partido_novo)

  if (!latestToken) return false

  const currentTokens = [normalizePartyValue(partidoSigla), normalizePartyValue(partidoAtual)].filter(
    (value): value is string => Boolean(value)
  )

  if (currentTokens.length === 0) return false

  return !currentTokens.includes(latestToken)
}
