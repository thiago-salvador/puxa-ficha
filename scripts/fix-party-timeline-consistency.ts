import { supabase } from "./lib/supabase"
import { escreverAuditado } from "./lib/escrita-auditada"
import { log, warn } from "./lib/logger"
import {
  analyzePartyTimelineRows,
  canonicalizePartyTimelineLabel,
  type PartyTimelineChangeCategory,
  type PartyTimelineSafeApplyKind,
  partyTimelineValuesEquivalent,
  rankPartyTimelineConsistencyRow,
} from "./lib/party-timeline-consistency"

/** Identidade deste programa na trilha de `coleta_log`. */
const SCRIPT = "fix-party-timeline-consistency"

type CandidateRef = { slug: string } | { slug: string }[]

interface MudancaRow {
  id: string
  candidato_id: string
  partido_anterior: string | null
  partido_novo: string | null
  ano: number | null
  data_mudanca: string | null
  contexto: string | null
  candidatos?: CandidateRef
}

interface HistoricoRow {
  id: string
  partido: string | null
  candidatos?: CandidateRef
}

function resolveSlug(ref: CandidateRef | undefined, fallback: string): string {
  if (Array.isArray(ref)) return ref[0]?.slug ?? fallback
  return ref?.slug ?? fallback
}

export interface PartyTimelineUpdate {
  slug: string
  id: string
  candidato_id: string
  ano: number | null
  category: PartyTimelineChangeCategory
  auto_apply: boolean
  apply_kind: PartyTimelineSafeApplyKind | null
  reason: string | null
  before: { partido_anterior: string | null; partido_novo: string | null }
  after: { partido_anterior: string | null; partido_novo: string | null }
}

interface HistoricoPartyUpdate {
  slug: string
  id: string
  category: PartyTimelineChangeCategory
  auto_apply: boolean
  apply_kind: PartyTimelineSafeApplyKind | null
  reason: string | null
  before: string
  after: string
}

type FixScopeKind = PartyTimelineSafeApplyKind | "all"

interface FixPartyTimelineOptions {
  slugs?: string[]
  kind?: FixScopeKind
}

function collectPartyTimelineUpdates(rows: readonly MudancaRow[]): PartyTimelineUpdate[] {
  if (rows.length === 0) return []

  const slug = resolveSlug(rows[0]?.candidatos, rows[0]?.candidato_id ?? "desconhecido")
  const decisionsById = new Map(
    analyzePartyTimelineRows(rows).map((decision) => [decision.row.id, decision] as const)
  )

  return rows.flatMap((row) => {
    const decision = decisionsById.get(row.id)
    if (!decision?.category) return []

    const after = decision.autoApply ? decision.normalized : decision.legacyNormalized

    if (
      row.partido_anterior === after.partido_anterior &&
      row.partido_novo === after.partido_novo
    ) {
      return []
    }

    return [
      {
        slug,
        id: row.id,
        candidato_id: row.candidato_id,
        ano: row.ano,
        category: decision.category,
        auto_apply: decision.autoApply,
        apply_kind: decision.applyKind,
        reason: decision.reason,
        before: {
          partido_anterior: row.partido_anterior,
          partido_novo: row.partido_novo,
        },
        after: {
          partido_anterior: after.partido_anterior,
          partido_novo: after.partido_novo,
        },
      },
    ]
  })
}

function collectHistoricoUpdates(rows: readonly HistoricoRow[]): HistoricoPartyUpdate[] {
  return rows.flatMap((row) => {
    const slug = resolveSlug(row.candidatos, row.id)
    const nextParty = canonicalizePartyTimelineLabel(row.partido)
    if (!row.partido || !nextParty || row.partido === nextParty) return []

    const category = partyTimelineValuesEquivalent(row.partido, nextParty)
      ? "alias_seguro"
      : "suspeito_precisa_revisao"
    const autoApply = category === "alias_seguro"

    return [
      {
        slug,
        id: row.id,
        category,
        auto_apply: autoApply,
        apply_kind: autoApply ? "alias" : null,
        reason: autoApply ? "canonical_label" : "historico_requires_review",
        before: row.partido,
        after: nextParty,
      },
    ]
  })
}

function matchesRequestedKind(updateKind: PartyTimelineSafeApplyKind | null, requestedKind: FixScopeKind) {
  if (!updateKind) return false
  return requestedKind === "all" || updateKind === requestedKind
}

function selectApplicablePartyTimelineUpdates(
  updates: readonly PartyTimelineUpdate[],
  requestedKind: FixScopeKind
) {
  return updates.filter(
    (update) => update.auto_apply && matchesRequestedKind(update.apply_kind, requestedKind)
  )
}

