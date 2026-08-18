import type { Candidato } from "@/lib/types"
import { getEstadoNome } from "@/lib/br-uf"
import { formatPartyPublicLabel, isUncertainParty } from "@/lib/party-utils"
import { normalizeForSearch } from "@/lib/search-normalize"
import { sanitizePtBrText } from "@/lib/ptbr-text"
import { formatCargoDisputadoPublicLabel } from "@/lib/ui-labels"

export { normalizeForSearch }

export interface VotacaoSearchRow {
  candidato_id: string
  votacao: { tema: string | null; titulo: string | null } | null
}

export interface GlobalSearchIndexItem {
  href: string
  title: string
  subtitle: string
  /** Texto já normalizado com `normalizeForSearch` para `includes` no cliente. */
  searchText: string
  /** Nome, partido, cargo, UF (sem temas/títulos de votação) — para ranking e deep link. */
  searchTextBio?: string
  /** Só temas e títulos de votação normalizados; vazio se não houver votos mapeados. */
  searchTextVotacao?: string
  foto_url?: string | null
  badge?: string | null
}

/** Limite de candidatos na lista principal do palette (busca vazia ou com filtro). */
export const GLOBAL_SEARCH_PALETTE_DISPLAY_LIMIT = 28

const DEFAULT_DISPLAY_LIMIT = GLOBAL_SEARCH_PALETTE_DISPLAY_LIMIT

/** Agrega temas e títulos distintos por candidato a partir das linhas de voto. */
export function mergeVotacaoTagsByCandidatoId(
  rows: VotacaoSearchRow[]
): Map<string, { temas: string[]; titulos: string[] }> {
  const temasMap = new Map<string, Set<string>>()
  const titulosMap = new Map<string, Set<string>>()

  for (const row of rows) {
    const v = row.votacao
    if (!v) continue
    const tema = v.tema?.trim()
    const titulo = v.titulo?.trim()
    if (tema) {
      let s = temasMap.get(row.candidato_id)
      if (!s) {
        s = new Set()
        temasMap.set(row.candidato_id, s)
      }
      s.add(tema)
    }
    if (titulo) {
      let s = titulosMap.get(row.candidato_id)
      if (!s) {
        s = new Set()
        titulosMap.set(row.candidato_id, s)
      }
      s.add(titulo)
    }
  }

  const ids = new Set([...temasMap.keys(), ...titulosMap.keys()])
  const out = new Map<string, { temas: string[]; titulos: string[] }>()
  for (const id of ids) {
    out.set(id, {
      temas: [...(temasMap.get(id) ?? [])].sort(),
      titulos: [...(titulosMap.get(id) ?? [])].sort(),
    })
  }
  return out
}

function buildSearchTextBioOnly(c: Candidato): string {
  const chunks: string[] = [
    c.nome_urna,
    c.nome_completo,
    isUncertainParty(c.partido_sigla) ? null : c.partido_sigla,
    isUncertainParty(c.partido_atual) ? null : c.partido_atual,
    c.cargo_disputado,
  ].filter((value): value is string => Boolean(value))
  if (c.cargo_atual) chunks.push(c.cargo_atual)
  if (c.estado) {
    chunks.push(c.estado)
    const nome = getEstadoNome(c.estado)
    if (nome) chunks.push(nome)
  }
  return normalizeForSearch(chunks.filter(Boolean).join(" "))
}

export function buildSearchTextForCandidato(
  c: Candidato,
  tags: { temas: string[]; titulos: string[] }
): string {
  const bio = buildSearchTextBioOnly(c)
  const vot = normalizeForSearch([...tags.temas, ...tags.titulos].join(" "))
  if (!vot) return bio
  return normalizeForSearch(`${bio} ${vot}`)
}

