import { canonicalCargo } from "./cargo-utils"

const BROAD_CURRENT_OFFICE_CANONICAL_MATCH = new Set([
  "Presidente",
  "Vice-Presidente",
  "Governador",
  "Vice-Governador",
  "Prefeito",
  "Vice-Prefeito",
  "Senador",
  "Deputado Federal",
  "Deputado Estadual",
  "Deputado Distrital",
  "Vereador",
])

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

function canonicalHistoricoCargo(
  row: { cargo: string; cargo_canonico: string | null | undefined }
): string {
  return (row.cargo_canonico?.trim() || canonicalCargo(row.cargo)).trim()
}

export function isSyntheticCurrentOfficeAnchorObservation(observacoes: string | null | undefined): boolean {
  const normalized = normalizeText(observacoes)
  return (
    normalized.includes("cargo atual confirmado na atualizacao do perfil") &&
    normalized.includes("inicio do mandato ainda nao determinado")
  )
}

export function currentOfficeMatchesHistoricoRow(
  currentOffice: string,
  row: { cargo: string; cargo_canonico: string | null | undefined }
): boolean {
  if (normalizeText(row.cargo) === normalizeText(currentOffice)) {
    return true
  }

  const currentCanon = canonicalCargo(currentOffice).trim()
  const rowCanon = canonicalHistoricoCargo(row)
  if (!currentCanon || currentCanon !== rowCanon) {
    return false
  }

  return BROAD_CURRENT_OFFICE_CANONICAL_MATCH.has(currentCanon)
}