function selectApplicableHistoricoUpdates(
  updates: readonly HistoricoPartyUpdate[],
  requestedKind: FixScopeKind
) {
  return updates.filter(
    (update) => update.auto_apply && matchesRequestedKind(update.apply_kind, requestedKind)
  )
}

function buildMudancaUniqueKey(
  candidatoId: string,
  ano: number | null,
  partidoNovo: string | null | undefined
) {
  return `${candidatoId}::${ano ?? "NULL"}::${partidoNovo ?? "NULL"}`
}

function blockConflictingPartyTimelineUpdates(
  rows: readonly MudancaRow[],
  updates: readonly PartyTimelineUpdate[]
) {
  if (updates.length === 0) return [...updates]

  const updateById = new Map(updates.map((update) => [update.id, update] as const))
  const rowsByFinalKey = new Map<string, string[]>()

  for (const row of rows) {
    const update = updateById.get(row.id)
    const finalPartidoNovo =
      update?.auto_apply && update.before.partido_novo !== update.after.partido_novo
        ? update.after.partido_novo
        : row.partido_novo

    const key = buildMudancaUniqueKey(row.candidato_id, row.ano, finalPartidoNovo)
    const existing = rowsByFinalKey.get(key) ?? []
    existing.push(row.id)
    rowsByFinalKey.set(key, existing)
  }

  const conflictingIds = new Set<string>()

  for (const rowIds of rowsByFinalKey.values()) {
    if (rowIds.length < 2) continue

    for (const rowId of rowIds) {
      const update = updateById.get(rowId)
      if (!update?.auto_apply) continue
      if (update.before.partido_novo === update.after.partido_novo) continue
      conflictingIds.add(rowId)
    }
  }

  return updates.map((update) => {
    if (!conflictingIds.has(update.id)) return update

    return {
      ...update,
      auto_apply: false,
      apply_kind: null,
      reason: "unique_conflict_existing_row",
    }
  })
}

function createEmptyCategoryCounts() {
  return {
    reencadeamento_real: 0,
    alias_seguro: 0,
    renomeacao_historica_mesmo_partido: 0,
    suspeito_precisa_revisao: 0,
  } satisfies Record<PartyTimelineChangeCategory, number>
}

function createEmptyApplyKindCounts() {
  return {
    alias: 0,
    rechain: 0,
  } satisfies Record<PartyTimelineSafeApplyKind, number>
}

function summarizeCategorizedUpdates<
  Update extends {
    category: PartyTimelineChangeCategory
    auto_apply: boolean
    apply_kind: PartyTimelineSafeApplyKind | null
  },
>(updates: readonly Update[], requestedKind: FixScopeKind, appliedUpdates: readonly Update[]) {
  const byCategory = createEmptyCategoryCounts()
  const autoApplyByKind = createEmptyApplyKindCounts()
  const inScopeByKind = createEmptyApplyKindCounts()
  const appliedByKind = createEmptyApplyKindCounts()

  for (const update of updates) {
    byCategory[update.category] += 1
    if (update.auto_apply && update.apply_kind) {
      autoApplyByKind[update.apply_kind] += 1
      if (matchesRequestedKind(update.apply_kind, requestedKind)) {
        inScopeByKind[update.apply_kind] += 1
      }
    }
  }

  for (const update of appliedUpdates) {
    if (update.apply_kind) {
      appliedByKind[update.apply_kind] += 1
    }
  }

  return {
    total: updates.length,
    by_category: byCategory,
    auto_apply_total: updates.filter((update) => update.auto_apply).length,
    blocked_total: updates.filter((update) => !update.auto_apply).length,
    auto_apply_by_kind: autoApplyByKind,
    in_scope_total: updates.filter(
      (update) => update.auto_apply && matchesRequestedKind(update.apply_kind, requestedKind)
    ).length,
    in_scope_by_kind: inScopeByKind,
    applied_total: appliedUpdates.length,
    applied_by_kind: appliedByKind,
  }
}

