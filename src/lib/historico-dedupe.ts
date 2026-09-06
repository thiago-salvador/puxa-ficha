import { canonicalCargo } from "@/lib/cargo-utils"
import { longFormMatchesUfSigla, normalizeBrUfToken } from "@/lib/br-uf"
import { isHistoricoCandidaturaRow } from "@/lib/historico-tipo-evento"
import { resolveHistoricoRowProvenance } from "@/lib/historico-provenance"
import type { Candidato, HistoricoPolitico } from "@/lib/types"

const CURRENT_CANDIDACY_ELECTION_YEAR = 2026

/** Alinhado a `historicoCanonKey` em `historico-display.ts`. */
function historicoCanonKeyForRow(row: Pick<HistoricoPolitico, "cargo" | "cargo_canonico">): string {
  return (row.cargo_canonico?.trim() || canonicalCargo(row.cargo ?? "")).trim()
}

/**
 * A candidatura vigente pertence ao perfil atual, enquanto `historico_politico`
 * também guarda mandatos e pleitos anteriores. Projeta a candidatura atual na
 * trajetória quando a linha denormalizada não existe, sem apagar um mandato do
 * mesmo cargo e ano.
 */
export function ensureCurrentCandidacyInHistory(
  candidato: Pick<
    Candidato,
    | "id"
    | "cargo_disputado"
    | "partido_sigla"
    | "estado"
    | "status"
    | "fonte_dados"
  >,
  rows: HistoricoPolitico[],
  electionYear = CURRENT_CANDIDACY_ELECTION_YEAR,
): HistoricoPolitico[] {
  if (
    candidato.cargo_disputado === "Nenhum" ||
    candidato.status === "desistente" ||
    candidato.status === "removido"
  ) {
    return rows
  }

  const currentCargo = canonicalCargo(candidato.cargo_disputado)
  const isCurrentCandidacy = (row: HistoricoPolitico) =>
    row.periodo_inicio === electionYear &&
    isHistoricoCandidaturaRow(row) &&
    canonicalCargo(row.cargo_canonico?.trim() || row.cargo) === currentCargo
  // `status=candidato` é o contrato público de registro oficial. Estados
  // editoriais anteriores permanecem como `pre-candidato`.
  const hasOfficialRegistration = candidato.status === "candidato"
  const alreadyPresent = rows.some(
    (row) =>
      isCurrentCandidacy(row),
  )
  if (alreadyPresent) {
    // O registro oficial pode chegar depois da linha editorial de
    // pré-candidatura. Quando o perfil já tem SQ_CANDIDATO vigente, conservar
    // `manual`/`misto` aqui faria a âncora de pleitos ignorar 2026 e esconder
    // patrimônio e financiamento já coletados. A normalização é apenas da
    // candidatura corrente e não reclassifica outras linhas da trajetória.
    return hasOfficialRegistration
      ? rows.map((row) => isCurrentCandidacy(row) ? { ...row, proveniencia: "tse" } : row)
      : rows
  }

  const proveniencia = hasOfficialRegistration || candidato.fonte_dados.some((fonte) => /\btse\b/i.test(fonte))
    ? "tse"
    : "manual"

  return [
    ...rows,
    {
      id: `perfil-atual-${candidato.id}-${electionYear}`,
      candidato_id: candidato.id,
      cargo: candidato.cargo_disputado,
      cargo_canonico: currentCargo,
      tipo_evento: "candidatura",
      periodo_inicio: electionYear,
      periodo_fim: electionYear,
      partido: candidato.partido_sigla,
      estado: candidato.estado ?? "BR",
      eleito_por: "",
      observacoes: null,
      proveniencia,
    },
  ]
}

/**
 * Dois mandatos presidenciais abertos com inícios muito afastados (ex.: 2002 e 2022) costumam ser
 * um único registo “aberto” antigo + o mandato atual, sem linhas para os dois mandatos de 4 anos
 * (eleições 2002 e 2006). Expande em dois períodos fechados 2002–2006 e 2006–2010 antes do hiato.
 */
