import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { readSavedState, rememberState } from "../src/components/StatePreference"

const previousWindow = globalThis.window
afterEach(() => {
  if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window")
  else globalThis.window = previousWindow
})

function browser(initial: string | null = null) {
  let saved = initial
  let changes = 0
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => saved,
        setItem: (_key: string, value: string) => { saved = value },
      },
      dispatchEvent: () => { changes += 1 },
    },
  })
  return { changes: () => changes }
}

test("a escolha válida persiste e comunica a mudança sem navegar automaticamente", () => {
  const state = browser()
  assert.equal(readSavedState(), null)
  rememberState("SP")
  assert.equal(readSavedState(), "SP")
  assert.equal(state.changes(), 1)
  rememberState("DF")
  assert.equal(readSavedState(), "DF")
})

test("dados antigos ou manipulados não criam destino arbitrário", () => {
  browser("https://example.org")
  assert.equal(readSavedState(), null)
  rememberState("SP")
  rememberState("../../externo")
  assert.equal(readSavedState(), "SP")
})

test("armazenamento bloqueado não impede a seleção nem a renderização", () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { get localStorage() { throw new Error("SecurityError") } },
  })
  assert.equal(readSavedState(), null)
  assert.doesNotThrow(() => rememberState("GO"))
})

test("servidor sem window não lê preferência do navegador", () => {
  Reflect.deleteProperty(globalThis, "window")
  assert.equal(readSavedState(), null)
})
