import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("todo nó interativo da timeline tem foco visível", () => {
  const source = readFileSync(new URL("../src/components/timeline/TimelineDesktop.tsx", import.meta.url), "utf8")
  const interactiveNodes = source.match(/<g[\s\S]*?role="button"[\s\S]*?tabIndex=\{0\}[\s\S]*?>/g) ?? []
  assert.equal(interactiveNodes.length, 3, "o inventário de nós interativos da timeline mudou")
  for (const node of interactiveNodes) {
    assert.match(node, /focus-visible:ring-2/)
    assert.match(node, /focus-visible:ring-ring/)
  }
})