export function splitBrasilPresidenteTwoOpenLongGap(rows: HistoricoPolitico[]): HistoricoPolitico[] {
  let out = [...rows]
  const isPresidente = (r: HistoricoPolitico) => historicoCanonKeyForRow(r) === "Presidente"

  while (true) {
    const openPresidentes = out
      .filter((r) => isPresidente(r) && r.periodo_fim == null && r.periodo_inicio != null)
      .sort((a, b) => (a.periodo_inicio ?? 0) - (b.periodo_inicio ?? 0))

    let applied = false
    for (let k = 0; k < openPresidentes.length - 1; k++) {
      const first = openPresidentes[k]!
      const second = openPresidentes[k + 1]!
      const Y = first.periodo_inicio!
      const Z = second.periodo_inicio!
      if (Z - Y < 16) continue

      const hasMiddle = out.some(
        (r) =>
          r.id !== first.id &&
          r.id !== second.id &&
          isPresidente(r) &&
          r.periodo_inicio != null &&
          r.periodo_inicio > Y &&
          r.periodo_inicio < Z,
      )
      if (hasMiddle) continue

      const t1: HistoricoPolitico = { ...first, id: `${first.id}-pf-s1`, periodo_fim: Y + 4 }
      const t2: HistoricoPolitico = {
        ...first,
        id: `${first.id}-pf-s2`,
        periodo_inicio: Y + 4,
        periodo_fim: Y + 8,
      }
      out = out.filter((r) => r.id !== first.id)
      out.push(t1, t2)
      applied = true
      break
    }
    if (!applied) break
  }
  return out
}

/** Deduplicação + normalizações editoriais para lista exibida na ficha e na timeline. */
export function normalizeHistoricoPoliticoForDisplay(rows: HistoricoPolitico[]): HistoricoPolitico[] {
  return splitBrasilPresidenteTwoOpenLongGap(
    dropRedundantUndatedHistoricoRows(
      shrinkNarrativeHeadAgainstSameSeriesTseSegments(
        resolvePartyChangeMidMandateOverlaps(
          collapseAdjacentTseMandatePairs(dedupeHistoricoPoliticoForDisplay(rows))
        )
      )
    )
  )
}

/**
 * Colapsa o padrão "row narrativa (curadoria) + N mandatos segmentados TSE do mesmo cargo+partido+estado".
 *
 * Caso típico (marcos-vieira): curadoria cria uma row 2003-atual PSDB cobrindo 5 mandatos TSE
 * (2006-2010, 2010-2014, 2014-2018, 2018-2022, 2022-atual). Ambos formatos convivem no banco,
 * produzindo sobreposições que `countHistoricoSobreposicoesCargo` conta no audit, mesmo quando
 * `resolvePartyChangeMidMandateOverlaps` não se aplica (partidos iguais).
 *
 * Regra:
 * - Agrupa rows por `cargo_canonico + partido (normalizado) + estado (normalizado)`.
 * - Dentro do grupo, uma row é "narrativa" se as observacoes NÃO tiverem marker de eleição TSE
 *   (`eleito`/`eleita`) e NÃO forem candidaturas.
 * - Se a narrativa começa antes da mais antiga TSE sobreposta, encurtamos a narrativa para
 *   terminar onde a TSE começa (preserva o cabeçalho descoberto pela TSE).
 * - Se a narrativa cai inteira dentro do span das TSE sobrepostas, a narrativa é dropada.
 *
 * Preserva rows TSE originais + candidaturas intactas; só mexe na narrativa.
 */
