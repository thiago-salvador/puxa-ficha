import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { classificarMigration } from "../scripts/audit/lib/migrations-classificacao"

const ROOT = process.cwd()
const schemaPath = join(ROOT, "supabase/migrations/20260819140000_formacao_instituicao_schema_publico.sql")
const higienePath = join(ROOT, "supabase/migrations/20260819140200_formacao_instituicao_higiene.sql")
const schema = readFileSync(schemaPath, "utf8")
const higiene = readFileSync(higienePath, "utf8")

const HIGIENE = [
  ["acm-neto", "SUPERIOR COMPLETO", "Universidade Federal da Bahia"],
  ["alysson-bezerra", "SUPERIOR COMPLETO", "Universidade Federal Rural do Semi-Árido; Universidade do Estado do Rio Grande do Norte"],
  ["david-almeida", "SUPERIOR COMPLETO", "Universidade Luterana do Brasil"],
  ["dr-furlan", "SUPERIOR COMPLETO", "Universidade Federal do Pará"],
  ["eduardo-paes", "SUPERIOR COMPLETO", "Pontifícia Universidade Católica do Rio de Janeiro"],
  ["elmano-de-freitas", "SUPERIOR COMPLETO", "Faculdade de Direito da Universidade Federal do Ceará"],
  ["joao-henrique-catan", "SUPERIOR COMPLETO", "Instituto Presbiteriano Mackenzie"],
  ["mailza-assis", "SUPERIOR COMPLETO", "Universidade Federal do Acre (UFAC)"],
  ["mateus-simoes", "SUPERIOR COMPLETO", "Faculdade de Direito Milton Campos"],
  ["raquel-lyra", "SUPERIOR COMPLETO", "Faculdade de Direito da Universidade Federal de Pernambuco"],
  ["renan-santos", "SUPERIOR INCOMPLETO", "Universidade de São Paulo"],
  ["requiao-filho", "SUPERIOR COMPLETO", "Centro Universitário de Brasília"],
  ["ricardo-cappelli", "SUPERIOR COMPLETO", "Centro Universitário Euroamericano"],
  ["sergio-moro-gov-pr", "SUPERIOR COMPLETO", "Universidade Federal do Paraná"],
  ["wilder-morais", "SUPERIOR COMPLETO", "Pontifícia Universidade Católica de Goiás"],
] as const

describe("formação híbrida", () => {
  it("mantém schema e higiene em migrations separadas e não mistas", () => {
    assert.doesNotMatch(schema, /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\b/i)
    assert.doesNotMatch(higiene, /\b(CREATE|ALTER|DROP)\s+(TABLE|VIEW|INDEX)\b/i)
    assert.equal(classificarMigration(schemaPath, schema).mista, false)
    assert.equal(classificarMigration(higienePath, higiene).classe, "curadoria")
  })

  it("não concatena grau e instituição na coluna de grau", () => {
    assert.doesNotMatch(higiene, /formacao = 'SUPERIOR INCOMPLETO ·/)
    assert.match(higiene, /formacao_instituicao = 'Universidade de São Paulo'/)
  })

  it("restaura o grau TSE e a instituição curada nos slugs de instituição-como-grau", () => {
    for (const [slug, grau, instituicao] of HIGIENE) {
      const instituicaoRe = instituicao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      assert.match(
        higiene,
        new RegExp(
          `-- @write tabela=candidatos slug=${slug} campos=formacao,formacao_instituicao,ultima_atualizacao\\nUPDATE public\\.candidatos\\nSET formacao = '${grau}',\\n    formacao_instituicao = '${instituicaoRe}'`,
        ),
      )
    }
  })
})

describe("formação Cury e Marçal", () => {
  const curadoriaPath = join(ROOT, "supabase/migrations/20260819140400_formacao_cury_marcal.sql")
  const curadoria = readFileSync(curadoriaPath, "utf8")

  it("só grava grau TSE e instituição já curada, sem misturar schema", () => {
    assert.doesNotMatch(curadoria, /\b(CREATE|ALTER|DROP)\s+(TABLE|VIEW|INDEX)\b/i)
    assert.equal(classificarMigration(curadoriaPath, curadoria).classe, "curadoria")
    assert.match(curadoria, /DS_GRAU_INSTRUCAO/)
    assert.doesNotMatch(curadoria, /formacao = 'SUPERIOR COMPLETO ·/)
  })

  it("restaura o grau TSE e move a instituição para a coluna certa", () => {
    assert.match(
      curadoria,
      /-- @write tabela=candidatos slug=augusto-cury campos=formacao,formacao_instituicao,ultima_atualizacao\nUPDATE public\.candidatos\nSET formacao = 'SUPERIOR COMPLETO',\n    formacao_instituicao = 'Medicina pela Faculdade de Medicina de São José do Rio Preto'/,
    )
    assert.match(
      curadoria,
      /-- @write tabela=candidatos slug=pablo-marcal campos=formacao,formacao_instituicao,ultima_atualizacao\nUPDATE public\.candidatos\nSET formacao = 'SUPERIOR COMPLETO',\n    formacao_instituicao = 'Universidade Paulista \(Unip\)'/,
    )
  })
})