export async function fixCandidatePartyTimelineConsistency(
  candidateId: string,
  apply = false,
  options: FixPartyTimelineOptions = {}
): Promise<PartyTimelineUpdate[]> {
  const requestedKind = options.kind ?? "all"
  const { data: rows, error } = await supabase
    .from("mudancas_partido")
    .select("id, candidato_id, partido_anterior, partido_novo, ano, data_mudanca, contexto, candidatos!inner(slug)")
    .eq("candidato_id", candidateId)

  if (error) {
    throw new Error(`Erro ao carregar mudancas_partido de ${candidateId}: ${error.message}`)
  }

  const updates = selectApplicablePartyTimelineUpdates(
    blockConflictingPartyTimelineUpdates(
      (rows ?? []) as MudancaRow[],
      collectPartyTimelineUpdates((rows ?? []) as MudancaRow[])
    ),
    requestedKind
  )

  if (apply && updates.length > 0) {
    // O laço roda dentro da escrita auditada: o reencadeamento de um candidato
    // é UM ato editorial, ainda que toque várias linhas. Uma linha de trilha
    // por candidato responde "o que mudou na timeline dele e por quê"; uma por
    // linha de tabela responderia a mesma coisa N vezes.
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "mudancas_partido",
        motivo: `reencadeia a timeline partidária do candidato (escopo ${requestedKind})`,
        recorte: `candidato ${candidateId}, ${updates.length} linha(s) propostas`,
      },
      async () => {
        const tocadas: Array<{ id: string }> = []
        for (const update of updates) {
          const { data, error: updateError } = await supabase
            .from("mudancas_partido")
            .update(update.after)
            .eq("id", update.id)
            .select("id")

          if (updateError) {
            return {
              data: tocadas,
              error: { message: `ao atualizar mudancas_partido ${update.id}: ${updateError.message}` },
            }
          }
          tocadas.push(...((data ?? []) as Array<{ id: string }>))
        }
        return { data: tocadas, error: null }
      }
    )
  }

  return updates
}

