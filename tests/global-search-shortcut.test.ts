import assert from "node:assert/strict"
import test from "node:test"

import { atalhoDaBuscaGlobal } from "@/lib/global-search-shortcut"

const foraDeCampo = () => false
const dentroDeCampo = () => true

test("Cmd/Ctrl+K alterna e / fora de campo abre", () => {
  assert.equal(atalhoDaBuscaGlobal({ key: "k", metaKey: true, ctrlKey: false }, foraDeCampo), "alternar")
  assert.equal(atalhoDaBuscaGlobal({ key: "K", metaKey: false, ctrlKey: true }, foraDeCampo), "alternar")
  assert.equal(atalhoDaBuscaGlobal({ key: "/", metaKey: false, ctrlKey: false }, foraDeCampo), "abrir")
  assert.equal(atalhoDaBuscaGlobal({ key: "/", metaKey: false, ctrlKey: false }, dentroDeCampo), null)
  assert.equal(atalhoDaBuscaGlobal({ key: "k", metaKey: false, ctrlKey: false }, foraDeCampo), null)
})

/**
 * Autofill do navegador dispara `keydown` como `Event` simples, sem `key`.
 * O listener global lia `event.key.toLowerCase()` e quebrava em toda página.
 */
test("keydown sem key (autofill) não lança e não aciona atalho", () => {
  const alvo = new EventTarget()
  const resultados: unknown[] = []
  let erro: unknown = null
  alvo.addEventListener("keydown", (event) => {
    try {
      resultados.push(atalhoDaBuscaGlobal(event as unknown as KeyboardEvent, foraDeCampo))
    } catch (e) {
      erro = e
    }
  })

  alvo.dispatchEvent(new Event("keydown"))

  assert.equal(erro, null)
  assert.deepEqual(resultados, [null])
  assert.equal(
    atalhoDaBuscaGlobal({ key: undefined, metaKey: true, ctrlKey: true } as unknown as KeyboardEvent, foraDeCampo),
    null
  )
})
