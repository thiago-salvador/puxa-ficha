import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("cache da Mesa usa o TTL de 12 h da ficha, a tag da ficha e filtros separados na chave", () => {
  const source = readFileSync(new URL("../src/lib/imprensa-cache.ts", import.meta.url), "utf8")
  assert.match(source, /const IMPRENSA_DATASET_REVALIDATE_SECONDS = 43200/)
  assert.match(source, /const IMPRENSA_DATASET_TAG = "public-candidato-ficha"/)
  // A chave muda quando a projeção pública muda; evita servir a forma antiga
  // durante o TTL após a publicação de estados judiciais separados.
  assert.match(source, /\["imprensa-dataset-v4", SENADO_CACHE_VARIANT\]/)
  assert.match(source, /getCachedImprensaDataset\(filters\.cargo, filters\.uf\)/)
  assert.match(source, /\{ revalidate: IMPRENSA_DATASET_REVALIDATE_SECONDS, tags: \[IMPRENSA_DATASET_TAG\] \}/)
  assert.match(source, /getImprensaDataset\(\{ cargo, uf \}\)/)
  assert.match(source, /toPageDataset\(await getImprensaDataset\(\{ cargo, uf \}\)\)/)
  assert.match(source, /ocorrencias: sitesOccurrences/)
  assert.match(source, /ocorrencias: processOccurrences/)
})
