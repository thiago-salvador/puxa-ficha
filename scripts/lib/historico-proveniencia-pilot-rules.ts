/**
 * Regras **só** para backfill piloto P2b (`historico_politico.proveniencia`).
 * Idempotente: aplicar só quando `proveniencia` é NULL no banco.
 *
 * `null` = não materializar (caso ambíguo ou curadoria com menção TSE fora do padrão `(TSE AAAA)`).
 */

export type PilotProvenance = "tse" | "wikidata" | "manual"

/**
 * Critério **P2d** (lote baixo risco): mesma evidência textual que força `wikidata` em
 * `computePilotProvenanceForBackfill`, sem depender de outros ramos (TSE/manual).
 */
export function isWikidataSubstringP2dEligible(obs: string | null): boolean {
  const raw = obs ?? ""
  if (raw.trim() === "") return false
  const u = raw.toUpperCase()
  return u.includes("WIKIDATA") || u.includes("IMPORTADO AUTOMATICAMENTE")
}

/**
 * **P2e (piloto):** complemento típico fora do lote P2d — mandato **pré-1994** com `observacoes`
 * vazia e candidato com `wikidata_id`, quando ainda não há `proveniencia` na row.
 *
 * Não substitui curadoria: volume esperado baixo; se crescer, preferir whitelist ou revisão
 * humana antes de automatizar em massa.
 */
export function evaluateP2ePre1994NullObsWikidata(input: {
  proveniencia: string | null | undefined
  observacoes: string | null | undefined
  periodo_inicio: number | null | undefined
  wikidata_id: string | null | undefined
}): "wikidata" | null {
  const prov = input.proveniencia
  if (prov != null && String(prov).trim() !== "") return null
  const obs = input.observacoes
  if (obs != null && String(obs).trim() !== "") return null
  const y = input.periodo_inicio
  if (y == null || typeof y !== "number" || !Number.isFinite(y) || y >= 1994) return null
  const q = (input.wikidata_id ?? "").trim()
  if (q.length === 0) return null
  return "wikidata"
}

/**
 * Alta confiança para **primeira** materialização da coluna.
 * - **wikidata:** mesmos marcadores que `inferHistoricoObsSource`.
 * - **tse:** exige parênteses `(TSE AAAA)` como no template do ingest TSE; exclui texto típico de curadoria (`curadoria`, `.csv`).
 * - **manual:** observação vazia; ou texto sem TSE/Wikidata conforme abaixo.
 */
export function computePilotProvenanceForBackfill(obs: string | null): PilotProvenance | null {
  const raw = obs ?? ""
  const o = raw.trim()
  if (o === "") return "manual"

  const u = o.toUpperCase()
  if (isWikidataSubstringP2dEligible(o)) return "wikidata"

  if (/\(\s*TSE\s*\d{4}\s*\)/.test(raw)) {
    if (/\bCURADORIA\b/u.test(raw) || /\.csv\b/i.test(raw)) return null
    return "tse"
  }

  if (u.includes("TSE")) return null

  return "manual"
}