function shrinkNarrativeHeadAgainstSameSeriesTseSegments(
  rows: HistoricoPolitico[],
): HistoricoPolitico[] {
  const seriesKeyOf = (row: HistoricoPolitico): string => {
    const canon = historicoCanonKeyForRow(row)
    const partido = normalizeLooseToken(row.partido)
    const estado = normalizeLooseToken(row.estado)
    return `${canon}|${partido}|${estado}`
  }

  const hasTseElectionMarker = (row: HistoricoPolitico): boolean => {
    if (isHistoricoCandidaturaRow(row)) return false
    const obs = normalizeObsForHeuristics(row.observacoes).trim()
    // Linhas TSE começam com ELEITO/ELEITA e trazem a assinatura literal `(TSE YYYY)` inserida
    // pelo ingest do TSE. Narrativas editoriais (curadoria) também podem abrir com "Eleito em 2018..."
    // e citar TSE no meio — não são linhas TSE. Exigir AMBOS critérios evita falsos positivos.
    return /^eleito|^eleita/.test(obs) && /\(tse\s/.test(obs)
  }

  const grouped = new Map<string, HistoricoPolitico[]>()
  for (const row of rows) {
    const list = grouped.get(seriesKeyOf(row)) ?? []
    list.push(row)
    grouped.set(seriesKeyOf(row), list)
  }

  const out: HistoricoPolitico[] = []
  for (const group of grouped.values()) {
    const mandatos = group.filter((r) => !isHistoricoCandidaturaRow(r) && r.periodo_inicio != null)
    const narratives = mandatos.filter((r) => !hasTseElectionMarker(r))
    const tseRows = mandatos.filter((r) => hasTseElectionMarker(r))
    const candidaturas = group.filter((r) => isHistoricoCandidaturaRow(r) || r.periodo_inicio == null)

    if (tseRows.length === 0 || narratives.length === 0) {
      out.push(...mandatos, ...candidaturas)
      continue
    }

    const adjusted: HistoricoPolitico[] = []
    for (const narr of narratives) {
      const ni = narr.periodo_inicio!
      const nf = narr.periodo_fim ?? Number.POSITIVE_INFINITY
      const overlapping = tseRows.filter((t) => {
        const tFim = t.periodo_fim ?? Number.POSITIVE_INFINITY
        return Math.max(ni, t.periodo_inicio!) < Math.min(nf, tFim)
      })
      if (overlapping.length === 0) {
        adjusted.push(narr)
        continue
      }
      const minTseInicio = Math.min(...overlapping.map((t) => t.periodo_inicio!))
      if (ni < minTseInicio) {
        adjusted.push({ ...narr, periodo_fim: minTseInicio })
        continue
      }
      // Narrativa começa dentro/depois das TSE sobrepostas → drop (TSE é mais preciso).
    }

    out.push(...adjusted, ...tseRows, ...candidaturas)
  }
  return out
}

/**
 * Detecta o padrão `linha_ampla_manual_vs_mandatos_tse_segmentados`:
 * uma row com período amplo (>= 12 anos) cobre 2 ou mais outras rows
 * do mesmo `cargo_canonico` que cabem totalmente dentro dela.
 *
 * Caso confirmado em `aldo-rebelo`: row manual `Deputado Federal 1991-2015`
 * convivendo com 5 mandatos segmentados TSE (1994-1998, 1998-2002,
 * 2002-2006, 2006-2010, 2010-2014). O gate atual de sobreposição
 * semântica não pega esse caso porque exige partidos diferentes; aqui
 * a row ampla normalmente está no mesmo partido das segmentadas.
 *
 * Usado como gate da Fase 0 para bloquear a renderização da seção de
 * histórico político quando há row manual ampla concorrendo com
 * mandatos segmentados do mesmo cargo canônico.
 */
export function hasWideManualOverlappingSegmentedMandates(
  rows: readonly HistoricoPolitico[],
): boolean {
  const WIDE_SPAN_THRESHOLD = 12

  const grouped = new Map<string, HistoricoPolitico[]>()
  for (const row of rows) {
    if (isHistoricoCandidaturaRow(row)) continue
    if (row.periodo_inicio == null || row.periodo_fim == null) continue
    const canon = historicoCanonKeyForRow(row)
    if (!canon) continue
    const list = grouped.get(canon) ?? []
    list.push(row)
    grouped.set(canon, list)
  }

  for (const group of grouped.values()) {
    if (group.length < 3) continue
    for (const wide of group) {
      const wideStart = wide.periodo_inicio!
      const wideEnd = wide.periodo_fim!
      const wideSpan = wideEnd - wideStart
      if (wideSpan < WIDE_SPAN_THRESHOLD) continue

      let innerCount = 0
      for (const inner of group) {
        if (inner.id === wide.id) continue
        const innerStart = inner.periodo_inicio!
        const innerEnd = inner.periodo_fim!
        const innerSpan = innerEnd - innerStart
        if (innerSpan >= wideSpan) continue
        if (innerStart >= wideStart && innerEnd <= wideEnd) {
          innerCount++
          if (innerCount >= 2) return true
        }
      }
    }
  }

  return false
}

/**
 * Conta sobreposições semânticas: mesmo cargo canônico, períodos sobrepostos, partidos diferentes.
 * Usado pelo gate factual para detectar ambiguidades visíveis na ficha pública.
 */
export function countHistoricoSemanticOverlaps(rows: HistoricoPolitico[]): number {
  let count = 0
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]
    if (a.periodo_inicio == null) continue
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j]
      if (b.periodo_inicio == null) continue
      if (isHistoricoCandidaturaRow(a) || isHistoricoCandidaturaRow(b)) continue
      if (historicoCanonKeyForRow(a) !== historicoCanonKeyForRow(b)) continue
      const aFim = a.periodo_fim ?? Number.POSITIVE_INFINITY
      const bFim = b.periodo_fim ?? Number.POSITIVE_INFINITY
      if (Math.max(a.periodo_inicio, b.periodo_inicio) < Math.min(aFim, bFim)) {
        const aPartido = (a.partido ?? "").trim().toLowerCase()
        const bPartido = (b.partido ?? "").trim().toLowerCase()
        if (aPartido !== bPartido) count++
      }
    }
  }
  return count
}

