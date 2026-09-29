export type ProgramaTextMatch = { start: number; end: number }

/**
 * Removes accents while keeping punctuation and whitespace literal. This is
 * deliberately shared by the public search and the in-document highlighter.
 */
export function normalizedSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("pt-BR")
}

export type ProgramaTextSearchIndex = {
  searchable: string
  starts?: Uint32Array
  ends?: Uint32Array
}

const NORMALIZED_CHARACTER_CACHE = new Map<string, string>()

function normalizedCharacter(character: string): string {
  const cached = NORMALIZED_CHARACTER_CACHE.get(character)
  if (cached !== undefined) return cached
  const normalized = normalizedSearch(character)
  NORMALIZED_CHARACTER_CACHE.set(character, normalized)
  return normalized
}

export function createProgramaTextSearchIndex(
  text: string,
  options: { withOffsets?: boolean } = {},
): ProgramaTextSearchIndex {
  // Whole-string lowercasing treats capital sigma contextually. Keep the
  // character mapping for those strings so both index modes stay equivalent.
  if (options.withOffsets === false && !text.includes("Σ")) {
    return { searchable: normalizedSearch(text) }
  }
  const searchable: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  const withOffsets = options.withOffsets !== false
  let originalOffset = 0

  for (const character of text) {
    const start = originalOffset
    originalOffset += character.length
    const normalized = normalizedCharacter(character)
    // `String#indexOf` reports UTF-16 offsets. Keep one mapping entry per
    // UTF-16 code unit so astral characters cannot shift the following match.
    for (let index = 0; index < normalized.length; index += 1) {
      searchable.push(normalized[index])
      if (withOffsets) {
        starts.push(start)
        ends.push(originalOffset)
      }
    }
  }

  const index: ProgramaTextSearchIndex = { searchable: searchable.join("") }
  if (withOffsets) {
    index.starts = Uint32Array.from(starts)
    index.ends = Uint32Array.from(ends)
  }
  return index
}

export function findProgramaTextMatchesInIndex(
  index: ProgramaTextSearchIndex,
  rawQuery: string,
  originalText?: string,
): ProgramaTextMatch[] {
  const query = normalizedSearch(rawQuery.trim())
  if (!query) return []

  let starts = index.starts
  let ends = index.ends
  if (!starts || !ends) {
    if (originalText === undefined) throw new Error("Índice de texto sem offsets requer texto original")
    const mapped = createProgramaTextSearchIndex(originalText)
    starts = mapped.starts
    ends = mapped.ends
  }
  if (!starts || !ends) throw new Error("Índice de texto sem offsets")
  const matches: ProgramaTextMatch[] = []
  let cursor = 0
  while (cursor <= index.searchable.length - query.length) {
    const matchIndex = index.searchable.indexOf(query, cursor)
    if (matchIndex < 0) break
    matches.push({
      start: starts[matchIndex],
      end: ends[matchIndex + query.length - 1],
    })
    cursor = matchIndex + Math.max(1, query.length)
  }
  return matches
}

export function countProgramaTextMatchesInIndex(index: ProgramaTextSearchIndex, rawQuery: string): number {
  const query = normalizedSearch(rawQuery.trim())
  if (!query) return 0
  let count = 0
  let cursor = 0
  while (cursor <= index.searchable.length - query.length) {
    const matchIndex = index.searchable.indexOf(query, cursor)
    if (matchIndex < 0) break
    count += 1
    cursor = matchIndex + Math.max(1, query.length)
  }
  return count
}

export function findProgramaTextMatches(text: string, rawQuery: string): ProgramaTextMatch[] {
  if (!rawQuery.trim()) return []
  return findProgramaTextMatchesInIndex(createProgramaTextSearchIndex(text), rawQuery)
}
