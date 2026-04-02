import type {
  CandidateAuditProfile,
  CandidatePublicSnapshot,
  CandidateSection,
} from "./audit-types"

export const APPLICABLE_SECTIONS_BY_PROFILE: Record<
  CandidateAuditProfile,
  readonly CandidateSection[]
> = {
  deputado_federal_em_exercicio: [
    "biografia",
    "historico_politico",
    "mudancas_partido",
    "patrimonio",
    "financiamento",
    "processos",
    "projetos_lei",
    "votos_candidato",
    "gastos_parlamentares",
  ],
  senador_em_exercicio: [
    "biografia",
    "historico_politico",
    "mudancas_partido",
    "patrimonio",
    "financiamento",
    "processos",
    "projetos_lei",
    "votos_candidato",
  ],
  executivo_em_exercicio: [
    "biografia",
    "historico_politico",
    "mudancas_partido",
    "patrimonio",
    "financiamento",
    "processos",
  ],
  ex_mandatario_sem_cargo_atual: [
    "biografia",
    "historico_politico",
    "mudancas_partido",
    "patrimonio",
    "financiamento",
    "processos",
  ],
  sem_mandato_previo: [
    "biografia",
    "mudancas_partido",
    "patrimonio",
    "financiamento",
    "processos",
  ],
}

const EXECUTIVE_TOKENS = [
  "governador",
  "governadora",
  "prefeito",
  "prefeita",
  "ministro",
  "ministra",
  "presidente",
  "vice presidente",
  "vice-presidente",
  "secretario",
  "secretaria",
]

const PAST_OFFICE_BIO_TOKENS = [
  "ex governador",
  "ex governadora",
  "ex prefeito",
  "ex prefeita",
  "ex senador",
  "ex senadora",
  "ex deputado",
  "ex deputada",
  "ex vereador",
  "ex vereadora",
  "ja foi ",
  "foi governador",
  "foi governadora",
  "foi prefeito",
  "foi prefeita",
  "foi senador",
  "foi senadora",
  "foi deputado",
  "foi deputada",
  "foi vereador",
  "foi vereadora",
]

function normalize(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
}

function includesAnyToken(value: string | null | undefined, tokens: string[]): boolean {
  const normalized = normalize(value)
  return tokens.some((token) => normalized.includes(token))
}

function hasDeputadoFederalOffice(value: string | null | undefined): boolean {
  const normalized = normalize(value)
  return normalized.includes("deputad") && normalized.includes("federal")
}

function hasSenadoOffice(value: string | null | undefined): boolean {
  const normalized = normalize(value)
  return normalized.includes("senador")
}

function hasCurrentPublicOffice(snapshot: CandidatePublicSnapshot): boolean {
  const normalized = normalize(snapshot.cargo_atual)
  if (!normalized) return false
  if (
    normalized.includes("sem cargo publico") ||
    normalized.includes("sem mandato") ||
    normalized.includes("nao ocupa cargo")
  ) {
    return false
  }
  return !normalized.startsWith("ex ")
}

function hasPastMandateEvidence(snapshot: CandidatePublicSnapshot): boolean {
  if (snapshot.total_historico_politico > 0) return true

  const normalizedCargoAtual = normalize(snapshot.cargo_atual)
  if (normalizedCargoAtual.startsWith("ex ")) return true

  return includesAnyToken(snapshot.biografia, PAST_OFFICE_BIO_TOKENS)
}

export function resolveAuditProfile(snapshot: CandidatePublicSnapshot): CandidateAuditProfile {
  if (hasDeputadoFederalOffice(snapshot.cargo_atual)) {
    return "deputado_federal_em_exercicio"
  }

  if (hasSenadoOffice(snapshot.cargo_atual)) {
    return "senador_em_exercicio"
  }

  if (
    includesAnyToken(snapshot.cargo_atual, EXECUTIVE_TOKENS) ||
    hasCurrentPublicOffice(snapshot)
  ) {
    return "executivo_em_exercicio"
  }

  if (hasPastMandateEvidence(snapshot)) {
    return "ex_mandatario_sem_cargo_atual"
  }

  return "sem_mandato_previo"
}

export function getApplicableSections(snapshot: CandidatePublicSnapshot): readonly CandidateSection[] {
  return APPLICABLE_SECTIONS_BY_PROFILE[resolveAuditProfile(snapshot)]
}

export function isSectionApplicable(
  snapshot: CandidatePublicSnapshot,
  section: CandidateSection
): boolean {
  return getApplicableSections(snapshot).includes(section)
}
