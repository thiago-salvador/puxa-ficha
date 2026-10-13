import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  STALE_DEPLOY_RELOAD_WINDOW_MS,
  isStaleDeployError,
  shouldReloadForStaleDeploy,
} from "../src/lib/stale-deploy-recovery"

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe("isStaleDeployError", () => {
  it("reconhece o TypeError do PUXA-FICHA-2Z (aba de um build lendo módulo de outro)", () => {
    const error = new TypeError("(0 , e.i(...).default) is not a function")
    assert.equal(isStaleDeployError(error), true)
  })

  it("reconhece falhas de carregamento de chunk", () => {
    const chunk = new Error("Loading chunk 123 failed.")
    chunk.name = "ChunkLoadError"
    assert.equal(isStaleDeployError(chunk), true)
    assert.equal(
      isStaleDeployError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/a.js")),
      true,
    )
    assert.equal(isStaleDeployError(new TypeError("Importing a module script failed.")), true)
  })

  it("não confunde erro de aplicação com deploy defasado", () => {
    assert.equal(isStaleDeployError(new TypeError("candidato.nome is not a function")), false)
    assert.equal(isStaleDeployError(new Error("Supabase timeout")), false)
    assert.equal(isStaleDeployError(null), false)
    assert.equal(isStaleDeployError("(0 , e.i(...).default) is not a function"), false)
  })
})

describe("shouldReloadForStaleDeploy", () => {
  it("permite um reload e bloqueia o segundo dentro da janela", () => {
    const storage = memoryStorage()
    assert.equal(shouldReloadForStaleDeploy(storage, 1_000), true)
    assert.equal(shouldReloadForStaleDeploy(storage, 1_000 + STALE_DEPLOY_RELOAD_WINDOW_MS - 1), false)
  })

  it("libera de novo depois da janela", () => {
    const storage = memoryStorage()
    assert.equal(shouldReloadForStaleDeploy(storage, 1_000), true)
    assert.equal(shouldReloadForStaleDeploy(storage, 1_000 + STALE_DEPLOY_RELOAD_WINDOW_MS), true)
  })

  it("sem storage utilizável não recarrega, para nunca entrar em loop", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {
        throw new Error("SecurityError")
      },
    }
    assert.equal(shouldReloadForStaleDeploy(broken, 1_000), false)
    assert.equal(shouldReloadForStaleDeploy(null, 1_000), false)
  })
})
