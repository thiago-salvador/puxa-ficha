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
const SELECTION_PATH = path.join(ROOT, "docs/reviews/programas-governo-governadores-2026/publicacao-2026-08-28.json")

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

type SelectionItem = {
  identityKey: string
  outcome: "approved" | "human_review_required" | "unavailable"
  slug: string | null
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main(): Promise<void> {
  const inventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8")) as { candidaturas: InventoryCandidate[] }
  const selection = JSON.parse(await readFile(SELECTION_PATH, "utf8")) as { items: SelectionItem[] }
  const files = (await readdir(RECORDS_DIR)).filter((file) => file.endsWith(".json")).sort()
  const records = await Promise.all(files.map(async (file) => {
    const record = JSON.parse(await readFile(path.join(RECORDS_DIR, file), "utf8")) as ProgramaGovernoRegistro
    assertProgramaGovernoRegistro(record)
    assert(record.fonte.slug && file === `${record.fonte.slug}.json`, `${file}: nome diverge do slug`)
    return record
  }))

  const inventoryByKey = new Map(inventory.candidaturas.map((item) => [`${item.ano}:${item.cargo}:${item.uf}:${item.sqCandidato}`, item]))
  const selectionByKey = new Map(selection.items.map((item) => [item.identityKey, item]))
  assert(selection.items.length === inventory.candidaturas.length, "manifesto de publicacao nao cobre o inventario")
  assert(selectionByKey.size === selection.items.length, "manifesto de publicacao contem identidade duplicada")

  const approvedSelection = selection.items.filter((item) => item.outcome === "approved")
  assert(approvedSelection.length === records.length, `selecionados=${approvedSelection.length}; arquivos=${records.length}`)
  const approvedSlugs = new Set(approvedSelection.map((item) => item.slug))
  assert(records.every((record) => approvedSlugs.has(record.fonte.slug)), "arquivo publicado fora da selecao aprovada")

  const byUf = new Map<ProgramaGovernoUf, ProgramaGovernoRegistro[]>()
  for (const record of records) {
    assert(record.estado === "aprovado", `${record.fonte.slug}: estado nao aprovado`)
    const key = `${record.fonte.ano}:${record.fonte.cargo}:${record.fonte.uf}:${record.fonte.sqCandidato}`
    const expected = inventoryByKey.get(key)
    assert(expected, `${record.fonte.slug}: identidade fora do inventario`)
    assert(expected.perfilEstado === "vinculado", `${record.fonte.slug}: perfil local nao vinculado`)
    assert(expected.slug === record.fonte.slug, `${record.fonte.slug}: slug diverge do inventario`)
    assert(expected.nomeUrna === record.fonte.nomeUrna, `${record.fonte.slug}: nomeUrna diverge do inventario`)
    assert(expected.partido === record.fonte.partido, `${record.fonte.slug}: partido diverge do inventario`)
    assert(
      JSON.stringify(expected.documentoIds) === JSON.stringify(record.documentos?.map(({ documentoId }) => documentoId)),
      `${record.fonte.slug}: conjunto documental diverge do inventario`,
    )
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

  console.log(`PROGRAMAS_GOV_PUBLICADOS_PASS candidatos=${records.length} ufs=${byUf.size} claims=${claims} eval_items=${evalItems}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
