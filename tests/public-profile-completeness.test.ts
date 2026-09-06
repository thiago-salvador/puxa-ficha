import assert from "node:assert/strict"
import test from "node:test"

import { analyzePublicProfileCompleteness } from "../scripts/audit/audit-public-profile-completeness"

const completeCore = {
  partido_sigla: "PSTU",
  situacao_candidatura: "aguardando julgamento",
  foto_url: "https://example.test/foto.jpg",
  biografia: "Biografia factual.",
  naturalidade: "Belém (PA)",
  data_nascimento: "1980-03-23",
  formacao: "Superior incompleto",
  profissao_declarada: "Comunicólogo",
  genero: "Feminino",
  estado_civil: "Solteiro(a)",
  cor_raca: "Preta",
}

test("marca patrimônio e financiamento não coletados como acionáveis", () => {
  const result = analyzePublicProfileCompleteness("well-macedo", {
    sourceStatus: "live",
    data: {
      ...completeCore,
      patrimonio_eleicoes: [
        { ano: 2022, estado: "nao_coletado" },
        { ano: 2016, estado: "vazio_confirmado" },
      ],
      financiamento_eleicoes: [
        { ano: 2022, estado: "erro" },
        { ano: 2016, estado: "ausencia_oficial" },
      ],
    },
  })
  assert.deepEqual(result.actionable, [
    { slug: "well-macedo", kind: "patrimonio_uncollected", year: 2022, state: "nao_coletado" },
    { slug: "well-macedo", kind: "financiamento_uncollected", year: 2022, state: "erro" },
  ])
})

test("aceita publicação, ausência oficial, zero e pleito futuro", () => {
  const result = analyzePublicProfileCompleteness("perfil-completo", {
    sourceStatus: "live",
    data: {
      ...completeCore,
      patrimonio_eleicoes: [
        { ano: 2022, estado: "publicado" },
        { ano: 2018, estado: "vazio_confirmado" },
      ],
      financiamento_eleicoes: [
        { ano: 2022, estado: "zero_declarado" },
        { ano: 2018, estado: "ausencia_oficial" },
        { ano: 2026, estado: "pleito_futuro" },
        { ano: 1998, estado: "fora_da_serie_oficial" },
      ],
    },
  })
  assert.deepEqual(result.actionable, [])
})

test("separa ausência de recibo contextual de lacuna objetiva", () => {
  const result = analyzePublicProfileCompleteness("sem-recibos", {
    sourceStatus: "live",
    data: {
      ...completeCore,
      patrimonio_eleicoes: [],
      financiamento_eleicoes: [],
      processos_verificacao: null,
      trajetoria_verificacao: null,
      section_freshness: {
        gastos_parlamentares: { status: "missing" },
      },
    },
  })
  assert.deepEqual(result.actionable, [])
  assert.deepEqual(result.review, [
    { slug: "sem-recibos", section: "processos", reason: "missing_verification" },
    { slug: "sem-recibos", section: "trajetoria", reason: "missing_verification" },
    { slug: "sem-recibos", section: "patrimonio", reason: "missing_verification" },
    { slug: "sem-recibos", section: "votacoes", reason: "missing_verification" },
    { slug: "sem-recibos", section: "gastos_parlamentares", reason: "section_missing" },
  ])
})

test("falha com fonte não live e campo cadastral ausente", () => {
  const result = analyzePublicProfileCompleteness("perfil-quebrado", {
    sourceStatus: "fallback",
    data: { ...completeCore, foto_url: null },
  })
  assert.deepEqual(result.actionable, [
    { slug: "perfil-quebrado", kind: "source_not_live", state: "fallback" },
    { slug: "perfil-quebrado", kind: "core_field_missing", field: "foto_url" },
  ])
})

console.log("PUBLIC_PROFILE_COMPLETENESS_TESTS_OK")