async function fixPartyTimelineConsistency(
  apply = false,
  options: FixPartyTimelineOptions = {}
) {
  const requestedKind = options.kind ?? "all"
  const slugFilter = new Set((options.slugs ?? []).map((slug) => slug.trim()).filter(Boolean))

  const { data: mudancas, error: mudancasError } = await supabase
    .from("mudancas_partido")
    .select("id, candidato_id, partido_anterior, partido_novo, ano, data_mudanca, contexto, candidatos!inner(slug)")

  if (mudancasError) {
    throw new Error(`Erro ao carregar mudancas_partido: ${mudancasError.message}`)
  }

  const mudancasByCandidate = new Map<string, MudancaRow[]>()
  for (const row of (mudancas ?? []) as MudancaRow[]) {
    const slug = resolveSlug(row.candidatos, row.candidato_id)
    if (slugFilter.size > 0 && !slugFilter.has(slug)) continue

    const existing = mudancasByCandidate.get(row.candidato_id) ?? []
    existing.push(row)
    mudancasByCandidate.set(row.candidato_id, existing)
  }

  const partyTimelineUpdates: PartyTimelineUpdate[] = []

  for (const [, rows] of mudancasByCandidate) {
    const orderedRows = [...rows].sort(
      (left, right) => rankPartyTimelineConsistencyRow(left) - rankPartyTimelineConsistencyRow(right)
    )
    const updates = blockConflictingPartyTimelineUpdates(
      orderedRows,
      collectPartyTimelineUpdates(orderedRows)
    )

    partyTimelineUpdates.push(...updates)
  }

  // A seleção do que se aplica sai do laço: é a mesma lista de antes (a união
  // das seleções por candidato), e tirá-la daqui é o que permite a varredura
  // inteira caber numa escrita auditada só, em vez de uma por candidato.
  const appliedPartyTimelineUpdates = selectApplicablePartyTimelineUpdates(
    partyTimelineUpdates,
    requestedKind
  )

  if (apply && appliedPartyTimelineUpdates.length > 0) {
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "mudancas_partido",
        motivo: `corrige inconsistência de timeline partidária em varredura completa (escopo ${requestedKind})`,
        recorte:
          slugFilter.size > 0
            ? `${appliedPartyTimelineUpdates.length} linha(s) nos slugs ${[...slugFilter].join(", ")}`
            : `${appliedPartyTimelineUpdates.length} linha(s) em ${mudancasByCandidate.size} candidato(s)`,
      },
      async () => {
        const tocadas: Array<{ id: string }> = []
        for (const update of appliedPartyTimelineUpdates) {
          const { data, error } = await supabase
            .from("mudancas_partido")
            .update(update.after)
            .eq("id", update.id)
            .select("id")

          if (error) {
            return {
              data: tocadas,
              error: { message: `ao atualizar mudancas_partido ${update.id}: ${error.message}` },
            }
          }
          tocadas.push(...((data ?? []) as Array<{ id: string }>))
        }
        return { data: tocadas, error: null }
      }
    )
  }

  const { data: historico, error: historicoError } = await supabase
    .from("historico_politico")
    .select("id, partido, candidatos!inner(slug)")
    .not("partido", "is", null)

  if (historicoError) {
    throw new Error(`Erro ao carregar historico_politico: ${historicoError.message}`)
  }

  const historicoRows = ((historico ?? []) as HistoricoRow[]).filter((row) => {
    const slug = resolveSlug(row.candidatos, row.id)
    return slugFilter.size === 0 || slugFilter.has(slug)
  })
  const historicoUpdates = collectHistoricoUpdates(historicoRows)

  const appliedHistoricoUpdates = selectApplicableHistoricoUpdates(
    historicoUpdates,
    requestedKind
  )

  if (apply && appliedHistoricoUpdates.length > 0) {
    await escreverAuditado(
      {
        script: SCRIPT,
        tabela: "historico_politico",
        motivo: `canoniza sigla de partido no histórico político (escopo ${requestedKind})`,
        recorte: `${appliedHistoricoUpdates.length} linha(s) com sigla fora da forma canônica`,
      },
      async () => {
        const tocadas: Array<{ id: string }> = []
        for (const update of appliedHistoricoUpdates) {
          const { data, error } = await supabase
            .from("historico_politico")
            .update({ partido: update.after })
            .eq("id", update.id)
            .select("id")

          if (error) {
            return {
              data: tocadas,
              error: { message: `ao atualizar historico_politico ${update.id}: ${error.message}` },
            }
          }
          tocadas.push(...((data ?? []) as Array<{ id: string }>))
        }
        return { data: tocadas, error: null }
      }
    )
  }

  const summary = {
    requested_kind: requestedKind,
    mudancas_partido: summarizeCategorizedUpdates(
      partyTimelineUpdates,
      requestedKind,
      apply ? appliedPartyTimelineUpdates : []
    ),
    historico_politico: summarizeCategorizedUpdates(
      historicoUpdates,
      requestedKind,
      apply ? appliedHistoricoUpdates : []
    ),
  }

  log(
    "fix-party-timeline-consistency",
    `mudancas_partido: ${partyTimelineUpdates.length} proposal(s), ${summary.mudancas_partido.in_scope_total} no escopo ${requestedKind}; historico_politico: ${historicoUpdates.length} proposal(s), ${summary.historico_politico.in_scope_total} no escopo ${requestedKind}`
  )

  if (partyTimelineUpdates.length > 0) {
    for (const update of partyTimelineUpdates.slice(0, 40)) {
      log(
        "fix-party-timeline-consistency",
        `  [${update.category}] auto=${update.auto_apply && matchesRequestedKind(update.apply_kind, requestedKind) ? "yes" : "no"} ${update.slug}: ${update.before.partido_anterior} -> ${update.before.partido_novo} => ${update.after.partido_anterior} -> ${update.after.partido_novo}`
      )
    }
    if (partyTimelineUpdates.length > 40) {
      warn(
        "fix-party-timeline-consistency",
        `  ... ${partyTimelineUpdates.length - 40} update(s) adicionais omitidos no log`
      )
    }
  }

  if (historicoUpdates.length > 0) {
    for (const update of historicoUpdates.slice(0, 20)) {
      log(
        "fix-party-timeline-consistency",
        `  historico [${update.category}] auto=${update.auto_apply && matchesRequestedKind(update.apply_kind, requestedKind) ? "yes" : "no"} ${update.slug}: ${update.before} => ${update.after}`
      )
    }
    if (historicoUpdates.length > 20) {
      warn(
        "fix-party-timeline-consistency",
        `  ... ${historicoUpdates.length - 20} update(s) adicionais de histórico omitidos no log`
      )
    }
  }

  return {
    apply,
    kind: requestedKind,
    slugs: slugFilter.size > 0 ? [...slugFilter] : null,
    summary,
    mudancas_partido: partyTimelineUpdates,
    historico_politico: historicoUpdates,
  }
}

function parseArgs(argv: string[]) {
  const slugs: string[] = []
  let kind: FixScopeKind = "all"

  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--slug" && argv[index + 1]) {
      slugs.push(argv[index + 1])
      index++
      continue
    }

    if (argv[index] === "--kind" && argv[index + 1]) {
      const candidate = argv[index + 1]
      if (candidate === "alias" || candidate === "rechain" || candidate === "all") {
        kind = candidate
      } else {
        throw new Error(`Valor inválido para --kind: ${candidate}`)
      }
      index++
    }
  }

  return {
    apply: argv.includes("--apply"),
    slugs,
    kind,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { apply, slugs, kind } = parseArgs(process.argv.slice(2))
  fixPartyTimelineConsistency(apply, { slugs, kind }).then((result) => {
    console.log(JSON.stringify(result, null, 2))
  })
}
