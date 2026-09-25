import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("cache da Mesa usa TTL de 300s e filtros separados na chave", () => {
  const source = readFileSync(new URL("../src/lib/imprensa-cache.ts", import.meta.url), "utf8")
  assert.match(source, /const IMPRENSA_DATASET_REVALIDATE_SECONDS = 300/)
  // A chave muda quando a projeção pública muda; evita servir a forma antiga
  // durante o TTL após a publicação de estados judiciais separados.
  assert.match(source, /\["imprensa-dataset-v3"\]/)
  assert.match(source, /getCachedImprensaDataset\(filters\.cargo, filters\.uf\)/)
  assert.match(source, /\{ revalidate: IMPRENSA_DATASET_REVALIDATE_SECONDS \}/)
  assert.match(source, /getImprensaDataset\(\{ cargo, uf \}\)/)
  assert.match(source, /toPageDataset\(await getImprensaDataset\(\{ cargo, uf \}\)\)/)
  assert.match(source, /ocorrencias: sitesOccurrences/)
  assert.match(source, /ocorrencias: processOccurrences/)
})
