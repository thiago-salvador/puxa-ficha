import assert from "node:assert/strict"
import test from "node:test"

import {
  clearStoredAlertManageToken,
  clearStoredAlertState,
  hasStoredAlertSessionHint,
  setStoredCandidateFollowState,
  writeStoredFollowedCandidateSlugs,
} from "@/lib/alerts-client"

/**
 * Com storage bloqueado (iframe sandbox, cookies desligados) o próprio getter
 * `window.localStorage` lança SecurityError. Nenhuma função pode propagar.
 */
function comLocalStorageBloqueado(fn: () => void): void {
  const globalComWindow = globalThis as { window?: unknown }
  const tinhaWindow = "window" in globalComWindow
  const windowAnterior = globalComWindow.window
  const janela = {}
  Object.defineProperty(janela, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException(
        "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
        "SecurityError"
      )
    },
  })
  globalComWindow.window = janela
  try {
    fn()
  } finally {
    if (tinhaWindow) globalComWindow.window = windowAnterior
    else delete globalComWindow.window
  }
}

test("storage bloqueado: leituras caem no fallback e escritas viram no-op", () => {
  comLocalStorageBloqueado(() => {
    assert.doesNotThrow(() => clearStoredAlertManageToken())
    assert.equal(hasStoredAlertSessionHint(), false)
    assert.doesNotThrow(() => writeStoredFollowedCandidateSlugs(["a", "b"]))
    assert.deepEqual(setStoredCandidateFollowState("fulano", true), ["fulano"])
    assert.deepEqual(setStoredCandidateFollowState("fulano", false), [])
    assert.doesNotThrow(() => clearStoredAlertState())
  })
})
