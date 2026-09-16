import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from "next/dist/client/components/http-access-fallback/http-access-fallback"
import SenadoPage, { generateMetadata as generateSenadoMetadata } from "@/app/(site)/senado/page"
import { isSenadoEnabled, shouldExposeCargo } from "@/lib/senado-feature"

describe("feature flag do Senado", () => {
  it("fica desligada por padrão e só aceita true explícito", () => {
    assert.equal(isSenadoEnabled({}), false)
    assert.equal(isSenadoEnabled({ SENADO_ENABLED: "false" }), false)
    assert.equal(isSenadoEnabled({ SENADO_ENABLED: "1" }), false)
    assert.equal(isSenadoEnabled({ SENADO_ENABLED: " true " }), true)
  })

  it("preserva os cargos existentes e bloqueia Senador quando desligada", () => {
    assert.equal(shouldExposeCargo("Presidente", {}), true)
    assert.equal(shouldExposeCargo("Governador", {}), true)
    assert.equal(shouldExposeCargo("Senador", {}), false)
    assert.equal(shouldExposeCargo("Senador", { SENADO_ENABLED: "true" }), true)
  })

  it("fecha também metadata e página /senado quando a flag está desligada", () => {
    const env = process.env as Record<string, string | undefined>
    const saved = env.SENADO_ENABLED
    try {
      delete env.SENADO_ENABLED
      assert.deepEqual(generateSenadoMetadata(), {})
      assert.throws(() => SenadoPage(), (error: unknown) =>
        isHTTPAccessFallbackError(error) && getAccessFallbackHTTPStatus(error) === 404)

      env.SENADO_ENABLED = "true"
      assert.equal(generateSenadoMetadata().alternates?.canonical, "/senado")
      assert.doesNotThrow(() => SenadoPage())
    } finally {
      if (saved === undefined) delete env.SENADO_ENABLED
      else env.SENADO_ENABLED = saved
    }
  })
})
