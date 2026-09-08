import assert from "node:assert/strict"
import test from "node:test"
import { ambienteSentry, sentryHabilitadoNesteAmbiente } from "../src/lib/sentry-env"

function comEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const chaves = [
    "NEXT_PUBLIC_VERCEL_ENV",
    "VERCEL_ENV",
    "VERCEL",
    "NODE_ENV",
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

test("produção na Vercel continua reportando", () => {
  comEnv({ VERCEL: "1", VERCEL_ENV: "production" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), true)
    assert.equal(ambienteSentry(), "production")
  })
})

test("preview fica mudo por padrão, pelas duas variantes de env", () => {
  comEnv({ VERCEL: "1", VERCEL_ENV: "preview" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
  })
  comEnv({ VERCEL: "1", NEXT_PUBLIC_VERCEL_ENV: "preview" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
  })
})

test("opt-in explícito religa o preview", () => {
  comEnv({ VERCEL: "1", VERCEL_ENV: "preview", SENTRY_ENABLE_PREVIEW: "1" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), true)
  })
  comEnv(
    { VERCEL: "1", NEXT_PUBLIC_VERCEL_ENV: "preview", NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW: "1" },
    () => {
      assert.equal(sentryHabilitadoNesteAmbiente(), true)
    },
  )
  comEnv({ VERCEL: "1", VERCEL_ENV: "preview", SENTRY_ENABLE_PREVIEW: "0" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
  })
})

/**
 * Regressão da PUXA-FICHA-1E (06/09/2026): o evento veio de
 * `Thiagos-MacBook-Pro.local` com `environment: production` porque o processo
 * local tinha `VERCEL_ENV=production` no ambiente. Sem `VERCEL=1` não é deploy,
 * e o servidor não pode nem reportar nem se rotular produção.
 */
test("run local com VERCEL_ENV=production não reporta e não vira produção", () => {
  comEnv({ VERCEL_ENV: "production", NODE_ENV: "development" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
    assert.equal(ambienteSentry(), "development")
  })
  comEnv({ NEXT_PUBLIC_VERCEL_ENV: "production", NODE_ENV: "development" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
  })
})

test("dev local sem nenhuma variável da Vercel não reporta no servidor", () => {
  comEnv({ NODE_ENV: "development" }, () => {
    assert.equal(sentryHabilitadoNesteAmbiente(), false)
    assert.equal(ambienteSentry(), "development")
  })
})

/**
 * O bundle do cliente não enxerga `process.env.VERCEL` (o Next só inlina
 * `NEXT_PUBLIC_*`), então exigir a flag lá silenciaria o navegador em produção.
 * A exigência é só do lado servidor.
 */
test("no cliente a exigência de Vercel não se aplica", () => {
  const globalComWindow = globalThis as { window?: unknown }
  const tinhaWindow = "window" in globalComWindow
  globalComWindow.window = {}
  try {
    comEnv({ NEXT_PUBLIC_VERCEL_ENV: "production" }, () => {
      assert.equal(sentryHabilitadoNesteAmbiente(), true)
      assert.equal(ambienteSentry(), "production")
    })
    comEnv({ NEXT_PUBLIC_VERCEL_ENV: "preview" }, () => {
      assert.equal(sentryHabilitadoNesteAmbiente(), false)
    })
    // Consequência aceita e explícita: navegador local, sem nenhuma variável da
    // Vercel, continua reportando. O corte do servidor não o alcança, e fechar
    // este caso exigiria uma variável `NEXT_PUBLIC_` criada só para isso.
    comEnv({ NODE_ENV: "development" }, () => {
      assert.equal(sentryHabilitadoNesteAmbiente(), true)
      assert.equal(ambienteSentry(), "development")
    })
  } finally {
    if (!tinhaWindow) delete globalComWindow.window
  }
})