export function buildGlobalSearchIndexItems(
  candidatos: Candidato[],
  tagsById: Map<string, { temas: string[]; titulos: string[] }>
): GlobalSearchIndexItem[] {
  return candidatos.map((c) => {
    const tags = tagsById.get(c.id) ?? { temas: [], titulos: [] }
    const subtitle = [
      formatPartyPublicLabel(c.partido_sigla) || null,
      c.cargo_atual
        ? sanitizePtBrText(c.cargo_atual)
        : c.cargo_disputado
          ? formatCargoDisputadoPublicLabel(c.cargo_disputado)
          : null,
      c.estado,
    ]
      .filter(Boolean)
      .join(" · ")
    const searchTextBio = buildSearchTextBioOnly(c)
    const searchTextVotacao = normalizeForSearch(
      [...tags.temas, ...tags.titulos].join(" ")
    )
    return {
      href: `/candidato/${c.slug}`,
      title: c.nome_urna,
      subtitle,
      searchText: buildSearchTextForCandidato(c, tags),
      searchTextBio,
      searchTextVotacao: searchTextVotacao || undefined,
      foto_url: c.foto_url,
    }
  })
}

function paletteItemHaystack(item: GlobalSearchIndexItem): string {
  if (item.searchText) return item.searchText
  return normalizeForSearch(
    [item.title, item.subtitle, item.badge ?? ""].filter(Boolean).join(" ")
  )
}

/** Maior = melhor posição na lista. */
function scoreShortcutForQuery(item: GlobalSearchIndexItem, q: string): number {
  if (!q) return 0
  const t = normalizeForSearch(item.title)
  if (t === q) return 100
  if (t.startsWith(q)) return 85
  if (t.includes(q)) return 70
  const h = paletteItemHaystack(item)
  if (h.includes(q)) return 45
  return 0
}

/** Maior = melhor posição na lista. */
function scoreCandidateForQuery(item: GlobalSearchIndexItem, q: string): number {
  if (!q) return 0
  const t = normalizeForSearch(item.title)
  const bio = item.searchTextBio ?? item.searchText
  const vot = item.searchTextVotacao ?? ""
  if (t === q) return 100
  if (t.startsWith(q)) return 88
  if (t.includes(q)) return 72
  if (bio.includes(q) && !vot.includes(q)) return 55
  if (bio.includes(q) && vot.includes(q)) return 50
  if (vot.includes(q) && !bio.includes(q)) return 42
  if (item.searchText.includes(q)) return 35
  return 0
}

/**
 * Se o utilizador encontrou o candidato só por tema/título de votação, abre a aba Votos.
 * `tab=votos` é consumido por `normalizeCandidatoProfileTab` na ficha.
 */
export function resolveGlobalSearchHref(item: GlobalSearchIndexItem, query: string): string {
  const q = normalizeForSearch(query)
  if (!q || item.badge === "Atalho") return item.href
  const bio = item.searchTextBio ?? item.searchText
  const vot = item.searchTextVotacao ?? ""
  if (!vot) return item.href
  const matchedBio = bio.includes(q)
  const matchedVot = vot.includes(q)
  if (matchedVot && !matchedBio) {
    const sep = item.href.includes("?") ? "&" : "?"
    return `${item.href}${sep}tab=votos`
  }
  return item.href
}

export function filterGlobalSearchPalette(
  query: string,
  shortcuts: GlobalSearchIndexItem[],
  candidates: GlobalSearchIndexItem[],
  displayLimit = DEFAULT_DISPLAY_LIMIT
): { shortcuts: GlobalSearchIndexItem[]; candidates: GlobalSearchIndexItem[] } {
  const q = normalizeForSearch(query)
  if (!q) {
    return {
      shortcuts,
      candidates: candidates.slice(0, displayLimit),
    }
  }
  const filteredShortcuts = shortcuts
    .filter((s) => paletteItemHaystack(s).includes(q))
    .sort((a, b) => scoreShortcutForQuery(b, q) - scoreShortcutForQuery(a, q))
  const filteredCandidates = candidates
    .filter((c) => c.searchText.includes(q))
    .sort((a, b) => scoreCandidateForQuery(b, q) - scoreCandidateForQuery(a, q))
    .slice(0, displayLimit)
  return { shortcuts: filteredShortcuts, candidates: filteredCandidates }
}
