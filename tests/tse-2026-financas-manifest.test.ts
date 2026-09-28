import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { hashesDoManifesto } from "../scripts/tse-2026-financas"

const receitaUrl = "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip"
const bensUrl = "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip"

test("manifest hashes are source-bound and checked against the files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tse-manifest-test-"))
  const original = process.env.PF_TSE_2026_ASSET_MANIFEST
  try {
    const receita = join(dir, "receitas.zip")
    const bens = join(dir, "bens.zip")
    const manifestPath = join(dir, "manifest.json")
    const payload = Buffer.from("PK\x03\x04fixture")
    const sha256 = createHash("sha256").update(payload).digest("hex")
    writeFileSync(receita, payload)
    writeFileSync(bens, payload)
    writeFileSync(manifestPath, JSON.stringify({ assets: [
      { family: "financiamento", year: 2026, path: receita, url: receitaUrl, sha256 },
      { family: "patrimonio", year: 2026, path: bens, url: bensUrl, sha256 },
    ] }))
    process.env.PF_TSE_2026_ASSET_MANIFEST = manifestPath
    assert.deepEqual(await hashesDoManifesto(receitaUrl), { sha256_receitas: sha256, sha256_bens: sha256 })
    writeFileSync(bens, Buffer.from("alterado"))
    await assert.rejects(hashesDoManifesto(receitaUrl), /SHA divergente/)
    await assert.rejects(hashesDoManifesto(`${receitaUrl}?outro`), /sem arquivo e SHA únicos/)
  } finally {
    if (original === undefined) delete process.env.PF_TSE_2026_ASSET_MANIFEST
    else process.env.PF_TSE_2026_ASSET_MANIFEST = original
    rmSync(dir, { recursive: true, force: true })
  }
})
