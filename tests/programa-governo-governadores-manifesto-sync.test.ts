import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import test, { before } from "node:test"
import {
  toProgramaGovernoManifestoPublico,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const require = createRequire(import.meta.url)
const serverOnlyPath = require.resolve("server-only")
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never

// O manifesto de governadores embute uma cópia do resumo de cada JSON. Editar
// o JSON sem rodar `npm run data:programas-governo:governadores:manifesto`
// deixa a página publicando o trecho antigo; este teste barra essa divergência.
const RECORDS_DIR = path.resolve(import.meta.dirname, "../src/data/programas-governo/governadores-2026")
const REGEN = "rode `npm run data:programas-governo:governadores:manifesto`"

let manifestModule: typeof import("../src/data/programas-governo-governadores-2026")
before(async () => {
  manifestModule = await import("../src/data/programas-governo-governadores-2026")
})

function loadRecords(): ProgramaGovernoRegistro[] {
  return readdirSync(RECORDS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(RECORDS_DIR, file), "utf8")) as ProgramaGovernoRegistro)
}

test("manifesto gerado de governadores cobre exatamente os JSONs publicados", () => {
  const jsonSlugs = loadRecords().map((record) => record.fonte.slug).sort()
  const manifestSlugs = manifestModule.programasGovernoGovernadores2026Identidades.map(({ slug }) => slug).sort()
  assert.deepEqual(manifestSlugs, jsonSlugs, `slugs divergentes; ${REGEN}`)
})

test("manifesto gerado de governadores reflete o conteúdo atual de cada JSON", () => {
  for (const record of loadRecords()) {
    const slug = record.fonte.slug!
    const entry = manifestModule.getProgramaGovernoGovernador2026ManifestoEntry(slug)
    assert.ok(entry, `${slug}: ausente do manifesto; ${REGEN}`)
    const { ano, cargo, uf, sqCandidato, nomeUrna, partido } = record.fonte
    assert.deepEqual(
      entry.identidade,
      { ano, cargo, uf, sqCandidato, slug, nomeUrna, partido },
      `${slug}: identidade divergente; ${REGEN}`,
    )
    assert.deepEqual(
      entry.manifesto,
      toProgramaGovernoManifestoPublico(record),
      `${slug}: manifesto divergente do JSON; ${REGEN}`,
    )
    assert.deepEqual(
      entry.documentos?.map(({ documentoId }) => documentoId) ?? [],
      record.documentos?.map(({ documentoId }) => documentoId) ?? [],
      `${slug}: documentoIds divergentes; ${REGEN}`,
    )
  }
})
