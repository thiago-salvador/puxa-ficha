import { normalizeHistoricoPoliticoForDisplay } from "../../src/lib/historico-dedupe"
import type { HistoricoPolitico } from "../../src/lib/types"

export interface SnapshotHistoricoCounts {
  slug: string
  total_historico_politico: number
  total_historico_politico_exibicao?: number
}

export interface LiveHistoricoCounts {
  total_historico_politico: number
  total_historico_politico_exibicao: number
}

export function buildLiveHistoricoCountsBySlug(
  snapshots: readonly Pick<SnapshotHistoricoCounts, "slug">[],
  idBySlug: ReadonlyMap<string, string>,
  rows: readonly HistoricoPolitico[],
): Map<string, LiveHistoricoCounts> {
  const grouped = new Map<string, HistoricoPolitico[]>()

  for (const row of rows) {
    const candidatoId = row.candidato_id
    const list = grouped.get(candidatoId) ?? []
    list.push(row)
    grouped.set(candidatoId, list)
  }

  const countsBySlug = new Map<string, LiveHistoricoCounts>()

  for (const snapshot of snapshots) {
    const candidatoId = idBySlug.get(snapshot.slug)
    const historico = candidatoId ? grouped.get(candidatoId) ?? [] : []
    countsBySlug.set(snapshot.slug, {
      total_historico_politico: historico.length,
      total_historico_politico_exibicao: normalizeHistoricoPoliticoForDisplay(historico).length,
    })
  }

  return countsBySlug
}

export function mergeLiveHistoricoCounts<T extends SnapshotHistoricoCounts>(
  snapshots: readonly T[],
  countsBySlug: ReadonlyMap<string, LiveHistoricoCounts>,
): T[] {
  return snapshots.map((snapshot) => {
    const liveCounts = countsBySlug.get(snapshot.slug)
    if (!liveCounts) return snapshot

    return {
      ...snapshot,
      total_historico_politico: liveCounts.total_historico_politico,
      total_historico_politico_exibicao: liveCounts.total_historico_politico_exibicao,
    }
  })
}
