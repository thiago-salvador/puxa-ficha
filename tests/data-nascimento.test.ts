import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  isPlaceholderBirthDate,
  isSentinelBirthDate,
  isYearOnlyBirthDate,
  isoBirthDate,
  secondarySourceBirthDate,
} from "../scripts/lib/data-nascimento"
import { buildIngestPayload, type CandidateSnapshot, type MatchedData } from "../scripts/lib/ingest-tse-situacao"

const MATCHED: MatchedData = {
  cpf: "",
  situacao: "#NE",
  detalhe: "",
  ano: 2026,
  cand: {} as unknown as MatchedData["cand"],
  match_method: "sq-preloaded",
  ds_cargo: "GOVERNADOR",
  sg_uf: "PA",
  uf_nascimento: "MA",
  data_nascimento: "1986-08-25",
  genero: "",
  grau_instrucao: "",
  estado_civil: "",
  cor_raca: "",
  ocupacao: "",
  sq_candidato: "140002549930",
  julgamento: null,
  email: "",
}

const SNAPSHOT: CandidateSnapshot = {
  cpf: null,
  situacao_candidatura: null,
  naturalidade: null,
  data_nascimento: null,
  formacao: null,
  profissao_declarada: null,
  genero: null,
  estado_civil: null,
  cor_raca: null,
  email_campanha: null,
}

test("data de nascimento: sentinela do Senado e data só com ano são placeholders", () => {
  assert.equal(isSentinelBirthDate("1900-01-01"), true)
  assert.equal(isSentinelBirthDate("1909-12-31"), true)
  assert.equal(isSentinelBirthDate("1910-01-02"), false)
  assert.equal(isYearOnlyBirthDate("1968-01-01"), true)
  assert.equal(isYearOnlyBirthDate("1968-05-25"), false)
  assert.equal(isPlaceholderBirthDate("1900-01-01"), true)
  assert.equal(isPlaceholderBirthDate("1968-01-01"), true)
  assert.equal(isPlaceholderBirthDate("1949-07-08"), false)
  assert.equal(isPlaceholderBirthDate(null), false)
})

test("data de nascimento: fonte secundária não grava sentinela, só ano ou data inválida", () => {
  assert.equal(secondarySourceBirthDate("1900-01-01"), null)
  assert.equal(secondarySourceBirthDate("+1968-01-01T00:00:00Z"), null)
  assert.equal(secondarySourceBirthDate("1986-02-30"), null)
  assert.equal(secondarySourceBirthDate("16/02/1979"), null)
  assert.equal(secondarySourceBirthDate(undefined), null)
  assert.equal(secondarySourceBirthDate("+1986-08-25T00:00:00Z"), "1986-08-25")
  assert.equal(isoBirthDate("1986-08-25"), "1986-08-25")
})

test("ingest TSE: linha do pleito corrente casada por SQ corrige data divergente", () => {
  const { payload } = buildIngestPayload(MATCHED, { ...SNAPSHOT, data_nascimento: "1979-02-16" }, 2026)
  assert.equal(payload.data_nascimento, "1986-08-25")
})

test("ingest TSE: corrige sentinela e data só com ano pela linha do pleito corrente", () => {
  const sentinela = buildIngestPayload({ ...MATCHED, data_nascimento: "1949-07-08" }, { ...SNAPSHOT, data_nascimento: "1900-01-01" }, 2026)
  assert.equal(sentinela.payload.data_nascimento, "1949-07-08")
  const soAno = buildIngestPayload({ ...MATCHED, data_nascimento: "1968-05-25" }, { ...SNAPSHOT, data_nascimento: "1968-01-01" }, 2026)
  assert.equal(soAno.payload.data_nascimento, "1968-05-25")
})

test("ingest TSE: 1º de janeiro declarado no cadastro do pleito corrente é data real e fica", () => {
  const { payload } = buildIngestPayload({ ...MATCHED, data_nascimento: "1973-01-01" }, { ...SNAPSHOT, data_nascimento: "1973-01-01" }, 2026)
  assert.equal(payload.data_nascimento, undefined)
})

test("ingest TSE: ano histórico ou match fraco não reescrevem data já gravada", () => {
  const historico = buildIngestPayload({ ...MATCHED, ano: 2020, data_nascimento: "1974-10-05" }, { ...SNAPSHOT, data_nascimento: "1994-04-18" }, 2026)
  assert.equal(historico.payload.data_nascimento, undefined)
  const fraco = buildIngestPayload({ ...MATCHED, match_method: "cpf" }, { ...SNAPSHOT, data_nascimento: "1979-02-16" }, 2026)
  assert.equal(fraco.payload.data_nascimento, undefined)
})

test("ingest TSE: data do cadastro abaixo de 1910 nunca entra", () => {
  const { payload } = buildIngestPayload({ ...MATCHED, data_nascimento: "1900-01-01" }, SNAPSHOT, 2026)
  assert.equal(payload.data_nascimento, undefined)
})

test("seed: mauricio-coelho não ancora as candidaturas de 2012 e 2020 do vereador homônimo", () => {
  const seed = JSON.parse(readFileSync(new URL("../data/candidatos.json", import.meta.url), "utf8")) as Array<{
    slug: string
    ids: { tse_sq_candidato?: Record<string, string> }
  }>
  const sqs = seed.find((c) => c.slug === "mauricio-coelho")?.ids.tse_sq_candidato
  assert.deepEqual(sqs, {})
  const usados = new Set(seed.flatMap((c) => Object.values(c.ids.tse_sq_candidato ?? {})))
  assert.equal(usados.has("110000010928"), false)
  assert.equal(usados.has("110000951550"), false)
})
