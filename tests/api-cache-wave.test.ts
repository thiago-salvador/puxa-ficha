import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import ts from "typescript"

const API_PATH = new URL("../src/lib/api.ts", import.meta.url)

test("todo cache público com single-flight inclui o ponto único de bump", () => {
  const source = readFileSync(API_PATH, "utf8")
  const file = ts.createSourceFile("api.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const cacheCalls: ts.CallExpression[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "unstableCacheWithSingleFlight"
    ) {
      cacheCalls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)

  assert.equal(cacheCalls.length, 12, "o inventário de caches públicos mudou; revise este contrato")
  for (const call of cacheCalls) {
    const key = call.arguments[1]
    assert.ok(
      ts.isArrayLiteralExpression(key),
      "unstableCacheWithSingleFlight deve declarar uma chave estática"
    )
    assert.ok(
      key.elements.some((element) => ts.isIdentifier(element) && element.text === "CURRENT_DATA_WAVE"),
      `cache sem CURRENT_DATA_WAVE na linha ${file.getLineAndCharacterOfPosition(call.getStart()).line + 1}`,
    )
  }

  assert.match(source, /export const CURRENT_DATA_WAVE = "ceaps-utf8-20260821"/)
  assert.match(source, /\["global-search-index"[^\n]+"party-siglas-lote2-20260815"[^\n]+CURRENT_DATA_WAVE\]/)
})
