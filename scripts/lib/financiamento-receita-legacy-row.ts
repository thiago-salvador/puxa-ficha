/**
 * Prestações de receitas TSE anteriores a 2018 usam cabeçalhos distintos em
 * cada ciclo. Unifica os campos necessários ao ingest sem sintetizar identidade.
 */
import { stripAccents } from "../../src/lib/strip-accents"

function firstNonEmpty(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

function normalizeIdentityName(value: string): string {
  return stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

export function historicalCandidateRowMatches(
  row: Record<string, string>,
  candidate: { nome_completo: string; nome_urna: string; nome_completo_alternativos?: string[]; nome_urna_alternativos?: string[] },
): boolean {
  const officialNames = [
    row.NM_CANDIDATO,
    row.NOME_CANDIDATO,
    row.NO_CAND,
    row.NM_URNA_CANDIDATO,
    row.NOME_URNA,
  ]
    .map((value) => normalizeIdentityName(value ?? ""))
    .filter(Boolean)
  const expectedNames = [candidate.nome_completo, candidate.nome_urna, ...(candidate.nome_completo_alternativos ?? []), ...(candidate.nome_urna_alternativos ?? [])]
    .map(normalizeIdentityName)
    .filter(Boolean)
  return officialNames.some((official) => expectedNames.includes(official))
}

export function resolveLegacyReceiptSqIdentity(
  row: Record<string, string>,
  ano: number,
  identities: Array<{
    sqCandidato: string
    uf?: string
    candidato: { nome_completo: string; nome_urna: string }
    historicalIdentity?: { sg_ue?: string; cargo_codigo?: string; cargo?: string; numero?: string; nome?: string; nome_urna?: string; cpf_match?: boolean }
  }>,
): { sqCandidato: string; uf: string } | undefined {
  const uf = row.SG_UF_CANDIDATURA?.trim().toUpperCase()

  const matches = new Map<string, { sqCandidato: string; uf: string }>()
  for (const identity of identities) {
    const identityUf = identity.uf?.trim().toUpperCase()
    if (!identityUf || (uf && identityUf !== uf)) continue
    const historical = identity.historicalIdentity
    // A row without UF is unsafe even in newer packages: force the same
    // strong, source-derived municipality/cargo/number anchors used for
    // pre-2010 SQs instead of falling back to a nominal match.
    if ((ano < 2010 || !uf) && (!historical?.sg_ue || !historical.cargo_codigo || !historical.numero)) continue
    if (!historicalCandidateRowMatches(row, {
      ...identity.candidato,
      ...(historical?.nome ? { nome_completo_alternativos: [historical.nome] } : {}),
      ...(historical?.nome_urna ? { nome_urna_alternativos: [historical.nome_urna] } : {}),
    })) continue
    if (historical) {
      const rowSgUe = (row.SG_UE || row.SG_UE_SUP || row.SG_UE_SUPERIOR || "").trim().toUpperCase()
      const rowCargoCode = (row.CD_CARGO || row.CD_CARGO_CANDIDATO || "").trim().toUpperCase()
      const rowCargoLabel = (row.DS_CARGO || "").trim().toUpperCase()
      const rowNumero = (row.NR_CAND || row.NR_CANDIDATO || row.NUMERO_CANDIDATO || "").trim()
      if (historical.sg_ue && rowSgUe !== historical.sg_ue.trim().toUpperCase()) continue
      if (historical.cargo_codigo && rowCargoCode && rowCargoCode !== historical.cargo_codigo.trim().toUpperCase()) continue
      if (historical.cargo_codigo && !rowCargoCode && (!historical.cargo || rowCargoLabel !== historical.cargo.trim().toUpperCase())) continue
      if (historical.numero && rowNumero && rowNumero !== historical.numero.trim()) continue
      if (historical.numero && !rowNumero) continue
    }
    const match = { sqCandidato: identity.sqCandidato.trim(), uf: identityUf }
    matches.set(financiamentoReceitaIdentityKey({ ...match, ano }), match)
  }

  if (matches.size > 1) {
    throw new Error(`Financiamento ${ano}: identidade legada ambigua para nome e UF ${uf || "não informado"}`)
  }
  return matches.values().next().value
}

export function normalizeFinanciamentoReceitaRow(row: Record<string, string>): Record<string, string> {
  const sqCand = firstNonEmpty(row, [
    "SQ_CANDIDATO",
    "Sequencial Candidato",
    "SEQUENCIAL_CANDIDATO",
  ])
  const ufCandidate = firstNonEmpty(row, [
    "SG_UF_CANDIDATURA",
    "SG_UF",
    "UF",
    "UNIDADE_ELEITORAL_CANDIDATO",
    "SG_UE_SUPERIOR",
    "SG_UE_SUP",
  ]).toUpperCase()
  // `SG_UE_SUP` in ReceitaCandidato.csv can be a numeric municipality code,
  // never treat it as a UF. The resolver may use a single configured UF only
  // when the official legacy file omits a UF field entirely.
  const ufCandidatura = /^[A-Z]{2}$/.test(ufCandidate) ? ufCandidate : ""
  const sqRec = firstNonEmpty(row, [
    "SQ_RECEITA",
    "Numero Recibo Eleitoral",
    "Número Recibo Eleitoral",
    "Numero do documento",
    "Número do documento",
  ])
  const vr = firstNonEmpty(row, ["VR_RECEITA", "Valor receita", "VALOR_RECEITA"])
  const fonte = firstNonEmpty(row, ["DS_FONTE_RECEITA", "Fonte recurso", "FONTE_RECURSO"])
  const tipo = firstNonEmpty(row, [
    "Tipo receita",
    "TIPO_RECEITA",
    "TP_RECURSO",
    "DS_TITULO",
  ])
  const desc = firstNonEmpty(row, [
    "Descricao da receita",
    "Descrição da receita",
    "DESCRICAO_TIPO_RECURSO",
    "DS_ESP_RECURSO",
  ])
  const origemPadrao = firstNonEmpty(row, ["DS_ORIGEM_RECEITA"])
  const dsOrigem = [origemPadrao, tipo, desc].filter(Boolean).join(" — ")
  const nm = firstNonEmpty(row, ["NM_DOADOR", "Nome do doador", "NO_DOADOR", "NOME_DOADOR"])
  const nmRfb = firstNonEmpty(row, ["NM_DOADOR_RFB", "Nome do doador RFB"])

  return {
    ...row,
    SQ_CANDIDATO: sqCand || row.SQ_CANDIDATO,
    SG_UF_CANDIDATURA: ufCandidatura || row.SG_UF_CANDIDATURA,
    SQ_RECEITA: sqRec || row.SQ_RECEITA,
    VR_RECEITA: vr || row.VR_RECEITA,
    DS_FONTE_RECEITA: fonte || row.DS_FONTE_RECEITA,
    DS_ORIGEM_RECEITA: dsOrigem || row.DS_ORIGEM_RECEITA,
    NM_DOADOR: nm || row.NM_DOADOR,
    NM_DOADOR_RFB: nmRfb || row.NM_DOADOR_RFB,
  }
}

export function financiamentoReceitaIdentity(
  row: Record<string, string>,
  ano: number,
  ufEsperada?: string,
): { sqCandidato: string; ano: number; uf: string } {
  const sqCandidato = row.SQ_CANDIDATO?.trim()
  if (!sqCandidato) {
    throw new Error(`Financiamento ${ano}: SQ_CANDIDATO ausente no layout oficial`)
  }
  if (!Number.isInteger(ano) || ano < 1900 || ano > 2100) {
    throw new Error(`Financiamento: ano inválido (${ano})`)
  }
  const explicitUf = row.SG_UF_CANDIDATURA?.trim().toUpperCase()
  const uf = explicitUf
  if (!uf) {
    throw new Error(`Financiamento ${ano} SQ ${sqCandidato}: UF da candidatura ausente`)
  }
  const expected = ufEsperada?.trim().toUpperCase()
  if (expected && expected !== uf) {
    throw new Error(
      `Financiamento ${ano} SQ ${sqCandidato}: UF divergente, fonte=${uf}, identidade=${expected}`,
    )
  }
  return { sqCandidato, ano, uf }
}

export function financiamentoReceitaIdentityKey(identity: {
  sqCandidato: string
  ano: number
  uf: string
}): string {
  return `${identity.ano}:${identity.uf.trim().toUpperCase()}:${identity.sqCandidato.trim()}`
}
