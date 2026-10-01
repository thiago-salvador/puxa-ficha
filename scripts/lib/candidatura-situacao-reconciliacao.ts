import { SITUACAO_CANDIDATURA_DOMINIO } from "@/lib/situacao-candidatura"
import { lerEvidenciaSituacaoCandidatura } from "@/lib/candidatura-situacao-evidencia"
import { mapearJulgamento } from "./tse-situacao-julgamento"
import { stripAccents } from "../../src/lib/strip-accents"

export interface CandidaturaSituacaoDbRow {
  id: string
  slug: string
  sq_candidato_2026: string | null
  cargo_disputado: string | null
  estado: string | null
  situacao_candidatura: string | null
  status: string
  publicavel: boolean
  verificacao_campos: Record<string, unknown> | null
}

export interface SituacaoOficialFonte {
  fonte_url: string
  fonte_sha256: string
  verificado_em: string
}

export interface SituacaoOficialCandidatura {
  sq: string
  cargo: string
  uf: string
  observacoes?: Array<SituacaoOficialFonte & { descricao: string }>
  julgamento: SituacaoOficialFonte & {
    codigo: string | null
    descricao: string
    valor: string
  }
  concorrencia: (SituacaoOficialFonte & {
    descricao: string | null
    apto: boolean | null
    inapto: boolean | null
  }) | null
  recurso: (SituacaoOficialFonte & {
    descricao: string | null
    interposto: boolean | null
  }) | null
}

export interface SituacaoCandidaturaCasPlan {
  before: CandidaturaSituacaoDbRow
  official_evidence: readonly SituacaoOficialCandidatura[]
  after: {
    situacao_candidatura?: string
    verificacao_campos: Record<string, unknown>
  } | null
  status: "ready" | "unchanged" | "review_required" | "blocked"
  reasons: string[]
  ambiguities: string[]
}

const normalize = (value: string | null | undefined): string =>
  stripAccents(value ?? "").trim().toLocaleLowerCase("pt-BR")

function normalizeCargo(value: string | null | undefined): string | null {
  const cargo = normalize(value).replace(/\s+/g, " ")
  if (["governador", "governadora", "governo estadual"].includes(cargo)) return "GOVERNADOR"
  if (["senador", "senadora", "senado"].includes(cargo)) return "SENADOR"
  if (["presidente", "presidenta"].includes(cargo)) return "PRESIDENTE"
  return null
}

function normalizeUf(value: string | null | undefined): string | null {
  const uf = (value ?? "").trim().toLocaleUpperCase("pt-BR")
  return /^[A-Z]{2}$/.test(uf) ? uf : null
}

function exactDomainValue(value: string | null | undefined): string | null {
  const normalized = normalize(value)
  return SITUACAO_CANDIDATURA_DOMINIO.find((item) => normalize(item) === normalized) ?? null
}

function mapExactDescription(description: string): string | null {
  const normalized = normalize(description).replace(/\s+/g, " ")
  const exactOfficialAliases: Readonly<Record<string, string>> = {
    "indeferido em prazo recursal ou com recurso": "indeferido com recurso",
    "deferido em prazo recursal ou com recurso": "deferido com recurso",
  }
  const alias = exactOfficialAliases[normalized]
  if (alias) return exactDomainValue(alias)
  // Fonte detalhe e pacote complementar têm catálogos de código diferentes.
  // Descrição só é aceita por igualdade normalizada com o domínio ou aliases
  // oficiais completos declarados acima, sem busca por substring.
  return exactDomainValue(description)
}

