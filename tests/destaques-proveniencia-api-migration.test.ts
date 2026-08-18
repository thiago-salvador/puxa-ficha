import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const REPO = join(import.meta.dirname, "..")
const MIGRATION_NAME = "20260810110000_destaques_vazio_com_proveniencia.sql"
const APPLICABLE_MIGRATION_PATH = join(REPO, "supabase", "migrations", MIGRATION_NAME)
const APPLICABLE_ROLLBACK_PATH = join(
  REPO,
  "supabase",
  "rollback",
  MIGRATION_NAME.replace(/\.sql$/, ".rollback.sql"),
)
const PROPOSAL_DIR = join(
  REPO,
  "QA",
  "evidencias",
  "2026-08-10-item4-14-destaques",
  "proposta-autoauditoria",
)
const PROPOSAL_PATH = join(PROPOSAL_DIR, MIGRATION_NAME)
const PROPOSAL_ROLLBACK_PATH = join(
  PROPOSAL_DIR,
  MIGRATION_NAME.replace(/\.sql$/, ".rollback.sql"),
)

describe("proveniência de vazio dos itens 4 e 14", () => {
  test("API e DTO propagam trajetória e votações até a ficha pública", () => {
    const api = readFileSync(join(REPO, "src", "lib", "api.ts"), "utf8")
    const dto = readFileSync(join(REPO, "src", "lib", "public-profile-dto.ts"), "utf8")
    const tipos = readFileSync(join(REPO, "src", "lib", "types.ts"), "utf8")

    for (const fonte of ["destaques-trajetoria", "destaques-patrimonio", "destaques-votacoes"]) {
      assert.match(api, new RegExp(fonte))
    }
    assert.match(
      api,
      /fonte\.startsWith\("destaques-"\)/,
      "detalhe técnico de outras coletas não pode vazar no DTO público",
    )
    for (const campo of ["trajetoria_verificacao", "patrimonio_verificacao", "votacoes_verificacao"]) {
      assert.match(api, new RegExp(campo))
      assert.match(dto, new RegExp(campo))
      assert.match(tipos, new RegExp(campo))
    }
  })

  test("proposta auto-auditada fica fora do diretório aplicável", () => {
    assert.equal(existsSync(APPLICABLE_MIGRATION_PATH), false)
    assert.equal(existsSync(APPLICABLE_ROLLBACK_PATH), false)
    assert.ok(existsSync(PROPOSAL_PATH), `proposta ausente: ${MIGRATION_NAME}`)
    assert.ok(existsSync(PROPOSAL_ROLLBACK_PATH), `rollback da proposta ausente: ${MIGRATION_NAME}`)
  })

  test("proposta e rollback materializam o universo público sem hardcode por candidato", () => {
    const sql = readFileSync(PROPOSAL_PATH, "utf8")
    const rollback = readFileSync(PROPOSAL_ROLLBACK_PATH, "utf8")

    assert.match(sql, /from public\.candidatos_publico/i)
    assert.match(sql, /destaques-trajetoria/g)
    assert.match(sql, /destaques-votacoes/g)
    assert.match(sql, /create temp table [\s\S]*destaques_vazio_universo/i)
    assert.match(sql, /universo vazio/i)
    assert.doesNotMatch(
      sql,
      /publicas\s*<>\s*194/i,
      "proposta precisa reconciliar o universo medido no ato",
    )
    assert.match(sql, /resultado[\s\S]*vazio_confirmado/i)
    assert.match(
      sql,
      /least\(1,\s*count\(vc\.id\)\)::integer as volume/i,
      "voto sem join de votação-chave não pode virar card nem resultado encontrado",
    )
    assert.match(
      sql,
      /least\(1,\s*count\(h\.id\)\)::integer as volume/i,
      "volume é sinal de conteúdo, não contagem crua que diverge do dedupe do DTO",
    )
    assert.match(sql, /@write tabela=coleta_log/i)
    assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT)\s*;/im)

    assert.match(rollback, /delete from public\.coleta_log/i)
    assert.match(rollback, /destaques-trajetoria/)
    assert.match(rollback, /destaques-votacoes/)
    assert.doesNotMatch(rollback, /^\s*(BEGIN|COMMIT)\s*;/im)
  })

  test("fontes dedicadas entram no catálogo canônico do log", () => {
    const coletaLog = readFileSync(join(REPO, "scripts", "lib", "coleta-log.ts"), "utf8")
    assert.match(coletaLog, /"destaques-trajetoria": "candidato"/)
    assert.match(coletaLog, /"destaques-patrimonio": "candidato"/)
    assert.match(coletaLog, /"destaques-votacoes": "candidato"/)
  })

  test("harness prova cardinalidade, classificação e rollback em Postgres real", () => {
    const caminho = join(REPO, "scripts", "audit", "provar-migration-destaques-proveniencia.sh")
    assert.ok(existsSync(caminho), "harness Postgres ausente")
    const harness = readFileSync(caminho, "utf8")
    assert.match(harness, /postgres:17@sha256:/)
    assert.match(harness, /universo vazio aborta/)
    assert.match(harness, /77 por fonte/)
    assert.match(harness, /194 por fonte/)
    assert.match(harness, /rollback remove 388/)
  })
})
