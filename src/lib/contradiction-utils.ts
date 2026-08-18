import type { PontoAtencao, VotoCandidato } from "@/lib/types"

export interface EnrichedContradiction {
  voto: VotoCandidato
  pontoAtencao: PontoAtencao | null
}

function stripCombiningMarks(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** trim + lower + strip accents (aligns "Tributária" vs "Tributaria"). */
export function normalizeContradictionText(s: string | null | undefined): string {
  return stripCombiningMarks((s ?? "").trim().toLowerCase())
}

function voteDateMs(v: VotoCandidato): number {
  const raw = v.votacao?.data_votacao?.trim()
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

/** Both non-empty; avoids `includes("") === true`. */
function phrasesOverlap(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

function pontoMatchesVotacaoTitulo(ponto: PontoAtencao, votNorm: string): boolean {
  const t = normalizeContradictionText(ponto.titulo)
  const d = normalizeContradictionText(ponto.descricao)
  return phrasesOverlap(votNorm, t) || phrasesOverlap(votNorm, d)
}

function findMatchingPontoIndex(pool: PontoAtencao[], votNorm: string): number {
  for (let i = 0; i < pool.length; i++) {
    if (pontoMatchesVotacaoTitulo(pool[i], votNorm)) return i
  }
  return -1
}

/**
 * Cross-reference contradiction votes with contradiction attention points (substring match).
 * Each {@link PontoAtencao} matches at most one vote (first eligible vote by `data_votacao` desc).
 */
export function enrichContradictions(
  votosContradicao: VotoCandidato[],
  pontosContradicao: PontoAtencao[],
): { enriched: EnrichedContradiction[]; unmatched: PontoAtencao[] } {
  if (votosContradicao.length === 0) {
    return { enriched: [], unmatched: [...pontosContradicao] }
  }

  const pool = [...pontosContradicao]
  const sorted = [...votosContradicao].sort((a, b) => voteDateMs(b) - voteDateMs(a))

  const enriched: EnrichedContradiction[] = []
  for (const voto of sorted) {
    if (!voto.votacao) {
      enriched.push({ voto, pontoAtencao: null })
      continue
    }

    const votTit = (voto.votacao.titulo ?? "").trim()
    if (!votTit) {
      enriched.push({ voto, pontoAtencao: null })
      continue
    }

    const votNorm = normalizeContradictionText(votTit)
    if (!votNorm) {
      enriched.push({ voto, pontoAtencao: null })
      continue
    }

    const idx = findMatchingPontoIndex(pool, votNorm)
    if (idx === -1) {
      enriched.push({ voto, pontoAtencao: null })
      continue
    }

    const [matched] = pool.splice(idx, 1)
    enriched.push({ voto, pontoAtencao: matched })
  }

  return { enriched, unmatched: pool }
}
