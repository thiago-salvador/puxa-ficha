import assert from "node:assert/strict"
import test from "node:test"
import { eventFiltersIntegration, type Event } from "@sentry/nextjs"

import { SENTRY_CLIENT_DENY_URLS, SENTRY_CLIENT_IGNORE_ERRORS } from "@/lib/sentry-client-filters"

/**
 * Passa o evento pelo filtro do próprio SDK, com as listas do cliente e sem os
 * padrões default dele, para medir só o que este projeto acrescenta.
 */
function descartado(event: Event): boolean {
  const filtro = eventFiltersIntegration({
    ignoreErrors: SENTRY_CLIENT_IGNORE_ERRORS,
    denyUrls: SENTRY_CLIENT_DENY_URLS,
    disableErrorDefaults: true,
  })
  const client = { getOptions: () => ({}) }
  const processEvent = filtro.processEvent as unknown as (e: Event, h: object, c: typeof client) => Event | null
  return processEvent(event, {}, client) === null
}

function erro(type: string, value: string, filename = "app:///_next/static/chunks/app.js"): Event {
  return {
    exception: {
      values: [{ type, value, stacktrace: { frames: [{ filename, function: "f", lineno: 1, colno: 1 }] } }],
    },
  }
}

test("ruído real de terceiros é descartado", () => {
  const ruidos: Array<[string, string]> = [
    ["Error", "Error invoking postMessage: Java exception was raised during method invocation"],
    ["Error", "Error invoking postMessage: Java object is gone"],
    ["TypeError", "undefined is not an object (evaluating 'window.webkit.messageHandlers')"],
    ["i", "Failed to connect to MetaMask"],
    ["Error", "MetaMask extension not found"],
    ["TypeError", `undefined is not an object (evaluating 'r["@context"].toLowerCase')`],
    ["TypeError", "Cannot read properties of undefined (reading 'M_ID')"],
    ["TypeError", "Load failed"],
    ["TypeError", "Load failed (puxaficha.com.br)"],
    ["TypeError", "network error"],
    [
      "UnhandledRejection",
      "Non-Error promise rejection captured with value: Object Not Found Matching Id:2, MethodName:update, ParamCount:4",
    ],
    ["Error", "The destination stream closed early."],
  ]
  for (const [type, value] of ruidos) {
    assert.equal(descartado(erro(type, value)), true, `devia descartar: ${value}`)
  }
})

test("frames de extensão e de executor injetado são descartados por URL", () => {
  assert.equal(descartado(erro("Error", "qualquer", "app:///scripts/inpage.js")), true)
  assert.equal(descartado(erro("Error", "qualquer", "chrome-extension://abc/scripts/inpage.js")), true)
  assert.equal(descartado(erro("TypeError", "qualquer", "app:///executors/200.js")), true)
  assert.equal(descartado(erro("TypeError", "qualquer", "https://puxaficha.com.br/executors/200.js?v=1")), true)
})

test("erro genuíno da aplicação continua sendo enviado", () => {
  const genuinos: Array<[string, string]> = [
    ["TypeError", "Cannot read properties of undefined (reading 'nome')"],
    ["TypeError", "Cannot read properties of undefined (reading 'toLowerCase')"],
    ["TypeError", "Failed to fetch"],
    ["TypeError", "Load failed while parsing candidato"],
    ["UnhandledRejection", "Non-Error promise rejection captured with value: timeout"],
    ["Error", "chapas_2026_publico: permission denied for table chapas_2026"],
  ]
  for (const [type, value] of genuinos) {
    assert.equal(descartado(erro(type, value)), false, `não devia descartar: ${value}`)
  }
  assert.equal(descartado(erro("TypeError", "x", "app:///_next/static/chunks/scripts/busca.js")), false)
})
