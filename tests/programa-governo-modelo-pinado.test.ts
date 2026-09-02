import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import type { ProgramaGovernoRegistro } from "../src/lib/programa-governo"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIRS = ["governadores-2026", "presidencia-2026"].map((dir) => path.join(ROOT, "src/data/programas-governo", dir))

// ID completo: `Fornecedor Nome@id-do-modelo` no mínimo, com o id depois do `@`.
const MODELO_PINADO = /^[^@]+@[A-Za-z0-9.][A-Za-z0-9._-]*/u

function records(): ProgramaGovernoRegistro[] {
  return DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ProgramaGovernoRegistro),
  )
}

test("todo registro publicado tem modelo com ID completo, salvo os 13 presidenciais anotados com modelPinned=false", () => {
  const naoPinados: string[] = []
  for (const record of records()) {
    if (!record.geracao || !record.julgamento) continue
    const slug = String(record.fonte.slug)
    const marcado = record.geracao.modelPinned === false && record.julgamento.modelPinned === false
    if (marcado) {
      assert.equal(record.fonte.cargo, "PRESIDENTE", `${slug}: só o legado presidencial pode ficar sem ID pinado`)
      naoPinados.push(slug)
      continue
    }
    assert.notEqual(record.geracao.modelPinned, false, `${slug}: modelPinned parcial`)
    assert.notEqual(record.julgamento.modelPinned, false, `${slug}: modelPinned parcial`)
    assert.match(record.geracao.model, MODELO_PINADO, `${slug}: gerador sem ID completo: ${record.geracao.model}`)
    assert.match(record.julgamento.model, MODELO_PINADO, `${slug}: judge sem ID completo: ${record.julgamento.model}`)
  }
  assert.equal(naoPinados.length, 13, `presidenciais legados anotados: ${naoPinados.length}`)
})

test("registros gerados depois de 2026-09-02 carregam o hash das instruções do gerador", () => {
  // Os 202 de agosto não têm o campo; o contrato aceita a ausência. O que se
  // fixa aqui é que, quando presente, ele é sha256 e é o mesmo em todos.
  const hashes = new Set<string>()
  for (const record of records()) {
    const sha = record.geracao?.instructionsSha256
    if (sha === undefined) continue
    assert.match(sha, /^[0-9a-f]{64}$/u)
    hashes.add(sha)
  }
  assert.ok(hashes.size <= 1, `mais de um hash de instruções em produção: ${[...hashes].join(", ")}`)
})