function isComplementaryPackage(url: string): boolean {
  return /consulta_cand_complementar/i.test(url)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validOfficialSource(source: SituacaoOficialFonte | null | undefined): boolean {
  if (!source || !/^[a-f0-9]{64}$/i.test(source.fonte_sha256) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(source.verificado_em)) return false
  try {
    const url = new URL(source.fonte_url)
    return url.protocol === "https:" && (url.hostname === "tse.jus.br" || url.hostname.endsWith(".tse.jus.br")) && Number.isFinite(Date.parse(source.verificado_em))
  } catch {
    return false
  }
}

function matchesIdentity(row: CandidaturaSituacaoDbRow, evidence: SituacaoOficialCandidatura): boolean {
  return Boolean(
    row.sq_candidato_2026?.trim() && evidence.sq.trim() === row.sq_candidato_2026.trim() &&
    normalizeCargo(row.cargo_disputado) && normalizeCargo(row.cargo_disputado) === normalizeCargo(evidence.cargo) &&
    normalizeUf(row.estado) && normalizeUf(row.estado) === normalizeUf(evidence.uf),
  )
}

function officialReceipt(row: CandidaturaSituacaoDbRow, evidence: SituacaoOficialCandidatura, allEvidence: readonly SituacaoOficialCandidatura[], value: string, ambiguities: readonly string[], judgmentEvidence = evidence): Record<string, unknown> {
  return {
    estado: "publicado",
    candidate_id: row.id,
    verificado_em: evidence.julgamento.verificado_em,
    sq_candidato: evidence.sq.trim(),
    julgamento: { ...judgmentEvidence.julgamento, valor: value },
    fontes_julgamento: allEvidence.map(({ julgamento }) => ({ ...julgamento })),
    observacoes: allEvidence.flatMap(({ observacoes }) => observacoes ?? []),
    concorrencia: evidence.concorrencia,
    recurso: evidence.recurso,
    ambiguidades: [...ambiguities],
  }
}

function classifyJudgment(evidence: SituacaoOficialCandidatura): { value: string | null; problem: string | null; ambiguity?: string } {
  if (!evidence.julgamento?.descricao?.trim() || !evidence.julgamento.valor?.trim()) return { value: null, problem: "julgamento-sem-descricao-ou-valor-explicito" }
  if (!validOfficialSource(evidence.julgamento)) return { value: null, problem: "fonte-do-julgamento-invalida" }
  const valueFromDescription = mapExactDescription(evidence.julgamento.descricao)
  const explicitValue = exactDomainValue(evidence.julgamento.valor)
  if (!valueFromDescription || !explicitValue) return { value: null, problem: "julgamento-sem-mapeamento-seguro", ambiguity: `julgamento-fora-do-dominio:${evidence.julgamento.descricao}:${evidence.julgamento.valor}` }
  if (valueFromDescription !== explicitValue) return { value: null, problem: "julgamento-interno-inconsistente", ambiguity: `descricao-e-valor-divergem:${valueFromDescription}:${explicitValue}` }
  if (isComplementaryPackage(evidence.julgamento.fonte_url)) {
    if (!evidence.julgamento.codigo?.trim()) return { value: null, problem: "pacote-complementar-sem-codigo" }
    const mapped = mapearJulgamento({ sq: evidence.sq.trim(), codigo: evidence.julgamento.codigo, descricao: evidence.julgamento.descricao })
    if (!mapped.ok || mapped.valor !== explicitValue) return { value: null, problem: "codigo-do-pacote-complementar-inconsistente", ambiguity: `codigo-e-descricao-divergem:${evidence.julgamento.codigo}:${evidence.julgamento.descricao}:${explicitValue}` }
  }
  return { value: explicitValue, problem: null }
}

/** Produz plano CAS local. A função é pura e nunca faz I/O. */
export function planCandidaturaSituacao(
  row: CandidaturaSituacaoDbRow,
  officialInput: SituacaoOficialCandidatura | readonly SituacaoOficialCandidatura[],
): SituacaoCandidaturaCasPlan {
  const evidences = Array.isArray(officialInput) ? [...officialInput] : [officialInput as SituacaoOficialCandidatura]
  const reasons: string[] = []
  const ambiguities: string[] = []
  if (!row.sq_candidato_2026?.trim() || !normalizeCargo(row.cargo_disputado) || !normalizeUf(row.estado)) {
    return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons: ["identidade-local-incompleta"], ambiguities }
  }
  const matches = evidences.filter((evidence) => matchesIdentity(row, evidence))
  if (matches.length === 0) {
    reasons.push("identidade-oficial-nao-corresponde-por-sq-cargo-uf")
    return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons, ambiguities }
  }
  const evidence = matches[0]
  const classified = matches.map((item) => ({ evidence: item, result: classifyJudgment(item) }))
  for (const item of classified) {
    if (item.result.ambiguity) ambiguities.push(`${item.result.ambiguity} @ ${item.evidence.julgamento.fonte_url}`)
    if (item.result.problem) reasons.push(item.result.problem)
  }
  if (reasons.length > 0) return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons: [...new Set(reasons)], ambiguities }
  const values = [...new Set(classified.map((item) => item.result.value))]
  if (values.length > 1) {
    ambiguities.push(`fontes-oficiais-divergem:${classified.map(({ evidence: item, result }) => `${result.value} @ ${item.julgamento.fonte_url} sha256=${item.julgamento.fonte_sha256} verificado_em=${item.julgamento.verificado_em}`).join(" | ")}`)
    const currentValue = exactDomainValue(row.situacao_candidatura)
    const matchingCurrent = classified.find(({ result }) => result.value === currentValue)
    if (!matchingCurrent) return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons: ["fontes-oficiais-divergem", "situacao-atual-nao-corresponde-a-nenhuma-fonte"], ambiguities }
    const reviewValue = matchingCurrent.result.value!
    const detailEvidence = matches.find((item) => !isComplementaryPackage(item.julgamento.fonte_url)) ?? matchingCurrent.evidence
    for (const optional of [detailEvidence.concorrencia, detailEvidence.recurso]) {
      if (optional && !validOfficialSource(optional)) reasons.push(optional === detailEvidence.concorrencia ? "fonte-de-concorrencia-invalida" : "fonte-de-recurso-invalida")
    }
    if (reasons.length > 0) return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons: [...new Set(reasons)], ambiguities }
    const reviewReceipt = officialReceipt(row, detailEvidence, matches, reviewValue, ambiguities, matchingCurrent.evidence)
    const mergedReviewVerification = { ...(isRecord(row.verificacao_campos) ? row.verificacao_campos : {}), candidatura_situacao: reviewReceipt }
    if (!lerEvidenciaSituacaoCandidatura(reviewReceipt, reviewValue, row.sq_candidato_2026, row.id)) {
      return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons: ["recibo-de-revisao-nao-validado-pelo-consumidor-publico"], ambiguities }
    }
    return {
      before: structuredClone(row), official_evidence: structuredClone(evidences),
      after: { verificacao_campos: mergedReviewVerification }, status: "review_required",
      reasons: ["fontes-oficiais-divergem", "revisao-humana-necessaria"], ambiguities,
    }
  }

  for (const item of matches) {
    for (const optional of [item.concorrencia, item.recurso]) {
      if (optional && !validOfficialSource(optional)) {
        reasons.push(optional === item.concorrencia ? "fonte-de-concorrencia-invalida" : "fonte-de-recurso-invalida")
      }
    }
  }
  if (reasons.length > 0) return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons: [...new Set(reasons)], ambiguities }

  for (const item of matches) {
    if (item.concorrencia?.apto === true && item.concorrencia.inapto === true) ambiguities.push(`aptidao-e-inaptidao-ambas-verdadeiras:${item.concorrencia.fonte_url}`)
    const competitionFacts = new Set(matches.map((candidate) => `${candidate.concorrencia?.descricao ?? "∅"}|${candidate.concorrencia?.apto ?? "∅"}|${candidate.concorrencia?.inapto ?? "∅"}`))
    if (competitionFacts.size > 1) ambiguities.push(`fontes-de-concorrencia-divergem:${matches.map((candidate) => `${candidate.concorrencia?.descricao ?? "∅"}; apto=${candidate.concorrencia?.apto ?? "∅"}; inapto=${candidate.concorrencia?.inapto ?? "∅"} @ ${candidate.concorrencia?.fonte_url ?? "sem-fonte"}`).join(" | ")}`)
  }

  const nextValue = values[0]!
  const detailEvidence = matches.find((item) => !isComplementaryPackage(item.julgamento.fonte_url)) ?? evidence
  const receipt = officialReceipt(row, detailEvidence, matches, nextValue, ambiguities, evidence)
  const mergedVerification = { ...(isRecord(row.verificacao_campos) ? row.verificacao_campos : {}), candidatura_situacao: receipt }
  const parsed = lerEvidenciaSituacaoCandidatura(receipt, nextValue, row.sq_candidato_2026, row.id)
  if (!parsed) {
    return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: null, status: "blocked", reasons: ["recibo-oficial-nao-validado-pelo-consumidor-publico"], ambiguities }
  }
  if (row.situacao_candidatura === nextValue && JSON.stringify(row.verificacao_campos?.candidatura_situacao ?? null) === JSON.stringify(receipt)) {
    return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: { situacao_candidatura: nextValue, verificacao_campos: mergedVerification }, status: "unchanged", reasons, ambiguities }
  }
  return { before: structuredClone(row), official_evidence: structuredClone(evidences), after: { situacao_candidatura: nextValue, verificacao_campos: mergedVerification }, status: "ready", reasons, ambiguities }
}
