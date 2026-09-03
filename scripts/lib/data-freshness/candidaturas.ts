import type {
  CandidacyChange,
  CandidacyChangeKind,
  CandidacyComparison,
  CandidacyRecord,
  RelevantOffice,
} from "./types"
import { stripAccents } from "../../../src/lib/strip-accents"

const OFFICE_ORDER: Record<RelevantOffice, number> = {
  PRESIDENTE: 0,
  "VICE PRESIDENTE": 1,
  GOVERNADOR: 2,
  "VICE GOVERNADOR": 3,
}

function normalized(value: string | null): string {
  return stripAccents(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export function candidacySlot(record: CandidacyRecord): string {
  return [record.uf ?? "BR", record.cargo, record.sq_coligacao].join(":")
}

function stableRecordSort(a: CandidacyRecord, b: CandidacyRecord): number {
  return (
    (a.uf ?? "BR").localeCompare(b.uf ?? "BR") ||
    OFFICE_ORDER[a.cargo] - OFFICE_ORDER[b.cargo] ||
    a.sq_coligacao.localeCompare(b.sq_coligacao) ||
    a.sq_candidato.localeCompare(b.sq_candidato)
  )
}

function addChange(changes: CandidacyChange[], change: CandidacyChange): void {
  changes.push(change)
}

function sameIdentity(a: CandidacyRecord, b: CandidacyRecord): boolean {
  return (
    normalized(a.nome_urna) === normalized(b.nome_urna) &&
    normalized(a.partido_sigla) === normalized(b.partido_sigla) &&
    a.cargo === b.cargo &&
    (a.uf ?? null) === (b.uf ?? null)
  )
}

export interface CompareCandidaciesOptions {
  /**
   * SQ_CANDIDATO das vices que o DivulgaCandContas marca como substituídas
   * (situacaoVice 3). O pacote consolidado consulta_cand_2026.zip mantém as
   * duas alternativas com a mesma situação, então a substituição só é
   * comprovável por esse registro externo versionado.
   */
  substitutedViceSqs?: Iterable<string>
}

// Mudanças informativas entram no relatório e nas contagens, mas não levam a
// auditoria a review_required: elas descrevem um estado já conferido.
const INFORMATIVE_KINDS = new Set<CandidacyChangeKind>(["substituted"])

export function compareCandidacies(
  officialInput: CandidacyRecord[],
  publishedInput: CandidacyRecord[],
  generatedAt = new Date().toISOString(),
  options: CompareCandidaciesOptions = {},
): CandidacyComparison {
  const substitutedViceSqs = new Set(options.substitutedViceSqs ?? [])
  const official = [...officialInput].sort(stableRecordSort)
  const published = [...publishedInput].sort(stableRecordSort)
  const officialBySq = new Map(
    official.filter((record) => record.sq_candidato).map((record) => [record.sq_candidato, record]),
  )
  const publishedBySq = new Map(
    published.filter((record) => record.sq_candidato).map((record) => [record.sq_candidato, record]),
  )
  const officialBySlot = new Map(official.map((record) => [candidacySlot(record), record]))
  const officialRecordsBySlot = new Map<string, CandidacyRecord[]>()
  for (const record of official) {
    const slot = candidacySlot(record)
    officialRecordsBySlot.set(slot, [...(officialRecordsBySlot.get(slot) ?? []), record])
  }
  const publishedBySlot = new Map(published.map((record) => [candidacySlot(record), record]))
  const changes: CandidacyChange[] = []
  const replacedOfficial = new Set<string>()
  const replacedPublished = new Set<string>()

  for (const [slot, officialRecord] of officialBySlot) {
    const publishedRecord = publishedBySlot.get(slot)
    if (
      publishedRecord &&
      publishedRecord.sq_candidato &&
      publishedRecord.sq_candidato !== officialRecord.sq_candidato
    ) {
      replacedOfficial.add(officialRecord.sq_candidato)
      replacedPublished.add(publishedRecord.sq_candidato)
      addChange(changes, {
        kind: "replacement",
        slot,
        official: officialRecord,
        published: publishedRecord,
        detail: `${publishedRecord.nome_urna} foi substituído por ${officialRecord.nome_urna}`,
      })
    }
  }

  for (const officialRecord of official) {
    const slotRecord = publishedBySlot.get(candidacySlot(officialRecord))
    const publishedRecord =
      publishedBySq.get(officialRecord.sq_candidato) ??
      (slotRecord && !slotRecord.sq_candidato && sameIdentity(officialRecord, slotRecord)
        ? slotRecord
        : undefined)
    if (!publishedRecord) {
      if (!replacedOfficial.has(officialRecord.sq_candidato)) {
        const slot = candidacySlot(officialRecord)
        const vigente = (officialRecordsBySlot.get(slot) ?? []).find(
          (candidate) => candidate.sq_candidato !== officialRecord.sq_candidato,
        )
        const publishedSlotRecord = publishedBySlot.get(slot)
        if (
          substitutedViceSqs.has(officialRecord.sq_candidato) &&
          vigente &&
          publishedSlotRecord &&
          publishedSlotRecord.sq_candidato === vigente.sq_candidato
        ) {
          addChange(changes, {
            kind: "substituted",
            slot,
            official: officialRecord,
            published: publishedSlotRecord,
            detail: `${officialRecord.nome_urna} é vice substituído conforme DivulgaCandContas; o catálogo publica ${vigente.nome_urna}`,
          })
        } else {
          addChange(changes, {
            kind: "inclusion",
            slot,
            official: officialRecord,
            published: null,
            detail: `${officialRecord.nome_urna} consta na fonte oficial e não no catálogo publicado`,
          })
        }
      }
      continue
    }

    if (
      officialRecord.situacao_codigo &&
      publishedRecord.situacao_codigo &&
      officialRecord.situacao_codigo !== publishedRecord.situacao_codigo
    ) {
      addChange(changes, {
        kind: "status_change",
        slot: candidacySlot(officialRecord),
        official: officialRecord,
        published: publishedRecord,
        detail: `situação mudou de ${publishedRecord.situacao_descricao ?? publishedRecord.situacao_codigo} para ${officialRecord.situacao_descricao ?? officialRecord.situacao_codigo}`,
      })
    }

    if (
      !sameIdentity(officialRecord, publishedRecord)
    ) {
      addChange(changes, {
        kind: "identity_mismatch",
        slot: candidacySlot(officialRecord),
        official: officialRecord,
        published: publishedRecord,
        detail: "identidade, partido, cargo ou UF diverge da fonte oficial",
      })
    }

    const exigeFichaPublica = !officialRecord.cargo.startsWith("VICE ")
    if (exigeFichaPublica && !publishedRecord.perfil_slug) {
      addChange(changes, {
        kind: "missing_profile",
        slot: candidacySlot(officialRecord),
        official: officialRecord,
        published: publishedRecord,
        detail: `${officialRecord.nome_urna} não possui ficha pública vinculada`,
      })
    }
  }

  for (const publishedRecord of published) {
    const officialSlot = officialBySlot.get(candidacySlot(publishedRecord))
    const matchedUnresolved =
      !publishedRecord.sq_candidato && officialSlot && sameIdentity(officialSlot, publishedRecord)
    if (
      !matchedUnresolved &&
      !officialBySq.has(publishedRecord.sq_candidato) &&
      !replacedPublished.has(publishedRecord.sq_candidato)
    ) {
      addChange(changes, {
        kind: "removal",
        slot: candidacySlot(publishedRecord),
        official: null,
        published: publishedRecord,
        detail: `${publishedRecord.nome_urna} está publicado, mas não consta na fonte oficial atual`,
      })
    }
  }

  const kinds: CandidacyChangeKind[] = [
    "inclusion",
    "removal",
    "replacement",
    "status_change",
    "identity_mismatch",
    "missing_profile",
    "substituted",
  ]
  const counts = Object.fromEntries(
    kinds.map((kind) => [kind, changes.filter((change) => change.kind === kind).length]),
  ) as Record<CandidacyChangeKind, number>
  const blocking = changes.filter((change) => !INFORMATIVE_KINDS.has(change.kind))

  return {
    generated_at: generatedAt,
    official_count: official.length,
    published_count: published.length,
    counts,
    changes,
    status: blocking.length === 0 ? "ok" : "review_required",
  }
}