/**
 * Resolve sobreposição entre mandatos do mesmo cargo com partidos diferentes.
 *
 * Padrão típico: deputado 2014-2018 PP + deputado 2016-2019 PSC, onde houve
 * troca de partido durante o mandato. A resolução trunca o período anterior
 * para terminar quando o posterior começa, eliminando a ambiguidade visual.
 */
function resolvePartyChangeMidMandateOverlaps(rows: HistoricoPolitico[]): HistoricoPolitico[] {
  const grouped = new Map<string, HistoricoPolitico[]>()
  for (const row of rows) {
    const key = historicoCanonKeyForRow(row)
    const list = grouped.get(key) ?? []
    list.push(row)
    grouped.set(key, list)
  }

  const resolved: HistoricoPolitico[] = []

  for (const group of grouped.values()) {
    const mandatos = group
      .filter((r) => !isHistoricoCandidaturaRow(r) && r.periodo_inicio != null)
      .sort((a, b) => (a.periodo_inicio ?? 0) - (b.periodo_inicio ?? 0))
    const candidaturas = group.filter(
      (r) => isHistoricoCandidaturaRow(r) || r.periodo_inicio == null
    )

    const adjusted: HistoricoPolitico[] = []
    for (const row of mandatos) {
      const partido = (row.partido ?? "").trim().toLowerCase()
      const fim = row.periodo_fim ?? Number.POSITIVE_INFINITY

      // Check if a later row in the same cargo overlaps with different party
      const laterOverlap = mandatos.find(
        (other) =>
          other.id !== row.id &&
          other.periodo_inicio != null &&
          other.periodo_inicio > (row.periodo_inicio ?? 0) &&
          other.periodo_inicio < fim &&
          (other.partido ?? "").trim().toLowerCase() !== partido
      )

      if (laterOverlap && laterOverlap.periodo_inicio != null) {
        // Truncate this row to end where the later one begins
        const newFim = laterOverlap.periodo_inicio
        if (newFim > (row.periodo_inicio ?? 0)) {
          adjusted.push({ ...row, periodo_fim: newFim })
        }
        // else: the overlap completely subsumes this row, drop it
      } else {
        adjusted.push(row)
      }
    }

    resolved.push(...adjusted, ...candidaturas)
  }

  return resolved
}

function historicoDedupeKey(row: HistoricoPolitico): string {
  const canon = (row.cargo_canonico?.trim() || canonicalCargo(row.cargo ?? "")).trim()
  const ini = row.periodo_inicio != null ? String(row.periodo_inicio) : ""
  const fim = row.periodo_fim != null ? String(row.periodo_fim) : ""
  return `${canon}|${ini}|${fim}`
}

function historicoRowRichness(row: HistoricoPolitico): number {
  return (
    (row.observacoes?.length ?? 0) +
    (row.cargo?.length ?? 0) +
    (row.partido?.length ?? 0) +
    (row.estado?.length ?? 0)
  )
}

