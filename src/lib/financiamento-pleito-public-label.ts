/**
 * Rótulo público de pleito para linhas de `financiamento` (via C: só UI, sem schema).
 *
 * Regra (fail-closed, não usa `cargo_disputado` atual do pleito 2026):
 * - Consideram-se linhas de `historico` cuja classificação editorial é **candidatura**
 *   (`isHistoricoCandidaturaRow`, alinhado a `historico-tipo-evento.ts`, inclui legado inferível)
 *   e cujo `periodo_inicio` coincide com `ano_eleicao` da linha de financiamento.
 * - Agrupa-se por par estável `(cargo_canonico|canonicalCargo, UF canónica)` usando
 *   `canonicalizeEstadoForStorage` (`src/lib/br-uf.ts`); valores não reconhecidos usam
 *   chave `raw:<token>` (NFD-stripped lower) para não colapsar estados distintos ilegíveis.
 * - Exatamente um pleito distinto -> `"{ano} - {cargo}"` (cargo = texto público da linha).
 *   Acrescenta-se `({UF})` **só** quando há sigla de UF na linha, o cargo não a espelha já
 *   no texto e o sufixo ajuda a desambiguar âmbito (ex. "Deputado Federal" + `PE`).
 *   Dois ou mais pleitos distintos após `(canon, UF)` → fallback **ambíguo** (fail-closed).
 * - Zero matches → fallback explícito (não finge saber o pleito).
 * - Mais de um pleito distinto após agrupamento → ambíguo (não escolhe campanha).
 */

import { canonicalizeEstadoForStorage, normalizeBrUfToken } from "@/lib/br-uf"
import { historicoCanonKey } from "@/lib/historico-display"
import { isHistoricoCandidaturaRow } from "@/lib/historico-tipo-evento"
import type { Financiamento, HistoricoPolitico } from "@/lib/types"

export type FinanciamentoPleitoPublicResolution = "unique" | "deduped" | "no_match" | "ambiguous"

export type FinanciamentoPleitoPublicLabelResult = {
  /** Texto único para overview, aba Dinheiro e timeline. */
  label: string
  resolution: FinanciamentoPleitoPublicResolution
}

/** Chave estável para dedupe: sigla UF canónica ou fallback explícito para texto não reconhecido. */
function estadoDedupeKey(estado: string | null | undefined): string {
  const canon = canonicalizeEstadoForStorage(estado)
  if (canon != null) return canon
  const raw = normalizeBrUfToken(estado)
  if (raw) return `raw:${raw}`
  return ""
}

function cargoDisplay(row: Pick<HistoricoPolitico, "cargo">): string {
  return (row.cargo ?? "").trim() || "Cargo não informado"
}

function estadoSuffixIfDisambiguates(cargo: string, estado: string | null | undefined): string {
  const uf = canonicalizeEstadoForStorage(estado)
  if (!uf) return ""
  const c = cargo.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  const ufLower = uf.toLowerCase()
  if (c.includes(` ${ufLower}`) || c.includes(`-${ufLower}`) || c.includes(`(${ufLower})`)) return ""
  if (c.includes(" brasil ") || c === "presidente" || c.includes("presidente do brasil")) return ""
  return ` (${uf})`
}

function collectCandidaturaRowsForFinanciamentoYear(
  historico: HistoricoPolitico[],
  anoEleicao: number,
): HistoricoPolitico[] {
  return historico.filter(
    (h) => h.periodo_inicio === anoEleicao && isHistoricoCandidaturaRow(h),
  )
}

function dedupeByCanonAndEstado(rows: HistoricoPolitico[]): HistoricoPolitico[] {
  const seen = new Set<string>()
  const out: HistoricoPolitico[] = []
  for (const row of rows) {
    const key = `${historicoCanonKey(row)}|${estadoDedupeKey(row.estado)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

export function resolveFinanciamentoPleitoPublicLabel(
  anoEleicao: number,
  historico: HistoricoPolitico[] | null | undefined,
): FinanciamentoPleitoPublicLabelResult {
  const list = historico ?? []
  const matches = collectCandidaturaRowsForFinanciamentoYear(list, anoEleicao)
  if (matches.length === 0) {
    return {
      label: `${anoEleicao} - pleito não identificado na trajetória pública`,
      resolution: "no_match",
    }
  }

  const deduped = dedupeByCanonAndEstado(matches)
  const resolution: FinanciamentoPleitoPublicResolution =
    matches.length > deduped.length ? "deduped" : "unique"

  if (deduped.length > 1) {
    return {
      label: `${anoEleicao} - pleitos ambíguos na trajetória (consulte a secção Trajetória)`,
      resolution: "ambiguous",
    }
  }

  const row = deduped[0]!
  const cargo = cargoDisplay(row)
  const suffix = estadoSuffixIfDisambiguates(cargo, row.estado)
  return {
    label: `${anoEleicao} - ${cargo}${suffix}`,
    resolution,
  }
}

/** Atalho quando só o texto final interessa. */
function formatFinanciamentoPleitoPublicLabel(
  anoEleicao: number,
  historico: HistoricoPolitico[] | null | undefined,
): string {
  return resolveFinanciamentoPleitoPublicLabel(anoEleicao, historico).label
}

export function formatFinanciamentoPleitoPublicLabelForRow(
  fin: Pick<Financiamento, "ano_eleicao">,
  historico: HistoricoPolitico[] | null | undefined,
): string {
  return formatFinanciamentoPleitoPublicLabel(fin.ano_eleicao, historico)
}
