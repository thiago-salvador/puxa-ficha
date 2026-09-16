import assert from "node:assert/strict"
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import test from "node:test"

import {
  coletarFamiliaTransparencia,
  endpointTransparencia,
  sanitizeTransparenciaPublic,
  validateTransparenciaPage,
} from "../scripts/lib/ingest-transparencia"

const CPF = "52998224725"

test("Transparência pagina resposta positiva e remove identificadores pessoais", async () => {
  const requests: string[] = []
  const coleta = await coletarFamiliaTransparencia(CPF, endpointTransparencia("cartoes"), {
    apiKey: "test-key",
    cacheDir: "/tmp/puxa-ficha-transparencia-test-positive",
    useCache: false,
    fetchImpl: async (url, init) => {
      requests.push(`${url} ${String(init?.headers && (init.headers as Record<string, string>)["chave-api-dados"])}`)
      return new Response(requests.length === 1 ? JSON.stringify([{ id: 7, nomePortador: "Pessoa", cpfPortador: "529.982.247-25", dataTransacao: "01/01/2024", valorTransacao: "12,00" }]) : "[]", { status: 200 })
    },
  })
  assert.equal(coleta.resultado, "encontrado")
  assert.equal(coleta.registros, 1)
  assert.equal(coleta.paginas, 2)
  assert.equal(requests.length, 2)
  assert.match(requests[0], /cpfPortador=52998224725&pagina=1/)
  assert.match(requests[0], /test-key/)
  assert.equal(JSON.stringify(coleta.rows).includes("cpfPortador"), false)
  assert.equal(JSON.stringify(coleta.rows).includes("52998224725"), false)
})

test("Transparência distingue vazio confirmado de envelope inválido", async () => {
  const empty = await coletarFamiliaTransparencia(CPF, endpointTransparencia("viagens"), {
    apiKey: "test-key",
    cacheDir: "/tmp/puxa-ficha-transparencia-test-empty",
    useCache: false,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  })
  assert.equal(empty.resultado, "vazio_confirmado")
  const invalid = await coletarFamiliaTransparencia(CPF, endpointTransparencia("contratos"), {
    apiKey: "test-key",
    cacheDir: "/tmp/puxa-ficha-transparencia-test-invalid",
    useCache: false,
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
  })
  assert.equal(invalid.resultado, "erro")
  assert.match(invalid.erro ?? "", /não tabular/)
  const malformedRow = await coletarFamiliaTransparencia(CPF, endpointTransparencia("contratos"), {
    apiKey: "test-key",
    cacheDir: "/tmp/puxa-ficha-transparencia-test-malformed-row",
    useCache: false,
    fetchImpl: async () => new Response(JSON.stringify([{}]), { status: 200 }),
  })
  assert.equal(malformedRow.resultado, "erro")
  assert.match(malformedRow.erro ?? "", /não tabular/)
  const errorRow = await coletarFamiliaTransparencia(CPF, endpointTransparencia("contratos"), {
    apiKey: "test-key",
    cacheDir: "/tmp/puxa-ficha-transparencia-test-error-row",
    useCache: false,
    fetchImpl: async () => new Response(JSON.stringify([{ erro: "limite" }]), { status: 200 }),
  })
  assert.equal(errorRow.resultado, "erro")
  assert.match(errorRow.erro ?? "", /não tabular/)
})

test("Transparência recusa identidade documental divergente e CPF ausente", async () => {
  rmSync("/tmp/puxa-ficha-transparencia-test-mismatch", { recursive: true, force: true })
  const mismatch = await coletarFamiliaTransparencia(CPF, endpointTransparencia("cartoes"), {
    apiKey: "test-key",
    cacheDir: "/tmp/puxa-ficha-transparencia-test-mismatch",
    useCache: false,
    fetchImpl: (() => {
      let calls = 0
      return async () => new Response(calls++ === 0 ? JSON.stringify([{ id: 1, cpfPortador: "11144477735", dataTransacao: "01/01/2024", valorTransacao: "1,00" }]) : "[]", { status: 200 })
    })(),
  })
  assert.equal(mismatch.resultado, "erro")
  assert.match(mismatch.erro ?? "", /divergente/)
  assert.equal(readdirSync("/tmp/puxa-ficha-transparencia-test-mismatch").filter((name) => name.endsWith(".json")).length, 0)
  const noCpf = await coletarFamiliaTransparencia("", endpointTransparencia("cartoes"), { fetchImpl: async () => { throw new Error("não deveria consultar") } })
  assert.equal(noCpf.resultado, "erro")
})

test("Transparência não reutiliza cache alterado sem prova de identidade", async () => {
  const cacheDir = "/tmp/puxa-ficha-transparencia-test-cache-guards"
  rmSync(cacheDir, { recursive: true, force: true })
  await coletarFamiliaTransparencia(CPF, endpointTransparencia("cartoes"), {
    apiKey: "test-key", cacheDir, useCache: false,
    fetchImpl: async () => new Response(JSON.stringify([{ id: 7, dataTransacao: "01/01/2024", valorTransacao: "1,00", portador: { nome: "Pessoa" } }]), { status: 200 }),
  })
  const file = readdirSync(cacheDir).find((name) => name.endsWith(".json"))
  assert.ok(file)
  const cached = JSON.parse(readFileSync(`${cacheDir}/${file}`, "utf8"))
  cached.pagina = 2
  writeFileSync(`${cacheDir}/${file}`, `${JSON.stringify(cached)}\n`)
  const refused = await coletarFamiliaTransparencia(CPF, endpointTransparencia("cartoes"), { apiKey: "test-key", cacheDir, useCache: true, fetchImpl: async () => new Response("[]", { status: 200 }) })
  assert.equal(refused.resultado, "erro")
  assert.match(refused.erro ?? "", /cache recusado/)
})

test("Transparência valida linhas e sanitiza recursivamente", () => {
  assert.equal(validateTransparenciaPage({ data: [] }), null)
  assert.equal(validateTransparenciaPage([{}], "cartoes"), null)
  assert.equal(validateTransparenciaPage([{ erro: "falha" }], "contratos"), null)
  assert.deepEqual(validateTransparenciaPage([{ id: 1, dataTransacao: "01/01/2024", valorTransacao: "1,00" }], "cartoes"), [{ id: 1, dataTransacao: "01/01/2024", valorTransacao: "1,00" }])
  const clean = sanitizeTransparenciaPublic({ nome: "Pessoa", cpf: "52998224725", nested: { email: "x@y.test", valor: 1 } }) as Record<string, unknown>
  assert.deepEqual(clean, { nome: "Pessoa", nested: { valor: 1 } })
})