function pickRicherHistorico(a: HistoricoPolitico, b: HistoricoPolitico): HistoricoPolitico {
  const da = historicoRowRichness(a)
  const db = historicoRowRichness(b)
  if (db !== da) return db > da ? b : a
  return a.id.localeCompare(b.id) <= 0 ? a : b
}

/**
 * Remove linhas duplicadas para exibição quando o banco ainda tem mais de um registo
 * para o mesmo cargo canónico e período (ex.: antes do UNIQUE ou ingestões sobrepostas).
 */
export function dedupeHistoricoPoliticoForDisplay(rows: HistoricoPolitico[]): HistoricoPolitico[] {
  const map = new Map<string, HistoricoPolitico>()
  for (const row of rows) {
    const key = historicoDedupeKey(row)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, row)
      continue
    }
    map.set(key, pickRicherHistorico(existing, row))
  }
  return [...map.values()]
}

function normalizeObsForHeuristics(obs: string | null | undefined): string {
  return (obs ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function normalizeLooseToken(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

function historicoInclusiveYearRangesOverlap(
  inicioA: number,
  fimA: number | null,
  inicioB: number,
  fimB: number | null,
): boolean {
  const endA = fimA ?? Number.POSITIVE_INFINITY
  const endB = fimB ?? Number.POSITIVE_INFINITY
  return Math.max(inicioA, inicioB) <= Math.min(endA, endB)
}

function isTseAdjacentYearOverlappingMandatePair(
  older: HistoricoPolitico,
  newer: HistoricoPolitico,
): boolean {
  if (isHistoricoCandidaturaRow(older) || isHistoricoCandidaturaRow(newer)) {
    return false
  }
  if (resolveHistoricoRowProvenance(older) !== "tse") return false
  if (resolveHistoricoRowProvenance(newer) !== "tse") return false
  if (historicoCanonKeyForRow(older) !== historicoCanonKeyForRow(newer)) return false
  if (older.periodo_inicio == null || newer.periodo_inicio == null) return false
  if (Math.abs(older.periodo_inicio - newer.periodo_inicio) !== 1) return false
  return historicoInclusiveYearRangesOverlap(
    older.periodo_inicio,
    older.periodo_fim,
    newer.periodo_inicio,
    newer.periodo_fim,
  )
}

function isLikelyTseElectionPlaceholder(older: HistoricoPolitico): boolean {
  if (isHistoricoCandidaturaRow(older)) return false
  if (resolveHistoricoRowProvenance(older) !== "tse") return false
  const obs = normalizeObsForHeuristics(older.observacoes)
  return obs.includes("eleito") || obs.includes("eleita")
}

/** Permite sigla UF ↔ nome do estado conhecido; bloqueia textos longos diferentes (ex.: RJ vs São Paulo). */
function historicoEstadosLooselyCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ta = normalizeBrUfToken(a)
  const tb = normalizeBrUfToken(b)
  if (!ta || !tb) return true
  if (ta === tb) return true
  if (ta.length === 2 && tb.length === 2) return ta === tb
  if (ta.length === 2 && tb.length > 2) return longFormMatchesUfSigla(ta, tb)
  if (tb.length === 2 && ta.length > 2) return longFormMatchesUfSigla(tb, ta)
  return false
}

function isAdjacentElectionYearPlaceholderPair(
  older: HistoricoPolitico,
  newer: HistoricoPolitico,
): boolean {
  if (older.periodo_inicio == null || newer.periodo_inicio == null) return false
  if (newer.periodo_inicio - older.periodo_inicio !== 1) return false
  if (historicoCanonKeyForRow(older) !== historicoCanonKeyForRow(newer)) return false
  if (!isLikelyTseElectionPlaceholder(older)) return false
  if (isHistoricoCandidaturaRow(newer)) return false
  // Partidos podem divergir entre ingestão TSE (pleito) e curadoria do mandato; só exigir match quando ambas as linhas são TSE.
  const newerSrc = resolveHistoricoRowProvenance(newer)
  const olderSrc = resolveHistoricoRowProvenance(older)
  if (
    olderSrc === "tse" &&
    newerSrc === "tse" &&
    normalizeLooseToken(older.partido) !== "" &&
    normalizeLooseToken(newer.partido) !== "" &&
    normalizeLooseToken(older.partido) !== normalizeLooseToken(newer.partido)
  ) {
    return false
  }
  // Evitar falso negativo quando um registo traz UF (ex.: "RJ") e outro veio vazio ou com texto longo na curadoria.
  if (!historicoEstadosLooselyCompatible(older.estado, newer.estado)) return false
  return historicoInclusiveYearRangesOverlap(
    older.periodo_inicio,
    older.periodo_fim,
    newer.periodo_inicio,
    newer.periodo_fim,
  )
}

/**
 * Colapsa o padrão benigno "ano da eleição TSE" + "ano de posse" para o mesmo mandato,
 * mantendo a linha mais recente (ex.: 2022 aberto + 2023 aberto -> fica 2023).
 */
function collapseAdjacentTseMandatePairs(rows: HistoricoPolitico[]): HistoricoPolitico[] {
  const grouped = new Map<string, HistoricoPolitico[]>()

  for (const row of rows) {
    const canon = historicoCanonKeyForRow(row)
    const list = grouped.get(canon) ?? []
    list.push(row)
    grouped.set(canon, list)
  }

  const collapsed: HistoricoPolitico[] = []

  for (const group of grouped.values()) {
    const kept: HistoricoPolitico[] = []
    const sorted = [...group].sort((a, b) => {
      const startDiff = (b.periodo_inicio ?? Number.NEGATIVE_INFINITY) - (a.periodo_inicio ?? Number.NEGATIVE_INFINITY)
      if (startDiff !== 0) return startDiff
      return historicoRowRichness(b) - historicoRowRichness(a)
    })

    for (const row of sorted) {
      const collapsesIntoNewer = kept.some((newer) => {
        if (newer.periodo_inicio == null || row.periodo_inicio == null) return false
        const older = row.periodo_inicio <= newer.periodo_inicio ? row : newer
        const newerRow = older === row ? newer : row
        return (
          older !== newerRow &&
          (isTseAdjacentYearOverlappingMandatePair(older, newerRow) ||
            isAdjacentElectionYearPlaceholderPair(older, newerRow))
        )
      })

      if (!collapsesIntoNewer) {
        kept.push(row)
        continue
      }

      // O par eleição+posse continua colapsando para não duplicar o mandato,
      // mas a eleição que o originou não pode sumir da trajetória: o
      // placeholder TSE do ano do pleito vira candidatura visível naquele ano.
      if (
        row.periodo_inicio != null &&
        isLikelyTseElectionPlaceholder(row) &&
        !kept.some((newer) => newer.periodo_inicio === row.periodo_inicio)
      ) {
        kept.push({
          ...row,
          tipo_evento: "candidatura",
          periodo_fim: row.periodo_inicio,
        })
      }
    }

    collapsed.push(...kept)
  }

  return collapsed
}

function historicoDisplayGroupKey(row: HistoricoPolitico): string {
  return `${isHistoricoCandidaturaRow(row) ? "candidatura" : "mandato"}|${historicoCanonKeyForRow(row)}`
}

/**
 * Descarta linha totalmente sem período quando já existe outro registo cronologicamente útil
 * do mesmo cargo canónico e mesmo tipo de evento. A linha nula só adiciona ruído de display
 * (`Período não determinado`) e não melhora a trajetória pública.
 */
function dropRedundantUndatedHistoricoRows(rows: HistoricoPolitico[]): HistoricoPolitico[] {
  const grouped = new Map<string, HistoricoPolitico[]>()

  for (const row of rows) {
    const key = historicoDisplayGroupKey(row)
    const list = grouped.get(key) ?? []
    list.push(row)
    grouped.set(key, list)
  }

  const filtered: HistoricoPolitico[] = []

  for (const group of grouped.values()) {
    const hasDatedSibling = group.some(
      (row) => row.periodo_inicio != null || row.periodo_fim != null,
    )

    if (!hasDatedSibling) {
      filtered.push(...group)
      continue
    }

    filtered.push(
      ...group.filter((row) => !(row.periodo_inicio == null && row.periodo_fim == null)),
    )
  }

  return filtered
}
