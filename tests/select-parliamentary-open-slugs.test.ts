import assert from "node:assert/strict"
import { test } from "node:test"
import type { CoverageMatrix } from "../scripts/audit/audit-cobertura-fichas"
import { selectParliamentaryOpenSlugs } from "../scripts/audit/select-parliamentary-open-slugs"

function cell(slug: string, familia: string, estado: string, aplicavel = true): CoverageMatrix["cells"][number] {
  return { slug, familia, estado, aplicavel } as CoverageMatrix["cells"][number]
}

test("selects each open parliamentary slug and excludes closed or unrelated families", () => {
  const cells = [
    cell("ana", "projetos_lei", "sem_recibo"),
    cell("ana", "votos_candidato", "erro"),
    cell("bia", "gastos_parlamentares", "desatualizado"),
    cell("caio", "projetos_lei", "publicado"),
    cell("duda", "votos_candidato", "vazio_confirmado"),
    cell("eva", "mudancas_partido", "sem_recibo"),
    cell("fabi", "gastos_parlamentares", "sem_recibo", false),
  ]
  assert.deepEqual(selectParliamentaryOpenSlugs({ cells }), ["ana", "bia"])
})

test("invalid open slug fails before scheduled capture", () => {
  assert.throws(() => selectParliamentaryOpenSlugs({ cells: [cell("../../bad", "projetos_lei", "erro")] }), /slug inválido/)
})
