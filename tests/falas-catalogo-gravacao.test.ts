import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { gravarCatalogoVerificado } from "../scripts/falas-validar-transcricoes"
import type { CatalogoFalas } from "../src/lib/falas-candidatos"

test("grava catálogo com backup exato e readback, sem aceitar conteúdo inválido", () => {
  const dir = mkdtempSync(join(tmpdir(), "falas-write-"))
  try {
    const path = join(dir, "catalog.json")
    const previous = '{"schema_version":"falas-v1","updated_at":null,"quotes":[]}\n'
    writeFileSync(path, previous)
    assert.throws(() => gravarCatalogoVerificado(path, { schema_version: "inválido", quotes: [] } as unknown as CatalogoFalas, join(dir, "backup")))
    assert.equal(readFileSync(path, "utf8"), previous)
    assert.deepEqual(readdirSync(dir), ["catalog.json"])
    const next: CatalogoFalas = { schema_version: "falas-v1", updated_at: "2026-09-12T00:00:00Z", quotes: [] }
    const backup = gravarCatalogoVerificado(path, next, join(dir, "backup"))
    assert.equal(readFileSync(backup, "utf8"), previous)
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), next)
    assert.equal(readdirSync(dir).some(f => f.endsWith(".tmp")), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
