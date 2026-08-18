import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { parseCiclo } from "../scripts/audit/lib/candidatura-resultado-gate"
import { validateTseReference } from "../scripts/audit/partidos-oficiais"

test("referência de partidos preserva a âncora TSE", () => {
  const url = new URL("../data/referencia-tse-partidos-2026-08-14.json", import.meta.url)
  const raw = readFileSync(url, "utf8")
  assert.doesNotThrow(() => validateTseReference(JSON.parse(raw), raw))
  assert.throws(() => validateTseReference(JSON.parse(raw), `${raw}\n`), /SHA-256/)
})

test("auditoria de partidos não contém caminho absoluto do autor", () => {
  const source = readFileSync(new URL("../scripts/audit/partidos-oficiais.ts", import.meta.url), "utf8")
  assert.doesNotMatch(source, /\/Users\/thiagosalvador/)
  assert.match(source, /code === "ENOENT"/)
})

test("ciclo aceita inteiro positivo e rejeita valores arbitrários", () => {
  assert.equal(parseCiclo("2026"), 2026)
  assert.throws(() => parseCiclo("foo"), /inválido/)
  assert.throws(() => parseCiclo("-1"), /inválido/)
  assert.throws(() => parseCiclo("0"), /inválido/)
})
