import type {
  CandidacyChange,
  CandidacyChangeKind,
  CandidacyComparison,
  CandidacyRecord,
  RelevantOffice,
} from "./types"
import { stripAccents } from "../../../src/lib/strip-accents"
import type { OfficialCandidacy } from "../../../src/lib/candidate-publication-integrity"

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
  return [record.uf ?? "BR", record.cargo, record.sq_coligacao || `SQ:${record.sq_candidato}`].join(":")
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

function statusDescription(value: string | null): string | null {
  const description = normalized(value)
  return !description || description === "#NE" ? null : description
}

/** -3/#NE registra ausência de informação no CSV, sem equivalência com situação humana. */
export function hasUnknownCdnStatus(record: CandidacyRecord): boolean {
  return (!record.situacao_codigo || record.situacao_codigo === "-3") &&
    statusDescription(record.situacao_descricao) === null
}

export interface CompareCandidaciesOptions {
  currentOfficial?: readonly (OfficialCandidacy & {
    party?: string
    vices?: readonly { sq_candidato: string; name: string; situacao_vice: number; party: string | null }[]
  })[]
  currentStatusEvidence?: readonly CandidacyRecord[]
  /**
   * SQ_CANDIDATO das vices com substituição comprovada em recibo revisado.
   * situacaoVice 3 significa inaptidão e não basta para provar substituição.
   * O pacote consolidado consulta_cand_2026.zip mantém as
   * duas alternativas com a mesma situação, então a substituição só é
   * comprovável por esse registro externo versionado.
   */
  substitutedViceSqs?: Iterable<string>
  /**
   * SQ_CANDIDATO dos TITULARES com substituição comprovada em recibo
   * revisado (mesmo padrão de `substitutedViceSqs`, issue #340). O pacote
   * consulta_cand_2026.zip lista titular substituído e substituto como duas
   * candidaturas distintas na mesma coligação, ambas com CD_SITUACAO -3/#NE;
   * a prova de substituição vem do detalhe ao vivo do DivulgaCandContas
   * (`st_SUBSTITUIDO: true` e `substituto.sqCandidato` apontando para quem
   * está no ar), não do pacote consolidado sozinho.
   */
  substitutedTitularSqs?: Iterable<string>
}

// Mudanças informativas entram no relatório e nas contagens, mas não levam a
// auditoria a review_required: elas descrevem um estado já conferido.
const INFORMATIVE_KINDS = new Set<CandidacyChangeKind>(["substituted", "inactive_vice"])

/** Inaptidão isolada não identifica quem substituiu a vice. */
export function reviewedSubstitutedViceSqs(resolutions: readonly {
  replaced_vice_sq?: string
  vices?: readonly { sq_candidato?: string; situacao_vice?: number }[]
}[]): string[] {
  return resolutions.flatMap((resolution) => resolution.replaced_vice_sq ? [resolution.replaced_vice_sq] : [])
}

/**
 * Espelha `reviewedSubstitutedViceSqs` para titulares. `replaced_titular_sq`
 * só entra no recibo revisado quando o detalhe ao vivo confirmou
 * `st_SUBSTITUIDO: true` E `substituto.sqCandidato` apontando para o SQ que
 * está publicado no mesmo slot — a mesma dupla prova que o mecanismo de vice
 * exige, adaptada ao campo que o TSE usa para titular.
 */
export function reviewedSubstitutedTitularSqs(resolutions: readonly {
  replaced_titular_sq?: string
}[]): string[] {
  return resolutions.flatMap((resolution) => resolution.replaced_titular_sq ? [resolution.replaced_titular_sq] : [])
}

function isVerifiedInactiveVice(
  vice: CandidacyRecord,
  official: readonly CandidacyRecord[],
  publishedBySq: ReadonlyMap<string, CandidacyRecord>,
  current: CompareCandidaciesOptions["currentOfficial"],
): boolean {
  if (!vice.cargo.startsWith("VICE ") || !hasUnknownCdnStatus(vice) || !vice.sq_coligacao.trim() ||
    official.filter((row) => row.sq_candidato === vice.sq_candidato).length !== 1) return false
  const titularOffice = vice.cargo === "VICE GOVERNADOR" ? "GOVERNADOR" : "PRESIDENTE"
  const titulares = official.filter((row) => row.cargo === titularOffice && row.uf === vice.uf &&
    row.sq_coligacao === vice.sq_coligacao)
  if (titulares.length !== 1) return false
  const titular = titulares[0]
  const publishedTitular = publishedBySq.get(titular.sq_candidato)
  if (!publishedTitular || !sameIdentity(titular, publishedTitular) ||
      publishedTitular.sq_coligacao !== titular.sq_coligacao) return false
  const details = current?.filter((row) => row.sq_candidato === titular.sq_candidato &&
    normalized(row.name) === normalized(titular.nome_urna) && normalized(row.party ?? null) === normalized(titular.partido_sigla) &&
    normalized(row.office) === titularOffice && row.uf === titular.uf &&
    typeof row.is_candidato_inapto === "boolean" && typeof row.substituido === "boolean") ?? []
  if (details.length !== 1) return false
  const matches = details[0].vices?.filter((row) => row.sq_candidato === vice.sq_candidato) ?? []
  // situacaoVice belongs to DivulgaCand's vice domain, not CD_SITUACAO_CANDIDATURA.
  return matches.length === 1 && matches[0].situacao_vice === 3 &&
    normalized(matches[0].name) === normalized(vice.nome_urna) &&
    Boolean(matches[0].party) && normalized(matches[0].party) === normalized(vice.partido_sigla)
}

