import { strict as assert } from "node:assert"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { readSenadoPublicCohortConfig } from "../scripts/lib/ingest-cohort"
import type { CandidatoConfig } from "../scripts/lib/types"

/**
 * A config pública 309 e o readback de identidade Câmara são artefatos locais
 * de execução, não versionados. A contagem exata (309 linhas, 19 bindings) é
 * garantida no momento da geração, que aborta se os bindings incorporados
 * divergirem.
 *
 * Aqui fica o contrato do leitor sobre dados sintéticos: a config lida preserva
 * exatamente cada ID Câmara validado, não reintroduz ID rejeitado, não liga um
 * ID a mais de uma ficha e não aceita contagem divergente da declarada.
 */

interface ReadbackSintetico {
  results: Array<{ slug: string; camara_id: number; identity_status: string; usable_for_ingest: boolean }>
}

function configSintetica(slug: string, sq: string, uf: string, camara: number | null): CandidatoConfig {
  return {
    slug,
    nome_completo: `PESSOA SINTETICA ${sq}`,
    nome_urna: `SINTETICA ${sq}`,
    cargo_disputado: "Senador",
    estado: uf,
    ids: { camara, senado: null, tse_sq_candidato: { "2026": sq }, tse_uf_candidatura: { "2026": uf } },
  }
}

const readback: ReadbackSintetico = {
  results: [
    { slug: "tse-2026-101", camara_id: 9101, identity_status: "validated", usable_for_ingest: true },
    { slug: "tse-2026-102", camara_id: 9102, identity_status: "validated", usable_for_ingest: true },
  ],
}
const ID_REJEITADO = 9999

const rows: CandidatoConfig[] = [
  configSintetica("tse-2026-101", "101", "AC", 9101),
  configSintetica("tse-2026-102", "102", "SP", 9102),
  configSintetica("tse-2026-103", "103", "RJ", null),
]

function withConfig<T>(document: unknown, run: (path: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "senado-public-cohort-config-"))
  try {
    const path = join(directory, "config.json")
    writeFileSync(path, JSON.stringify(document))
    return run(path)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const documento = {
  schema_version: "senado-public-cohort-config-v1",
  generated_at: "2026-09-15T00:00:00.000Z",
  source: { relation: "candidatos_publico", expected_count: rows.length, endpoint: "local-supabase" },
  rows,
}

test("configuração pública incorpora exatamente os bindings Câmara validados", () => {
  const config = withConfig(documento, readSenadoPublicCohortConfig)
  const expected = new Map(readback.results.map((row) => [row.slug, row.camara_id]))
  assert.equal(config.rows.length, rows.length)
  assert.ok(readback.results.every((row) => row.identity_status === "validated" && row.usable_for_ingest === true))

  const incorporated = config.rows.filter((row) => expected.has(row.slug))
  assert.equal(incorporated.length, expected.size)
  for (const row of incorporated) assert.equal(row.ids.camara, expected.get(row.slug))

  assert.equal(config.rows.filter((row) => row.ids.camara === ID_REJEITADO).length, 0)
  for (const id of expected.values()) assert.equal(config.rows.filter((row) => row.ids.camara === id).length, 1)
  assert.equal(config.rows.find((row) => row.slug === "tse-2026-103")?.ids.camara, null)
})

test("leitor recusa contagem divergente, relação errada e data inválida", () => {
  withConfig({ ...documento, source: { ...documento.source, expected_count: rows.length + 1 } }, (path) => {
    assert.throws(() => readSenadoPublicCohortConfig(path), /diverge da contagem declarada/)
  })
  withConfig({ ...documento, source: { ...documento.source, relation: "candidatos" } }, (path) => {
    assert.throws(() => readSenadoPublicCohortConfig(path), /configuração pública Senado inválida/)
  })
  withConfig({ ...documento, generated_at: "ontem" }, (path) => {
    assert.throws(() => readSenadoPublicCohortConfig(path), /sem data válida/)
  })
})

test("leitor recusa SQ duplicado na coorte explícita", () => {
  const duplicado = [...rows, configSintetica("tse-2026-104", "101", "MG", null)]
  withConfig({ ...documento, rows: duplicado, source: { ...documento.source, expected_count: duplicado.length } }, (path) => {
    assert.throws(() => readSenadoPublicCohortConfig(path), /SQ ausente ou duplicado/)
  })
})
