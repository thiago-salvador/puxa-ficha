import assert from "node:assert/strict"
import test from "node:test"

import {
  BRAZIL_UFS,
  PartialCheckFailure,
  candidatePathFromHref,
  formatResultLine,
  hasMoneyData,
  releaseBaseUrl,
  runWithRetry,
} from "../scripts/smoke-lancamento"

test("smoke cobre as 27 UFs sem duplicatas", () => {
  assert.equal(BRAZIL_UFS.length, 27)
  assert.equal(new Set(BRAZIL_UFS).size, 27)
  assert.ok(BRAZIL_UFS.includes("DF"))
})

test("candidatePathFromHref aceita apenas fichas publicas", () => {
  assert.equal(candidatePathFromHref("/candidato/pablo-marcal"), "/candidato/pablo-marcal")
  assert.equal(
    candidatePathFromHref("https://puxaficha.com.br/candidato/pablo-marcal?tab=dinheiro"),
    "/candidato/pablo-marcal",
  )
  assert.equal(candidatePathFromHref("/comparar?c1=pablo-marcal"), null)
  assert.equal(candidatePathFromHref("/candidato/"), null)
})

test("releaseBaseUrl aceita stage Vercel e rejeita host externo", () => {
  assert.equal(releaseBaseUrl("https://puxaficha.com.br"), "https://puxaficha.com.br")
  assert.equal(
    releaseBaseUrl("https://puxa-ficha-stage.vercel.app/"),
    "https://puxa-ficha-stage.vercel.app",
  )
  assert.throws(() => releaseBaseUrl("http://puxa-ficha-stage.vercel.app"), /HTTPS/)
  assert.throws(() => releaseBaseUrl("https://attacker.example"), /permitido/)
})

test("hasMoneyData reconhece somente colecoes monetarias com dados", () => {
  assert.equal(hasMoneyData({ patrimonio: [], financiamento: [], gastos_executivo: [] }), false)
  assert.equal(hasMoneyData({ patrimonio: [{ ano: 2026 }] }), true)
  assert.equal(hasMoneyData({ financiamento_eleicoes: [{ ano: 2022 }] }), true)
  assert.equal(hasMoneyData({ maiores_doadores: [{ nome: "Doador" }] }), true)
  assert.equal(hasMoneyData({ processos: [{ numero: "1" }] }), false)
})

test("hasMoneyData reconhece o envelope data da API publica", () => {
  assert.equal(hasMoneyData({ data: { patrimonio: [{ ano: 2026 }] } }), true)
  assert.equal(hasMoneyData({ data: { financiamento_eleicoes: [] } }), false)
})

test("runWithRetry repete uma vez e retorna o segundo resultado", async () => {
  let attempts = 0
  const result = await runWithRetry("pagina", async () => {
    attempts += 1
    if (attempts === 1) throw new Error("rede instavel")
    return "ok"
  })

  assert.equal(result, "ok")
  assert.equal(attempts, 2)
})

test("runWithRetry encerra depois de duas falhas", async () => {
  let attempts = 0

  await assert.rejects(
    runWithRetry("pagina", async () => {
      attempts += 1
      throw new Error(`falha ${attempts}`)
    }),
    /pagina: falha 2/,
  )
  assert.equal(attempts, 2)
})

test("runWithRetry preserva descoberta parcial depois da segunda falha", async () => {
  let caught: unknown

  try {
    await runWithRetry("home", async () => {
      throw new PartialCheckFailure("copy proibida", ["/candidato/pablo-marcal"])
    })
  } catch (error) {
    caught = error
  }

  assert.ok(caught instanceof PartialCheckFailure)
  assert.deepEqual(caught.value, ["/candidato/pablo-marcal"])
  assert.match(caught.message, /home: copy proibida/)
})

test("formatResultLine gera uma linha compacta sem travessao", () => {
  const line = formatResultLine({ status: "PASS", item: "home", details: "cards=13" })

  assert.equal(line, "PASS home cards=13")
  assert.doesNotMatch(line, /[\u2013\u2014]/)
})
