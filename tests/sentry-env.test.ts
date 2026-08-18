import assert from "node:assert/strict"
import test from "node:test"
import { sentryHabilitadoNesteAmbiente } from "../src/lib/sentry-env"

function comEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const chaves = [
    "NEXT_PUBLIC_VERCEL_ENV",
    "VERCEL_ENV",
    "NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW",
    "SENTRY_ENABLE_PREVIEW",
  ]
  const anteriores = new Map(chaves.map((k) => [k, process.env[k]]))
  for (const k of chaves) delete process.env[k]
  Object.assign(process.env, env)
  try {
    fn()
  } finally {
    for (const [k, v] of anteriores) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test("produção e development continuam reportando", () => {
  comEnv({ VERCEL_ENV: "production" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), true)
  })
  comEnv({}, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), true)
  })
})

test("preview fica mudo por padrão, pelas duas variantes de env", () => {
  comEnv({ VERCEL_ENV: "preview" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
  })
  comEnv({ NEXT_PUBLIC_VERCEL_ENV: "preview" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
  })
})

test("opt-in explícito religa o preview", () => {
  comEnv({ VERCEL_ENV: "preview", SENTRY_ENABLE_PREVIEW: "1" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), true)
  })
  comEnv({ NEXT_PUBLIC_VERCEL_ENV: "preview", NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW: "1" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), true)
  })
  comEnv({ VERCEL_ENV: "preview", SENTRY_ENABLE_PREVIEW: "0" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
  })
})
