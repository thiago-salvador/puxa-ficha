import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import {
  assertProgramaGovernoRegistro,
  type ProgramaGovernoUf,
  type ProgramaGovernoRegistro,
} from "../../src/lib/programa-governo"
import { auditProgramaGovernoRecordSet } from "./audit-programas-governo"
import type {
  ProgramaGovernoPipelineRecord,
  ProgramaGovernoStageSource,
} from "../programas-governo-stage"

const ROOT = path.resolve(import.meta.dirname, "../..")
const RECORDS_DIR = path.join(ROOT, "src/data/programas-governo/governadores-2026")
const INVENTORY_PATH = path.join(ROOT, "scripts/data/programas-governo-governadores-2026/inventario-2026-08-29.json")
const SELECTION_PATH = path.join(ROOT, "docs/reviews/programas-governo-governadores-2026/publicacao-2026-08-29.json")

type InventoryCandidate = {
  ano: number
  cargo: string
  uf: string
  sqCandidato: string
  slug: string | null
  nomeUrna: string
  partido: string
  perfilEstado: string
  documentoIds: string[]
}

type InventoryDocument = {
  id: string
  sha256: string
}

type PublishedDocument = {
  documentoId: string
  extracao?: { sourceSha256?: string }
}

type SelectionItem = {
  identityKey: string
  outcome: "approved" | "human_review_required" | "unavailable"
  slug: string | null
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main(): Promise<void> {
  const inventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8")) as {
    candidaturas: InventoryCandidate[]
    documentos: InventoryDocument[]
  }
  const selection = JSON.parse(await readFile(SELECTION_PATH, "utf8")) as { items: SelectionItem[] }
  const files = (await readdir(RECORDS_DIR)).filter((file) => file.endsWith(".json")).sort()
  const records = await Promise.all(files.map(async (file) => {
    const record = JSON.parse(await readFile(path.join(RECORDS_DIR, file), "utf8")) as ProgramaGovernoRegistro
    assertProgramaGovernoRegistro(record)
    assert(record.fonte.slug && file === `${record.fonte.slug}.json`, `${file}: nome diverge do slug`)
    return record
  }))

  const inventoryByKey = new Map(inventory.candidaturas.map((item) => [`${item.ano}:${item.cargo}:${item.uf}:${item.sqCandidato}`, item]))
  const inventoryBySlug = new Map(inventory.candidaturas.filter((item) => item.slug).map((item) => [item.slug, item]))
  const inventoryDocumentsById = new Map(inventory.documentos.map((item) => [item.id, item]))
  const selectionByKey = new Map(selection.items.map((item) => [item.identityKey, item]))
  const staleRecords: Array<{ slug: string; identityKey: string; reasons: string[] }> = []

  const byUf = new Map<ProgramaGovernoUf, ProgramaGovernoRegistro[]>()
  for (const record of records) {
    assert(record.estado === "aprovado", `${record.fonte.slug}: estado nao aprovado`)
    const key = `${record.fonte.ano}:${record.fonte.cargo}:${record.fonte.uf}:${record.fonte.sqCandidato}`
    const expected = inventoryByKey.get(key)
    const slugExpected = inventoryBySlug.get(record.fonte.slug)
    const reasons: string[] = []
    if (!expected) reasons.push(slugExpected ? "identity" : "identity_not_in_canonical_crosswalk")
    else {
      if (expected.perfilEstado !== "vinculado") reasons.push("profile_not_linked")
      if (expected.slug !== record.fonte.slug) reasons.push("identity")
      if (expected.nomeUrna !== record.fonte.nomeUrna) reasons.push("name")
      if (expected.partido !== record.fonte.partido) reasons.push("party")
      const publishedDocuments = (record.documentos ?? []) as PublishedDocument[]
      const publishedIds = publishedDocuments.map(({ documentoId }) => documentoId)
      if (JSON.stringify(expected.documentoIds) !== JSON.stringify(publishedIds)) reasons.push("document_set")
      const hashesMatch = expected.documentoIds.every((id, index) => {
        const current = inventoryDocumentsById.get(id)?.sha256
        const published = publishedDocuments[index]?.extracao?.sourceSha256
        return current === published
      })
      if (!hashesMatch) reasons.push("document_hash")
    }
    if (reasons.length) {
      const slug = record.fonte.slug
      assert(slug, `${key}: registro stale sem slug`)
      staleRecords.push({ slug, identityKey: key, reasons })
      continue
    }
    const current = byUf.get(record.fonte.uf) ?? []
    current.push(record)
    byUf.set(record.fonte.uf, current)
  }

  let claims = 0
  let evalItems = 0
  for (const [uf, ufRecords] of byUf) {
    const result = auditProgramaGovernoRecordSet(
      ufRecords.map((record) => ({
        ...record.fonte,
        documentos: record.documentos?.map((documento) => ({
          documentoId: documento.documentoId,
          fonte: documento.fonte,
        })),
      }) as ProgramaGovernoStageSource),
      ufRecords as ProgramaGovernoPipelineRecord[],
      { expected: { ano: 2026, cargo: "GOVERNADOR", uf }, expectAllApproved: true },
    )
    claims += result.claims
    evalItems += result.evalItems
  }

  const approvedSelection = selection.items.filter((item) => item.outcome === "approved")
  const approvedSlugs = new Set(approvedSelection.map((item) => item.slug))
  const selectionReasons = [
    ...(selection.items.length === inventory.candidaturas.length ? [] : ["selection_coverage"]),
    ...(selectionByKey.size === selection.items.length ? [] : ["selection_duplicate_identity"]),
    ...(approvedSelection.length === records.length ? [] : ["selection_approved_count"]),
    ...(records.every((record) => approvedSlugs.has(record.fonte.slug)) ? [] : ["selection_membership"]),
  ]
  if (selectionReasons.length) staleRecords.push({ slug: "<publication-manifest>", identityKey: "<manifest>", reasons: selectionReasons })
  if (staleRecords.length) {
    console.error(`PROGRAMAS_GOV_PUBLICADOS_STALE total=${staleRecords.length} ${JSON.stringify(staleRecords)}`)
    process.exitCode = 1
    return
  }
  console.log(`PROGRAMAS_GOV_PUBLICADOS_PASS candidatos=${records.length} ufs=${byUf.size} claims=${claims} eval_items=${evalItems}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
