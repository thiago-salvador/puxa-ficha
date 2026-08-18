/**
 * discovery-plausibility.ts
 *
 * Plausibility checks for weak (name-urna-uf) SQ_CANDIDATO matches.
 * Prevents homonym contamination by validating NM_CANDIDATO compatibility,
 * cargo plausibility, and other signals before accepting a discovery.
 */

export type MatchStatus = "accepted" | "suspect" | "rejected"

export interface PlausibilityResult {
  status: MatchStatus
  reasons: string[]
}

const FILLER_WORDS = new Set([
  "DE", "DA", "DO", "DAS", "DOS", "E", "DES", "DEL", "DI",
])

// Municipal-only cargos that a federal/state-level candidate would not hold
// in an election year where they are already serving at a higher level.
const MUNICIPAL_CARGOS = new Set([
  "VEREADOR",
  "VICE-PREFEITO",
])

const MUNICIPAL_YEARS = new Set([2004, 2008, 2012, 2016, 2020, 2024])

export function significantTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !FILLER_WORDS.has(t))
}

export function checkNameCompatibility(
  candidateNome: string,
  csvNome: string
): { score: number; reasons: string[] } {
  const ours = significantTokens(candidateNome)
  const theirs = significantTokens(csvNome)

  if (ours.length === 0 || theirs.length === 0) {
    return { score: 0, reasons: ["empty-name-tokens"] }
  }

  const reasons: string[] = []
  const ourFirst = ours[0]
  const theirFirst = theirs[0]
  const firstNameMatch = ourFirst === theirFirst

  if (!firstNameMatch) {
    const ourFirstAnywhere = theirs.includes(ourFirst)
    if (!ourFirstAnywhere) {
      reasons.push(`first-name-missing: ours=${ourFirst} not in CSV`)
    } else {
      reasons.push(`first-name-displaced: ours=${ourFirst} csv-first=${theirFirst}`)
    }
  }

  const oursInTheirs = ours.filter((t) => theirs.includes(t)).length
  const overlapRatio = oursInTheirs / ours.length

  if (overlapRatio < 0.5) {
    reasons.push(`low-overlap: ${oursInTheirs}/${ours.length}`)
  }

  const extraTokens = theirs.filter((t) => !ours.includes(t))
  const extraSignificant = extraTokens.length

  if (extraSignificant >= 2) {
    reasons.push(`extra-identity-tokens: ${extraTokens.join(",")}`)
  }

  let score = overlapRatio
  if (!firstNameMatch) {
    score *= 0.3
  }
  if (extraSignificant >= 2) {
    score *= 0.5
  }

  return { score, reasons }
}

export function assessWeakMatch(
  candidateNome: string,
  csvNome: string,
  csvCargo: string,
  ano: number
): PlausibilityResult {
  const nameCheck = checkNameCompatibility(candidateNome, csvNome)
  const allReasons = [...nameCheck.reasons]

  const cargoUpper = csvCargo.toUpperCase().trim()
  const isMunicipalCargo = MUNICIPAL_CARGOS.has(cargoUpper)
  const isMunicipalYear = MUNICIPAL_YEARS.has(ano)

  if (nameCheck.score < 0.2) {
    allReasons.push("name-score-very-low")
    return { status: "rejected", reasons: allReasons }
  }

  if (isMunicipalYear && isMunicipalCargo && nameCheck.score < 0.8) {
    allReasons.push(`municipal-cargo-in-municipal-year: ${cargoUpper} ${ano}`)
    return { status: "rejected", reasons: allReasons }
  }

  if (isMunicipalYear && isMunicipalCargo && nameCheck.reasons.length > 0) {
    allReasons.push(`municipal-cargo-with-name-concerns: ${cargoUpper} ${ano}`)
    return { status: "suspect", reasons: allReasons }
  }

  if (nameCheck.score < 0.6) {
    allReasons.push("name-score-mediocre")
    return { status: "suspect", reasons: allReasons }
  }

  if (nameCheck.reasons.length > 0 && nameCheck.score < 0.8) {
    return { status: "suspect", reasons: allReasons }
  }

  return { status: "accepted", reasons: allReasons }
}
