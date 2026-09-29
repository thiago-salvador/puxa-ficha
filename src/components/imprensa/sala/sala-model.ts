import type { ImprensaPageRow } from "@/lib/imprensa-cache"
import { formatImprensaCargoList } from "@/lib/imprensa-facts"
import { IMPRENSA_UFS, type ImprensaUf } from "@/lib/imprensa-uf-pack"
import { formatUpdateValue, type VerifiedCandidateUpdate } from "@/lib/verified-candidate-updates"

/**
 * Cálculos da Sala (/imprensa). Puro: recebe as linhas do dataset público e as
 * mudanças verificadas e devolve o que a página mostra. Nenhum número é fixo.
 */

type SalaRow = Pick<ImprensaPageRow, "cargo" | "uf">

/**
 * Frase de promessa do hero. `total` null quer dizer que a contagem falhou: a
 * frase sai sem número, nunca com zero.
 */
export function buildSalaPromise(total: number | null, cargos: readonly string[]): string {
  const cargoList = formatImprensaCargoList(cargos)
  const alvo = cargoList ? ` a ${cargoList}` : ""
  const quem = total === null || total === 0
    ? `os candidatos${alvo}`
    : total === 1
      ? `1 candidato${alvo}`
      : `os ${new Intl.NumberFormat("pt-BR").format(total)} candidatos${alvo}`
  return `O que TSE, tribunais, CGU e Congresso registram sobre ${quem}. Cada dado com link para a fonte oficial e data de coleta.`
}

export interface SalaUfCount {
  uf: ImprensaUf
  total: number
}

/** Linhas a presidente e linhas por UF, na ordem das 27 UFs. */
export function countSalaRecortes(rows: readonly SalaRow[]): { presidencia: number; ufs: SalaUfCount[] } {
  const byUf = new Map<string, number>()
  let presidencia = 0
  for (const row of rows) {
    if (row.cargo === "Presidente") presidencia += 1
    const uf = row.uf?.trim().toUpperCase()
    if (uf) byUf.set(uf, (byUf.get(uf) ?? 0) + 1)
  }
  return { presidencia, ufs: IMPRENSA_UFS.map((uf) => ({ uf, total: byUf.get(uf) ?? 0 })) }
}

export interface SalaUpdateItem {
  id: string
  detectedAt: string
  /** "DD/MM" no horário de Brasília. */
  dateLabel: string
  /** Nome do candidato, como registrado na mudança verificada. */
  name: string
  /** Cargo e UF, quando a candidatura está no dataset. */
  context: string | null
  change: string
  fichaUrl: string | null
  sourceUrl: string
}

const DAY_MONTH = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })

function fieldLabel(update: VerifiedCandidateUpdate): string {
  if (update.field === "patrimonio") return `Patrimônio declarado em ${update.year}`
  if (update.field === "situacao") return "Situação da candidatura"
  return "Partido"
}

/**
 * As mudanças mais recentes, com o nome do candidato. Cargo e UF vêm do
 * dataset pela slug; a ficha fica a um clique.
 */
export function buildSalaUpdates(
  updates: readonly VerifiedCandidateUpdate[],
  rows: readonly Pick<ImprensaPageRow, "slug" | "cargo" | "uf" | "fichaUrl">[],
  limit = 3,
): SalaUpdateItem[] {
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  return updates.slice(0, limit).map((update) => {
    const row = bySlug.get(update.candidate_slug)
    const context = row ? [row.cargo, row.uf].filter(Boolean).join(" · ") || null : null
    return {
      id: update.id,
      name: update.candidate_name,
      detectedAt: update.detected_at,
      dateLabel: DAY_MONTH.format(new Date(update.detected_at)),
      context,
      change: `${fieldLabel(update)}: de ${formatUpdateValue(update, update.before_value)} para ${formatUpdateValue(update, update.after_value)}`,
      fichaUrl: row?.fichaUrl ?? null,
      sourceUrl: update.source_url,
    }
  })
}