export function compareCandidacies(
  officialInput: CandidacyRecord[],
  publishedInput: CandidacyRecord[],
  generatedAt = new Date().toISOString(),
  options: CompareCandidaciesOptions = {},
): CandidacyComparison {
  const substitutedViceSqs = new Set(options.substitutedViceSqs ?? [])
  const substitutedTitularSqs = new Set(options.substitutedTitularSqs ?? [])
  const substitutedSqs = new Set([...substitutedViceSqs, ...substitutedTitularSqs])
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
  const inactiveViceSqs = new Set(official.filter((row) =>
    !substitutedViceSqs.has(row.sq_candidato) &&
    isVerifiedInactiveVice(row, official, publishedBySq, options.currentOfficial)).map((row) => row.sq_candidato))
  const replacedOfficial = new Set<string>()
  const replacedPublished = new Set<string>()

  for (const [slot, officialRecord] of officialBySlot) {
    const publishedRecord = publishedBySlot.get(slot)
    if (
      publishedRecord &&
      publishedRecord.sq_candidato &&
      publishedRecord.sq_candidato !== officialRecord.sq_candidato &&
      !publishedBySq.has(officialRecord.sq_candidato)
      && !inactiveViceSqs.has(officialRecord.sq_candidato)
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
        // Casamento por slot (uf:cargo:sq_coligacao) falha por construção
        // quando a chapa publicada é de fonte direta (chapas_2026.sq_coligacao
        // NULL, issue #340): a chave da chapa oficial usa a coligação real do
        // pacote CSV, a da chapa publicada cai no fallback SQ:<próprio
        // sq_candidato>, e as duas nunca coincidem mesmo quando o vigente
        // está corretamente publicado. `publishedBySq` é indiferente a
        // coligação, então o titular vigente resolve por SQ_CANDIDATO puro.
        const publishedSlotRecord =
          publishedBySlot.get(slot) ??
          (vigente ? publishedBySq.get(vigente.sq_candidato) : undefined)
        if (inactiveViceSqs.has(officialRecord.sq_candidato)) {
          addChange(changes, {
            kind: "inactive_vice",
            slot,
            official: officialRecord,
            published: null,
            detail: `${officialRecord.nome_urna} consta como vice inapto no detalhe atual do DivulgaCandContas; sua ausência não exige inclusão nem comprova substituição ou aptidão de outra vice`,
          })
        } else if (
          substitutedSqs.has(officialRecord.sq_candidato) &&
          vigente &&
          publishedSlotRecord &&
          publishedSlotRecord.sq_candidato === vigente.sq_candidato
        ) {
          const papel = officialRecord.cargo.startsWith("VICE ") ? "vice" : "titular"
          addChange(changes, {
            kind: "substituted",
            slot,
            official: officialRecord,
            published: publishedSlotRecord,
            detail: `${officialRecord.nome_urna} é ${papel} substituído conforme DivulgaCandContas; o catálogo publica ${vigente.nome_urna}`,
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

    let currentDescription = statusDescription(officialRecord.situacao_descricao)
    const publishedDescription = statusDescription(publishedRecord.situacao_descricao)
    if (hasUnknownCdnStatus(officialRecord) && !publishedRecord.situacao_codigo) {
      const detail = options.currentStatusEvidence?.find((row) =>
        row.sq_candidato === officialRecord.sq_candidato && sameIdentity(row, officialRecord))
      const titular = options.currentOfficial?.find((row) =>
        row.sq_candidato === officialRecord.sq_candidato &&
        normalized(row.name) === normalized(officialRecord.nome_urna) &&
        normalized(row.party ?? null) === normalized(officialRecord.partido_sigla) &&
        normalized(row.office) === officialRecord.cargo && row.uf === officialRecord.uf)
      currentDescription = statusDescription(detail?.situacao_descricao ?? titular?.status ?? null)
    }
    const bothCodes = Boolean(officialRecord.situacao_codigo && publishedRecord.situacao_codigo)
    const statusUnknown = !bothCodes && Boolean(currentDescription || publishedDescription ||
      !hasUnknownCdnStatus(officialRecord) || !hasUnknownCdnStatus(publishedRecord)) &&
      (!currentDescription || !publishedDescription)
    const statusChanged = bothCodes
      ? officialRecord.situacao_codigo !== publishedRecord.situacao_codigo
      : currentDescription !== publishedDescription
    if (statusChanged || statusUnknown) {
      addChange(changes, {
        kind: "status_change",
        slot: candidacySlot(officialRecord),
        official: officialRecord,
        published: publishedRecord,
        detail: statusUnknown
          ? "situação oficial sem evidência comparável à situação publicada; revisão necessária"
          : `situação mudou de ${publishedRecord.situacao_descricao ?? publishedRecord.situacao_codigo} para ${currentDescription ?? officialRecord.situacao_codigo}`,
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
    "inactive_vice",
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
